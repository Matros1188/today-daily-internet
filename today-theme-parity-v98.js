/* TODAY THEME GEOMETRY PARITY V98 — mirror dark-theme geometry, keep light colors */
(() => {
  'use strict';
  if (window.__TODAY_THEME_GEOMETRY_V98_INSTALLED) return;
  window.__TODAY_THEME_GEOMETRY_V98_INSTALLED = true;

  const root = document.documentElement;
  const STYLE_ID = 'today-theme-geometry-parity-v98';
  const ATTR = 'data-today-geometry-v98';
  const BEFORE_ATTR = 'data-today-geometry-before-v98';
  const AFTER_ATTR = 'data-today-geometry-after-v98';

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE'
  ]);

  const GEOMETRY_PROPS = [
    'display', 'position', 'box-sizing',
    'width', 'height', 'min-width', 'min-height',
    'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'top', 'right', 'bottom', 'left', 'inset',
    'flex', 'flex-basis', 'flex-direction', 'flex-grow',
    'flex-shrink', 'flex-wrap',
    'grid-template-columns', 'grid-template-rows',
    'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
    'grid-column-start', 'grid-column-end',
    'grid-row-start', 'grid-row-end',
    'gap', 'row-gap', 'column-gap',
    'align-items', 'align-content', 'align-self',
    'justify-content', 'justify-items', 'justify-self',
    'place-items', 'place-content', 'place-self',
    'overflow', 'overflow-x', 'overflow-y',
    'border-top-width', 'border-right-width',
    'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style',
    'border-bottom-style', 'border-left-style',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'font-stretch', 'font-kerning', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing',
    'white-space', 'word-break', 'overflow-wrap',
    'text-align', 'text-indent', 'text-transform', 'text-overflow',
    'vertical-align', 'aspect-ratio', 'object-fit', 'object-position',
    'transform', 'transform-origin',
    'writing-mode', 'direction',
    'column-count', 'column-width', 'list-style-position',
    'text-wrap', 'zoom', 'appearance', '-webkit-appearance', 'content'
  ];

  let running = false;
  let timer = 0;
  let observer = null;

  function removeLocks() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();

    document
      .querySelectorAll(`[${ATTR}],[${BEFORE_ATTR}],[${AFTER_ATTR}]`)
      .forEach(el => {
        el.removeAttribute(ATTR);
        el.removeAttribute(BEFORE_ATTR);
        el.removeAttribute(AFTER_ATTR);
      });
  }

  function snapshotStyle(el, pseudo = null) {
    let cs;

    try {
      cs = getComputedStyle(el, pseudo);
    } catch (_) {
      return null;
    }

    const values = {};

    for (const prop of GEOMETRY_PROPS) {
      const value = String(cs.getPropertyValue(prop) || '').trim();
      if (value) values[prop] = value;
    }

    return {
      values,
      display: cs.display || '',
      rect: pseudo ? null : (() => {
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height
        };
      })()
    };
  }

  function collect() {
    const elements = Array.from(
      document.body ? document.body.querySelectorAll('*') : []
    ).filter(el =>
      el && el.tagName && !SKIP_TAGS.has(el.tagName)
    );

    return elements.map(el => ({
      el,
      main: snapshotStyle(el),
      before: snapshotStyle(el, '::before'),
      after: snapshotStyle(el, '::after')
    }));
  }

  function safeCssValue(value) {
    return String(value)
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/;/g, '\\3B ');
  }

  function differenceFor(dark, light, pseudo = false) {
    if (!dark || !light) return {};

    const out = {};

    for (const prop of GEOMETRY_PROPS) {
      const darkValue = dark.values[prop] || '';
      const lightValue = light.values[prop] || '';

      if (darkValue !== lightValue && darkValue !== '') {
        out[prop] = darkValue;
      }
    }

    // Если реальные размеры блока всё-таки отличаются,
    // фиксируем измеренные размеры тёмной темы.
    if (!pseudo && dark.rect && light.rect) {
      const canSize =
        dark.display !== 'inline' &&
        dark.display !== 'contents' &&
        dark.display !== 'none';

      if (
        canSize &&
        Math.abs(dark.rect.width - light.rect.width) > 0.75
      ) {
        out.width = `${Math.max(0, dark.rect.width).toFixed(3)}px`;
        out['box-sizing'] = 'border-box';
      }

      if (
        canSize &&
        Math.abs(dark.rect.height - light.rect.height) > 0.75
      ) {
        out.height = `${Math.max(0, dark.rect.height).toFixed(3)}px`;
        out['box-sizing'] = 'border-box';
      }
    }

    return out;
  }

  function declarationsFor(diff) {
    return Object.entries(diff)
      .map(([prop, value]) =>
        `${prop}:${safeCssValue(value)} !important;`
      )
      .join('');
  }

  function setLock(el, attr, id, diff, suffix, rules) {
    if (!Object.keys(diff).length) return;

    el.setAttribute(attr, String(id));

    rules.push(
      `html.today-theme-light [${attr}="${id}"]${suffix || ''}` +
      `{${declarationsFor(diff)}}`
    );
  }

  function mirrorDarkGeometry() {
    if (running || !document.body) return;

    if (!root.classList.contains('today-theme-light')) {
      removeLocks();
      return;
    }

    running = true;

    try {
      removeLocks();

      const hadLight = root.classList.contains('today-theme-light');
      const hadDark = root.classList.contains('today-theme-dark');
      const oldThemeData = root.getAttribute('data-today-theme');

      // Снимаем размеры в настоящей тёмной теме.
      root.classList.remove('today-theme-light');
      root.classList.add('today-theme-dark');
      root.setAttribute('data-today-theme', 'dark');
      void root.offsetHeight;

      const dark = collect();

      // Снимаем размеры в светлой теме при тех же DOM и viewport.
      root.classList.remove('today-theme-dark');
      root.classList.add('today-theme-light');
      root.setAttribute('data-today-theme', 'light');
      void root.offsetHeight;

      const light = collect();

      // Немедленно возвращаем выбранную пользователем светлую тему.
      root.classList.toggle('today-theme-light', hadLight);
      root.classList.toggle('today-theme-dark', hadDark && !hadLight);

      if (oldThemeData === null) {
        root.removeAttribute('data-today-theme');
      } else {
        root.setAttribute('data-today-theme', oldThemeData);
      }

      const rules = [];
      let id = 0;
      const count = Math.min(dark.length, light.length);

      for (let i = 0; i < count; i++) {
        const darkEntry = dark[i];
        const lightEntry = light[i];

        if (darkEntry.el !== lightEntry.el) continue;

        const mainDiff = differenceFor(
          darkEntry.main, lightEntry.main, false
        );
        if (Object.keys(mainDiff).length) {
          setLock(
            darkEntry.el, ATTR, ++id, mainDiff, '', rules
          );
        }

        const beforeDiff = differenceFor(
          darkEntry.before, lightEntry.before, true
        );
        if (Object.keys(beforeDiff).length) {
          setLock(
            darkEntry.el, BEFORE_ATTR, ++id,
            beforeDiff, '::before', rules
          );
        }

        const afterDiff = differenceFor(
          darkEntry.after, lightEntry.after, true
        );
        if (Object.keys(afterDiff).length) {
          setLock(
            darkEntry.el, AFTER_ATTR, ++id,
            afterDiff, '::after', rules
          );
        }
      }

      if (rules.length) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
          '/* V98: geometry mirrored from dark theme; light palette remains active */\n' +
          rules.join('\n');

        (document.head || document.documentElement).appendChild(style);
      }

      root.dataset.todayGeometryParityV98 = String(rules.length);
    } catch (error) {
      // Сбой дополнительной синхронизации не должен ломать сайт.
      console.warn('[TODAY theme parity V98]', error);
    } finally {
      running = false;
    }
  }

  function scheduleMirror() {
    if (!root.classList.contains('today-theme-light')) return;

    clearTimeout(timer);
    timer = setTimeout(mirrorDarkGeometry, 180);
  }

  function onThemeClick(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest('#todayThemeToggle')
        : null;

    if (!target) return;

    // theme.js уже переключает класс темы на этом этапе.
    queueMicrotask(() => {
      if (root.classList.contains('today-theme-light')) {
        mirrorDarkGeometry();
      } else {
        removeLocks();
      }
    });
  }

  function start() {
    if (root.classList.contains('today-theme-light')) {
      mirrorDarkGeometry();
    }

    document.addEventListener('click', onThemeClick, true);

    if ('MutationObserver' in window && document.body) {
      observer = new MutationObserver(records => {
        if (
          running ||
          !root.classList.contains('today-theme-light')
        ) {
          return;
        }

        const relevant = records.some(record => {
          const target = record.target;

          if (target === root || !(target instanceof Element)) {
            return false;
          }

          // Изменения отдельных плиток игры не запускают тяжёлую
          // полную сверку на каждом игровом кадре.
          if (
            target.closest(
              '.ts-m3-board,.ts-match-board,.ts-m3-gem'
            )
          ) {
            return false;
          }

          return true;
        });

        if (relevant) scheduleMirror();
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden']
      });
    }

    window.addEventListener('resize', scheduleMirror, {
      passive: true
    });

    window.addEventListener('orientationchange', scheduleMirror, {
      passive: true
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleMirror).catch(() => {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
/* END TODAY THEME GEOMETRY PARITY V98 */
