/* TODAY THEME + UNIVERSAL NON-BLOCKING BACK V26 */
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
    if (meta) meta.content = theme === 'light' ? '#eeeae0' : '#090f20';
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }
  }
  applyTheme(theme, false);
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('#todayThemeToggle') : null;
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    applyTheme(theme === 'light' ? 'dark' : 'light', true);
  }, true);

  // Modal route snapshots make Back instant. It restores the previous rendered page instead of
  // waiting for history.back(), another network request, or a hung async screen loader.
  const modalRoot = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  if (!modalRoot || !content) return;
  let wasOpen = !modalRoot.classList.contains('hidden');
  let lastHtml = '';
  let lastScroll = 0;
  let backStack = [];
  let restoreTarget = null;
  const openNow = () => !modalRoot.classList.contains('hidden');
  const isLoading = html => /ts-loading-spinner|Загружаем раздел|Подключаемся к TODAY|Загрузка\.\.\./i.test(html || '');
  const meaningful = html => typeof html === 'string' && html.replace(/\s/g, '').length > 80 && !isLoading(html);
  const isGameView = html => /class="[^"]*ts-m3-game/.test(html || '');
  const isCampaignView = html => /class="[^"]*ts-m3-campaign/.test(html || '');
  const currentScroll = () => { const card = modalRoot.querySelector('.modal-card'); return card ? card.scrollTop : 0; };
  const restore = snapshot => {
    if (!snapshot || !openNow()) return false;
    try { if (typeof window.__TODAY_STOP_ACTIVE_GAME_V26 === 'function') window.__TODAY_STOP_ACTIVE_GAME_V26(); } catch (_) {}
    try { if (typeof window.__TODAY_STOP_ACTIVE_POLL_V26 === 'function') window.__TODAY_STOP_ACTIVE_POLL_V26(); } catch (_) {}
    restoreTarget = snapshot.html;
    content.innerHTML = snapshot.html;
    if (content.dataset) delete content.dataset.chatId;
    const card = modalRoot.querySelector('.modal-card');
    if (card) card.scrollTop = Math.max(0, snapshot.scroll || 0);
    const title = modalRoot.querySelector('#todaySocialPageTitle');
    const heading = content.querySelector('h1,h2,h3,[data-page-title]');
    if (title && heading && heading.textContent.trim()) title.textContent = heading.textContent.trim().slice(0, 64);
    return true;
  };
  const back = () => {
    if (!openNow()) return;
    try { if (typeof window.__TODAY_STOP_ACTIVE_GAME_V26 === 'function') window.__TODAY_STOP_ACTIVE_GAME_V26(); } catch (_) {}
    const previous = backStack.pop();
    if (previous && restore(previous)) return;
    // Always use our own direct cleanup. Do not delegate to legacy close handlers or history.back().
    try { if (typeof window.__TODAY_STOP_ACTIVE_POLL_V26 === 'function') window.__TODAY_STOP_ACTIVE_POLL_V26(); } catch (_) {}
    const savedScroll = Number.isFinite(Number(window.__todayModalScrollY)) ? Number(window.__todayModalScrollY) : window.scrollY;
    const savedBody = window.__todayModalBodyStyle && typeof window.__todayModalBodyStyle === 'object' ? window.__todayModalBodyStyle : {};
    const clearInline = (node, names) => { if (!node || !node.style) return; names.forEach(name => { try { node.style.removeProperty(name); } catch (_) {} }); };
    clearInline(modalRoot, ['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
    clearInline(modalRoot.querySelector('.modal-card'), ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
    clearInline(content, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);
    modalRoot.querySelectorAll('[data-object-url]').forEach(node => { try { URL.revokeObjectURL(node.dataset.objectUrl); } catch (_) {} delete node.dataset.objectUrl; });
    modalRoot.classList.add('hidden');
    modalRoot.classList.remove('today-social-page','today-social-modal');
    content.innerHTML = '';
    document.documentElement.classList.remove('today-modal-open','today-social-page-mode');
    document.body.classList.remove('today-social-page-mode');
    document.body.style.position = savedBody.position || '';
    document.body.style.top = savedBody.top || '';
    document.body.style.left = savedBody.left || '';
    document.body.style.right = savedBody.right || '';
    document.body.style.width = savedBody.width || '';
    document.body.style.overflow = savedBody.overflow || '';
    window.__todayModalBodyStyle = null; window.__todayModalScrollY = null;
    try { window.scrollTo(0, Math.max(0, savedScroll)); } catch (_) {}
    backStack = []; lastHtml = ''; restoreTarget = null;
  };
  const selector = '#todaySocialBackTop,#todaySocialExitTop,#todaySocialCloseTop,#modalClose,.ts-panel-close,[data-back],[data-nav-back],[data-social-act="back"],[data-game-act$="-back"],[aria-label*="назад" i],[title*="назад" i]';
  document.addEventListener('click', event => {
    const element = event.target instanceof Element ? event.target : null;
    const button = element && element.closest('button,a,[role="button"]');
    if (!button || !modalRoot.contains(button) || !openNow()) return;
    const id = button.id || '';
    const text = (button.getAttribute('aria-label') || button.getAttribute('title') || button.innerText || button.textContent || '').trim().replace(/\s+/g,' ').toLowerCase();
    const matches = button.matches(selector) || /^(назад|←|‹|к карте кампании|к играм|к друзьям|вернуться)$/.test(text) || /^(←|‹)\s*(назад|к играм|к друзьям|к списку)/.test(text);
    if (!matches) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    // Explicit X/close exits the modal. Back-arrow controls restore a prior screen when possible.
    if (id === 'modalClose' || /закрыть|close modal|выход/.test(text) || text === '×' || text === '✕') {
      backStack = []; back(); return;
    }
    back();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !openNow()) return;
    event.preventDefault();
    backStack = [];
    back();
  }, true);

  const observer = new MutationObserver(() => {
    const opened = openNow();
    if (opened && !wasOpen) { backStack = []; lastHtml = ''; lastScroll = 0; restoreTarget = null; }
    if (!opened && wasOpen) { backStack = []; lastHtml = ''; lastScroll = 0; restoreTarget = null; }
    wasOpen = opened;
    if (!opened) return;
    const html = content.innerHTML;
    if (restoreTarget !== null && html === restoreTarget) { lastHtml = html; lastScroll = currentScroll(); restoreTarget = null; return; }
    if (isLoading(html)) return;
    if (html === lastHtml) return;
    if (meaningful(lastHtml)) {
      // A changing game HUD/result is one screen, not a new navigation level.
      if ((isGameView(lastHtml) && isGameView(html)) || (isCampaignView(lastHtml) && isCampaignView(html))) { lastHtml = html; lastScroll = currentScroll(); return; }
      const prev = { html: lastHtml, scroll: lastScroll };
      if (!backStack.length || backStack[backStack.length - 1].html !== prev.html) backStack.push(prev);
      if (backStack.length > 18) backStack.shift();
    }
    lastHtml = html;
    lastScroll = currentScroll();
  });
  observer.observe(modalRoot, {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
})();
/* END TODAY THEME + UNIVERSAL NON-BLOCKING BACK V26 */
