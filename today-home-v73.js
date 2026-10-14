/* TODAY HOME V73 — responsive actions and diagnostics */
(() => {
  'use strict';

  if (window.TODAY_HOME_V73?.version === 'V73') return;

  const root = document.documentElement;
  const mediaQuery = window.matchMedia
    ? window.matchMedia('(max-width: 640px)')
    : null;

  let resizeTimer = null;

  function syncMobileActions() {
    const mobile = !!mediaQuery?.matches;
    root.classList.toggle('today-v73-mobile-actions', mobile);
  }

  function diagnostics() {
    const width = root.clientWidth;
    const pageWidth = Math.max(
      root.scrollWidth,
      document.body?.scrollWidth || 0
    );
    const actionBar = document.querySelector('#todayV69QuickBar');
    const actions = actionBar
      ? actionBar.querySelectorAll('[data-v70-action]').length
      : 0;

    return {
      version: 'V73',
      mobileActions: root.classList.contains('today-v73-mobile-actions'),
      quickActionsAvailable: actions,
      dailyRubrics: document.querySelectorAll(
        '#dailyGrid .daily-card'
      ).length,
      clipModuleAvailable: !!window.TODAY_MEDIA_V66,
      liveModuleAvailable:
        typeof window.TODAY_HOME_V69?.openLive === 'function',
      cameraModuleAvailable: !!window.TODAY_HOME_V70,
      horizontalOverflow: pageWidth > width + 2,
      viewportWidth: width,
      documentWidth: pageWidth
    };
  }

  function init() {
    if (root.dataset.todayHomeV73 === 'ready') return;

    root.dataset.todayHomeV73 = 'ready';
    root.classList.add('today-home-v73');
    syncMobileActions();

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncMobileActions, 100);
    }, { passive: true });

    if (mediaQuery) {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', syncMobileActions);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(syncMobileActions);
      }
    }

    window.TODAY_HOME_V73 = {
      version: 'V73',
      refresh() {
        syncMobileActions();
        return diagnostics();
      },
      diagnose: diagnostics
    };

    if (new URLSearchParams(location.search).has('diagnostics')) {
      console.info('[TODAY V73 diagnostics]', diagnostics());
    }

    console.info('[TODAY HOME V73] Initialized', diagnostics());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
