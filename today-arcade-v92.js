
/* TODAY ARCADE V92 — 100 IMPROVEMENTS */
(() => {
  "use strict";

  const VERSION = "20261015190032";

  const GAME_IDS = [
    "match3", "flappy", "merge2048", "memory", "snake",
    "pulse", "breakout", "ttt", "word", "colorsnap",
    "stacker", "laserdodge", "quiz", "starcatch"
  ];

  const GAME_NAMES = {
    match3: "CRYSTAL CHRONICLES",
    flappy: "NIGHT FLIGHT",
    merge2048: "MERGE 2048",
    memory: "REMEMBER",
    snake: "NEON SNAKE",
    pulse: "PULSE REACTION",
    breakout: "NEON BREAKOUT",
    ttt: "X / O DUEL",
    word: "WORD SHIFT",
    colorsnap: "COLOR SNAP",
    stacker: "SKY STACKER",
    laserdodge: "LASER DODGE",
    quiz: "QUICK QUIZ",
    starcatch: "STAR CATCHER"
  };

  const GAME_CATEGORY = {
    match3: "puzzle",
    merge2048: "puzzle",
    ttt: "puzzle",
    memory: "memory",
    word: "brain",
    quiz: "brain",
    colorsnap: "brain",
    pulse: "reaction",
    flappy: "arcade",
    snake: "arcade",
    breakout: "arcade",
    stacker: "arcade",
    laserdodge: "arcade",
    starcatch: "arcade"
  };

  const CATEGORY_LABEL = {
    all: "Все игры",
    puzzle: "Головоломки",
    memory: "Память",
    brain: "Логика",
    reaction: "Реакция",
    arcade: "Аркады",
    favorites: "Избранное"
  };

  const GAME_GUIDES = {
    match3: "CRYSTAL CHRONICLES: сопоставляй соседние кристаллы, следи за целью уровня и используй доступные усилители. Сюжет, уровень и прогресс сохраняются существующим движком.",
    flappy: "NIGHT FLIGHT: коснись поля или нажми пробел, чтобы взмахнуть. Держи ритм, следи за проёмами и старайся не терять высоту.",
    merge2048: "MERGE 2048: сдвигай плитки стрелками или свайпом. Одинаковые числа объединяются. Оставляй пространство для следующих ходов.",
    memory: "REMEMBER: открывай две карточки за ход. Запоминай символы и расположение уже увиденных пар, чтобы сократить число попыток.",
    snake: "NEON SNAKE: используй экранные стрелки или клавиши направления. Собирай ядра, не направляй змейку в стену или собственный хвост.",
    pulse: "PULSE REACTION: дождись зелёного сигнала. Нажатие раньше времени заканчивает попытку. Чем меньше задержка после сигнала, тем лучше.",
    breakout: "NEON BREAKOUT: управляй платформой касанием или мышью, держи мяч в игре и разбивай блоки. Не теряй поле из виду.",
    ttt: "X / O DUEL: ищи выигрышную линию и блокируй угрозы соперника. Учитывай не только следующий ход, но и возможную вилку.",
    word: "WORD SHIFT: собери исходное слово из перемешанных букв. Вводи ответ в поле и проверяй его до окончания таймера.",
    colorsnap: "COLOR SNAP: выбирай реальный цвет букв, а не смысл написанного слова. Сначала посмотри на оттенок, потом нажимай.",
    stacker: "SKY STACKER: останавливай движущийся этаж максимально точно. Каждый промах уменьшает полезную площадь следующего блока.",
    laserdodge: "LASER DODGE: меняй полосу до попадания импульса. Следи за направлением лазеров и не жди последней доли секунды.",
    quiz: "QUICK QUIZ: прочитай вопрос целиком, сравни варианты и выбирай ответ до следующего раунда. Результат зависит от точности.",
    starcatch: "STAR CATCHER: двигай корзину под звёзды и избегай тёмных осколков. Следи за следующими объектами и не гонись за каждым."
  };

  const STORAGE = {
    favorites: "today-arcade-v92-favorites",
    history: "today-arcade-v92-history",
    awards: "today-arcade-v92-awards",
    calm: "today-arcade-calm",
    menu: "today-arcade-v92-menu-state"
  };

  const state = {
    observer: null,
    booted: false,
    activeGame: null,
    loggedGame: null,
    sessionStarted: 0,
    sessionTimer: 0,
    lastScore: null,
    lastStatus: "",
    feedbackTimer: 0,
    filter: "all",
    search: "",
    sort: "default",
    menu: null,
    lastToast: "",
    toastTimer: 0
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function safeGet(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = safeGet(key, null);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      return safeSet(key, JSON.stringify(value));
    } catch (_) {
      return false;
    }
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function dateKey() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const values = {};
      for (const part of parts) values[part.type] = part.value;
      return values.year + "-" + values.month + "-" + values.day;
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function gameFromUrl() {
    try {
      const id = new URL(location.href).searchParams.get("arcade");
      return GAME_IDS.includes(id) ? id : null;
    } catch (_) {
      return null;
    }
  }

  function getFavorites() {
    const raw = readJson(STORAGE.favorites, []);
    return Array.isArray(raw)
      ? [...new Set(raw.filter(id => GAME_IDS.includes(id)))]
      : [];
  }

  function setFavorites(ids) {
    writeJson(STORAGE.favorites, [...new Set(ids.filter(id => GAME_IDS.includes(id)))]);
  }

  function getHistory() {
    const raw = readJson(STORAGE.history, []);
    if (!Array.isArray(raw)) return [];

    return raw
      .filter(row => row && GAME_IDS.includes(row.id))
      .slice(0, 80);
  }

  function gameBest(id) {
    try {
      if (id !== "match3") {
        return Math.max(0, Number(localStorage.getItem("today-game-best-" + id) || 0));
      }

      let best = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("today-crystal-chronicles-v25:")) continue;

        try {
          const data = JSON.parse(localStorage.getItem(key) || "null");
          for (const row of Object.values(data?.levels || {})) {
            best = Math.max(best, Number(row?.best_score || 0));
          }
        } catch (_) {}
      }

      return best;
    } catch (_) {
      return 0;
    }
  }

  function countToday(history) {
    const day = dateKey();
    return history.filter(row => row.day === day).length;
  }

  function distinctPlayed(history) {
    return new Set(history.map(row => row.id)).size;
  }

  function recentGame(history) {
    return history.length ? history[0].id : null;
  }

  function dailyGameId() {
    const day = dateKey();
    let hash = 0;

    for (let i = 0; i < day.length; i++) {
      hash = ((hash << 5) - hash + day.charCodeAt(i)) | 0;
    }

    return GAME_IDS[Math.abs(hash) % GAME_IDS.length];
  }

  function toast(message) {
    const root = $("#todayV92Toast") || document.body.appendChild(
      Object.assign(document.createElement("div"), {
        id: "todayV92Toast",
        className: "today-v92-toast",
        role: "status",
        ariaLive: "polite"
      })
    );

    const text = String(message || "").slice(0, 220);

    if (state.lastToast === text && root.classList.contains("is-visible")) return;
    state.lastToast = text;
    root.textContent = text;
    root.classList.add("is-visible");

    if (state.toastTimer) clearTimeout(state.toastTimer);

    state.toastTimer = setTimeout(() => {
      root.classList.remove("is-visible");
      state.lastToast = "";
    }, 2400);
  }

  function addHistory(id) {
    if (!GAME_IDS.includes(id)) return;

    const history = getHistory();
    history.unshift({
      id,
      day: dateKey(),
      at: Date.now()
    });

    writeJson(STORAGE.history, history.slice(0, 80));
    updateCatalog();
  }

  function getAwards() {
    const value = readJson(STORAGE.awards, []);
    return Array.isArray(value) ? value : [];
  }

  function award(id, label) {
    const awards = getAwards();
    if (awards.includes(id)) return;

    awards.push(id);
    writeJson(STORAGE.awards, awards);
    toast("Достижение открыто: " + label);
  }

  function updateAwards(history) {
    const unique = distinctPlayed(history);
    const days = [...new Set(history.map(row => row.day))];

    if (history.length >= 1) award("first-play", "Первый запуск");
    if (unique >= 3) award("three-games", "Исследователь аркады");
    if (unique >= 7) award("seven-games", "Семь граней TODAY");
    if (unique >= 14) award("all-games", "Коллекционер игр");
    if (days.length >= 3) award("three-days", "Возвращение в игру");
  }

  function categoryFor(id) {
    return GAME_CATEGORY[id] || "arcade";
  }

  function getCardId(card) {
    const launch = $('[data-social-act="play-game"][data-game]', card);
    const id = launch?.dataset?.game;
    return GAME_IDS.includes(id) ? id : null;
  }

  function setTextIfChanged(node, value) {
    if (node && node.textContent !== String(value)) {
      node.textContent = String(value);
    }
  }

  function createDiscovery(home) {
    let deck = $(".today-v92-discovery", home);
    if (deck) return deck;

    const grid = $(".ts-game-grid", home);
    if (!grid) return null;

    deck = document.createElement("section");
    deck.className = "today-v92-discovery";
    deck.setAttribute("aria-label", "Поиск и управление игровым каталогом");

    deck.innerHTML = `
      <div class="today-v92-discovery-header">
        <div>
          <h3 class="today-v92-section-title">Твоя игровая зона</h3>
          <p class="today-v92-section-subtitle">
            Подбирай игру под настроение, возвращайся к рекордам и сохраняй любимое.
          </p>
        </div>
        <span class="today-v92-micro-label">ARCADE V92</span>
      </div>

      <div class="today-v92-topgrid">
        <div class="today-v92-stats" aria-label="Игровая статистика">
          <div class="today-v92-stat">
            <b data-v92-stat="games">14</b>
            <span>Всего игр</span>
          </div>
          <div class="today-v92-stat">
            <b data-v92-stat="favorites">0</b>
            <span>Избранное</span>
          </div>
          <div class="today-v92-stat">
            <b data-v92-stat="today">0</b>
            <span>Запусков сегодня</span>
          </div>
          <div class="today-v92-stat">
            <b data-v92-stat="played">0</b>
            <span>Открыто игр</span>
          </div>
        </div>

        <article class="today-v92-mission">
          <span class="today-v92-micro-label">ИСПЫТАНИЕ ДНЯ</span>
          <h3 data-v92-daily-title>Выбери свою игру дня</h3>
          <p data-v92-daily-copy>
            Новая цель на каждый день. Начни с одной игровой сессии.
          </p>
          <button class="today-v92-mission-button"
            type="button" data-v92-play-daily>
            Начать испытание <span aria-hidden="true">↗</span>
          </button>
        </article>
      </div>

      <div class="today-v92-toolsline">
        <label class="today-v92-search">
          <span>ПОИСК ПО ИГРАМ</span>
          <input type="search" data-v92-search
            placeholder="Например, змейка, кристаллы, слова…"
            autocomplete="off" spellcheck="false"
            aria-label="Найти игру">
        </label>

        <button class="today-v92-ui-button" type="button" data-v92-random>
          🎲 Случайная
        </button>

        <button class="today-v92-ui-button" type="button" data-v92-resume>
          ▶ Продолжить
        </button>

        <select class="today-v92-ui-button" data-v92-sort
          aria-label="Сортировка игр">
          <option value="default">Сначала главные</option>
          <option value="recent">Недавно открытые</option>
          <option value="record">По рекорду</option>
          <option value="name">По названию</option>
        </select>
      </div>

      <div class="today-v92-filter-row" role="group" aria-label="Категории игр">
        <button class="today-v92-filter" data-v92-filter="all"
          aria-pressed="true" type="button">Все игры</button>
        <button class="today-v92-filter" data-v92-filter="puzzle"
          aria-pressed="false" type="button">Головоломки</button>
        <button class="today-v92-filter" data-v92-filter="memory"
          aria-pressed="false" type="button">Память</button>
        <button class="today-v92-filter" data-v92-filter="brain"
          aria-pressed="false" type="button">Логика</button>
        <button class="today-v92-filter" data-v92-filter="reaction"
          aria-pressed="false" type="button">Реакция</button>
        <button class="today-v92-filter" data-v92-filter="arcade"
          aria-pressed="false" type="button">Аркады</button>
        <button class="today-v92-filter" data-v92-filter="favorites"
          aria-pressed="false" type="button">♡ Избранное</button>
      </div>

      <div class="today-v92-achievements" aria-label="Достижения">
        <span class="today-v92-achievement" data-v92-achievement="first-play">
          ✦ <b>Новичок</b>
        </span>
        <span class="today-v92-achievement" data-v92-achievement="three-games">
          ◈ <b>Исследователь</b>
        </span>
        <span class="today-v92-achievement" data-v92-achievement="seven-games">
          ☆ <b>Коллекционер</b>
        </span>
        <span class="today-v92-achievement" data-v92-achievement="all-games">
          ♛ <b>Все игры</b>
        </span>
        <span class="today-v92-achievement" data-v92-achievement="three-days">
          ◷ <b>Возвращение</b>
        </span>
      </div>

      <div class="today-v92-empty" data-v92-empty hidden>
        Ничего не найдено. Измени запрос или выбери другую категорию.
      </div>
    `;

    grid.parentNode.insertBefore(deck, grid);
    return deck;
  }

  function updateCatalog() {
    const home = $(".ts-games-home");
    if (!home) return;

    const grid = $(".ts-game-grid", home);
    if (!grid) return;

    const deck = createDiscovery(home);
    if (!deck) return;

    const history = getHistory();
    const favorites = getFavorites();
    const recent = [...new Set(history.map(row => row.id))];
    const recentIndex = new Map(recent.map((id, index) => [id, index]));
    const daily = dailyGameId();

    setTextIfChanged($('[data-v92-stat="games"]', deck), GAME_IDS.length);
    setTextIfChanged($('[data-v92-stat="favorites"]', deck), favorites.length);
    setTextIfChanged($('[data-v92-stat="today"]', deck), countToday(history));
    setTextIfChanged($('[data-v92-stat="played"]', deck), distinctPlayed(history));

    const dailyTitle = $('[data-v92-daily-title]', deck);
    const dailyCopy = $('[data-v92-daily-copy]', deck);
    const dailyButton = $('[data-v92-play-daily]', deck);

    setTextIfChanged(dailyTitle, GAME_NAMES[daily]);
    setTextIfChanged(
      dailyCopy,
      "Сегодняшняя игра: " + GAME_NAMES[daily] +
      ". Запусти её и попробуй улучшить свой результат."
    );

    if (dailyButton) {
      dailyButton.dataset.game = daily;
      dailyButton.setAttribute(
        "aria-label",
        "Открыть испытание дня: " + GAME_NAMES[daily]
      );
    }

    const recentId = recentGame(history);
    const resume = $('[data-v92-resume]', deck);

    if (resume) {
      resume.disabled = !recentId;
      resume.dataset.game = recentId || "";
      resume.style.opacity = recentId ? "1" : ".55";
      resume.title = recentId
        ? "Продолжить: " + GAME_NAMES[recentId]
        : "Сначала открой любую игру";
      setTextIfChanged(
        resume,
        recentId ? "▶ " + GAME_NAMES[recentId] : "▶ Продолжить"
      );
    }

    const search = $('[data-v92-search]', deck);

    if (search && search.value !== state.search) {
      search.value = state.search;
    }

    const sortSelect = $('[data-v92-sort]', deck);

    if (sortSelect && sortSelect.value !== state.sort) {
      sortSelect.value = state.sort;
    }

    $$(".today-v92-filter", deck).forEach(button => {
      const active = button.dataset.v92Filter === state.filter;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const cards = $$(".ts-game-card", grid);

    cards.forEach((card, index) => {
      const id = getCardId(card);
      if (!id) return;

      card.dataset.v92GameId = id;
      card.dataset.v92Category = categoryFor(id);

      if (!card.dataset.v92Order) {
        card.dataset.v92Order = String(index);
      }

      const art = $(".ts-game-art", card);
      const bottom = $(".ts-game-card-bottom", card);
      const launch = $('[data-social-act="play-game"]', card);

      if (art && !$(".today-v92-card-badge", art)) {
        const badge = document.createElement("span");
        badge.className = "today-v92-card-badge";
        badge.textContent = id === "match3" ? "ГЛАВНАЯ ИГРА" : CATEGORY_LABEL[categoryFor(id)];
        art.appendChild(badge);
      }

      if (art && !$(".today-v92-fav", art)) {
        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = "today-v92-fav";
        favoriteButton.dataset.v92Favorite = id;
        favoriteButton.setAttribute("aria-label", "Добавить в избранное");
        favoriteButton.setAttribute("aria-pressed", "false");
        favoriteButton.textContent = "☆";
        art.appendChild(favoriteButton);
      }

      const favButton = $(".today-v92-fav", card);

      if (favButton) {
        const selected = favorites.includes(id);
        favButton.textContent = selected ? "★" : "☆";
        favButton.setAttribute("aria-pressed", selected ? "true" : "false");
        favButton.setAttribute(
          "aria-label",
          selected ? "Убрать из избранного" : "Добавить в избранное"
        );
      }

      if (bottom && !$(".today-v92-card-footnote", bottom)) {
        const footnote = document.createElement("span");
        footnote.className = "today-v92-card-footnote";
        footnote.style.display = "none";
        bottom.appendChild(footnote);
      }

      if (launch) {
        launch.setAttribute("aria-label", "Играть: " + GAME_NAMES[id]);
        if (!launch.dataset.v92LaunchText) {
          launch.dataset.v92LaunchText = "1";
          launch.title = "Открыть отдельную страницу игры";
        }
      }

      const badge = $(".today-v92-card-badge", art || card);

      if (badge) {
        badge.className = "today-v92-card-badge";
        badge.textContent = id === "match3" ? "ГЛАВНАЯ ИГРА" : CATEGORY_LABEL[categoryFor(id)];

        if (id === "match3") {
          badge.classList.add("featured");
        } else if (recentIndex.has(id)) {
          badge.classList.add("recent");
          badge.textContent = "НЕДАВНО";
        } else if (gameBest(id) > 0) {
          badge.classList.add("record");
          badge.textContent = "РЕКОРД " + gameBest(id);
        }
      }

      const query = state.search.trim().toLocaleLowerCase("ru-RU");
      const haystack = (
        GAME_NAMES[id] + " " + card.textContent + " " + id + " " +
        CATEGORY_LABEL[categoryFor(id)]
      ).toLocaleLowerCase("ru-RU");

      const matchesSearch = !query || haystack.includes(query);
      const matchesCategory =
        state.filter === "all" ||
        (state.filter === "favorites" && favorites.includes(id)) ||
        categoryFor(id) === state.filter;

      const visible = matchesSearch && matchesCategory;

      if (card.style.display !== (visible ? "" : "none")) {
        card.style.display = visible ? "" : "none";
      }

      let order = Number(card.dataset.v92Order || index);

      if (state.sort === "recent") {
        order = recentIndex.has(id) ? recentIndex.get(id) : 999 + index;
      } else if (state.sort === "record") {
        order = -gameBest(id);
      } else if (state.sort === "name") {
        order = GAME_NAMES[id].localeCompare(GAME_NAMES[id], "ru");
      }

      card.style.order = String(order);
    });

    const empty = $('[data-v92-empty]', deck);

    if (empty) {
      const hasVisible = cards.some(card => card.style.display !== "none");
      empty.hidden = hasVisible;
    }

    const awards = getAwards();

    $$(".today-v92-achievement", deck).forEach(node => {
      const id = node.dataset.v92Achievement;
      const unlocked = awards.includes(id);
      node.classList.toggle("is-locked", !unlocked);
      node.title = unlocked
        ? "Достижение получено"
        : "Ещё не открыто";
    });

    state.menu = home;
  }

  function refreshMenu() {
    updateCatalog();
  }

  function switchFilter(filter) {
    if (!Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, filter)) return;

    state.filter = filter;
    writeJson(STORAGE.menu, {
      filter: state.filter,
      sort: state.sort,
      search: state.search
    });

    refreshMenu();
  }

  function toggleFavorite(id) {
    if (!GAME_IDS.includes(id)) return;

    const favorites = getFavorites();
    const exists = favorites.includes(id);

    setFavorites(
      exists ? favorites.filter(value => value !== id) : [...favorites, id]
    );

    refreshMenu();
    toast(exists ? "Игра удалена из избранного" : "Добавлено в избранное");
  }

  function openGame(id) {
    if (!GAME_IDS.includes(id)) return;

    if (window.TODAY_ARCADE_V91 && typeof window.TODAY_ARCADE_V91.open === "function") {
      window.TODAY_ARCADE_V91.open(id);
      return;
    }

    const url = new URL(location.href);
    url.searchParams.delete("reset");
    url.searchParams.set("arcade", id);
    location.href = url.href;
  }

  function openRandomGame() {
    const grid = $(".ts-games-home .ts-game-grid");
    if (!grid) return;

    const visible = $$(".ts-game-card", grid)
      .filter(card => card.style.display !== "none")
      .map(getCardId)
      .filter(Boolean);

    if (!visible.length) {
      toast("Нет игр под выбранные фильтры");
      return;
    }

    const id = visible[Math.floor(Math.random() * visible.length)];
    openGame(id);
  }

  function shareCurrentGame() {
    const id = state.activeGame || gameFromUrl();
    const url = location.href;
    const title = id ? GAME_NAMES[id] : "TODAY ARCADE";

    if (navigator.share) {
      navigator.share({
        title: "TODAY ARCADE · " + title,
        text: "Попробуй эту игру в TODAY",
        url
      }).catch(() => {});
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url)
        .then(() => toast("Ссылка на игру скопирована"))
        .catch(() => fallbackCopy(url));
      return;
    }

    fallbackCopy(url);
  }

  function fallbackCopy(text) {
    const input = document.createElement("textarea");
    input.value = text;
    input.readOnly = true;
    input.style.position = "fixed";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);
    input.select();

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } catch (_) {}

    input.remove();
    toast(copied ? "Ссылка скопирована" : "Скопируй адрес игры из строки браузера");
  }

  function updateCalmMode() {
    const enabled = safeGet(STORAGE.calm, "0") === "1";

    document.documentElement.classList.toggle("today-arcade-calm", enabled);

    $$(".today-v92-calm").forEach(button => {
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
      const value = $("span", button);
      if (value) value.textContent = enabled ? "ВКЛ" : "ВЫКЛ";
    });
  }

  function toggleCalmMode() {
    const next = safeGet(STORAGE.calm, "0") !== "1";
    safeSet(STORAGE.calm, next ? "1" : "0");
    updateCalmMode();
    toast(next ? "Режим экономии эффектов включён" : "Анимации включены");
  }

  function updateFullscreenLabel(button) {
    if (!button) return;
    const active = Boolean(document.fullscreenElement);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    const text = $("span", button);
    if (text) text.textContent = active ? "ВЫЙТИ ИЗ FULLSCREEN" : "ПОЛНЫЙ ЭКРАН";
  }

  async function toggleFullscreen() {
    const target = $("#modal");

    if (!target) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen({ navigationUI: "hide" });
      } else {
        toast("Полный экран не поддерживается этим браузером");
      }
    } catch (_) {
      toast("Браузер не разрешил переключить полный экран");
    }
  }

  function closePopovers(except) {
    $$(".today-v92-popover").forEach(node => {
      if (node !== except) node.hidden = true;
    });

    $$("[data-v92-tools]").forEach(button => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function createTools(panel) {
    if (!panel) return;

    const header = $(".today-arcade-topbar", panel);
    if (!header) return;

    const tools = $(".today-arcade-tools", header);
    if (!tools) return;

    if (!$("[data-v92-tools]", tools)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "today-v92-tools-button";
      button.dataset.v92Tools = "1";
      button.setAttribute("aria-label", "Игровые настройки");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("title", "Игровые настройки");
      button.textContent = "⚙";
      tools.appendChild(button);
    }

    if (!$(".today-v92-popover", header)) {
      const popover = document.createElement("div");
      popover.className = "today-v92-popover";
      popover.hidden = true;
      popover.setAttribute("aria-label", "Настройки игровой страницы");

      popover.innerHTML = `
        <h3>Настройки игры</h3>
        <p>Управление страницей, доступностью и ссылкой на игру.</p>
        <button type="button" data-v92-share>
          <span>Поделиться игрой</span><span>↗</span>
        </button>
        <button type="button" data-v92-fullscreen>
          <span>Полный экран</span><span>⛶</span>
        </button>
        <button type="button" data-v92-calm class="today-v92-calm"
          aria-pressed="false">
          <span>Экономия эффектов</span><span>ВЫКЛ</span>
        </button>
        <button type="button" data-v92-back>
          <span>Вернуться в каталог</span><span>←</span>
        </button>
      `;

      header.appendChild(popover);
    }

    updateCalmMode();
  }

  function createGuide(panel, id) {
    const active = $(".ts-active-game", panel);

    if (!active || !GAME_GUIDES[id]) return;
    if ($(".today-v92-guide", panel)) return;

    const details = document.createElement("details");
    details.className = "today-v92-guide";
    details.innerHTML = `
      <summary>Подсказки и управление</summary>
      <p>${esc(GAME_GUIDES[id])}</p>
    `;

    active.parentNode.insertBefore(details, active);
  }

  function readScore() {
    const selectors = [
      "#todayMergeScore",
      "#todayMatchScore",
      "#todayMemoryScore",
      "#todayFlappyScore",
      "#todayExtraScore",
      "#todayMatch3Score"
    ];

    for (const selector of selectors) {
      const node = $(selector);

      if (!node) continue;

      const raw = String(node.textContent || "").replace(/[^\d-]/g, "");
      const value = Number(raw);

      if (Number.isFinite(value)) return value;
    }

    return null;
  }

  function readStatus() {
    const selectors = [
      "#todayExtraStatus",
      "#todayMatchStatus",
      "#todayMemoryStatus",
      "#todayFlappyStatus",
      "#todayMatch3Status",
      ".ts-game-status"
    ];

    for (const selector of selectors) {
      const node = $(selector);
      const value = String(node?.textContent || "").trim();

      if (value) return value;
    }

    return "";
  }

  function pulseStage() {
    const stage = $(".ts-game-stage");

    if (!stage) return;

    stage.classList.remove("today-v92-score-flash");
    void stage.offsetWidth;
    stage.classList.add("today-v92-score-flash");

    if (state.feedbackTimer) clearTimeout(state.feedbackTimer);

    state.feedbackTimer = setTimeout(() => {
      stage.classList.remove("today-v92-score-flash");
    }, 460);
  }

  function popNode(node, className) {
    if (!node) return;

    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);

    setTimeout(() => node.classList.remove(className), 400);
  }

  function inspectFeedback() {
    if (!state.activeGame) return;

    const score = readScore();

    if (score !== null) {
      if (state.lastScore !== null && score > state.lastScore) {
        pulseStage();

        popNode(
          $("#todayMergeScore, #todayMatchScore, #todayMemoryScore, " +
            "#todayFlappyScore, #todayExtraScore, #todayMatch3Score"),
          "today-v92-number-pop"
        );
      }

      state.lastScore = score;
    }

    const status = readStatus();

    if (status && status !== state.lastStatus) {
      const statusNode = $(
        "#todayExtraStatus, #todayMatchStatus, #todayMemoryStatus, " +
        "#todayFlappyStatus, #todayMatch3Status, .ts-game-status"
      );

      popNode(statusNode, "today-v92-text-pop");
      state.lastStatus = status;
    }
  }

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const remain = seconds % 60;

    return String(minutes).padStart(2, "0") + ":" +
      String(remain).padStart(2, "0");
  }

  function updateSessionClock() {
    if (!state.activeGame || !state.sessionStarted) return;

    const node = $(".today-v92-session-clock");

    if (node) {
      setTextIfChanged(node, "СЕССИЯ · " + formatDuration(Date.now() - state.sessionStarted));
    }
  }

  function endGameUi() {
    if (state.sessionTimer) clearInterval(state.sessionTimer);

    state.sessionTimer = 0;
    state.activeGame = null;
    state.loggedGame = null;
    state.sessionStarted = 0;
    state.lastScore = null;
    state.lastStatus = "";

    closePopovers(null);
  }

  function beginGameUi(id) {
    if (!GAME_IDS.includes(id)) return;

    const modal = $("#modal");
    const host = $("#modalContent");
    const panel = $(".ts-panel", host || document);

    if (!modal || !panel || !$(".ts-active-game", panel)) return;

    createTools(panel);
    createGuide(panel, id);

    if (state.loggedGame !== id) {
      state.activeGame = id;
      state.loggedGame = id;
      state.sessionStarted = Date.now();
      state.lastScore = readScore();
      state.lastStatus = readStatus();

      addHistory(id);
      updateAwards(getHistory());
    } else {
      state.activeGame = id;
    }

    if (!state.sessionTimer) {
      state.sessionTimer = setInterval(updateSessionClock, 1000);
    }

    updateSessionClock();
    inspectFeedback();
  }

  function enhance() {
    const id = gameFromUrl();
    const host = $("#modalContent");
    const isGamePage = Boolean(
      id && host && $("#modal .ts-active-game")
    );

    if (isGamePage) {
      beginGameUi(id);
      return;
    }

    if (!id) {
      if (state.activeGame || state.loggedGame) endGameUi();

      const home = $(".ts-games-home");
      if (home) updateCatalog();
    }
  }

  function onDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const favorite = target.closest("[data-v92-favorite]");

    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(favorite.dataset.v92Favorite);
      return;
    }

    const filter = target.closest("[data-v92-filter]");

    if (filter) {
      event.preventDefault();
      switchFilter(filter.dataset.v92Filter);
      return;
    }

    const daily = target.closest("[data-v92-play-daily]");

    if (daily) {
      event.preventDefault();
      openGame(daily.dataset.game || dailyGameId());
      return;
    }

    const resume = target.closest("[data-v92-resume]");

    if (resume) {
      event.preventDefault();

      if (GAME_IDS.includes(resume.dataset.game)) {
        openGame(resume.dataset.game);
      } else {
        toast("Сначала открой любую игру");
      }

      return;
    }

    const random = target.closest("[data-v92-random]");

    if (random) {
      event.preventDefault();
      openRandomGame();
      return;
    }

    const toolsButton = target.closest("[data-v92-tools]");

    if (toolsButton) {
      event.preventDefault();

      const header = toolsButton.closest(".today-arcade-topbar");
      const popover = $(".today-v92-popover", header);

      if (!popover) return;

      const opening = popover.hidden;
      closePopovers(popover);
      popover.hidden = !opening;
      toolsButton.setAttribute("aria-expanded", opening ? "true" : "false");
      updateCalmMode();
      return;
    }

    const share = target.closest("[data-v92-share]");

    if (share) {
      event.preventDefault();
      shareCurrentGame();
      closePopovers(null);
      return;
    }

    const fullscreen = target.closest("[data-v92-fullscreen]");

    if (fullscreen) {
      event.preventDefault();
      toggleFullscreen();
      return;
    }

    const calm = target.closest("[data-v92-calm]");

    if (calm) {
      event.preventDefault();
      toggleCalmMode();
      return;
    }

    const back = target.closest("[data-v92-back]");

    if (back) {
      event.preventDefault();
      const oldBack = $(".today-arcade-back");

      if (oldBack) oldBack.click();
      else {
        const url = new URL(location.href);
        url.searchParams.delete("arcade");
        location.href = url.href;
      }

      return;
    }

    const outsidePopover = !target.closest(".today-v92-popover, [data-v92-tools]");

    if (outsidePopover) closePopovers(null);
  }

  function onDocumentInput(event) {
    const target = event.target;

    if (target instanceof HTMLInputElement && target.matches("[data-v92-search]")) {
      state.search = target.value || "";
      updateCatalog();
      return;
    }

    if (target instanceof HTMLSelectElement && target.matches("[data-v92-sort]")) {
      state.sort = ["default", "recent", "record", "name"].includes(target.value)
        ? target.value
        : "default";

      writeJson(STORAGE.menu, {
        filter: state.filter,
        sort: state.sort,
        search: state.search
      });

      updateCatalog();
    }
  }

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    const target = event.target;

    const isTyping = target instanceof HTMLElement &&
      (target.isContentEditable ||
       ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (event.key === "/" && !isTyping) {
      const search = $("[data-v92-search]");

      if (search) {
        event.preventDefault();
        search.focus();
      }
    }

    if (event.key === "Escape") {
      closePopovers(null);
    }
  }

  function installObserver() {
    const host = $("#modalContent");

    if (!host || state.observer) return;

    state.observer = new MutationObserver(() => {
      enhance();
    });

    state.observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true
    });

    enhance();
  }

  function restoreMenuState() {
    const saved = readJson(STORAGE.menu, null);

    if (!saved || typeof saved !== "object") return;

    if (Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, saved.filter)) {
      state.filter = saved.filter;
    }

    if (["default", "recent", "record", "name"].includes(saved.sort)) {
      state.sort = saved.sort;
    }

    if (typeof saved.search === "string") {
      state.search = saved.search.slice(0, 120);
    }
  }

  function setup() {
    if (state.booted) return;
    state.booted = true;

    restoreMenuState();
    updateCalmMode();

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("input", onDocumentInput);
    document.addEventListener("change", onDocumentInput);
    document.addEventListener("keydown", onKeyDown);

    document.addEventListener("fullscreenchange", () => {
      $$("[data-v92-fullscreen]").forEach(updateFullscreenLabel);
    });

    installObserver();

    const id = gameFromUrl();

    if (id) {
      const waitForGame = (tries = 0) => {
        if ($(".ts-active-game")) {
          beginGameUi(id);
          return;
        }

        if (tries < 70) {
          setTimeout(() => waitForGame(tries + 1), 100);
        }
      };

      waitForGame();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }

  window.TODAY_ARCADE_V92 = {
    version: VERSION,
    games: GAME_IDS.slice(),

    open(id) {
      if (GAME_IDS.includes(id)) openGame(id);
    },

    refresh() {
      updateCatalog();
      enhance();
    },

    favorites() {
      return getFavorites();
    },

    history() {
      return getHistory();
    }
  };
})();
