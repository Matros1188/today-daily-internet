/* TODAY V82 — PROFILE STUDIO */
(() => {
  'use strict';

  if (window.TODAY_PROFILE_V82?.version === 'V82') return;

  const PAGE = '#todayProfilePage';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const COVER_PRESETS = ['amethyst', 'ocean', 'emerald', 'sunset'];
  const DEFAULT_PREFS = {
    cover: 'ocean',
    layout: 'grid',
    sort: 'new',
    favoritesOnly: false
  };

  const previewUrls = new WeakMap();

  let observer = null;
  let queued = false;
  let pendingText = '';
  let pendingBeforeIds = new Set();
  let currentScope = 'guest';
  let enhancements = 0;

  function scopeFor(root) {
    const handle =
      $('.today-profile-v63-username', root)?.textContent?.trim() ||
      $('.today-profile-v63-identity h1', root)?.textContent?.trim() ||
      'guest';

    return handle
      .toLocaleLowerCase('ru-RU')
      .replace(/[^\p{L}\p{N}_.@-]+/gu, '_')
      .slice(0, 72) || 'guest';
  }

  function storageKey(kind) {
    return `today-profile-v82:${currentScope}:${kind}`;
  }

  function readJSON(storageKey, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(storageKey, value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function getPrefs() {
    const stored = readJSON(storageKey('prefs'), {});

    return {
      ...DEFAULT_PREFS,
      ...(stored && typeof stored === 'object' ? stored : {})
    };
  }

  function updatePrefs(patch) {
    const prefs = { ...getPrefs(), ...patch };
    writeJSON(storageKey('prefs'), prefs);
    return prefs;
  }

  function getBookmarks() {
    const data = readJSON(storageKey('bookmarks'), []);
    return new Set(Array.isArray(data) ? data.map(String) : []);
  }

  function setBookmarks(bookmarks) {
    writeJSON(storageKey('bookmarks'), Array.from(bookmarks));
  }

  function getPostId(post) {
    return String(
      post?.getAttribute('data-profile-post-id') ||
      post?.dataset?.profilePostId ||
      ''
    );
  }

  function wallPosts(root) {
    const host = $('.today-profile-wall-posts', root);

    if (!host) return [];

    return Array.from(host.children).filter(node =>
      node.matches('.today-profile-wall-post, .today-profile-post')
    );
  }

  function toast(message) {
    const node = $('#todayProfileToast');

    if (!node) {
      console.info('[TODAY V82]', message);
      return;
    }

    node.textContent = message;
    node.hidden = false;
    node.classList.add('show');

    window.clearTimeout(window.__todayProfileV82Toast);

    window.__todayProfileV82Toast = window.setTimeout(() => {
      node.classList.remove('show');
      node.hidden = true;
    }, 2600);
  }

  // Feature 1: profile cover presets.

  function ensureCoverPicker(root, prefs) {
    const identity = $('.today-profile-v63-identity', root);

    if (!identity) return;

    const activeCover = COVER_PRESETS.includes(prefs.cover)
      ? prefs.cover
      : 'ocean';

    identity.setAttribute('data-v82-cover', activeCover);

    let picker = $('.today-profile-v82-cover-picker', identity);

    if (!picker) {
      picker = document.createElement('section');
      picker.className = 'today-profile-v82-cover-picker';
      picker.setAttribute('aria-label', 'Оформление обложки профиля');

      picker.innerHTML = `
        <div class="today-profile-v82-cover-picker-copy">
          <span>ТВОЙ СТИЛЬ</span>
          <b>Обложка профиля</b>
        </div>
        <div class="today-profile-v82-cover-options">
          <button type="button" data-v82-cover="amethyst" aria-label="Аметистовая обложка">
            <i></i><span>Аметист</span>
          </button>
          <button type="button" data-v82-cover="ocean" aria-label="Океанская обложка">
            <i></i><span>Океан</span>
          </button>
          <button type="button" data-v82-cover="emerald" aria-label="Изумрудная обложка">
            <i></i><span>Изумруд</span>
          </button>
          <button type="button" data-v82-cover="sunset" aria-label="Закатная обложка">
            <i></i><span>Закат</span>
          </button>
        </div>`;

      const intro = $('.today-profile-v81-intro', identity);

      if (intro) {
        intro.insertAdjacentElement('afterend', picker);
      } else {
        identity.appendChild(picker);
      }
    }

    $$('[data-v82-cover]', picker).forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.getAttribute('data-v82-cover') === activeCover)
      );
    });
  }

  // Feature 2: wall layout and sort controls.

  function ensureWallTools(root, prefs) {
    const wall = $('.today-profile-wall-v62', root);

    if (!wall) return;

    let tools = $('.today-profile-v82-wall-tools', wall);

    if (!tools) {
      tools = document.createElement('section');
      tools.className = 'today-profile-v82-wall-tools';
      tools.setAttribute('aria-label', 'Настройки отображения личной стены');

      tools.innerHTML = `
        <div class="today-profile-v82-tools-heading">
          <div>
            <small>ТВОЁ ПРОСТРАНСТВО</small>
            <b>Настрой стену под себя</b>
          </div>
          <span data-v82-visible-count aria-live="polite"></span>
        </div>
        <div class="today-profile-v82-tools-controls">
          <div class="today-profile-v82-control-group" aria-label="Вид записей">
            <button type="button" data-v82-layout="grid">▦ Сетка</button>
            <button type="button" data-v82-layout="list">☰ Список</button>
          </div>
          <div class="today-profile-v82-control-group" aria-label="Порядок записей">
            <button type="button" data-v82-sort="new">Сначала новые</button>
            <button type="button" data-v82-sort="old">Сначала старые</button>
          </div>
          <button
            type="button"
            class="today-profile-v82-favorites-filter"
            data-v82-favorites-filter
            aria-pressed="false">♡ Избранное</button>
        </div>`;

      const heading = $('.today-profile-v63-wall-title', wall);
      const composer = $('#todayProfilePostForm', wall);

      if (heading) {
        heading.insertAdjacentElement('afterend', tools);
      } else if (composer) {
        composer.insertAdjacentElement('afterend', tools);
      } else {
        wall.insertBefore(tools, wall.firstChild);
      }
    }

    $$('[data-v82-layout]', tools).forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.getAttribute('data-v82-layout') === prefs.layout)
      );
    });

    $$('[data-v82-sort]', tools).forEach(button => {
      button.setAttribute(
        'aria-pressed',
        String(button.getAttribute('data-v82-sort') === prefs.sort)
      );
    });

    const favoritesButton = $('[data-v82-favorites-filter]', tools);

    if (favoritesButton) {
      favoritesButton.setAttribute(
        'aria-pressed',
        String(Boolean(prefs.favoritesOnly))
      );
    }
  }

  // Feature 3: local bookmarks for profile posts.

  function ensureBookmarkButtons(root) {
    const bookmarks = getBookmarks();

    wallPosts(root).forEach(post => {
      const id = getPostId(post);

      if (!id) return;

      let button = $('[data-v82-bookmark]', post);

      const footer =
        $('.today-profile-wall-post-footer', post) ||
        $('.today-profile-post-actions', post) ||
        post;

      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'today-profile-v82-bookmark';
        button.setAttribute('data-v82-bookmark', '1');
        button.setAttribute('data-v82-post-id', id);

        if (footer === post) {
          post.appendChild(button);
        } else {
          footer.insertBefore(button, footer.firstChild);
        }
      }

      const saved = bookmarks.has(id);

      button.setAttribute('aria-pressed', String(saved));
      button.textContent = saved ? '♥ В избранном' : '♡ В избранное';
      button.title = saved
        ? 'Убрать из избранного'
        : 'Сохранить в избранное';
    });
  }

  function applyWall(root) {
    const prefs = getPrefs();
    const wall = $('.today-profile-wall-v62', root);
    const host = $('.today-profile-wall-posts', root);
    const tools = $('.today-profile-v82-wall-tools', root);

    if (!wall) return;

    if (host) {
      host.classList.toggle(
        'today-profile-v82-grid-mode',
        prefs.layout !== 'list'
      );

      host.classList.toggle(
        'today-profile-v82-list-mode',
        prefs.layout === 'list'
      );

      const posts = wallPosts(root);

      posts.forEach((post, index) => {
        if (!post.hasAttribute('data-v82-original-order')) {
          post.setAttribute('data-v82-original-order', String(index));
        }
      });

      const ordered = posts.slice().sort((a, b) => {
        const aa = Number(a.getAttribute('data-v82-original-order') || 0);
        const bb = Number(b.getAttribute('data-v82-original-order') || 0);

        return prefs.sort === 'old' ? bb - aa : aa - bb;
      });

      const currentOrder = wallPosts(root);
      const needsReorder = ordered.some(
        (post, index) => post !== currentOrder[index]
      );

      if (needsReorder) {
        ordered.forEach(post => host.appendChild(post));
      }

      const bookmarks = getBookmarks();
      let visibleCount = 0;

      ordered.forEach(post => {
        const id = getPostId(post);

        const visible =
          !prefs.favoritesOnly ||
          (id && bookmarks.has(id));

        post.classList.toggle(
          'today-profile-v82-filtered',
          !visible
        );

        if (visible) visibleCount++;
      });

      const count = $('[data-v82-visible-count]', tools || wall);

      if (count) {
        count.textContent =
          `${visibleCount} ${visibleCount === 1 ? 'запись' : 'записей'}`;
      }
    } else {
      const count = $('[data-v82-visible-count]', tools || wall);

      if (count) count.textContent = 'Пока нет записей';
    }

    if (tools) {
      $$('[data-v82-layout]', tools).forEach(button => {
        button.setAttribute(
          'aria-pressed',
          String(button.getAttribute('data-v82-layout') === prefs.layout)
        );
      });

      $$('[data-v82-sort]', tools).forEach(button => {
        button.setAttribute(
          'aria-pressed',
          String(button.getAttribute('data-v82-sort') === prefs.sort)
        );
      });

      const favoritesButton = $('[data-v82-favorites-filter]', tools);

      if (favoritesButton) {
        favoritesButton.setAttribute(
          'aria-pressed',
          String(Boolean(prefs.favoritesOnly))
        );
      }
    }
  }

  // Feature 4: draft saving, character count and photo validation.

  function ensureComposer(root) {
    const form = $('#todayProfilePostForm', root);
    const textarea = $('#todayProfilePostBody', root);

    if (!form || !textarea) return;

    const draftKey = storageKey('draft');

    if (textarea.getAttribute('data-v82-composer-ready') !== '1') {
      textarea.setAttribute('data-v82-composer-ready', '1');

      let draft = '';

      try {
        draft = localStorage.getItem(draftKey) || '';
      } catch (_) {}

      if (!textarea.value.trim() && draft) {
        textarea.value = draft;
      }

      let counter = $('.today-profile-v82-char-count', form);

      if (!counter) {
        counter = document.createElement('div');
        counter.className = 'today-profile-v82-char-count';
        counter.setAttribute('aria-live', 'polite');
        textarea.insertAdjacentElement('afterend', counter);
      }

      const updateCounter = () => {
        counter.textContent =
          `${textarea.value.length.toLocaleString('ru-RU')} / 5 000 символов`;

        try {
          if (textarea.value) {
            localStorage.setItem(draftKey, textarea.value);
          } else {
            localStorage.removeItem(draftKey);
          }
        } catch (_) {}
      };

      textarea.addEventListener('input', updateCounter);
      updateCounter();
    }

    const input = $('#todayProfilePostImage', form);

    let preview = $('.today-profile-v82-photo-preview', form);

    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'today-profile-v82-photo-preview';
      preview.hidden = true;

      const anchor =
        $('.today-profile-post-compose-bottom', form) ||
        input?.parentElement ||
        textarea;

      anchor.insertAdjacentElement('afterend', preview);
    }

    let remove = $('[data-v82-remove-photo]', form);

    if (!remove) {
      remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'today-profile-v82-remove-photo';
      remove.textContent = 'Убрать фото';
      remove.setAttribute('data-v82-remove-photo', '1');
      remove.hidden = true;

      preview.insertAdjacentElement('afterend', remove);
    }

    if (input && input.getAttribute('data-v82-photo-ready') !== '1') {
      input.setAttribute('data-v82-photo-ready', '1');
      input.setAttribute('accept', 'image/jpeg,image/png,image/webp');

      const renderPhoto = () => {
        const oldUrl = previewUrls.get(input);

        if (oldUrl) {
          try {
            URL.revokeObjectURL(oldUrl);
          } catch (_) {}

          previewUrls.delete(input);
        }

        preview.replaceChildren();

        const file = input.files?.[0];

        input.setCustomValidity('');
        remove.hidden = true;
        preview.hidden = true;

        if (!file) return;

        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp'
        ];

        if (!allowedTypes.includes(file.type)) {
          input.setCustomValidity(
            'Выбери изображение JPG, PNG или WebP.'
          );

          preview.hidden = false;
          preview.textContent =
            'Поддерживаются только JPG, PNG и WebP.';

          return;
        }

        if (file.size > 15 * 1024 * 1024) {
          input.setCustomValidity(
            'Размер изображения не должен превышать 15 МБ.'
          );

          preview.hidden = false;
          preview.textContent =
            'Файл больше 15 МБ. Выбери изображение меньшего размера.';

          return;
        }

        const url = URL.createObjectURL(file);
        previewUrls.set(input, url);

        const image = document.createElement('img');
        image.src = url;
        image.alt = 'Предпросмотр выбранной фотографии';

        const meta = document.createElement('span');
        meta.textContent =
          `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} МБ`;

        preview.append(image, meta);
        preview.hidden = false;
        remove.hidden = false;
      };

      input.addEventListener('change', renderPhoto);
    }
  }

  function detectSuccessfulPost(root) {
    if (!pendingText) return;

    const cards = wallPosts(root);

    for (const post of cards) {
      const id = getPostId(post);

      if (!id || pendingBeforeIds.has(id)) continue;

      if (String(post.textContent || '').includes(pendingText)) {
        try {
          localStorage.removeItem(storageKey('draft'));
        } catch (_) {}

        pendingText = '';
        pendingBeforeIds = new Set();

        const textarea = $('#todayProfilePostBody', root);

        if (textarea) {
          textarea.value = '';

          const counter = $('.today-profile-v82-char-count', root);

          if (counter) {
            counter.textContent = '0 / 5 000 символов';
          }
        }

        toast('Запись опубликована. Черновик очищен.');
        return;
      }
    }
  }

  function enhance() {
    const root = $(PAGE);

    if (!root) return;

    const newScope = scopeFor(root);

    if (newScope !== currentScope) {
      currentScope = newScope;
    }

    const prefs = getPrefs();

    ensureCoverPicker(root, prefs);
    ensureWallTools(root, prefs);
    ensureBookmarkButtons(root);
    ensureComposer(root);
    applyWall(root);
    detectSuccessfulPost(root);

    enhancements++;
  }

  function scheduleEnhance() {
    if (queued) return;

    queued = true;

    queueMicrotask(() => {
      queued = false;

      try {
        enhance();
      } catch (error) {
        console.warn('[TODAY V82] Profile Studio error', error);
      }
    });
  }

  function init() {
    const root = $(PAGE);

    if (!root) return;

    currentScope = scopeFor(root);

    scheduleEnhance();

    if ('MutationObserver' in window) {
      observer = new MutationObserver(scheduleEnhance);

      observer.observe(root, {
        childList: true,
        subtree: true
      });
    }

    root.addEventListener('click', event => {
      const button = event.target instanceof Element
        ? event.target.closest('button')
        : null;

      if (!button || !root.contains(button)) return;

      const cover = button.getAttribute('data-v82-cover');
      const layout = button.getAttribute('data-v82-layout');
      const sort = button.getAttribute('data-v82-sort');

      if (cover && COVER_PRESETS.includes(cover)) {
        updatePrefs({ cover });
        scheduleEnhance();
        return;
      }

      if (layout === 'grid' || layout === 'list') {
        updatePrefs({ layout });
        scheduleEnhance();
        return;
      }

      if (sort === 'new' || sort === 'old') {
        updatePrefs({ sort });
        scheduleEnhance();
        return;
      }

      if (button.hasAttribute('data-v82-favorites-filter')) {
        updatePrefs({
          favoritesOnly: !getPrefs().favoritesOnly
        });

        scheduleEnhance();
        return;
      }

      if (button.hasAttribute('data-v82-bookmark')) {
        event.preventDefault();

        const id = button.getAttribute('data-v82-post-id') || '';

        if (!id) return;

        const bookmarks = getBookmarks();

        if (bookmarks.has(id)) {
          bookmarks.delete(id);
        } else {
          bookmarks.add(id);
        }

        setBookmarks(bookmarks);

        ensureBookmarkButtons(root);
        applyWall(root);

        toast(
          bookmarks.has(id)
            ? 'Запись добавлена в избранное'
            : 'Запись убрана из избранного'
        );

        return;
      }

      if (button.hasAttribute('data-v82-remove-photo')) {
        event.preventDefault();

        const form = button.closest('#todayProfilePostForm');
        const input = $('#todayProfilePostImage', form || root);

        if (input) {
          const oldUrl = previewUrls.get(input);

          if (oldUrl) {
            try {
              URL.revokeObjectURL(oldUrl);
            } catch (_) {}

            previewUrls.delete(input);
          }

          input.value = '';
          input.setCustomValidity('');

          const preview = $('.today-profile-v82-photo-preview', form || root);

          if (preview) {
            preview.replaceChildren();
            preview.hidden = true;
          }

          button.hidden = true;

          const message = $('#todayProfilePostMessage', form || root);

          if (message) message.textContent = '';
        }
      }
    });

    document.addEventListener('submit', event => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) return;
      if (form.id !== 'todayProfilePostForm') return;

      const input = $('#todayProfilePostImage', form);

      if (input && !input.checkValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        input.reportValidity();
        return;
      }

      const textarea = $('#todayProfilePostBody', form);

      pendingText = String(textarea?.value || '').trim();

      pendingBeforeIds = new Set(
        wallPosts($(PAGE)).map(getPostId).filter(Boolean)
      );
    }, true);

    window.addEventListener('beforeunload', () => {
      const rootNow = $(PAGE);
      const input = rootNow && $('#todayProfilePostImage', rootNow);
      const url = input && previewUrls.get(input);

      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {}
      }

      if (observer) observer.disconnect();
    }, { once: true });

    window.TODAY_PROFILE_V82 = {
      version: 'V82',

      refresh() {
        scheduleEnhance();
        return this.diagnose();
      },

      diagnose() {
        const rootNow = $(PAGE);

        return {
          version: 'V82',
          active: Boolean(rootNow),
          profileScope: currentScope,
          coverPresets: COVER_PRESETS.length,
          posts: rootNow ? wallPosts(rootNow).length : 0,
          bookmarks: getBookmarks().size,
          enhancements
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
