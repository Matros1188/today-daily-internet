
/* ================================================================
   TODAY ARCADE V95 — PREMIUM GAME EXPERIENCE
   Non-invasive layer over the original TODAY game engines.
   ================================================================ */
(() => {
  "use strict";

  const VERSION = "95";

  if (window.TODAY_ARCADE_V95?.version === VERSION) return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const GAMES = {
    match3: {
      title: "CRYSTAL CHRONICLES",
      label: "Кристаллы",
      genre: "story",
      genreLabel: "Сюжет",
      desc: "220 уровней, главы, реликвии и история спасения Элары.",
      objective: "Проходи главы, выполняй цели уровня и открывай следующие эпизоды.",
      controls: ["Касание", "Обмен соседних кристаллов"],
      hint: "Главная сюжетная игра TODAY"
    },
    flappy: {
      title: "NIGHT FLIGHT",
      label: "Полёт",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Управляй полётом, проходи ворота и устанавливай рекорды.",
      objective: "Пролетай между препятствиями и набирай очки за каждый успешный пролёт.",
      controls: ["Касание поля", "Одно касание — взмах"],
      hint: "Реакция и точность"
    },
    merge2048: {
      title: "MERGE 2048",
      label: "Числа",
      genre: "logic",
      genreLabel: "Логика",
      desc: "Объединяй одинаковые плитки и планируй следующие ходы.",
      objective: "Совмещай одинаковые числа, освобождай место и стремись к плитке 2048.",
      controls: ["Свайп", "Стрелки клавиатуры", "Кнопки направления"],
      hint: "Стратегия на каждом ходе"
    },
    memory: {
      title: "REMEMBER",
      label: "Память",
      genre: "logic",
      genreLabel: "Логика",
      desc: "Ищи парные символы, запоминай позиции и сокращай число ходов.",
      objective: "Открой все пары, запоминая расположение карточек.",
      controls: ["Касание карточек", "Мышь"],
      hint: "Память и концентрация"
    },
    snake: {
      title: "NEON SNAKE",
      label: "Змейка",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Собирай светящиеся ядра, управляй движением и не сталкивайся с собой.",
      objective: "Собирай ядра, увеличивай длину и старайся прожить дольше.",
      controls: ["Стрелки", "Свайп", "Экранные кнопки"],
      hint: "Классика в неоновой оболочке"
    },
    pulse: {
      title: "PULSE REACTION",
      label: "Реакция",
      genre: "reflex",
      genreLabel: "Реакция",
      desc: "Дождись сигнала и нажми в правильный момент.",
      objective: "Не нажимай заранее. Точность реакции важнее спешки.",
      controls: ["Касание", "Один точный момент"],
      hint: "Проверь скорость реакции"
    },
    breakout: {
      title: "NEON BREAKOUT",
      label: "Арканоид",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Отбивай шар платформой, разбивай блоки и сохраняй жизни.",
      objective: "Удерживай шар в игре и очищай поле от блоков.",
      controls: ["Мышь", "Касание", "Стрелки"],
      hint: "Контроль траектории"
    },
    ttt: {
      title: "X / O DUEL",
      label: "Крестики",
      genre: "logic",
      genreLabel: "Логика",
      desc: "Сыграй против компьютера и ищи выигрышные комбинации.",
      objective: "Собери линию из трёх символов и блокируй опасные ходы соперника.",
      controls: ["Касание клетки", "Мышь"],
      hint: "Короткая тактическая дуэль"
    },
    word: {
      title: "WORD SHIFT",
      label: "Слова",
      genre: "logic",
      genreLabel: "Слова",
      desc: "Собирай слова из перемешанных букв и успевай до конца таймера.",
      objective: "Расшифровывай слова, вводи ответ и используй время эффективно.",
      controls: ["Клавиатура", "Экранная клавиатура"],
      hint: "Словарный вызов на время"
    },
    colorsnap: {
      title: "COLOR SNAP",
      label: "Цвета",
      genre: "reflex",
      genreLabel: "Реакция",
      desc: "Отличай цвет шрифта от написанного слова и отвечай быстро.",
      objective: "Выбирай реальный цвет букв, а не значение слова.",
      controls: ["Касание варианта", "Мышь"],
      hint: "Внимательность под давлением"
    },
    stacker: {
      title: "SKY STACKER",
      label: "Башня",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Ставь движущиеся блоки точно и поднимай башню выше.",
      objective: "Останавливай блок в нужный момент. Чем выше башня, тем сложнее.",
      controls: ["Касание поля", "Мышь"],
      hint: "Тайминг и точность"
    },
    laserdodge: {
      title: "LASER DODGE",
      label: "Лазеры",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Меняй полосу и уворачивайся от лазерных импульсов.",
      objective: "Следи за траекторией опасностей и продержись как можно дольше.",
      controls: ["Стрелки", "Кнопки полос", "Свайп"],
      hint: "Выживание в лазерном коридоре"
    },
    quiz: {
      title: "QUICK QUIZ",
      label: "Викторина",
      genre: "logic",
      genreLabel: "Викторина",
      desc: "Проверь эрудицию в короткой серии вопросов.",
      objective: "Выбирай ответы внимательно и набери максимум правильных ответов.",
      controls: ["Касание ответа", "Мышь"],
      hint: "Короткая проверка знаний"
    },
    starcatch: {
      title: "STAR CATCHER",
      label: "Звёзды",
      genre: "action",
      genreLabel: "Аркада",
      desc: "Лови падающие звёзды и избегай тёмных осколков.",
      objective: "Лови полезные объекты и не рискуй ради каждой падающей звезды.",
      controls: ["Движение мыши", "Свайп", "Касание"],
      hint: "Ловкость и управление"
    }
  };

  const GAME_IDS = Object.keys(GAMES);

  const STORAGE = {
    favorites: "today-arcade-v95-favorites",
    history: "today-arcade-v95-history",
    menu: "today-arcade-v95-menu"
  };

  const FILTERS = {
    all: "Все игры",
    favorites: "Избранное",
    story: "Сюжет",
    action: "Аркада",
    logic: "Логика",
    reflex: "Реакция"
  };

  const state = {
    filter: "all",
    sort: "featured",
    search: "",
    observer: null,
    framePending: false,
    activeGame: null,
    activeNode: null
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadFavorites() {
    const value = safeRead(STORAGE.favorites, []);
    return Array.isArray(value)
      ? [...new Set(value.filter(id => GAME_IDS.includes(id)))]
      : [];
  }

  function loadHistory() {
    const value = safeRead(STORAGE.history, []);

    if (!Array.isArray(value)) return [];

    return value
      .filter(row =>
        row &&
        GAME_IDS.includes(row.id) &&
        typeof row.time === "number"
      )
      .slice(0, 300);
  }

  function dayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dayGameId() {
    const key = dayKey();
    let hash = 2166136261;

    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const index = (hash >>> 0) % GAME_IDS.length;
    return GAME_IDS[index];
  }

  function loadMenuState() {
    const saved = safeRead(STORAGE.menu, {});

    if (!saved || typeof saved !== "object") return;

    if (Object.prototype.hasOwnProperty.call(FILTERS, saved.filter)) {
      state.filter = saved.filter;
    }

    if (["featured", "recent", "records", "name"].includes(saved.sort)) {
      state.sort = saved.sort;
    }

    if (typeof saved.search === "string") {
      state.search = saved.search.slice(0, 100);
    }
  }

  function saveMenuState() {
    safeWrite(STORAGE.menu, {
      filter: state.filter,
      sort: state.sort,
      search: state.search
    });
  }

  function recordGame(id) {
    if (!GAME_IDS.includes(id)) return;

    const history = loadHistory();
    const previous = history[0];

    // Не засчитываем несколько одинаковых событий, пришедших
    // практически одновременно от одного клика.
    if (
      previous &&
      previous.id === id &&
      Date.now() - previous.time < 900
    ) {
      return;
    }

    history.unshift({
      id,
      time: Date.now(),
      day: dayKey()
    });

    safeWrite(STORAGE.history, history.slice(0, 300));
  }

  function countToday(history) {
    const today = dayKey();
    return history.filter(row => row.day === today).length;
  }

  function recentIds(history) {
    const unique = [];

    history.forEach(row => {
      if (!unique.includes(row.id)) unique.push(row.id);
    });

    return unique;
  }

  function localBest(card) {
    const node = $('[data-local-best]', card);
    if (!node) return 0;

    const value = Number(String(node.textContent || "").replace(/[^\d-]/g, ""));
    return Number.isFinite(value) ? value : 0;
  }

  function gameIdFromCard(card) {
    const launch = $('[data-social-act="play-game"][data-game]', card);
    const id = launch?.dataset?.game;

    return GAME_IDS.includes(id) ? id : null;
  }

  function setText(node, value) {
    if (node && node.textContent !== String(value)) {
      node.textContent = String(value);
    }
  }

  function ensureDiscovery(home) {
    let deck = $(".today-v95-discovery", home);

    if (deck) return deck;

    const grid = $(".ts-game-grid", home);
    if (!grid) return null;

    deck = document.createElement("section");
    deck.className = "today-v95-discovery";
    deck.setAttribute("aria-label", "Управление игровой библиотекой");

    deck.innerHTML = `
      <header class="today-v95-discovery-header">
        <div>
          <span class="today-v95-overline">
            <span class="today-v95-live-dot" aria-hidden="true"></span>
            TODAY ORIGINAL ARCADE
          </span>
          <h3 class="today-v95-title">Твоя игровая вселенная</h3>
          <p class="today-v95-subtitle">
            Выбирай режим, возвращайся к рекордам и находи свою игру на сегодня.
          </p>
        </div>
        <span class="today-v95-version-mark">ARCADE V95</span>
      </header>

      <div class="today-v95-dashboard">
        <div class="today-v95-stat-grid" aria-label="Личная статистика">
          <div class="today-v95-stat">
            <b data-v95-stat="games">14</b>
            <span>Игр в библиотеке</span>
          </div>
          <div class="today-v95-stat">
            <b data-v95-stat="unique">0</b>
            <span>Попробовано</span>
          </div>
          <div class="today-v95-stat">
            <b data-v95-stat="today">0</b>
            <span>Запусков сегодня</span>
          </div>
          <div class="today-v95-stat">
            <b data-v95-stat="favorites">0</b>
            <span>В избранном</span>
          </div>
        </div>

        <article class="today-v95-mission">
          <span class="today-v95-mission-label">МИССИЯ ДНЯ</span>
          <h4 data-v95-daily-title>Выбери свою игру дня</h4>
          <p data-v95-daily-copy>
            Одна новая попытка — возможность превзойти свой результат.
          </p>
          <button type="button" data-v95-daily>
            Начать миссию <span aria-hidden="true">↗</span>
          </button>
        </article>
      </div>

      <div class="today-v95-tools">
        <label class="today-v95-search">
          <span class="today-v95-control-label">Найти игру</span>
          <input
            type="search"
            data-v95-search
            placeholder="Название, жанр или настроение…"
            autocomplete="off"
            spellcheck="false"
          >
        </label>

        <label class="today-v95-sort">
          <span class="today-v95-control-label">Порядок</span>
          <select data-v95-sort>
            <option value="featured">Рекомендуемые</option>
            <option value="recent">Недавно открытые</option>
            <option value="records">По личному рекорду</option>
            <option value="name">По названию</option>
          </select>
        </label>

        <button type="button" class="today-v95-random" data-v95-random>
          <span aria-hidden="true">✧</span>
          Случайная игра
        </button>
      </div>

      <nav class="today-v95-filter-row" aria-label="Фильтры игр">
        <button type="button" class="today-v95-filter"
          data-v95-filter="all" aria-pressed="true">Все игры</button>
        <button type="button" class="today-v95-filter"
          data-v95-filter="favorites" aria-pressed="false">★ Избранное</button>
        <button type="button" class="today-v95-filter"
          data-v95-filter="story" aria-pressed="false">✦ Сюжет</button>
        <button type="button" class="today-v95-filter"
          data-v95-filter="action" aria-pressed="false">⚡ Аркада</button>
        <button type="button" class="today-v95-filter"
          data-v95-filter="logic" aria-pressed="false">◈ Логика</button>
        <button type="button" class="today-v95-filter"
          data-v95-filter="reflex" aria-pressed="false">ϟ Реакция</button>
      </nav>

      <div class="today-v95-results">
        <span data-v95-results>Загружаем библиотеку игр…</span>
        <span data-v95-continue-label>Личная история хранится на этом устройстве</span>
      </div>

      <div class="today-v95-empty" data-v95-empty hidden>
        Игры не найдены. Измени поиск или выбери другой жанр.
      </div>
    `;

    grid.parentNode.insertBefore(deck, grid);

    const search = $("[data-v95-search]", deck);
    const sort = $("[data-v95-sort]", deck);

    if (search) search.value = state.search;
    if (sort) sort.value = state.sort;

    return deck;
  }

  function buildCard(card, id, index) {
    if (!id) return;

    card.classList.add("today-v95-card");
    card.dataset.v95Game = id;

    if (!card.dataset.v95Order) {
      card.dataset.v95Order = String(index);
    }

    const meta = GAMES[id];
    const art = $(".ts-game-art", card);

    if (art && !$(".today-v95-card-badge", art)) {
      const badge = document.createElement("span");
      badge.className = "today-v95-card-badge";
      badge.textContent = meta.genreLabel;
      art.appendChild(badge);
    }

    if (art && !$(".today-v95-favorite", art)) {
      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.className = "today-v95-favorite";
      favorite.dataset.v95Favorite = id;
      favorite.setAttribute("aria-label", "Добавить в избранное");
      favorite.setAttribute("aria-pressed", "false");
      favorite.textContent = "☆";
      art.appendChild(favorite);
    }

    const launch = $('[data-social-act="play-game"][data-game]', card);

    if (launch) {
      launch.title = "Запустить " + meta.title;
      launch.setAttribute("aria-label", "Играть: " + meta.title);
    }
  }

  function updateCatalog() {
    const host = $("#modalContent");
    const home = $(".ts-games-home", host || document);

    if (!home) return;

    const grid = $(".ts-game-grid", home);
    if (!grid) return;

    const deck = ensureDiscovery(home);
    if (!deck) return;

    const history = loadHistory();
    const favorites = loadFavorites();
    const recent = recentIds(history);
    const daily = dayGameId();

    setText($('[data-v95-stat="games"]', deck), GAME_IDS.length);
    setText($('[data-v95-stat="unique"]', deck), recent.length);
    setText($('[data-v95-stat="today"]', deck), countToday(history));
    setText($('[data-v95-stat="favorites"]', deck), favorites.length);

    setText($("[data-v95-daily-title]", deck), GAMES[daily].title);
    setText(
      $("[data-v95-daily-copy]", deck),
      GAMES[daily].desc
    );

    $$(".today-v95-filter", deck).forEach(button => {
      const active = button.dataset.v95Filter === state.filter;
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const search = $("[data-v95-search]", deck);
    if (search && search.value !== state.search) {
      search.value = state.search;
    }

    const sort = $("[data-v95-sort]", deck);
    if (sort && sort.value !== state.sort) {
      sort.value = state.sort;
    }

    const cards = $$(".ts-game-card", grid);

    cards.forEach((card, index) => {
      const id = gameIdFromCard(card);
      if (!id) return;

      buildCard(card, id, index);

      const meta = GAMES[id];
      const fav = $(".today-v95-favorite", card);

      if (fav) {
        const selected = favorites.includes(id);
        const mark = selected ? "★" : "☆";

        if (fav.textContent !== mark) {
          fav.textContent = mark;
        }

        fav.setAttribute("aria-pressed", selected ? "true" : "false");
        fav.setAttribute(
          "aria-label",
          selected ? "Убрать из избранного" : "Добавить в избранное"
        );
      }

      const badge = $(".today-v95-card-badge", card);

      if (badge) {
        let label = meta.genreLabel;
        let badgeClass = "today-v95-card-badge";

        if (id === "match3") {
          label = "СЮЖЕТ · 220 УРОВНЕЙ";
          badgeClass += " is-story";
        } else if (recent.includes(id)) {
          label = "НЕДАВНО";
          badgeClass += " is-recent";
        } else if (localBest(card) > 0) {
          label = "ЛИЧНЫЙ РЕКОРД";
          badgeClass += " is-record";
        }

        if (badge.className !== badgeClass) {
          badge.className = badgeClass;
        }

        setText(badge, label);
      }

      const query = state.search.trim().toLocaleLowerCase("ru-RU");
      const searchable = [
        meta.title,
        meta.label,
        meta.genreLabel,
        meta.desc,
        id
      ].join(" ").toLocaleLowerCase("ru-RU");

      const matchesSearch = !query || searchable.includes(query);

      const matchesFilter =
        state.filter === "all" ||
        (state.filter === "favorites" && favorites.includes(id)) ||
        meta.genre === state.filter;

      const visible = matchesSearch && matchesFilter;

      card.classList.toggle("today-v95-card-hidden", !visible);

      let order = Number(card.dataset.v95Order || index);

      if (state.sort === "recent") {
        order = recent.includes(id) ? recent.indexOf(id) : 1000 + index;
      } else if (state.sort === "records") {
        order = -localBest(card);
      } else if (state.sort === "name") {
        order = GAME_IDS.indexOf(id);
      }

      if (card.style.order !== String(order)) {
        card.style.order = String(order);
      }
    });

    if (state.sort === "name") {
      cards
        .filter(card => gameIdFromCard(card))
        .sort((a, b) =>
          GAMES[gameIdFromCard(a)].title.localeCompare(
            GAMES[gameIdFromCard(b)].title,
            "ru"
          )
        )
        .forEach((card, index) => {
          card.style.order = String(index);
        });
    }

    const visibleCount = cards.filter(
      card => !card.classList.contains("today-v95-card-hidden")
    ).length;

    setText(
      $("[data-v95-results]", deck),
      `${visibleCount} из ${cards.length} игр`
    );

    const empty = $("[data-v95-empty]", deck);
    if (empty) empty.hidden = visibleCount > 0;

    const continueLabel = $("[data-v95-continue-label]", deck);
    const last = history[0];

    if (continueLabel) {
      continueLabel.textContent = last
        ? "Последняя игра: " + GAMES[last.id].title
        : "Начни играть — история появится здесь";
    }
  }

  function ensureGuide(active, id) {
    if (!active || !GAMES[id]) return;
    if ($(".today-v95-guide", active)) return;

    const meta = GAMES[id];
    const stage = $(".ts-game-stage", active);

    if (!stage) return;

    const guide = document.createElement("details");
    guide.className = "today-v95-guide";
    guide.innerHTML = `
      <summary>
        <span>КАК ИГРАТЬ · ${meta.title}</span>
        <span>Управление и цель</span>
      </summary>
      <div class="today-v95-guide-body">
        <p>${meta.objective}</p>
        <div class="today-v95-control-chips">
          ${meta.controls.map(item =>
            `<span class="today-v95-control-chip">${item}</span>`
          ).join("")}
        </div>
      </div>
    `;

    active.appendChild(guide);
  }

  function resetGamePresentation() {
    const modal = $("#modal");

    if (modal) {
      modal.classList.remove("today-v95-playing", "today-v95-crystal");
      delete modal.dataset.v95Game;
    }

    document.documentElement.classList.remove("today-v95-in-arcade");
    state.activeGame = null;
    state.activeNode = null;
  }

  function activateGamePresentation(id, active) {
    const modal = $("#modal");

    if (!modal) return;

    modal.classList.add("today-v95-playing");
    document.documentElement.classList.add("today-v95-in-arcade");
    modal.classList.remove("today-v95-crystal");
    modal.dataset.v95Game = id;

    if (id === "match3") {
      modal.classList.add("today-v95-crystal");
    }

    if (state.activeNode !== active || state.activeGame !== id) {
      state.activeNode = active;
      state.activeGame = id;
    }

    ensureGuide(active, id);
  }

  function enhanceCrystalCampaign(host) {
    const modal = $("#modal");
    if (!modal) return false;

    const campaign = $(".ts-m3-campaign", host);
    const levelGame = $(".ts-m3-game", host);

    if (!campaign && !levelGame) return false;

    modal.classList.add("today-v95-playing", "today-v95-crystal");
    modal.dataset.v95Game = "match3";
    document.documentElement.classList.add("today-v95-in-arcade");

    state.activeGame = "match3";
    state.activeNode = campaign || levelGame;

    return true;
  }

  function enhanceContent() {
    const host = $("#modalContent");

    if (!host) return;

    const home = $(".ts-games-home", host);

    if (home) {
      resetGamePresentation();
      updateCatalog();
      return;
    }

    const active = $(".ts-active-game", host);

    if (active) {
      const id = active.dataset.activeGame;

      if (GAME_IDS.includes(id)) {
        activateGamePresentation(id, active);
        return;
      }
    }

    if (enhanceCrystalCampaign(host)) return;

    // Another social modal or a closed/changed game view:
    // clean up only V95 classes, not the original app's state.
    resetGamePresentation();
  }

  function scheduleEnhance() {
    if (state.framePending) return;

    state.framePending = true;

    const request = window.requestAnimationFrame ||
      (callback => window.setTimeout(callback, 16));

    request(() => {
      state.framePending = false;

      try {
        enhanceContent();
      } catch (error) {
        console.warn("[TODAY ARCADE V95] UI enhancement:", error);
      }
    });
  }

  function launchGame(id) {
    if (!GAME_IDS.includes(id)) return;

    const home = $(".ts-games-home");
    if (!home) return;

    // Reveal the target card even if a search/filter hid it.
    state.search = "";
    state.filter = "all";
    saveMenuState();
    updateCatalog();

    const card = $(`.ts-game-card[data-v95-game="${id}"]`, home);
    const launch = card &&
      $('[data-social-act="play-game"][data-game]', card);

    if (!launch) {
      console.warn("[TODAY ARCADE V95] No launch control for", id);
      return;
    }

    // Invoke the original click target; the original engine owns launch.
    launch.click();
  }

  function toggleFavorite(id) {
    if (!GAME_IDS.includes(id)) return;

    const favorites = loadFavorites();
    const index = favorites.indexOf(id);

    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.unshift(id);
    }

    safeWrite(STORAGE.favorites, favorites);
    updateCatalog();
  }

  function openRandomGame() {
    const home = $(".ts-games-home");
    if (!home) return;

    const candidates = $$(".ts-game-card", home)
      .filter(card => !card.classList.contains("today-v95-card-hidden"))
      .map(gameIdFromCard)
      .filter(Boolean);

    if (!candidates.length) return;

    const id = candidates[Math.floor(Math.random() * candidates.length)];
    launchGame(id);
  }

  function openDailyGame() {
    launchGame(dayGameId());
  }

  function openLastGame() {
    const history = loadHistory();
    const last = history[0];

    if (last && GAME_IDS.includes(last.id)) {
      launchGame(last.id);
    }
  }

  function onClick(event) {
    const target = event.target instanceof Element
      ? event.target
      : null;

    if (!target) return;

    const favorite = target.closest("[data-v95-favorite]");

    if (favorite) {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(favorite.dataset.v95Favorite);
      return;
    }

    const filter = target.closest("[data-v95-filter]");

    if (filter) {
      event.preventDefault();
      state.filter = Object.prototype.hasOwnProperty.call(
        FILTERS,
        filter.dataset.v95Filter
      ) ? filter.dataset.v95Filter : "all";

      saveMenuState();
      updateCatalog();
      return;
    }

    const daily = target.closest("[data-v95-daily]");

    if (daily) {
      event.preventDefault();
      openDailyGame();
      return;
    }

    const random = target.closest("[data-v95-random]");

    if (random) {
      event.preventDefault();
      openRandomGame();
      return;
    }

    // Track native launch clicks without cancelling or replacing them.
    const launch = target.closest(
      '[data-social-act="play-game"][data-game]'
    );

    if (launch && GAME_IDS.includes(launch.dataset.game)) {
      recordGame(launch.dataset.game);
      return;
    }
  }

  function onInput(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    if (target.matches("[data-v95-search]")) {
      state.search = target.value.slice(0, 100);
      saveMenuState();
      updateCatalog();
    }
  }

  function onChange(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    if (target.matches("[data-v95-sort]")) {
      const value = target.value;

      state.sort = ["featured", "recent", "records", "name"].includes(value)
        ? value
        : "featured";

      saveMenuState();
      updateCatalog();
    }
  }

  function setupObserver() {
    const host = $("#modalContent");

    if (!host || state.observer) return;

    // Child-list changes only. No attributes or characterData.
    // This avoids the repeated mutation cycle that froze the old catalog.
    state.observer = new MutationObserver(() => {
      scheduleEnhance();
    });

    state.observer.observe(host, {
      childList: true,
      subtree: true
    });

    scheduleEnhance();
  }

  function setup() {
    loadMenuState();

    document.addEventListener("click", onClick, false);
    document.addEventListener("input", onInput, false);
    document.addEventListener("change", onChange, false);

    setupObserver();

    // Current screen may already have been created before this script.
    scheduleEnhance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }

  window.TODAY_ARCADE_V95 = {
    version: VERSION,

    refresh() {
      scheduleEnhance();
    },

    launch(id) {
      if (GAME_IDS.includes(id)) launchGame(id);
    },

    favorites() {
      return loadFavorites();
    },

    history() {
      return loadHistory();
    },

    games() {
      return GAME_IDS.slice();
    }
  };
})();
