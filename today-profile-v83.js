/* TODAY V83 — PROFILE JOURNEY */
(() => {
  'use strict';

  if (window.TODAY_PROFILE_V83?.version === 'V83') return;

  const PAGE = '#todayProfilePage';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let observer = null;
  let queued = false;
  let cardNode = null;
  let currentData = null;
  let enhancementCount = 0;

  const escHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  const escXML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  }[char]));

  function parseCount(value) {
    const digits = String(value ?? '').replace(/[^\d]/g, '');
    return Math.max(0, Number(digits) || 0);
  }

  function getData(root) {
    const identity = $('.today-profile-v63-identity', root);
    const statsRoot = $('.today-profile-v81-stats', root);

    if (!identity || !statsRoot) return null;

    const values = {};

    $$('.today-profile-v81-stats article', statsRoot).forEach(article => {
      const label = $('small', article)?.textContent?.trim()?.toLocaleUpperCase('ru-RU');
      const value = $('b', article)?.textContent?.trim() || '0';

      if (label) values[label] = value;
    });

    const name = $('h1', identity)?.textContent?.trim() || 'Участник TODAY';
    const username = $('.today-profile-v63-username', identity)
      ?.textContent?.trim() || '@today';

    const level = parseCount(values['УРОВЕНЬ']);
    const xp = parseCount(values['ОПЫТ']);
    const streak = parseCount(values['СЕРИЯ']);
    const coins = parseCount(values['МОНЕТЫ']);
    const posts = parseCount(values['ЗАПИСИ']);

    return {
      name,
      username,
      level: Math.max(1, level),
      xp,
      streak,
      coins,
      posts
    };
  }

  function goalFor(streak) {
    if (streak < 7) {
      return {
        target: 7,
        title: 'Первая неделя',
        caption: `Ещё ${7 - streak} ${7 - streak === 1 ? 'день' : 'дней'} до рубежа в 7 дней`
      };
    }

    if (streak < 30) {
      return {
        target: 30,
        title: 'Месяц в ритме',
        caption: `Ещё ${30 - streak} ${30 - streak === 1 ? 'день' : 'дней'} до рубежа в 30 дней`
      };
    }

    if (streak < 100) {
      return {
        target: 100,
        title: 'Сто дней TODAY',
        caption: `Ещё ${100 - streak} ${100 - streak === 1 ? 'день' : 'дней'} до рубежа в 100 дней`
      };
    }

    return {
      target: 100,
      title: 'Большая дистанция',
      caption: 'Рубеж в 100 дней пройден. Продолжай в собственном ритме.'
    };
  }

  function milestoneCards(data) {
    const levelTitle = data.level >= 10
      ? 'Свой человек'
      : data.level >= 3
        ? 'Осваиваешься'
        : 'Первый шаг';

    const streakTitle = data.streak >= 30
      ? 'Месяц в ритме'
      : data.streak >= 7
        ? 'Неделя подряд'
        : data.streak > 0
          ? 'Серия началась'
          : 'Ритм начинается сегодня';

    const postTitle = data.posts >= 20
      ? 'Автор своей истории'
      : data.posts >= 5
        ? 'Есть что вспомнить'
        : data.posts > 0
          ? 'Первые записи'
          : 'Первая запись впереди';

    return [
      {
        symbol: '✦',
        label: 'УРОВЕНЬ',
        title: levelTitle,
        detail: `Уровень ${data.level}`
      },
      {
        symbol: '◷',
        label: 'ПОСЛЕДОВАТЕЛЬНОСТЬ',
        title: streakTitle,
        detail: `${data.streak} дн. подряд`
      },
      {
        symbol: '▤',
        label: 'ПУБЛИКАЦИИ',
        title: postTitle,
        detail: `${data.posts} записей`
      }
    ];
  }

  function summaryText(data) {
    return [
      'TODAY — моя история одного дня',
      `${data.name} · ${data.username}`,
      `Уровень: ${data.level}`,
      `Опыт: ${data.xp.toLocaleString('ru-RU')} XP`,
      `Серия: ${data.streak} дн.`,
      `Монеты: ${data.coins.toLocaleString('ru-RU')}`,
      `Личные записи: ${data.posts}`,
      '',
      'Интернет, который живёт только сегодня.'
    ].join('\n');
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    let area;

    try {
      area = document.createElement('textarea');
      area.value = text;
      area.readOnly = true;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      area.style.pointerEvents = 'none';

      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, area.value.length);

      return document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      area?.remove();
    }
  }

  function announce(message) {
    const toast = $('#todayProfileToast');

    if (toast) {
      toast.textContent = message;
      toast.hidden = false;
      toast.classList.add('show');

      clearTimeout(window.__todayProfileV83Toast);

      window.__todayProfileV83Toast = setTimeout(() => {
        toast.classList.remove('show');
        toast.hidden = true;
      }, 3000);
    } else {
      console.info('[TODAY V83]', message);
    }
  }

  function buildCardMarkup(data) {
    const goal = goalFor(data.streak);
    const progress = data.streak >= 100
      ? 100
      : Math.max(0, Math.min(100, Math.round(data.streak / goal.target * 100)));

    const milestones = milestoneCards(data);

    return `
      <div class="today-profile-v83-heading">
        <div>
          <small class="today-profile-v83-eyebrow">YOUR TODAY JOURNEY</small>
          <h2>Твой путь в TODAY</h2>
          <p>Личная карточка прогресса — только твои реальные показатели.</p>
        </div>
        <div class="today-profile-v83-mark" aria-hidden="true">✦</div>
      </div>

      <div class="today-profile-v83-card-preview">
        <div class="today-profile-v83-card-top">
          <span class="today-profile-v83-wordmark"><i>✦</i> TODAY</span>
          <span class="today-profile-v83-card-label">MY DAILY STORY</span>
        </div>

        <div class="today-profile-v83-person">
          <div class="today-profile-v83-avatar" aria-hidden="true">
            ${escHTML(String(data.name).trim().charAt(0).toLocaleUpperCase('ru-RU') || '✦')}
          </div>
          <div class="today-profile-v83-person-details">
            <b>${escHTML(data.name)}</b>
            <span>${escHTML(data.username)}</span>
          </div>
          <div class="today-profile-v83-level">
            <small>УРОВЕНЬ</small>
            <b>${data.level}</b>
          </div>
        </div>

        <div class="today-profile-v83-mini-stats">
          <div><small>ОПЫТ</small><b>${data.xp.toLocaleString('ru-RU')} XP</b></div>
          <div><small>СЕРИЯ</small><b>${data.streak} дн.</b></div>
          <div><small>ЗАПИСИ</small><b>${data.posts}</b></div>
        </div>

        <div class="today-profile-v83-card-bottom">
          <span>ИНТЕРНЕТ ОДНОГО ДНЯ</span>
          <span>ОСТАВЬ СВОЙ СЛЕД ✦</span>
        </div>
      </div>

      <div class="today-profile-v83-actions">
        <button type="button" data-v83-export>
          <span aria-hidden="true">↧</span> Сохранить карточку SVG
        </button>
        <button type="button" data-v83-copy>
          <span aria-hidden="true">▤</span> Копировать сводку
        </button>
      </div>

      <div class="today-profile-v83-progress">
        <div class="today-profile-v83-progress-top">
          <div>
            <small>СЛЕДУЮЩИЙ ОРИЕНТИР</small>
            <b>${escHTML(goal.title)}</b>
          </div>
          <strong>${progress}%</strong>
        </div>
        <div
          class="today-profile-v83-progress-track"
          role="progressbar"
          aria-label="Прогресс серии"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${progress}">
          <span style="width:${progress}%"></span>
        </div>
        <p>${escHTML(goal.caption)}</p>
      </div>

      <div class="today-profile-v83-milestones">
        ${milestones.map(item => `
          <article class="today-profile-v83-milestone">
            <div class="today-profile-v83-milestone-symbol" aria-hidden="true">
              ${escHTML(item.symbol)}
            </div>
            <div>
              <small>${escHTML(item.label)}</small>
              <b>${escHTML(item.title)}</b>
              <span>${escHTML(item.detail)}</span>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function renderCard(root, data) {
    const stats = $('.today-profile-v81-stats', root);

    if (!stats) return;

    let card = $('.today-profile-v83-journey', root);

    const signature = JSON.stringify(data);

    if (card && card.getAttribute('data-v83-signature') === signature) {
      cardNode = card;
      currentData = data;
      return;
    }

    if (!card) {
      card = document.createElement('section');
      card.className = 'today-profile-v83-journey';
      card.setAttribute('aria-label', 'Путь и достижения TODAY');
      stats.insertAdjacentElement('afterend', card);
    }

    card.innerHTML = buildCardMarkup(data);
    card.setAttribute('data-v83-signature', signature);

    cardNode = card;
    currentData = data;
  }

  function exportSVG(data) {
    const xml = escXML;
    const name = xml(data.name);
    const username = xml(data.username);
    const level = data.level;
    const xp = data.xp.toLocaleString('ru-RU');
    const streak = data.streak;
    const posts = data.posts;
    const coins = data.coins.toLocaleString('ru-RU');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1428"/>
      <stop offset="55%" stop-color="#172c49"/>
      <stop offset="100%" stop-color="#273d59"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8bcbf1" stop-opacity=".68"/>
      <stop offset="100%" stop-color="#8e9ef2" stop-opacity=".12"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#87d5ef"/>
      <stop offset="100%" stop-color="#b6a4f6"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="675" rx="42" fill="url(#bg)"/>
  <circle cx="1050" cy="70" r="220" fill="#83c8ed" opacity=".08"/>
  <circle cx="1125" cy="160" r="130" fill="#b39df6" opacity=".10"/>
  <rect x="35" y="35" width="1130" height="605" rx="34" fill="none" stroke="#ffffff" stroke-opacity=".20"/>
  <rect x="36" y="36" width="1128" height="603" rx="33" fill="url(#shine)" opacity=".25"/>

  <text x="82" y="105" fill="#c2ddf3" font-family="Arial,sans-serif" font-size="26" font-weight="700" letter-spacing="4">✦ TODAY</text>
  <text x="1118" y="103" fill="#c2ddf3" font-family="Arial,sans-serif" font-size="15" text-anchor="end" letter-spacing="3">MY DAILY STORY</text>

  <circle cx="125" cy="230" r="48" fill="url(#line)" opacity=".95"/>
  <text x="125" y="246" fill="#0c1428" font-family="Arial,sans-serif" font-size="43" font-weight="700" text-anchor="middle">${xml(String(data.name).trim().charAt(0).toLocaleUpperCase('ru-RU') || '✦')}</text>

  <text x="198" y="216" fill="#ffffff" font-family="Arial,sans-serif" font-size="40" font-weight="700">${name}</text>
  <text x="200" y="259" fill="#b9d4ed" font-family="Arial,sans-serif" font-size="24">${username}</text>

  <rect x="940" y="176" width="172" height="99" rx="22" fill="#ffffff" fill-opacity=".10" stroke="#ffffff" stroke-opacity=".20"/>
  <text x="1026" y="208" fill="#a9c8e2" font-family="Arial,sans-serif" font-size="14" text-anchor="middle" letter-spacing="2">УРОВЕНЬ</text>
  <text x="1026" y="251" fill="#ffffff" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle">${level}</text>

  <path d="M82 326 H1118" stroke="url(#line)" stroke-width="2" stroke-opacity=".80"/>

  <g font-family="Arial,sans-serif">
    <text x="85" y="378" fill="#9fc1de" font-size="16" letter-spacing="2">ОПЫТ</text>
    <text x="85" y="431" fill="#ffffff" font-size="34" font-weight="700">${xml(xp)} XP</text>

    <text x="365" y="378" fill="#9fc1de" font-size="16" letter-spacing="2">СЕРИЯ</text>
    <text x="365" y="431" fill="#ffffff" font-size="34" font-weight="700">${streak} дн.</text>

    <text x="645" y="378" fill="#9fc1de" font-size="16" letter-spacing="2">ЗАПИСИ</text>
    <text x="645" y="431" fill="#ffffff" font-size="34" font-weight="700">${posts}</text>

    <text x="925" y="378" fill="#9fc1de" font-size="16" letter-spacing="2">МОНЕТЫ</text>
    <text x="925" y="431" fill="#ffffff" font-size="34" font-weight="700">${xml(coins)}</text>
  </g>

  <rect x="82" y="480" width="1036" height="2" fill="#ffffff" fill-opacity=".15"/>
  <text x="82" y="542" fill="#e2edf8" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="2">ИНТЕРНЕТ, КОТОРЫЙ ЖИВЁТ ТОЛЬКО СЕГОДНЯ</text>
  <text x="82" y="583" fill="#8faccc" font-family="Arial,sans-serif" font-size="16">Оставь свой след ✦</text>
  <text x="1115" y="583" fill="#8faccc" font-family="Arial,sans-serif" font-size="14" text-anchor="end">TODAY · PROFILE JOURNEY</text>
</svg>`;

    const blob = new Blob([svg], {
      type: 'image/svg+xml;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    const slug = String(data.username || 'today')
      .replace(/^@/, '')
      .toLowerCase()
      .replace(/[^a-z0-9а-яё_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'today';

    anchor.href = url;
    anchor.download = `today-profile-${slug}.svg`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    announce('Карточка профиля сохранена в SVG.');
  }

  function enhance() {
    const root = $(PAGE);

    if (!root) return;

    const data = getData(root);

    if (!data) return;

    renderCard(root, data);
    enhancementCount++;
  }

  function schedule() {
    if (queued) return;

    queued = true;

    queueMicrotask(() => {
      queued = false;

      try {
        enhance();
      } catch (error) {
        console.warn('[TODAY V83] Profile Journey error:', error);
      }
    });
  }

  function init() {
    const root = $(PAGE);

    if (!root) return;

    root.addEventListener('click', async event => {
      const button = event.target instanceof Element
        ? event.target.closest('button')
        : null;

      if (!button || !root.contains(button)) return;

      if (button.hasAttribute('data-v83-export')) {
        if (!currentData) {
          schedule();
          announce('Карточка ещё загружается.');
          return;
        }

        exportSVG(currentData);
      }

      if (button.hasAttribute('data-v83-copy')) {
        if (!currentData) {
          announce('Профиль ещё загружается.');
          return;
        }

        const copied = await copyText(summaryText(currentData));

        announce(
          copied
            ? 'Сводка профиля скопирована.'
            : 'Не удалось скопировать автоматически. Проверь разрешение браузера.'
        );
      }
    });

    schedule();

    if ('MutationObserver' in window) {
      observer = new MutationObserver(schedule);
      observer.observe(root, {
        childList: true,
        subtree: true
      });
    }

    window.addEventListener('beforeunload', () => {
      observer?.disconnect();
    }, { once: true });

    window.TODAY_PROFILE_V83 = {
      version: 'V83',

      refresh() {
        schedule();
        return this.diagnose();
      },

      diagnose() {
        const rootNow = $(PAGE);

        return {
          version: 'V83',
          active: Boolean(rootNow),
          cardVisible: Boolean(rootNow && $('.today-profile-v83-journey', rootNow)),
          profileName: currentData?.name || null,
          enhancements: enhancementCount
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
