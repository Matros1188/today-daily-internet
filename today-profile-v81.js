/* TODAY V81 — PROFILE SIGNATURE */
(() => {
  'use strict';

  if (window.TODAY_PROFILE_V81?.version === 'V81') return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const PAGE = '#todayProfilePage';
  let observer = null;
  let observerQueued = false;
  let viewer = null;
  let focusBack = null;
  let messageTimer = null;
  const previewUrls = new WeakMap();

  const state = {
    version: 'V81',
    enhancements: 0,
    searchableLists: 0,
    enhancedPosts: 0,
    viewerOpen: false
  };

  function announce(message) {
    const toast = $('#todayProfileToast');
    if (toast) {
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => {
        toast.hidden = true;
      }, 3200);
    } else {
      console.info('[TODAY V81]', message);
    }
  }

  async function copyText(value) {
    const text = String(value || '').trim();
    if (!text) return false;

    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    let area = null;

    try {
      area = document.createElement('textarea');
      area.value = text;
      area.readOnly = true;
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';

      document.body.append(area);
      area.select();
      area.setSelectionRange(0, area.value.length);

      return document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      area?.remove();
    }
  }

  // ------------------------------------------------------------
  // Feature 1 — visual shell for the upgraded profile identity
  // ------------------------------------------------------------

  function enhanceIdentity(root) {
    const layout = $('.today-profile-layout-v63', root);
    if (!layout) return;

    layout.classList.add('today-profile-v81-layout');

    const identity = $('.today-profile-v63-identity', layout);
    if (identity) identity.classList.add('today-profile-v81-cover');

    const avatar = $('.today-profile-v63-avatar', layout);

    if (avatar) {
      avatar.title = 'Нажми, чтобы изменить фото профиля';
      avatar.setAttribute('aria-label', 'Изменить фотографию профиля');
    }

    $$('.today-profile-v63-tabs [data-profile-tab]', layout).forEach(button => {
      const active = button.classList.contains('active') ||
        button.getAttribute('aria-pressed') === 'true';

      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  // ------------------------------------------------------------
  // Feature 2 — sticky, accessible profile tabs are styled in CSS;
  // this keeps the ARIA state in sync with existing route buttons.
  // ------------------------------------------------------------

  function syncTabs(root) {
    $$('.today-profile-v63-tabs [data-profile-tab]', root).forEach(button => {
      const pressed =
        button.getAttribute('aria-pressed') === 'true' ||
        button.classList.contains('active');

      button.setAttribute('aria-current', pressed ? 'page' : 'false');
    });
  }

  // ------------------------------------------------------------
  // Feature 3 — search personal wall and daily posts
  // ------------------------------------------------------------

  function makeListToolbar(host) {
    const previous = host.previousElementSibling;

    if (previous?.matches('.today-profile-v81-list-tools')) {
      return previous;
    }

    const toolbar = document.createElement('section');
    toolbar.className = 'today-profile-v81-list-tools';
    toolbar.setAttribute('aria-label', 'Поиск по публикациям');

    toolbar.innerHTML = `
      <label class="today-profile-v81-list-search">
        <span class="today-profile-v81-sr-only">Поиск по публикациям</span>
        <input
          type="search"
          data-v81-list-search
          maxlength="160"
          autocomplete="off"
          placeholder="Найти запись по тексту…">
      </label>
      <button type="button" data-v81-list-clear disabled>Очистить</button>
      <span class="today-profile-v81-list-count" data-v81-list-count aria-live="polite"></span>
      <p data-v81-empty hidden>Совпадений не найдено. Попробуй другой запрос.</p>
    `;

    host.insertAdjacentElement('beforebegin', toolbar);

    const input = $('[data-v81-list-search]', toolbar);
    const clear = $('[data-v81-list-clear]', toolbar);

    const items = () => Array.from(host.children).filter(node =>
      node.matches('.today-profile-wall-post, .today-profile-post')
    );

    const apply = () => {
      const query = String(input?.value || '')
        .trim()
        .toLocaleLowerCase('ru-RU');

      const list = items();
      let visible = 0;

      list.forEach(item => {
        const text = String(item.textContent || '')
          .toLocaleLowerCase('ru-RU');

        const match = !query || text.includes(query);

        item.hidden = !match;
        item.classList.toggle('today-profile-v81-filter-hidden', !match);

        if (match) visible++;
      });

      const count = $('[data-v81-list-count]', toolbar);
      if (count) {
        count.textContent = query
          ? `Найдено ${visible} из ${list.length}`
          : `${list.length} ${list.length === 1 ? 'запись' : 'записей'}`;
      }

      if (clear) clear.disabled = !query;

      const empty = $('[data-v81-empty]', toolbar);
      if (empty) empty.hidden = visible !== 0 || list.length === 0;
    };

    input?.addEventListener('input', apply);

    clear?.addEventListener('click', () => {
      if (input) input.value = '';
      apply();
      input?.focus({ preventScroll: true });
    });

    toolbar.__todayV81Apply = apply;
    toolbar.__todayV81Items = items;

    apply();
    state.searchableLists++;

    return toolbar;
  }

  function enhanceSearchableLists(root) {
    $$('.today-profile-wall-posts, .today-profile-posts', root).forEach(host => {
      makeListToolbar(host);
    });

    $$('.today-profile-v81-list-tools', root).forEach(toolbar => {
      if (typeof toolbar.__todayV81Apply === 'function') {
        toolbar.__todayV81Apply();
      }
    });
  }

  // ------------------------------------------------------------
  // Feature 4 — copy/share controls for profile publications
  // ------------------------------------------------------------

  function postText(post) {
    const title = $('.today-profile-post-head span', post)?.textContent?.trim() || '';
    const body = Array.from(post.querySelectorAll('p'))
      .map(p => p.textContent.trim())
      .filter(Boolean)
      .join('\n');

    return [title, body].filter(Boolean).join('\n\n').trim();
  }

  function enhancePostActions(root) {
    const posts = $$('.today-profile-wall-post, .today-profile-posts > .today-profile-post', root);

    posts.forEach(post => {
      if (post.dataset.todayV81Actions === '1') return;

      post.dataset.todayV81Actions = '1';

      const row = document.createElement('div');
      row.className = 'today-profile-v81-post-actions';
      row.dataset.v81PostActions = '1';

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.dataset.v81CopyPost = '1';
      copy.textContent = 'Копировать текст';

      const share = document.createElement('button');
      share.type = 'button';
      share.dataset.v81SharePost = '1';
      share.textContent = 'Поделиться ↗';

      row.append(copy, share);

      const footer = $('.today-profile-wall-post-footer', post);

      if (footer) {
        footer.insertAdjacentElement('beforebegin', row);
      } else {
        post.append(row);
      }

      const image = $('img', post);

      if (image) {
        image.classList.add('today-profile-v81-post-image');
        image.setAttribute('tabindex', '0');
        image.setAttribute('role', 'button');

        if (!image.alt) {
          image.alt = 'Открыть фотографию публикации';
        }

        image.setAttribute(
          'aria-label',
          'Открыть фотографию публикации'
        );
      }

      state.enhancedPosts++;
    });
  }

  async function sharePost(post) {
    const text = postText(post);

    if (!text) {
      announce('В этой записи нет текста для отправки.');
      return;
    }

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Публикация TODAY',
          text
        });

        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }

    const copied = await copyText(text);

    announce(
      copied
        ? 'Текст публикации скопирован.'
        : 'Не удалось скопировать текст публикации.'
    );
  }

  // ------------------------------------------------------------
  // Feature 5 — fullscreen post photo viewer
  // ------------------------------------------------------------

  function closeViewer() {
    if (!viewer) return;

    const old = viewer;
    viewer = null;
    state.viewerOpen = false;

    old.remove();
    document.body.classList.remove('today-profile-v81-viewer-open');

    if (focusBack?.isConnected) {
      try {
        focusBack.focus({ preventScroll: true });
      } catch (_) {
        focusBack.focus();
      }
    }

    focusBack = null;
  }

  function openViewer(image) {
    if (!image || viewer) return;

    const source = image.currentSrc || image.src;
    if (!source) return;

    focusBack = image;

    const overlay = document.createElement('div');
    overlay.className = 'today-profile-v81-image-viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Просмотр фотографии');

    const full = document.createElement('img');
    full.src = source;
    full.alt = image.alt || 'Фотография публикации';
    full.draggable = false;

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Закрыть фотографию');

    overlay.append(full, close);
    document.body.append(overlay);

    viewer = overlay;
    state.viewerOpen = true;
    document.body.classList.add('today-profile-v81-viewer-open');

    close.addEventListener('click', closeViewer);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeViewer();
    });

    close.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------
  // Feature 6 — avatar preview, dynamic rendering and safe keyboard
  // ------------------------------------------------------------

  function enhanceAvatarInput(root) {
    const input = $('#todayProfileAvatarFile', root);
    if (!input || input.dataset.todayV81Ready === '1') return;

    input.dataset.todayV81Ready = '1';

    const preview = document.createElement('div');
    preview.className = 'today-profile-v81-upload-preview';
    preview.hidden = true;

    input.insertAdjacentElement('afterend', preview);

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      const oldUrl = previewUrls.get(input);

      if (oldUrl) {
        try { URL.revokeObjectURL(oldUrl); } catch (_) {}
        previewUrls.delete(input);
      }

      preview.replaceChildren();

      if (!file) {
        preview.hidden = true;
        return;
      }

      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ];

      if (!allowed.includes(file.type)) {
        input.value = '';
        preview.hidden = true;
        announce('Для аватара выбери JPG, PNG или WebP.');
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        input.value = '';
        preview.hidden = true;
        announce('Фото аватара больше 15 МБ. Выбери файл меньшего размера.');
        return;
      }

      const url = URL.createObjectURL(file);
      previewUrls.set(input, url);

      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Предпросмотр нового аватара';
      img.decoding = 'async';

      const hint = document.createElement('small');
      hint.textContent =
        `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} МБ · ` +
        'нажми «Сохранить профиль», чтобы применить';

      preview.append(img, hint);
      preview.hidden = false;
    });
  }

  function bindDelegatedEvents(root) {
    if (root.dataset.todayV81Bound === '1') return;

    root.dataset.todayV81Bound = '1';

    root.addEventListener('click', async event => {
      const copyUsername = event.target.closest('[data-v81-copy-username]');

      if (copyUsername && root.contains(copyUsername)) {
        event.preventDefault();

        const username = copyUsername.dataset.v81Username || '';
        const copied = await copyText('@' + username.replace(/^@/, ''));

        announce(
          copied ? 'Ник скопирован.' : 'Не удалось скопировать ник.'
        );

        return;
      }

      const copyPostButton = event.target.closest('[data-v81-copy-post]');

      if (copyPostButton && root.contains(copyPostButton)) {
        event.preventDefault();

        const post = copyPostButton.closest(
          '.today-profile-wall-post, .today-profile-post'
        );

        const copied = await copyText(postText(post));

        announce(
          copied
            ? 'Текст записи скопирован.'
            : 'Не удалось скопировать текст.'
        );

        return;
      }

      const shareButton = event.target.closest('[data-v81-share-post]');

      if (shareButton && root.contains(shareButton)) {
        event.preventDefault();

        const post = shareButton.closest(
          '.today-profile-wall-post, .today-profile-post'
        );

        if (shareButton.dataset.busy === '1') return;

        shareButton.dataset.busy = '1';
        shareButton.disabled = true;

        try {
          await sharePost(post);
        } catch (error) {
          console.warn('[TODAY V81] Share failed', error);
          announce('Не удалось поделиться записью.');
        } finally {
          shareButton.disabled = false;
          delete shareButton.dataset.busy;
        }

        return;
      }

      const image = event.target.closest(
        '#todayProfileTabContent .today-profile-wall-post img, ' +
        '#todayProfileTabContent .today-profile-posts img'
      );

      if (image && root.contains(image)) {
        event.preventDefault();
        openViewer(image);
      }
    });

    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && viewer) {
        event.preventDefault();
        closeViewer();
        return;
      }

      if (
        viewer &&
        event.key === 'Tab'
      ) {
        const closeButton = $('button', viewer);

        if (closeButton && document.activeElement !== closeButton) {
          event.preventDefault();
          closeButton.focus();
        }
      }

      const image = event.target.closest(
        '#todayProfileTabContent .today-profile-wall-post img, ' +
        '#todayProfileTabContent .today-profile-posts img'
      );

      if (
        image &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        openViewer(image);
      }
    });
  }

  function enhance() {
    const root = $(PAGE);
    if (!root) return;

    enhanceIdentity(root);
    syncTabs(root);
    enhanceSearchableLists(root);
    enhancePostActions(root);
    enhanceAvatarInput(root);
    bindDelegatedEvents(root);

    const layout = $('.today-profile-layout-v63', root);

    if (layout) {
      layout.dataset.todayProfileV81 = 'ready';
    }

    state.enhancements++;
  }

  function scheduleEnhance() {
    if (observerQueued) return;
    observerQueued = true;

    queueMicrotask(() => {
      observerQueued = false;

      try {
        enhance();
      } catch (error) {
        console.warn('[TODAY V81] Profile enhancement failed', error);
      }
    });
  }

  function init() {
    const root = $(PAGE);
    if (!root) return;

    scheduleEnhance();

    if ('MutationObserver' in window) {
      observer = new MutationObserver(() => scheduleEnhance());

      observer.observe(root, {
        childList: true,
        subtree: true
      });
    }

    window.addEventListener('beforeunload', () => {
      closeViewer();

      const input = $('#todayProfileAvatarFile');
      const url = input && previewUrls.get(input);

      if (url) {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }
    });

    window.TODAY_PROFILE_V81 = {
      version: 'V81',

      refresh() {
        scheduleEnhance();
        return this.diagnose();
      },

      closeViewer,

      diagnose() {
        const page = $(PAGE);
        return {
          version: 'V81',
          profileLoaded: !!$('.today-profile-layout-v63', page || document),
          coverEnhanced: !!$('.today-profile-v81-cover', page || document),
          statsAvailable: !!$('.today-profile-v81-stats', page || document),
          tabCount: $$('.today-profile-v63-tabs [data-profile-tab]', page || document).length,
          searchableLists: $$('.today-profile-v81-list-tools', page || document).length,
          enhancedPosts: state.enhancedPosts,
          viewerOpen: !!viewer,
          observerAvailable: !!observer
        };
      }
    };

    console.info(
      '[TODAY PROFILE V81] Initialized',
      window.TODAY_PROFILE_V81.diagnose()
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
