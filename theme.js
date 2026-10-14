/* TODAY MODAL BACK ROUTING FIX V40 — native navigation, immediate close, no DOM snapshots */
(() => {
  'use strict';
  const THEME_KEY = 'today-theme-preference-v26';
  const root = document.documentElement;
  const readTheme = () => { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch (_) { return 'dark'; } };
  let theme = readTheme();
  function applyTheme(value, persist = true) {
    theme = value === 'light' ? 'light' : 'dark';
    root.classList.toggle('today-theme-light', theme === 'light');
    root.classList.toggle('today-theme-dark', theme === 'dark');
    root.dataset.todayTheme = theme;
    const button = document.getElementById('todayThemeToggle');
    if (button) {
      const icon = button.querySelector('.today-theme-icon');
      const label = button.querySelector('.today-theme-label');
      if (icon) icon.textContent = theme === 'light' ? '☾' : '☼';
      if (label) label.textContent = theme === 'light' ? 'ТЁМНАЯ ТЕМА' : 'СВЕТЛАЯ ТЕМА';
      button.title = theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#edf2fa' : '#090f20';
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }
  }
  applyTheme(theme, false);
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('#todayThemeToggle') : null;
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    applyTheme(theme === 'light' ? 'dark' : 'light', true);
  }, true);

  const modalRoot = document.getElementById('modal');
  if (!modalRoot) return;
  const isOpen = () => !modalRoot.classList.contains('hidden');
  let cleanupPending = false;

  function restorePageAndHide() {
    if (!isOpen()) return;
    // Hide first. Never serialize or replace modalContent as part of a close operation.
    const savedBody = window.__todayModalBodyStyle && typeof window.__todayModalBodyStyle === 'object'
      ? window.__todayModalBodyStyle : {};
    const savedScroll = Number.isFinite(Number(window.__todayModalScrollY))
      ? Number(window.__todayModalScrollY) : (window.scrollY || 0);
    const card = modalRoot.querySelector('.modal-card');
    const content = document.getElementById('modalContent');
    const clearInline = (node, names) => {
      if (!node || !node.style) return;
      for (const name of names) { try { node.style.removeProperty(name); } catch (_) {} }
    };

    modalRoot.classList.add('hidden');
    modalRoot.classList.remove('today-social-page', 'today-social-modal');
    root.classList.remove('today-modal-open', 'today-social-page-mode');
    document.body.classList.remove('today-social-page-mode');
    document.body.style.position = savedBody.position || '';
    document.body.style.top = savedBody.top || '';
    document.body.style.left = savedBody.left || '';
    document.body.style.right = savedBody.right || '';
    document.body.style.width = savedBody.width || '';
    document.body.style.overflow = savedBody.overflow || '';
    clearInline(modalRoot, ['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
    clearInline(card, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
    clearInline(content, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);
    window.__todayModalBodyStyle = null;
    window.__todayModalScrollY = null;
    try { window.scrollTo(0, Math.max(0, savedScroll)); } catch (_) {}

    // Cleanup is deferred until after the browser gets a chance to paint the closed state.
    // No game callback or chat timer is allowed to delay making the modal disappear.
    if (!cleanupPending) {
      cleanupPending = true;
      const cleanup = () => setTimeout(() => {
        try { if (typeof window.__TODAY_STOP_ACTIVE_GAME_V26 === 'function') window.__TODAY_STOP_ACTIVE_GAME_V26(); } catch (error) { console.warn('[TODAY V40 game cleanup]', error); }
        try { if (typeof window.__TODAY_STOP_ACTIVE_POLL_V26 === 'function') window.__TODAY_STOP_ACTIVE_POLL_V26(); } catch (error) { console.warn('[TODAY V40 poll cleanup]', error); }
        cleanupPending = false;
      }, 0);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(cleanup); else cleanup();
    }
  }

  function isExplicitClose(event) {
    const element = event && event.target instanceof Element ? event.target : null;
    if (!element || !modalRoot.contains(element) || !isOpen()) return false;
    const button = element.closest('button,a,[role="button"]');
    const backdrop = modalRoot.querySelector('.modal-backdrop');
    const isBackdrop = !!backdrop && element === backdrop;
    if (!button && !isBackdrop) return false;
    const isSocial = modalRoot.classList.contains('today-social-modal') || modalRoot.classList.contains('today-social-page');
    if (isBackdrop) return true;
    if (isSocial && button.matches('#todaySocialBackTop,#todaySocialExitTop,#todaySocialCloseTop')) return true;
    if (button.matches('#modalClose,#todaySocialCloseTop,.ts-panel-close,[data-modal-close],[aria-label*="закрыть" i],[title*="закрыть" i]')) return true;
    const label = String(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '')
      .trim().replace(/\s+/g, ' ').toLowerCase();
    return /^(закрыть|close|close modal|закрыть окно|×|✕|x)$/.test(label);
  }

  // Capture at window level, but intercept only actual Close / overlay-exit actions.
  // Do not catch [data-game-act$="-back"] or generic Back buttons: social.js owns those routes.
  function interceptClose(event) {
    if (!isExplicitClose(event)) return;
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    try { event.stopImmediatePropagation(); } catch (_) {}
    restorePageAndHide();
  }
  window.addEventListener('click', interceptClose, true);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    try { event.stopImmediatePropagation(); } catch (_) {}
    restorePageAndHide();
  }, true);
})();
/* END TODAY MODAL BACK ROUTING FIX V40 */
