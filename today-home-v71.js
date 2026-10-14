/* TODAY HOME V71 — streamlined shell and fullscreen clips */
(() => {
  'use strict';

  if (window.TODAY_HOME_V71?.version === 'V71') return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let clipObserver = null;
  let clipGrid = null;
  let mediaOpenOriginal = null;
  let noiseObserver = null;

  function toast(message) {
    const node = $('#toast');
    if (!node) {
      console.info('[TODAY V71]', message);
      return;
    }
    node.textContent = String(message || '');
    node.classList.add('show');
    clearTimeout(window.__todayV71Toast);
    window.__todayV71Toast = setTimeout(() => node.classList.remove('show'), 3200);
  }

  function cleanLegacyTopBlock() {
    const selectors = [
      '#todayV51Tools',
      '#todayV51QuestionTrack',
      '.today-v51-question-track',
      '.today-v51-tools',
      '#todayOmniverseV60Open',
      '#todayHomeSearch',
      '#todayHomeActivity',
      '#todayMediaV66Button'
    ];

    selectors.forEach(selector => {
      $$(selector).forEach(node => node.remove());
    });

    // Если старый блок сменил ID, ищем только непосредственных соседей hero
    // и удаляем только блок с однозначными текстовыми маркерами.
    const hero = $('#homeSection');
    const main = hero?.closest('main');

    if (!hero || !main) return;

    let node = hero.previousElementSibling;

    while (node) {
      const previous = node.previousElementSibling;
      const text = String(node.innerText || node.textContent || '')
        .toLocaleLowerCase('ru')
        .replace(/\s+/g, ' ')
        .trim();

      const looksLikeLegacyIntro =
        (text.includes('ритм') || text.includes('поиск по today')) &&
        (text.includes('прочитай') || text.includes('обдумай')) &&
        (text.includes('ответь') || text.includes('сегодня'));

      if (looksLikeLegacyIntro) node.remove();

      node = previous;
    }
  }

  function quickbarMarkup() {
    const actions = [
      ['post', 'Создать', 'Запись'],
      ['story', 'История', 'Фото и видео'],
      ['photo', 'Фото', 'Фото'],
      ['clips', 'Клипы', 'Вертикальные видео'],
      ['music', 'Музыка', 'Музыка'],
      ['search', 'Поиск', 'Поиск в TODAY'],
      ['live', 'Эфир', 'Прямой эфир']
    ];

    const paths = {
      post: '<path d="M12 5v14M5 12h14"/>',
      story: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.5"/>',
      photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/>',
      clips: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="m10 8 5 4-5 4z"/>',
      music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
      search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
      live: '<circle cx="12" cy="12" r="3"/><path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13"/>'
    };

    return actions.map(([id, label, description]) => `
      <button type="button"
        class="today-v70-action"
        data-v70-action="${id}"
        title="${description}"
        aria-label="${description}">
        <span class="today-v70-action-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">${paths[id]}</svg>
        </span>
        <b>${label}</b>
      </button>
    `).join('');
  }

  function rebuildQuickbar() {
    let bar = $('#todayV69QuickBar');

    if (!bar) {
      bar = document.createElement('section');
      bar.id = 'todayV69QuickBar';

      const anchor = $('.activity-strip') || $('#homeSection');
      if (!anchor) return;

      anchor.insertAdjacentElement('afterend', bar);
    }

    bar.className = 'shell today-v70-quickbar';
    bar.setAttribute('aria-label', 'Основные действия TODAY');
    bar.innerHTML = `<div class="today-v70-quickbar-inner">${quickbarMarkup()}</div>`;
  }

  function tuneComposer() {
    const sheet = $('#todayV70Composer');
    if (sheet) {
      sheet.setAttribute('aria-label', 'Создание публикации');
    }

    const recordButton = $('[data-v70-record-story]');
    if (recordButton) {
      recordButton.setAttribute('aria-label', 'Записать видеоисторию через камеру');
    }
  }

  function syncClipMode() {
    const modal = $('.today-v66-media-modal');

    if (!modal) {
      if (clipObserver) {
        try { clipObserver.disconnect(); } catch (_) {}
        clipObserver = null;
      }
      clipGrid = null;
      return;
    }

    const grid = $('.today-v66-media-grid.is-clips', modal);

    modal.classList.toggle('today-v71-clips-mode', !!grid);

    if (!grid) {
      if (clipObserver) {
        try { clipObserver.disconnect(); } catch (_) {}
        clipObserver = null;
      }
      clipGrid = null;
      return;
    }

    const videos = $$('.today-v66-media-video', grid);

    if (grid === clipGrid && clipObserver) return;

    if (clipObserver) {
      try { clipObserver.disconnect(); } catch (_) {}
    }

    clipGrid = grid;

    videos.forEach(video => {
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      video.loop = true;
      video.muted = true;
      video.controls = true;
    });

    if (!('IntersectionObserver' in window)) return;

    clipObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          videos.forEach(other => {
            if (other !== video) {
              try { other.pause(); } catch (_) {}
            }
          });

          video.muted = true;
          const promise = video.play();
          if (promise && typeof promise.catch === 'function') promise.catch(() => {});
        } else {
          try { video.pause(); } catch (_) {}
        }
      });
    }, {
      root: grid,
      threshold: [0, 0.35, 0.65, 0.9]
    });

    videos.forEach(video => clipObserver.observe(video));
  }

  function wrapMediaApi() {
    const media = window.TODAY_MEDIA_V66;

    if (!media || typeof media.open !== 'function') return;
    if (media.__todayV71Wrapped) return;

    mediaOpenOriginal = media.open.bind(media);

    media.open = async function(tab = 'all') {
      const result = await mediaOpenOriginal(tab);

      if (tab === 'video') {
        requestAnimationFrame(syncClipMode);
        setTimeout(syncClipMode, 100);
        setTimeout(syncClipMode, 260);
      } else {
        setTimeout(syncClipMode, 80);
      }

      return result;
    };

    try {
      Object.defineProperty(media, '__todayV71Wrapped', {
        value: true,
        configurable: false
      });
    } catch (_) {
      media.__todayV71Wrapped = true;
    }
  }

  function addNoiseWatcher() {
    const main = $('main');
    if (!main || noiseObserver || !('MutationObserver' in window)) return;

    noiseObserver = new MutationObserver(() => {
      cleanLegacyTopBlock();
    });

    // Только прямые вставки в main, не все изменения публикаций.
    noiseObserver.observe(main, { childList: true });
  }

  function diagnostics() {
    const width = document.documentElement.clientWidth;
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0
    );

    return {
      version: 'V71',
      quickbar: !!$('#todayV69QuickBar'),
      legacyIntroVisible: !!$(
        '#todayV51Tools,#todayV51QuestionTrack,.today-v51-question-track'
      ),
      composer: !!$('#todayV70Composer'),
      camera: !!$('#todayV70Camera'),
      clipsFullscreen: !!$('.today-v66-media-modal.today-v71-clips-mode'),
      viewportWidth: width,
      documentWidth,
      horizontalOverflow: documentWidth > width + 2,
      online: navigator.onLine
    };
  }

  function init() {
    if (document.documentElement.dataset.todayHomeV71 === 'ready') return;

    document.documentElement.dataset.todayHomeV71 = 'ready';
    document.documentElement.classList.add('today-home-v71');

    cleanLegacyTopBlock();
    rebuildQuickbar();
    tuneComposer();
    wrapMediaApi();
    addNoiseWatcher();

    // V70 может создать модальное окно после открытия истории.
    document.addEventListener('click', event => {
      if (event.target.closest('[data-v70-record-story]')) {
        setTimeout(tuneComposer, 80);
      }

      if (event.target.closest('.today-v66-media-close')) {
        setTimeout(syncClipMode, 80);
      }
    }, true);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        $$('.today-v71-clips-mode video').forEach(video => {
          try { video.pause(); } catch (_) {}
        });
      }
    });

    if (new URLSearchParams(location.search).has('diagnostics')) {
      console.info('[TODAY V71 diagnostics]', diagnostics());
    }

    window.TODAY_HOME_V71 = {
      version: 'V71',
      refresh() {
        cleanLegacyTopBlock();
        rebuildQuickbar();
        tuneComposer();
        syncClipMode();
        return diagnostics();
      },
      diagnose: diagnostics
    };

    console.info('[TODAY HOME V71] Initialized', diagnostics());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
