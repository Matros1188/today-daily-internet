/* TODAY ARCADE HUB V2.1 — DARK FIX — dedicated catalogue, original game engine retained */
(() => {
  'use strict';

  const root = document.getElementById('todayGamesHub');
  if (!root) return;

  const CATEGORY = {
    match3: 'puzzle',
    merge2048: 'puzzle',
    memory: 'puzzle',
    snake: 'arcade',
    breakout: 'arcade',
    starcatch: 'arcade',
    flappy: 'arcade',
    stacker: 'arcade',
    laserdodge: 'arcade',
    pulse: 'reflex',
    colorsnap: 'reflex',
    ttt: 'logic',
    word: 'logic',
    quiz: 'logic'
  };

  const CATEGORY_LABEL = {
    puzzle: 'Головоломки',
    arcade: 'Аркада',
    reflex: 'Реакция',
    logic: 'Логика'
  };

  const FILTERS = [
    ['all', 'Все игры'],
    ['puzzle', 'Головоломки'],
    ['arcade', 'Аркада'],
    ['reflex', 'Реакция'],
    ['logic', 'Логика']
  ];

  const LEADERBOARD_IDS = ['match3', 'flappy', 'merge2048', 'memory'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

  function renderError(message) {
    root.innerHTML = `
      <div class="tg-error">
        <b>Игровой центр пока не загрузился</b>
        <p>${escapeHtml(message)}</p>
        <button type="button" class="tg-play" id="tgReload">Повторить загрузку ↻</button>
        <p><a href="./index.html">← Вернуться на главную TODAY</a></p>
      </div>`;

    root.querySelector('#tgReload')?.addEventListener('click', () => {
      location.reload();
    });
  }

  function render() {
    const social = window.TODAY_SOCIAL;

    if (!social || typeof social.getGameCatalogue !== 'function') {
      renderError(
        'Игровой модуль не обнаружен. Проверь подключение social.js и обнови страницу.'
      );
      return;
    }

    let games;

    try {
      games = social.getGameCatalogue();
    } catch (error) {
      renderError(error?.message || 'Не удалось получить список игр.');
      return;
    }

    if (!Array.isArray(games) || !games.length) {
      renderError('Каталог игр пуст.');
      return;
    }

    const featured = games.find(game => game.id === 'match3') || games[0];
    const gridGames = games.filter(game => game.id !== featured.id);

    const filterMarkup = FILTERS.map(([id, label], index) => `
      <button type="button"
        class="tg-filter ${index === 0 ? 'is-active' : ''}"
        data-tg-filter="${id}"
        aria-pressed="${index === 0 ? 'true' : 'false'}">${label}</button>
    `).join('');

    const featureArt = featured.art || '';

    const gameCards = gridGames.map(game => {
      const category = CATEGORY[game.id] || 'arcade';
      const title = escapeHtml(game.title);
      const subtitle = escapeHtml(game.subtitle);
      const label = escapeHtml(game.label || CATEGORY_LABEL[category]);
      const id = escapeHtml(game.id);
      const art = game.art || '';
      const best = Math.max(0, Number(game.best) || 0);

      return `
        <article class="tg-card"
          data-tg-card="1"
          data-game-id="${id}"
          data-game-category="${category}"
          data-game-search="${escapeHtml(
            `${game.title} ${game.subtitle} ${game.label || ''} ${CATEGORY_LABEL[category]}`
          ).toLocaleLowerCase('ru-RU')}">
          <div class="tg-card-art">${art}</div>
          <div class="tg-card-copy">
            <div class="tg-card-meta">
              <span class="tg-pill">${label}</span>
              <small class="tg-local-best">Рекорд <b data-local-best="${id}">${best.toLocaleString('ru-RU')}</b></small>
            </div>
            <h3>${title}</h3>
            <p>${subtitle}</p>
            <div class="tg-card-bottom">
              <span class="tg-card-tag">TODAY ARCADE</span>
              <button type="button" class="tg-play"
                data-social-act="play-game" data-game="${id}">
                Играть <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </article>`;
    }).join('');

    const leaderboardTabs = LEADERBOARD_IDS
      .filter(id => games.some(game => game.id === id))
      .map(id => {
        const game = games.find(item => item.id === id);
        return `<button type="button" data-game-act="leaderboard"
          data-game="${escapeHtml(id)}">${escapeHtml(game.label || game.title)}</button>`;
      })
      .join('');

    root.innerHTML = `
      <header class="tg-topbar">
        <a class="tg-brand" href="./index.html" aria-label="TODAY — на главную">
          <span class="tg-brand-mark" aria-hidden="true">✦</span>
          <span class="tg-brand-copy">
            <b>TODAY ARCADE</b>
            <small>ИГРОВОЙ МИР TODAY</small>
          </span>
        </a>

        <nav class="tg-nav-actions" aria-label="Навигация">
          <a class="tg-nav-link" href="./index.html">← Главная</a>
          <button id="todayThemeToggle" type="button" aria-label="Переключить тему"
            title="Переключить тему">
            <span class="today-theme-icon" aria-hidden="true">☼</span>
            <span class="today-theme-label">СВЕТЛАЯ ТЕМА</span>
          </button>
          <a class="tg-nav-link tg-nav-profile" href="./profile.html">Мой профиль ↗</a>
        </nav>
      </header>

      <div class="tg-shell tg-content">
        <section class="tg-feature" data-tg-feature="1"
          data-game-id="${escapeHtml(featured.id)}"
          data-game-category="${CATEGORY[featured.id] || 'puzzle'}"
          data-game-search="${escapeHtml(
            `${featured.title} ${featured.subtitle} ${featured.label || ''}`
          ).toLocaleLowerCase('ru-RU')}">
          <div class="tg-feature-copy">
            <span class="tg-feature-badge">
              <span aria-hidden="true">✦</span>
              TODAY ORIGINAL · ГЛАВНАЯ ИГРА
            </span>
            <h1>CRYSTAL <span>CHRONICLES</span></h1>
            <p>
              Принцессу Элару забрала Бездна. Собирай кристаллы,
              раскрывай тайну Морвена и пройди путь через 11 глав
              королевства. Твоё большое приключение начинается здесь.
            </p>
            <div class="tg-feature-stats">
              <div class="tg-stat"><b>220</b><small>сюжетных уровней</small></div>
              <div class="tg-stat"><b>11</b><small>глав истории</small></div>
              <div class="tg-stat"><b>14</b><small>игр в коллекции</small></div>
            </div>
            <button type="button" class="tg-feature-cta"
              data-social-act="play-game" data-game="${escapeHtml(featured.id)}">
              Продолжить приключение <span aria-hidden="true">↗</span>
            </button>
          </div>

          <div class="tg-feature-art" aria-hidden="true">${featureArt}</div>
        </section>

        <section class="tg-section-head" aria-labelledby="tgCollectionTitle">
          <div>
            <span class="tg-eyebrow"><i class="tg-eyebrow-dot"></i> ВЫБЕРИ СВОЮ ИГРУ</span>
            <h2 id="tgCollectionTitle">Коллекция TODAY ARCADE</h2>
            <p>Большие приключения и короткие игры — всё в одном месте.</p>
          </div>
          <span class="tg-count" id="tgResultCount">${games.length} игр</span>
        </section>

        <div class="tg-toolbar">
          <div class="tg-filters" role="group" aria-label="Фильтры игр">
            ${filterMarkup}
          </div>

          <label class="tg-search">
            <span aria-hidden="true">⌕</span>
            <input id="tgGameSearch" type="search"
              autocomplete="off" placeholder="Найти игру…"
              aria-label="Поиск игры">
          </label>
        </div>

        <section class="tg-game-grid" id="tgGameGrid" aria-label="Все игры">
          ${gameCards}
          <div id="tgNoGames" class="tg-empty" hidden>
            Ничего не найдено. Попробуй другой запрос или категорию.
          </div>
        </section>

        <section class="tg-records" aria-labelledby="tgRecordsTitle">
          <div>
            <span class="tg-eyebrow">ЛИЧНЫЕ И МИРОВЫЕ РЕЗУЛЬТАТЫ</span>
            <h2 id="tgRecordsTitle">Рекорды TODAY</h2>
            <p>
              Личные рекорды хранятся на устройстве. Для онлайн-таблицы
              рекордов потребуется войти в аккаунт.
            </p>
          </div>
          <div class="tg-records-main">
            <div class="tg-record-tabs" role="group" aria-label="Рекорды по играм">
              ${leaderboardTabs}
            </div>
            <div id="todayGameLeaderboard" aria-live="polite">
              <p>Выбери игру, чтобы посмотреть рекорды за сегодня.</p>
            </div>
          </div>
        </section>

        <footer class="tg-footer">
          <span>© TODAY ARCADE · ОДИН ИНТЕРНЕТ. ОДИН ДЕНЬ.</span>
          <a href="./index.html">Вернуться в сегодняшнюю ленту ↗</a>
        </footer>
      </div>
    `;

    /* TODAY ARCADE HUB V3 — PREMIUM GAME LOUNGE */

    const search = root.querySelector('#tgGameSearch');

    // Уточняем тексты витрины: больше ясности, меньше визуального шума.
    const collectionTitle = root.querySelector('#tgCollectionTitle');
    if (collectionTitle) {
      collectionTitle.textContent = 'Игры под любое настроение';
    }

    const collectionDescription = root.querySelector('.tg-section-head p');
    if (collectionDescription) {
      collectionDescription.textContent =
        'От большой истории до коротких аркад — выбирай и возвращайся за новым рекордом.';
    }

    const collectionEyebrow = root.querySelector('.tg-section-head .tg-eyebrow');
    if (collectionEyebrow) {
      const dot = collectionEyebrow.querySelector('i');
      collectionEyebrow.textContent = '';
      if (dot) collectionEyebrow.appendChild(dot);
      collectionEyebrow.appendChild(
        document.createTextNode(' ИГРОВАЯ КОЛЛЕКЦИЯ')
      );
    }

    if (search) {
      search.placeholder = 'Найти игру…';
      search.setAttribute('aria-label', 'Найти игру в TODAY ARCADE');
      search.setAttribute('title', 'Быстрый поиск: нажми / или Ctrl+K');
    }

    // Случайный запуск одной из игр, учитывая активный поиск и жанр.
    const toolbar = root.querySelector('.tg-toolbar');

    if (toolbar && !root.querySelector('[data-tg-random]')) {
      const randomButton = document.createElement('button');
      randomButton.type = 'button';
      randomButton.className = 'tg-random-button';
      randomButton.setAttribute('data-tg-random', '1');
      randomButton.setAttribute('aria-label', 'Запустить случайную игру');
      randomButton.title = 'Выбрать случайную игру из текущей подборки';

      const randomIcon = document.createElement('span');
      randomIcon.className = 'tg-random-icon';
      randomIcon.setAttribute('aria-hidden', 'true');
      randomIcon.textContent = '✦';

      const randomLabel = document.createElement('span');
      randomLabel.className = 'tg-random-label';
      randomLabel.textContent = 'Случайная игра';

      randomButton.appendChild(randomIcon);
      randomButton.appendChild(randomLabel);

      const filters = toolbar.querySelector('.tg-filters');

      if (filters && filters.parentNode === toolbar) {
        filters.insertAdjacentElement('afterend', randomButton);
      } else if (search) {
        toolbar.insertBefore(randomButton, search);
      } else {
        toolbar.appendChild(randomButton);
      }

      randomButton.addEventListener('click', () => {
        const candidates = Array.from(
          root.querySelectorAll(
            '.tg-feature:not([hidden]) button[data-social-act="play-game"], ' +
            '.tg-card:not([hidden]) button[data-social-act="play-game"]'
          )
        );

        if (!candidates.length) {
          search?.focus();
          return;
        }

        const picked = candidates[
          Math.floor(Math.random() * candidates.length)
        ];

        picked.click();
      });
    }

    // Чуть более приятная анимация появления карточек.
    root.querySelectorAll('.tg-card').forEach((card, index) => {
      card.style.setProperty('--tg-card-index', String(index));
    });

    // Горячие клавиши: / или Ctrl+K — поиск; Escape очищает запрос.
    if (!root.dataset.tgKeyboardBound) {
      root.dataset.tgKeyboardBound = '1';

      document.addEventListener('keydown', event => {
        const active = document.activeElement;
        const isEditable = active instanceof HTMLElement && (
          active.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
        );

        if (
          event.key === '/' &&
          !isEditable &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          const field = root.querySelector('#tgGameSearch');
          if (field) {
            event.preventDefault();
            field.focus();
          }
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'k'
        ) {
          const field = root.querySelector('#tgGameSearch');
          if (field) {
            event.preventDefault();
            field.focus();
          }
        }

        if (
          event.key === 'Escape' &&
          active === root.querySelector('#tgGameSearch') &&
          active.value
        ) {
          active.value = '';
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.focus();
        }
      });
    }
    const filterButtons = Array.from(root.querySelectorAll('[data-tg-filter]'));
    const cards = Array.from(root.querySelectorAll('[data-tg-card]'));
    const feature = root.querySelector('[data-tg-feature]');
    const noGames = root.querySelector('#tgNoGames');
    const count = root.querySelector('#tgResultCount');

    let activeFilter = 'all';

    function applyFilters() {
      const q = String(search?.value || '').trim().toLocaleLowerCase('ru-RU');
      let visible = 0;

      cards.forEach(card => {
        const matchesCategory =
          activeFilter === 'all' ||
          card.dataset.gameCategory === activeFilter;

        const matchesQuery =
          !q || String(card.dataset.gameSearch || '').includes(q);

        const show = matchesCategory && matchesQuery;
        card.hidden = !show;
        if (show) visible++;
      });

      let showFeature = false;

      if (feature) {
        const matchesCategory =
          activeFilter === 'all' ||
          feature.dataset.gameCategory === activeFilter;

        const matchesQuery =
          !q || String(feature.dataset.gameSearch || '').includes(q);

        showFeature = matchesCategory && matchesQuery;
        feature.hidden = !showFeature;
      }

      const total = visible + (showFeature ? 1 : 0);

      if (count) {
        count.textContent = `${total} ${total === 1 ? 'игра' : total >= 2 && total <= 4 ? 'игры' : 'игр'}`;
      }

      if (noGames) noGames.hidden = total !== 0;
    }

    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        activeFilter = button.dataset.tgFilter || 'all';

        filterButtons.forEach(item => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        applyFilters();
      });
    });

    search?.addEventListener('input', applyFilters);
    applyFilters();

    // При возвращении из игры обновляем рекорды, уже сохранённые игровым движком.
    const modal = document.getElementById('modal');

    if (modal && !modal.dataset.tgBestObserver) {
      modal.dataset.tgBestObserver = '1';

      let refreshQueued = false;

      const refreshBest = () => {
        if (refreshQueued) return;
        refreshQueued = true;

        Promise.resolve().then(() => {
          refreshQueued = false;

          const current = window.TODAY_SOCIAL?.getGameCatalogue?.() || [];

          current.forEach(game => {
            document.querySelectorAll(
              `[data-local-best="${String(game.id).replace(/[^a-z0-9_-]/gi, '')}"]`
            ).forEach(node => {
              node.textContent = Math.max(0, Number(game.best) || 0)
                .toLocaleString('ru-RU');
            });
          });
        });
      };

      new MutationObserver(refreshBest).observe(modal, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  // Надёжный запуск каталога, даже если DOMContentLoaded уже прошёл.
  let bootAttempts = 0;

  function bootCatalogue() {
    if (window.TODAY_SOCIAL?.getGameCatalogue) {
      render();
      return;
    }

    bootAttempts += 1;

    if (bootAttempts < 35) {
      window.setTimeout(bootCatalogue, 100);
      return;
    }

    renderError(
      'Игровой модуль не успел запуститься. '
      + 'Перезагрузи страницу или вернись на главную TODAY '
      + 'и открой игровой центр ещё раз.'
    );
  }

  bootCatalogue();
})();
