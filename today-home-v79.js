/* TODAY V79 — SMART COMPOSER */
(() => {
  'use strict';

  if (window.TODAY_HOME_V79?.version === 'V79') return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const PREFIX = 'today-v79-draft-';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

  let active = null;
  let observer = null;
  let saveTimer = null;
  let sending = false;
  let nativeSend = null;
  let objectUrl = null;
  let announcementTimer = null;

  const stats = {
    version: 'V79',
    formsEnhanced: 0,
    draftsSaved: 0,
    submitsStarted: 0
  };

  // -----------------------------------------------------------
  // Feature 1 — Drafts are saved locally for the current day.
  // Photo files are deliberately not stored in browser storage.
  // -----------------------------------------------------------

  function currentDay() {
    const label = $('#dateLabel')?.textContent?.trim() || '';
    const match = label.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }

    const now = new Date();

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  function clearExpiredDrafts() {
    const today = currentDay();
    const keys = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key && key.startsWith(PREFIX) && !key.startsWith(PREFIX + today + '-')) {
          keys.push(key);
        }
      }

      keys.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('[TODAY V79] Could not clean expired drafts', error);
    }
  }

  function makeDraftKey(day, kind, contentId) {
    return PREFIX + day + '-' + kind + '-' + encodeURIComponent(contentId);
  }

  function parseComposerIdentity(root) {
    const button = $('.composer-row button[onclick*="sendContribution"]', root);

    const code = button?.getAttribute('onclick') || '';
    const match = code.match(
      /sendContribution\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/
    );

    if (!match) return null;

    return {
      id: match[1],
      kind: match[2]
    };
  }

  function composerValue(ctx) {
    const field = ctx.body || ctx.url;
    return field ? String(field.value || '') : '';
  }

  function showStatus(ctx, message, type = 'normal') {
    if (!ctx?.status) return;

    ctx.status.textContent = message;
    ctx.status.dataset.state = type;
  }

  function readDraft(ctx) {
    try {
      const raw = localStorage.getItem(ctx.key);
      if (!raw) return null;

      const saved = JSON.parse(raw);

      if (
        saved?.version !== 1 ||
        saved?.kind !== ctx.kind ||
        saved?.id !== ctx.id ||
        saved?.day !== ctx.day ||
        typeof saved.text !== 'string'
      ) {
        localStorage.removeItem(ctx.key);
        return null;
      }

      return saved;
    } catch (error) {
      console.warn('[TODAY V79] Draft read failed', error);
      return null;
    }
  }

  function persistDraft(ctx) {
    if (!ctx || !ctx.root.isConnected) return;

    const value = composerValue(ctx).trim();

    if (!value) {
      try {
        localStorage.removeItem(ctx.key);
        showStatus(
          ctx,
          ctx.file?.files?.length
            ? 'Фото выбрано. Сам файл не хранится в черновике.'
            : 'Черновик пока пуст.',
          'normal'
        );
      } catch (_) {}

      return;
    }

    const data = {
      version: 1,
      day: ctx.day,
      kind: ctx.kind,
      id: ctx.id,
      text: composerValue(ctx),
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(ctx.key, JSON.stringify(data));

      stats.draftsSaved += 1;

      showStatus(
        ctx,
        ctx.file?.files?.length
          ? 'Черновик сохранён. Не забудь прикрепить фото повторно, если закроешь форму.'
          : 'Черновик сохранён на этом устройстве · до конца дня.',
        'saved'
      );
    } catch (error) {
      console.warn('[TODAY V79] Draft save failed', error);

      showStatus(
        ctx,
        'Браузер не разрешил сохранить черновик. Скопируй текст перед закрытием.',
        'warning'
      );
    }
  }

  function scheduleSave(ctx) {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
      if (active === ctx) {
        updateFieldFeedback(ctx);
        persistDraft(ctx);
      }
    }, 280);
  }

  function flushSave() {
    if (active) {
      clearTimeout(saveTimer);
      persistDraft(active);
    }
  }

  // -----------------------------------------------------------
  // Feature 2 — Live character counter and URL feedback
  // -----------------------------------------------------------

  function updateFieldFeedback(ctx) {
    if (!ctx) return;

    if (ctx.body && ctx.counter) {
      const value = ctx.body.value || '';
      const max = Number(ctx.body.maxLength || 1200);
      const remaining = Math.max(0, max - value.length);

      ctx.counter.textContent = `${value.length} / ${max}`;
      ctx.counter.dataset.state =
        remaining <= 80 ? 'warning' : 'normal';

      if (ctx.remaining) {
        ctx.remaining.textContent = `Осталось ${remaining}`;
      }
    }

    if (ctx.url && ctx.urlHint) {
      const value = ctx.url.value.trim();
      let valid = false;

      if (value) {
        try {
          const parsed = new URL(value);
          valid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (_) {}
      }

      if (!value) {
        ctx.urlHint.textContent = 'Вставь ссылку на песню, начинающуюся с https://';
        ctx.urlHint.dataset.state = 'normal';
      } else if (valid) {
        ctx.urlHint.textContent = 'Ссылка выглядит корректно';
        ctx.urlHint.dataset.state = 'valid';
      } else {
        ctx.urlHint.textContent = 'Проверь адрес: нужна ссылка http:// или https://';
        ctx.urlHint.dataset.state = 'warning';
      }
    }
  }

  // -----------------------------------------------------------
  // Feature 3 — Photo preview and safe clearing
  // -----------------------------------------------------------

  function revokePreview() {
    if (!objectUrl) return;

    try {
      URL.revokeObjectURL(objectUrl);
    } catch (_) {}

    objectUrl = null;
  }

  function renderFilePreview(ctx, file) {
    if (!ctx?.preview) return;

    revokePreview();
    ctx.preview.replaceChildren();

    if (!file) {
      ctx.preview.hidden = true;
      return;
    }

    const info = document.createElement('div');
    info.className = 'today-v79-file-info';

    const img = document.createElement('img');
    img.className = 'today-v79-file-thumb';
    img.alt = 'Предпросмотр прикреплённой фотографии';
    img.decoding = 'async';

    objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    const details = document.createElement('div');
    details.className = 'today-v79-file-details';

    const name = document.createElement('strong');
    name.textContent = file.name || 'Фотография';

    const size = document.createElement('small');
    size.textContent = `${(file.size / 1024 / 1024).toFixed(2)} МБ`;

    details.append(name, size);
    info.append(img, details);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'today-v79-file-remove';
    remove.textContent = 'Убрать фото';
    remove.setAttribute('aria-label', 'Убрать выбранное фото');

    remove.addEventListener('click', () => {
      if (ctx.file) ctx.file.value = '';
      revokePreview();
      renderFilePreview(ctx, null);

      showStatus(
        ctx,
        'Фото убрано. Текст черновика сохранён отдельно.',
        'normal'
      );

      persistDraft(ctx);
    });

    ctx.preview.append(info, remove);
    ctx.preview.hidden = false;
  }

  function handleFileChange(ctx) {
    if (!ctx?.file) return;

    const file = ctx.file.files?.[0] || null;

    if (!file) {
      renderFilePreview(ctx, null);
      scheduleSave(ctx);
      return;
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      ctx.file.value = '';
      renderFilePreview(ctx, null);

      showStatus(
        ctx,
        'Поддерживаются фотографии JPG, PNG и WebP.',
        'warning'
      );

      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      ctx.file.value = '';
      renderFilePreview(ctx, null);

      showStatus(
        ctx,
        'Размер фотографии больше 10 МБ. Выбери изображение меньшего размера.',
        'warning'
      );

      return;
    }

    renderFilePreview(ctx, file);

    showStatus(
      ctx,
      'Фото готово к отправке. Сам файл не сохраняется в черновике.',
      'saved'
    );

    scheduleSave(ctx);
  }

  // -----------------------------------------------------------
  // Feature 4 — Prevent duplicate submissions and show progress
  // -----------------------------------------------------------

  function setSubmitting(ctx, enabled) {
    const button = ctx?.submit;

    if (!button) return;

    if (enabled) {
      if (!button.dataset.v79OriginalLabel) {
        button.dataset.v79OriginalLabel =
          button.textContent?.trim() || 'ОТПРАВИТЬ';
      }

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.classList.add('today-v79-submitting');
      button.textContent = 'ОТПРАВЛЯЕМ…';
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('today-v79-submitting');

      if (button.dataset.v79OriginalLabel) {
        button.textContent = button.dataset.v79OriginalLabel;
        delete button.dataset.v79OriginalLabel;
      }
    }
  }

  function installSendGuard() {
    if (window.sendContribution?.__todayV79Wrapped) return;

    nativeSend = window.sendContribution;

    if (typeof nativeSend !== 'function') {
      console.warn('[TODAY V79] sendContribution is not available yet');
      return;
    }

    const wrapped = async function(id, kind) {
      if (sending) {
        if (active) {
          showStatus(
            active,
            'Публикация уже отправляется. Подожди завершения.',
            'warning'
          );
        }

        return;
      }

      sending = true;

      const ctx = active &&
        active.kind === String(kind) &&
        active.id === String(id)
          ? active
          : null;

      setSubmitting(ctx, true);
      stats.submitsStarted += 1;

      if (ctx) {
        showStatus(
          ctx,
          'Отправляем публикацию. Не закрывай страницу.',
          'normal'
        );
      }

      try {
        const result = await nativeSend.apply(this, arguments);

        const modal = $('#modal');

        // The existing backend implementation closes the composer only
        // when it confirms that the publication succeeded.
        if (ctx && modal?.classList.contains('hidden')) {
          try {
            localStorage.removeItem(ctx.key);
          } catch (_) {}

          showStatus(
            ctx,
            'Публикация отправлена. Черновик удалён.',
            'saved'
          );
        }

        return result;
      } catch (error) {
        if (ctx) {
          showStatus(
            ctx,
            'Не удалось отправить публикацию. Черновик сохранён.',
            'warning'
          );
        }

        throw error;
      } finally {
        sending = false;

        // If validation or network saving failed, the modal remains open:
        // restore the button and retain the user's text.
        if (ctx && !$('#modal')?.classList.contains('hidden')) {
          setSubmitting(ctx, false);
          updateFieldFeedback(ctx);
        } else if (ctx) {
          setSubmitting(ctx, false);
        }
      }
    };

    wrapped.__todayV79Wrapped = true;
    wrapped.__todayV79Native = nativeSend;

    window.sendContribution = wrapped;
  }

  // -----------------------------------------------------------
  // Feature 5 — Clear a saved draft without losing the form
  // -----------------------------------------------------------

  function clearDraft(ctx) {
    if (!ctx) return;

    clearTimeout(saveTimer);

    if (ctx.body) ctx.body.value = '';
    if (ctx.url) ctx.url.value = '';

    if (ctx.file) ctx.file.value = '';

    renderFilePreview(ctx, null);

    try {
      localStorage.removeItem(ctx.key);
    } catch (_) {}

    updateFieldFeedback(ctx);

    showStatus(
      ctx,
      'Черновик очищен. Форма готова к новому тексту.',
      'normal'
    );

    (ctx.body || ctx.url)?.focus({ preventScroll: true });
  }

  // -----------------------------------------------------------
  // Feature 6 — Keyboard shortcuts, live announcements,
  // restoration and safe handling of dynamically-created forms
  // -----------------------------------------------------------

  function buildToolbar(ctx) {
    if (ctx.toolbar) return;

    const tools = document.createElement('section');
    tools.className = 'today-v79-composer-tools';
    tools.setAttribute('aria-label', 'Подсказки и состояние публикации');

    tools.innerHTML = `
      <div class="today-v79-counter-row">
        <span class="today-v79-field-label" data-v79-field-label>
          Текст публикации
        </span>
        <span class="today-v79-counter" data-v79-counter>0 / 1200</span>
      </div>

      <div class="today-v79-remaining" data-v79-remaining>
        Напиши текст или добавь фото
      </div>

      <div class="today-v79-url-hint" data-v79-url-hint hidden></div>

      <div
        class="today-v79-file-preview"
        data-v79-preview
        hidden></div>

      <div class="today-v79-tools-row">
        <span
          class="today-v79-status"
          data-v79-status
          role="status"
          aria-live="polite">
          Черновик можно восстановить в течение сегодняшнего дня.
        </span>

        <button
          type="button"
          class="today-v79-clear-draft"
          data-v79-clear>
          Очистить черновик
        </button>
      </div>

      <div class="today-v79-shortcut">
        <span>Быстрая отправка</span>
        <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
        <span class="today-v79-shortcut-alt">или</span>
        <kbd>⌘</kbd> + <kbd>Enter</kbd>
      </div>
    `;

    ctx.root.insertBefore(tools, ctx.notice || null);

    ctx.toolbar = tools;
    ctx.status = $('[data-v79-status]', tools);
    ctx.counter = $('[data-v79-counter]', tools);
    ctx.remaining = $('[data-v79-remaining]', tools);
    ctx.urlHint = $('[data-v79-url-hint]', tools);
    ctx.preview = $('[data-v79-preview]', tools);
    ctx.clearButton = $('[data-v79-clear]', tools);
    ctx.fieldLabel = $('[data-v79-field-label]', tools);

    if (ctx.url) {
      ctx.counter.textContent = 'Ссылка на песню';
      ctx.remaining.textContent = 'Добавь ссылку на одну песню, которую слушаешь сегодня';
      ctx.urlHint.hidden = false;
      ctx.fieldLabel.textContent = 'Ссылка на песню';
    }

    if (ctx.file && !ctx.body && !ctx.url) {
      ctx.counter.textContent = 'Фотография';
      ctx.remaining.textContent = 'Добавь фотографию сегодняшнего момента';
    }

    if (ctx.body) {
      ctx.body.setAttribute('aria-describedby', 'todayV79ComposerStatus');
      ctx.status.id = 'todayV79ComposerStatus';
    } else if (ctx.url) {
      ctx.url.setAttribute('aria-describedby', 'todayV79ComposerStatus');
      ctx.status.id = 'todayV79ComposerStatus';
    }

    ctx.clearButton.addEventListener('click', () => clearDraft(ctx));

    if (ctx.file) {
      ctx.file.addEventListener('change', () => handleFileChange(ctx));
    }

    const fields = [ctx.body, ctx.url].filter(Boolean);

    fields.forEach(field => {
      field.addEventListener('input', () => {
        updateFieldFeedback(ctx);
        scheduleSave(ctx);
      });

      field.addEventListener('keydown', event => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === 'Enter'
        ) {
          event.preventDefault();

          if (ctx.submit && !ctx.submit.disabled) {
            window.sendContribution?.(ctx.id, ctx.kind);
          }
        }
      });
    });
  }

  function disposeActive() {
    if (active) {
      clearTimeout(saveTimer);
      flushSave();
    }

    revokePreview();
    active = null;
  }

  function enhanceComposer() {
    const content = $('#modalContent');
    const modal = $('#modal');

    if (!content || !modal || modal.classList.contains('hidden')) {
      return;
    }

    const body = $('#contribBody', content);
    const url = $('#contribUrl', content);
    const file = $('#contribFile', content);

    if (!body && !url && !file) {
      return;
    }

    const root = $('.composer', content);
    if (!root) return;

    const identity = parseComposerIdentity(root);
    if (!identity) return;

    if (
      active &&
      active.root === root &&
      active.id === identity.id &&
      active.kind === identity.kind
    ) {
      updateFieldFeedback(active);
      return;
    }

    disposeActive();

    const day = currentDay();

    const ctx = {
      root,
      id: identity.id,
      kind: identity.kind,
      day,
      key: makeDraftKey(day, identity.kind, identity.id),
      body,
      url,
      file,
      toolbar: null,
      status: null,
      counter: null,
      remaining: null,
      urlHint: null,
      preview: null,
      clearButton: null,
      fieldLabel: null,
      notice: $('.notice', root),
      submit: $('.composer-row button', root)
    };

    active = ctx;

    buildToolbar(ctx);

    // Do not save the selected file itself. Local drafts contain only text.
    const saved = readDraft(ctx);

    if (saved) {
      const field = ctx.body || ctx.url;

      if (field && !field.value.trim()) {
        field.value = saved.text;
      }

      showStatus(
        ctx,
        'Черновик восстановлен. Его можно продолжить редактировать.',
        'saved'
      );
    }

    updateFieldFeedback(ctx);
    stats.formsEnhanced += 1;

    // The browser can close/reload while a debounced save is pending.
    window.addEventListener('pagehide', flushSave, { once: true });

    installSendGuard();

    console.info('[TODAY HOME V79] Composer enhanced', {
      kind: ctx.kind,
      day: ctx.day,
      draftAvailable: !!saved
    });
  }

  function scheduleEnhance() {
    queueMicrotask(() => {
      try {
        enhanceComposer();
      } catch (error) {
        console.warn('[TODAY V79] Composer enhancement failed', error);
      }
    });
  }

  function init() {
    clearExpiredDrafts();
    installSendGuard();

    const target = $('#modalContent');

    if (!target) {
      console.warn('[TODAY V79] #modalContent not found');
      return;
    }

    if ('MutationObserver' in window) {
      observer = new MutationObserver(() => scheduleEnhance());

      observer.observe(target, {
        childList: true,
        subtree: true
      });
    }

    // Handles a composer that may already be present.
    scheduleEnhance();

    window.TODAY_HOME_V79 = {
      version: 'V79',

      refresh() {
        installSendGuard();
        scheduleEnhance();

        return this.diagnose();
      },

      diagnose() {
        return {
          version: 'V79',
          activeComposer: !!active,
          kind: active?.kind || null,
          day: active?.day || null,
          draftPresent: !!active && !!readDraft(active),
          sending,
          observerAvailable: !!observer,
          formsEnhanced: stats.formsEnhanced,
          draftsSaved: stats.draftsSaved,
          submitsStarted: stats.submitsStarted
        };
      }
    };

    console.info('[TODAY HOME V79] Initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
