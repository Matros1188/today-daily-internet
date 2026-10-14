/* TODAY HOME V72 — mobile focus and rubric controls */
(() => {
  'use strict';

  if (window.TODAY_HOME_V72?.version === 'V72') return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const root = document.documentElement;
  let observedGrid = null;
  let gridObserver = null;
  let resizeTimer = null;

  function cards() {
    return $$('#dailyGrid .daily-card');
  }

  function ensureControl(grid) {
    let control = $('#todayV72RubricControl');

    if (control) return control;

    control = document.createElement('div');
    control.id = 'todayV72RubricControl';
    control.className = 'today-v72-rubric-control';
    control.hidden = true;
    control.innerHTML = `
      <button id="todayV72RubricToggle"
              type="button"
              aria-controls="dailyGrid"
              aria-expanded="false">
        <span class="today-v72-rubric-toggle-icon" aria-hidden="true">⌄</span>
        <span class="today-v72-rubric-toggle-copy">
          <b data-v72-toggle-title>Показать все рубрики</b>
          <small data-v72-toggle-note>Остальные блоки доступны по нажатию</small>
        </span>
        <span class="today-v72-rubric-toggle-count"
              data-v72-toggle-count>12</span>
      </button>`;

    grid.insertAdjacentElement('afterend', control);
    return control;
  }

  function connectGridObserver(grid) {
    if (grid === observedGrid || !('MutationObserver' in window)) return;

    if (gridObserver) {
      try { gridObserver.disconnect(); } catch (_) {}
    }

    observedGrid = grid;
    gridObserver = new MutationObserver(() => {
      window.requestAnimationFrame(syncLayout);
    });

    gridObserver.observe(grid, { childList: true });
  }

  function syncLayout() {
    const grid = $('#dailyGrid');
    if (!grid) return;

    const mobile = !!(
      window.matchMedia &&
      window.matchMedia('(max-width: 640px)').matches
    );

    root.classList.toggle('today-v72-mobile', mobile);

    if (!mobile) {
      root.classList.remove('today-v72-rubrics-expanded');
    }

    const list = cards();
    const control = ensureControl(grid);
    const button = $('#todayV72RubricToggle', control);
    const title = $('[data-v72-toggle-title]', control);
    const note = $('[data-v72-toggle-note]', control);
    const count = $('[data-v72-toggle-count]', control);

    const expanded = root.classList.contains(
      'today-v72-rubrics-expanded'
    );

    control.hidden = !mobile || list.length <= 6;

    if (title) {
      title.textContent = expanded
        ? 'Свернуть до 6 рубрик'
        : `Показать все ${list.length} рубрик`;
    }

    if (note) {
      note.textContent = expanded
        ? `Все ${list.length} рубрик сейчас открыты`
        : 'Первые 6 — на главной, остальные по нажатию';
    }

    if (count) {
      count.textContent = expanded
        ? '⌃'
        : String(Math.max(0, list.length - 6));
    }

    if (button) {
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute(
        'aria-label',
        expanded
          ? 'Свернуть список до шести рубрик'
          : `Показать все ${list.length} рубрик`
      );
    }

    connectGridObserver(grid);
  }

  function diagnostics() {
    const width = document.documentElement.clientWidth;
    const pageWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0
    );

    const list = cards();
    const mobile = root.classList.contains('today-v72-mobile');
    const expanded = root.classList.contains(
      'today-v72-rubrics-expanded'
    );

    return {
      version: 'V72',
      rubricCount: list.length,
      estimatedVisibleRubrics:
        mobile && !expanded ? Math.min(6, list.length) : list.length,
      mobileFocus: mobile,
      allRubricsExpanded: expanded,
      liveModuleAvailable:
        typeof window.TODAY_HOME_V69?.openLive === 'function',
      cameraModuleAvailable: !!window.TODAY_HOME_V70,
      mediaModuleAvailable: !!window.TODAY_MEDIA_V66,
      viewportWidth: width,
      pageWidth,
      horizontalOverflow: pageWidth > width + 2
    };
  }

  function init() {
    if (root.dataset.todayHomeV72 === 'ready') return;
    root.dataset.todayHomeV72 = 'ready';
    root.classList.add('today-home-v72');

    syncLayout();

    document.addEventListener('click', event => {
      const button = event.target.closest('#todayV72RubricToggle');
      if (!button) return;

      event.preventDefault();

      root.classList.toggle('today-v72-rubrics-expanded');
      syncLayout();

      if (!root.classList.contains('today-v72-rubrics-expanded')) {
        $('#todayTitle')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncLayout, 100);
    }, { passive: true });

    if (window.matchMedia) {
      const query = window.matchMedia('(max-width: 640px)');
      if (query.addEventListener) {
        query.addEventListener('change', syncLayout);
      } else if (query.addListener) {
        query.addListener(syncLayout);
      }
    }

    window.TODAY_HOME_V72 = {
      version: 'V72',
      refresh() {
        syncLayout();
        return diagnostics();
      },
      diagnose: diagnostics
    };

    if (new URLSearchParams(location.search).has('diagnostics')) {
      console.info('[TODAY V72 diagnostics]', diagnostics());
    }

    console.info('[TODAY HOME V72] Initialized', diagnostics());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
