/* TODAY V77 — SOCIAL EXPERIENCE PACK */
(() => {
  'use strict';

  if (window.TODAY_HOME_V77?.version === 'V77') return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const root = document.documentElement;

  let feedObserver = null;
  let viewer = null;
  let returnFocus = null;
  let topButton = null;
  let networkBanner = null;
  let scrollFrame = 0;
  let onlineTimer = null;
  let currentOnlineMessage = '';

  // -------------------------------------------------------------
  // Feature 1 — fullscreen image viewer
  // -------------------------------------------------------------

  function closeViewer() {
    if (!viewer) return;

    const oldViewer = viewer;
    viewer = null;
    oldViewer.remove();

    document.body.classList.remove('today-v77-viewer-open');

    const target = returnFocus;
    returnFocus = null;

    if (target && target.isConnected && typeof target.focus === 'function') {
      try {
        target.focus({ preventScroll: true });
      } catch (_) {
        target.focus();
      }
    }
  }

  function openViewer(image) {
    if (!image || viewer) return;

    const src = image.currentSrc || image.src;
    if (!src) return;

    returnFocus = image;

    const node = document.createElement('div');
    node.id = 'todayV77ImageViewer';
    node.className = 'today-v77-image-viewer';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-label', 'Просмотр фотографии');

    node.innerHTML = `
      <button
        type="button"
        class="today-v77-viewer-close"
        data-v77-close
        aria-label="Закрыть фотографию">×</button>
      <div
        class="today-v77-viewer-backdrop"
        data-v77-close
        aria-hidden="true"></div>
      <figure class="today-v77-viewer-figure">
        <img class="today-v77-viewer-image" alt="">
        <figcaption class="today-v77-viewer-caption"></figcaption>
      </figure>`;

    const fullImage = $('.today-v77-viewer-image', node);
    const caption = $('.today-v77-viewer-caption', node);

    fullImage.src = src;
    fullImage.alt = image.alt || 'Фотография публикации TODAY';
    fullImage.draggable = false;

    const card = image.closest('.today-post-card');
    const author = $('.today-post-name', card);
    const authorText = author?.textContent?.trim() || '';

    if (caption) {
      caption.textContent = authorText
        ? `Фото · ${authorText}`
        : 'Фото TODAY';

      caption.hidden = !caption.textContent;
    }

    node.addEventListener('click', event => {
      if (event.target.closest('[data-v77-close]')) {
        event.preventDefault();
        closeViewer();
      }
    });

    document.body.append(node);
    document.body.classList.add('today-v77-viewer-open');

    viewer = node;

    const closeButton = $('.today-v77-viewer-close', node);
    closeButton?.focus({ preventScroll: true });

    fullImage.addEventListener('error', () => {
      if (viewer !== node) return;
      if (caption) caption.textContent = 'Не удалось загрузить изображение';
    }, { once: true });
  }

  function enhanceImages(scope) {
    const images = [];

    if (
      scope?.nodeType === 1 &&
      scope.matches?.('#communityFeed img.today-post-media')
    ) {
      images.push(scope);
    }

    if (scope?.querySelectorAll) {
      images.push(...scope.querySelectorAll(
        '#communityFeed img.today-post-media'
      ));
    }

    images.forEach(image => {
      if (image.dataset.todayV77ImageReady === '1') return;

      image.dataset.todayV77ImageReady = '1';
      image.setAttribute('tabindex', '0');
      image.setAttribute('role', 'button');
      image.setAttribute(
        'aria-label',
        image.alt || 'Открыть фотографию публикации'
      );
      image.title = 'Открыть фотографию';
    });
  }

  // -------------------------------------------------------------
  // Feature 2 — expand long post text, including dynamically-added
  // cards from the V74 incremental feed.
  // -------------------------------------------------------------

  function enhanceLongText(scope) {
    const paragraphs = [];

    if (
      scope?.nodeType === 1 &&
      scope.matches?.('.today-post-card .today-post-text')
    ) {
      paragraphs.push(scope);
    }

    if (scope?.querySelectorAll) {
      paragraphs.push(...scope.querySelectorAll(
        '.today-post-card .today-post-text'
      ));
    }

    paragraphs.forEach(paragraph => {
      if (paragraph.dataset.todayV77TextReady === '1') return;

      paragraph.dataset.todayV77TextReady = '1';

      const text = String(paragraph.textContent || '').trim();

      // Short entries need no expand button.
      if (text.length < 260) return;

      paragraph.classList.add('today-v77-text-collapsed');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'today-v77-read-more';
      button.textContent = 'Читать полностью';
      button.setAttribute('aria-expanded', 'false');

      paragraph.insertAdjacentElement('afterend', button);
    });
  }

  function processFeedNode(node) {
    if (!node || node.nodeType !== 1) return;
    enhanceImages(node);
    enhanceLongText(node);
  }

  function processFeed(feed) {
    enhanceImages(feed);
    enhanceLongText(feed);
  }

  function bindFeed(feed) {
    if (!feed || feed.dataset.todayV77Bound === '1') return;

    feed.dataset.todayV77Bound = '1';
    processFeed(feed);

    feed.addEventListener('click', event => {
      const readButton = event.target.closest('.today-v77-read-more');

      if (readButton && feed.contains(readButton)) {
        event.preventDefault();

        const paragraph = readButton.previousElementSibling;
        if (!paragraph?.matches('.today-post-text')) return;

        const expanded = readButton.getAttribute('aria-expanded') !== 'true';

        paragraph.classList.toggle(
          'today-v77-text-collapsed',
          !expanded
        );

        readButton.setAttribute('aria-expanded', String(expanded));
        readButton.textContent = expanded
          ? 'Свернуть'
          : 'Читать полностью';

        return;
      }

      const image = event.target.closest('img.today-post-media');

      if (image && feed.contains(image)) {
        event.preventDefault();
        event.stopPropagation();
        openViewer(image);
      }
    });

    feed.addEventListener('keydown', event => {
      const image = event.target.closest('img.today-post-media');

      if (!image || !feed.contains(image)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      openViewer(image);
    });

    if ('MutationObserver' in window) {
      feedObserver = new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(processFeedNode);
        });
      });

      feedObserver.observe(feed, {
        childList: true,
        subtree: true
      });
    }
  }

  // -------------------------------------------------------------
  // Feature 3 — floating scroll-to-top button
  // -------------------------------------------------------------

  function updateTopButton() {
    if (!topButton) return;

    topButton.hidden = window.scrollY < 550;

    if (viewer) {
      topButton.hidden = true;
    }
  }

  function scheduleTopButtonUpdate() {
    if (scrollFrame) return;

    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateTopButton();
    });
  }

  function createTopButton() {
    if (topButton?.isConnected) return;

    topButton = document.createElement('button');
    topButton.id = 'todayV77TopButton';
    topButton.type = 'button';
    topButton.className = 'today-v77-top-button';
    topButton.hidden = true;
    topButton.setAttribute('aria-label', 'Вернуться наверх');
    topButton.title = 'Наверх';
    topButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 14 6-6 6 6"></path>
      </svg>`;

    topButton.addEventListener('click', () => {
      try {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches ? 'auto' : 'smooth'
        });
      } catch (_) {
        window.scrollTo(0, 0);
      }
    });

    document.body.append(topButton);
    updateTopButton();
  }

  // -------------------------------------------------------------
  // Feature 4 — honest connectivity status
  // -------------------------------------------------------------

  function createNetworkBanner() {
    if (networkBanner?.isConnected) return;

    networkBanner = document.createElement('div');
    networkBanner.id = 'todayV77NetworkBanner';
    networkBanner.className = 'today-v77-network-banner';
    networkBanner.hidden = true;
    networkBanner.setAttribute('role', 'status');
    networkBanner.setAttribute('aria-live', 'polite');

    document.body.append(networkBanner);
  }

  function showNetworkState(message, kind) {
    createNetworkBanner();

    clearTimeout(onlineTimer);

    networkBanner.textContent = message;
    networkBanner.dataset.state = kind;
    networkBanner.hidden = false;

    if (kind === 'online') {
      onlineTimer = setTimeout(() => {
        if (!networkBanner) return;
        networkBanner.hidden = true;
      }, 2300);
    }
  }

  function bindNetworkEvents() {
    if (!navigator.onLine) {
      showNetworkState(
        'Нет подключения к сети. Публикации могут не сохраниться.',
        'offline'
      );
    }

    window.addEventListener('offline', () => {
      showNetworkState(
        'Нет подключения к сети. Публикации могут не сохраниться.',
        'offline'
      );
    });

    window.addEventListener('online', () => {
      showNetworkState(
        'Соединение с сетью восстановлено',
        'online'
      );
    });
  }

  // -------------------------------------------------------------
  // Feature 5 — keyboard handling and scroll-lock accessibility
  // -------------------------------------------------------------

  function bindGlobalKeyboard() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && viewer) {
        event.preventDefault();
        closeViewer();
        return;
      }

      // Keep keyboard users from scrolling the document behind the viewer.
      if (
        viewer &&
        event.key === 'Tab'
      ) {
        const focusables = $$(
          'button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]',
          viewer
        ).filter(element => !element.hidden);

        if (!focusables.length) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  // -------------------------------------------------------------
  // Feature 6 — dynamic-card support and diagnostics
  // -------------------------------------------------------------

  function diagnostics() {
    const width = root.clientWidth;
    const pageWidth = Math.max(
      root.scrollWidth,
      document.body?.scrollWidth || 0
    );

    const feed = $('#communityFeed');

    return {
      version: 'V77',
      feedAvailable: !!feed,
      feedCards: feed?.querySelectorAll('.today-post-card').length || 0,
      longPostsEnhanced:
        feed?.querySelectorAll('[data-today-v77-text-ready="1"]').length || 0,
      photosReady:
        feed?.querySelectorAll('[data-today-v77-image-ready="1"]').length || 0,
      imageViewerOpen: !!viewer,
      backToTopAvailable: !!topButton,
      online: navigator.onLine,
      viewportWidth: width,
      pageWidth,
      horizontalOverflow: pageWidth > width + 2
    };
  }

  function init() {
    if (root.dataset.todayHomeV77 === 'ready') return;

    root.dataset.todayHomeV77 = 'ready';
    root.classList.add('today-home-v77');

    bindFeed($('#communityFeed'));
    createTopButton();
    createNetworkBanner();
    bindNetworkEvents();
    bindGlobalKeyboard();

    window.addEventListener(
      'scroll',
      scheduleTopButtonUpdate,
      { passive: true }
    );

    window.addEventListener('resize', scheduleTopButtonUpdate, {
      passive: true
    });

    window.TODAY_HOME_V77 = {
      version: 'V77',
      refresh() {
        processFeed($('#communityFeed'));
        updateTopButton();
        return diagnostics();
      },
      diagnose: diagnostics,
      closeViewer
    };

    if (new URLSearchParams(location.search).has('diagnostics')) {
      console.info('[TODAY V77 diagnostics]', diagnostics());
    }

    console.info('[TODAY HOME V77] Initialized', diagnostics());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
