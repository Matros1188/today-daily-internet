/* TODAY THEME GEOMETRY PARITY V100
   Mirrors dark-theme layout and typography in light theme.
   Intentionally does NOT lock width/height or transforms.
   Palette, text colors, shadows, gradients and image filters stay theme-specific.
*/
(() => {
  'use strict';
  if (window.__TODAY_THEME_GEOMETRY_V100__) return;
  window.__TODAY_THEME_GEOMETRY_V100__ = true;

  const root = document.documentElement;
  const STYLE_ID = 'today-theme-parity-v100-rules';
  const COLOR_SCHEME_ID = 'today-theme-parity-v100-color-scheme';
  const MAIN_ATTR = 'data-today-geo-v100';
  const BEFORE_ATTR = 'data-today-geo-before-v100';
  const AFTER_ATTR = 'data-today-geo-after-v100';
  const SKIP = new Set(['SCRIPT','STYLE','LINK','META','TITLE','NOSCRIPT','TEMPLATE']);

  // Без width/height и transform — не закрепляем элементы в одном размере.
  const PROPS = [
    'display','position','box-sizing','z-index','float','clear','order',
    'min-width','max-width','min-height','max-height',
    'margin-top','margin-right','margin-bottom','margin-left',
    'padding-top','padding-right','padding-bottom','padding-left',
    'top','right','bottom','left',
    'flex','flex-basis','flex-grow','flex-shrink','flex-direction','flex-wrap',
    'grid-template-columns','grid-template-rows','grid-auto-columns','grid-auto-rows',
    'grid-auto-flow','grid-column-start','grid-column-end','grid-row-start','grid-row-end',
    'grid-area','gap','row-gap','column-gap',
    'align-items','align-content','align-self',
    'justify-content','justify-items','justify-self',
    'place-items','place-content','place-self',
    'overflow','overflow-x','overflow-y',
    'border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-top-style','border-right-style','border-bottom-style','border-left-style',
    'border-top-left-radius','border-top-right-radius',
    'border-bottom-right-radius','border-bottom-left-radius',
    'font-family','font-size','font-weight','font-style','font-stretch',
    'font-kerning','font-variant','font-feature-settings','font-variation-settings',
    'line-height','letter-spacing','word-spacing',
    'white-space','word-break','overflow-wrap',
    'text-align','text-indent','text-transform','text-overflow',
    'vertical-align','aspect-ratio','object-fit','object-position',
    'writing-mode','direction','column-count','column-width',
    'list-style-position','text-wrap','table-layout','border-collapse'
  ];

  let busy = false;
  let timer = 0;

  function ensureColorSchemeFix() {
    let style = document.getElementById(COLOR_SCHEME_ID);

    if (!style) {
      style = document.createElement('style');
      style.id = COLOR_SCHEME_ID;
      style.textContent =
        'html.today-theme-light{color-scheme:light!important}\n' +
        'html.today-theme-dark{color-scheme:dark!important}';

      (document.head || root).appendChild(style);
    }
  }

  function clearParityRules() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    document
      .querySelectorAll(`[${MAIN_ATTR}],[${BEFORE_ATTR}],[${AFTER_ATTR}]`)
      .forEach(el => {
        el.removeAttribute(MAIN_ATTR);
        el.removeAttribute(BEFORE_ATTR);
        el.removeAttribute(AFTER_ATTR);
      });
  }

  function snap(el, pseudo) {
    let cs;

    try {
      cs = getComputedStyle(el, pseudo || null);
    } catch (_) {
      return null;
    }

    const vals = {};

    for (const prop of PROPS) {
      const v = String(cs.getPropertyValue(prop) || '').trim();
      if (v) vals[prop] = v;
    }

    return {
      values: vals,
      display: cs.display || ''
    };
  }

  function allNodes() {
    return Array.from(
      document.body ? document.body.querySelectorAll('*') : []
    ).filter(el => el && el.tagName && !SKIP.has(el.tagName));
  }

  function diff(dark, light) {
    if (!dark || !light) return {};

    const out = {};

    for (const prop of PROPS) {
      const d = dark.values[prop] || '';
      const l = light.values[prop] || '';

      if (d && d !== l) out[prop] = d;
    }

    return out;
  }

  function cssValue(value) {
    return String(value).replace(/[\r\n\t]/g, ' ').replace(/[{};]/g, ' ');
  }

  function addRule(el, attr, id, values, pseudo, rules) {
    const entries = Object.entries(values);
    if (!entries.length) return;

    el.setAttribute(attr, String(id));

    const declarations = entries
      .map(([prop, value]) => `${prop}:${cssValue(value)} !important;`)
      .join('');

    rules.push(
      `html.today-theme-light [${attr}="${id}"]${pseudo || ''}{${declarations}}`
    );
  }

  function mirror() {
    if (busy || !document.body) return;

    if (!root.classList.contains('today-theme-light')) {
      clearParityRules();
      return;
    }

    busy = true;

    try {
      ensureColorSchemeFix();
      clearParityRules();

      const wasLight = root.classList.contains('today-theme-light');
      const wasDark = root.classList.contains('today-theme-dark');
      const oldData = root.getAttribute('data-today-theme');

      // Снимаем вычисленные стили в тёмной теме на том же DOM.
      root.classList.remove('today-theme-light');
      root.classList.add('today-theme-dark');
      root.setAttribute('data-today-theme', 'dark');
      void root.offsetHeight;

      const nodes = allNodes();
      const dark = nodes.map(el => ({
        el,
        main: snap(el),
        before: snap(el, '::before'),
        after: snap(el, '::after')
      }));

      // Снимаем вычисленные стили в светлой теме.
      root.classList.remove('today-theme-dark');
      root.classList.add('today-theme-light');
      root.setAttribute('data-today-theme', 'light');
      void root.offsetHeight;

      const light = nodes.map(el => ({
        el,
        main: snap(el),
        before: snap(el, '::before'),
        after: snap(el, '::after')
      }));

      // Восстанавливаем тему, выбранную пользователем.
      root.classList.toggle('today-theme-light', wasLight);
      root.classList.toggle('today-theme-dark', wasDark && !wasLight);

      if (oldData === null) root.removeAttribute('data-today-theme');
      else root.setAttribute('data-today-theme', oldData);

      const rules = [];
      let id = 0;

      for (let i = 0; i < Math.min(dark.length, light.length); i++) {
        const d = dark[i];
        const l = light[i];

        if (d.el !== l.el) continue;

        addRule(d.el, MAIN_ATTR, ++id, diff(d.main, l.main), '', rules);
        addRule(d.el, BEFORE_ATTR, ++id, diff(d.before, l.before), '::before', rules);
        addRule(d.el, AFTER_ATTR, ++id, diff(d.after, l.after), '::after', rules);
      }

      if (rules.length) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
          '/* V100 layout/type parity; palette remains light */\n' +
          rules.join('\n');

        (document.head || root).appendChild(style);
      }

      root.dataset.todayGeometryParityV100 = String(rules.length);
    } catch (error) {
      console.warn('[TODAY theme parity V100]', error);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (!root.classList.contains('today-theme-light')) return;

    clearTimeout(timer);
    timer = setTimeout(mirror, 220);
  }

  function onThemeClick(event) {
    const el = event.target instanceof Element
      ? event.target.closest('#todayThemeToggle')
      : null;

    if (!el) return;

    queueMicrotask(() => {
      if (root.classList.contains('today-theme-light')) mirror();
      else clearParityRules();
    });
  }

  function start() {
    ensureColorSchemeFix();

    if (root.classList.contains('today-theme-light')) mirror();

    document.addEventListener('click', onThemeClick, true);

    if ('MutationObserver' in window && document.body) {
      const observer = new MutationObserver(records => {
        if (busy || !root.classList.contains('today-theme-light')) return;

        const relevant = records.some(record => {
          const target = record.target;

          if (!(target instanceof Element)) return false;

          // Частые движения плиток match-3 не должны запускать
          // полное сравнение страницы на каждом кадре.
          if (target.closest('.ts-m3-board,.ts-match-board,.ts-m3-gem')) {
            return false;
          }

          return true;
        });

        if (relevant) schedule();
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class','style','hidden','aria-hidden']
      });
    }

    window.addEventListener('resize', schedule, {passive:true});
    window.addEventListener('orientationchange', schedule, {passive:true});

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(schedule).catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
/* END TODAY THEME GEOMETRY PARITY V100 */
