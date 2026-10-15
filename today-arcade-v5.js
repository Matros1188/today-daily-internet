/* TODAY ARCADE V5 — CONTENT DIRECTOR */
(() => {
  'use strict';
  const root = document.getElementById('todayGamesHub');
  if (!root) return;
  if (root.dataset.arcadeV5Observer === '1') return;
  root.dataset.arcadeV5Observer = '1';
  root.classList.add('tg-arcade-v5');

  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  function enhance() {
    if (!root.querySelector('.tg-feature') || !root.querySelector('.tg-v4-opening')) return;

    const kicker = root.querySelector('.tg-v4-opening-kicker');
    if (kicker && kicker.dataset.arcadeV5Copy !== '1') {
      const dot = kicker.querySelector('.tg-v4-live-dot');
      kicker.replaceChildren();
      if (dot) kicker.appendChild(dot);
      kicker.appendChild(document.createTextNode(' TODAY ARCADE · ПЕРЕЗАГРУЗКА НАЧИНАЕТСЯ ЗДЕСЬ'));
      kicker.dataset.arcadeV5Copy = '1';
    }

    const title = root.querySelector('.tg-v4-opening h2');
    if (title) {
      const accent = title.querySelector('span');
      const firstText = Array.from(title.childNodes).find(node => node.nodeType === 3);
      if (firstText && firstText.textContent !== 'Выйди из рутины. ') firstText.textContent = 'Выйди из рутины. ';
      if (accent) setText(accent, 'Зайди в игру.');
    }

    setText(root.querySelector('.tg-v4-opening p'),
      'Одна большая история, быстрые аркады и новые рекорды. Выбирай по настроению — и сразу играй.');

    const metricLabels = ['ИГР НА ВЫБОР', 'УРОВНЕЙ СЮЖЕТА', 'ГЛАВ КАМПАНИИ'];
    root.querySelectorAll('.tg-v4-metric small').forEach((node, i) => {
      if (metricLabels[i]) setText(node, metricLabels[i]);
    });

    const featureBadge = root.querySelector('.tg-feature-badge');
    if (featureBadge && featureBadge.dataset.arcadeV5Copy !== '1') {
      featureBadge.innerHTML = '<span aria-hidden="true">✦</span> ГЛАВНЫЙ КВЕСТ · 220 УРОВНЕЙ';
      featureBadge.dataset.arcadeV5Copy = '1';
    }

    setText(root.querySelector('.tg-feature-copy > p'),
      'Морвен забрал Элару. Собирай кристаллы, открывай новые миры и пройди 220 уровней, чтобы вернуть королевству свет.');

    const featureButton = root.querySelector('.tg-feature-cta');
    if (featureButton && featureButton.dataset.arcadeV5Copy !== '1') {
      featureButton.innerHTML = 'Начать приключение <span aria-hidden="true">↗</span>';
      featureButton.dataset.arcadeV5Copy = '1';
    }

    const signalCopy = [
      ['ГЛАВНЫЙ КВЕСТ', 'Большая история на 220 уровней'],
      ['БЫСТРЫЙ ЗАПУСК', 'Короткая игра — за пару секунд'],
      ['ЛИЧНЫЕ РЕКОРДЫ', 'Есть повод вернуться и улучшить']
    ];
    root.querySelectorAll('.tg-v4-signal-item').forEach((item, i) => {
      if (!signalCopy[i]) return;
      setText(item.querySelector('.tg-v4-signal-copy b'), signalCopy[i][0]);
      setText(item.querySelector('.tg-v4-signal-copy small'), signalCopy[i][1]);
    });

    setText(root.querySelector('#tgCollectionTitle'), 'Куда отправимся сегодня?');
    setText(root.querySelector('.tg-section-head p'),
      '14 игр — от коротких аркад до большого приключения. Выбирай по настроению.');

    const collectionEyebrow = root.querySelector('.tg-section-head .tg-eyebrow');
    if (collectionEyebrow && collectionEyebrow.dataset.arcadeV5Copy !== '1') {
      const dot = collectionEyebrow.querySelector('i');
      collectionEyebrow.replaceChildren();
      if (dot) collectionEyebrow.appendChild(dot);
      collectionEyebrow.appendChild(document.createTextNode(' ВЫБЕРИ СВОЙ РЕЖИМ'));
      collectionEyebrow.dataset.arcadeV5Copy = '1';
    }

    const search = root.querySelector('#tgGameSearch');
    if (search) {
      if (search.placeholder !== 'Какую игру ищем?') search.placeholder = 'Какую игру ищем?';
      search.setAttribute('aria-label', 'Поиск игры в TODAY ARCADE');
    }

    // Remove redundant portal counters from the prior visual layer.
    root.querySelectorAll('.tg-v4-portal-label').forEach(node => node.remove());
  }

  let queued = false;
  const scheduleEnhance = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      try { enhance(); } catch (error) { console.warn('[TODAY ARCADE V5] Visual enhancement skipped:', error); }
    });
  };

  // Current catalogue is usually already present; observer handles late boot/re-render.
  scheduleEnhance();
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });
  window.setTimeout(scheduleEnhance, 150);
  window.setTimeout(scheduleEnhance, 650);
})();
