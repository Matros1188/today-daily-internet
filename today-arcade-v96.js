
/* ================================================================
   TODAY ARCADE V96
   Per-game side quests, local seals and immersive presentation.
   Does not replace native game handlers.
   ================================================================ */
(() => {
  "use strict";

  const VERSION = "96";

  if (window.TODAY_ARCADE_V96?.version === VERSION) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const STORAGE = "today-arcade-v96-seals";

  const GAMES = {
    match3: {
      title: "CRYSTAL CHRONICLES",
      seal: "Реликвия хранителя",
      icon: "✦",
      task: "Выполни цель текущего уровня кампании.",
      target: 1000,
      tip: "Следи за целью, количеством ходов и дополнительными условиями. Комбинации из четырёх и пяти кристаллов помогают создавать особые самоцветы.",
      metric: "match3"
    },
    flappy: {
      title: "NIGHT FLIGHT",
      seal: "Пять ворот в темноте",
      icon: "✈",
      task: "Пройди пять ворот за один полёт.",
      target: 5,
      tip: "Не нажимай слишком часто. Держи ритм и смотри чуть дальше следующей трубы.",
      metric: "flappy"
    },
    merge2048: {
      title: "MERGE 2048",
      seal: "Пробуждение числа 256",
      icon: "▦",
      task: "Создай плитку 256 или больше.",
      target: 256,
      tip: "Старайся держать наибольшую плитку в одном углу и строй цепочки вокруг неё.",
      metric: "merge2048"
    },
    memory: {
      title: "REMEMBER",
      seal: "Архив памяти",
      icon: "◈",
      task: "Найди все восемь пар карточек.",
      target: 16,
      tip: "Запоминай не только символ, но и его место. Сначала открывай ещё неизвестные карточки, потом используй найденные пары.",
      metric: "memory"
    },
    snake: {
      title: "NEON SNAKE",
      seal: "Неоновое ядро",
      icon: "〰",
      task: "Собери восемь ядер за одну попытку.",
      target: 8,
      tip: "Не веди змейку вдоль хвоста без плана. Оставляй себе свободный коридор для разворота.",
      metric: "snake"
    },
    pulse: {
      title: "PULSE REACTION",
      seal: "Молниеносный импульс",
      icon: "ϟ",
      task: "Покажи реакцию не хуже 300 мс.",
      target: 300,
      tip: "Дождись зелёного сигнала. Фальстарт не ускорит реакцию — он просто завершит попытку.",
      metric: "pulse"
    },
    breakout: {
      title: "NEON BREAKOUT",
      seal: "Очистить орбиту",
      icon: "▥",
      task: "Набери 120 очков за раунд.",
      target: 120,
      tip: "Отслеживай траекторию шара до его возвращения. Старайся контролировать платформу заранее, а не в последний момент.",
      metric: "breakout"
    },
    ttt: {
      title: "X / O DUEL",
      seal: "Дуэль умов",
      icon: "×",
      task: "Выиграй хотя бы один раунд у компьютера.",
      target: 1,
      tip: "Занимай центр, проверяй немедленную угрозу соперника и не пропускай линию, в которой хватает одной клетки.",
      metric: "ttt"
    },
    word: {
      title: "WORD SHIFT",
      seal: "Словесный поток",
      icon: "Aa",
      task: "Разгадай три слова за одну серию.",
      target: 30,
      tip: "Сначала найди характерные окончания и сочетания букв. Если застрял, быстро проверь, можно ли собрать знакомое слово с другой позиции.",
      metric: "word"
    },
    colorsnap: {
      title: "COLOR SNAP",
      seal: "Цветовой фокус",
      icon: "●",
      task: "Набери 60 очков, глядя на цвет букв, а не на слово.",
      target: 60,
      tip: "Проговори про себя цвет шрифта и только после этого выбирай вариант. Не позволяй значению слова сбивать тебя.",
      metric: "colorsnap"
    },
    stacker: {
      title: "SKY STACKER",
      seal: "Небесная башня",
      icon: "▤",
      task: "Построй башню высотой восемь этажей.",
      target: 8,
      tip: "Следи за движущимся блоком, а не за всей сценой. С каждым этажом важнее точный момент касания.",
      metric: "stacker"
    },
    laserdodge: {
      title: "LASER DODGE",
      seal: "Непробиваемый",
      icon: "⌁",
      task: "Выживи все 30 секунд и избегай лазеров.",
      target: 30,
      tip: "Смотри на следующую опасность и заранее выбирай соседнюю полосу. Не делай движения в последний момент.",
      metric: "laserdodge"
    },
    quiz: {
      title: "QUICK QUIZ",
      seal: "Эрудит TODAY",
      icon: "?",
      task: "Набери минимум 700 очков в викторине.",
      target: 700,
      tip: "Сначала отвечай на вопросы, в которых уверен, и внимательно читай формулировку. Дистракторы часто похожи на верный ответ.",
      metric: "quiz"
    },
    starcatch: {
      title: "STAR CATCHER",
      seal: "Звёздный улов",
      icon: "✦",
      task: "Набери 100 очков, собирая звёзды и избегая осколков.",
      target: 100,
      tip: "Двигай корзину плавно и смотри на несколько объектов вперёд. Не рискуй ради звезды, если рядом тёмный осколок.",
      metric: "starcatch"
    }
  };

  const state = {
    activeId: null,
    activeNode: null,
    lastMenu: null
  };

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function readSeals() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      return Array.isArray(value)
        ? value.filter(
            row => row &&
              typeof row.id === "string" &&
              GAMES[row.id] &&
              typeof row.day === "string"
          )
        : [];
    } catch (_) {
      return [];
    }
  }

  function writeSeals(value) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(value.slice(-1200)));
    } catch (_) {
      // The game remains playable even when storage is unavailable.
    }
  }

  function getSealCount() {
    return readSeals().length;
  }

  function isSealEarnedToday(id) {
    const today = dayKey();
    return readSeals().some(row => row.id === id && row.day === today);
  }

  function awardSeal(id) {
    if (!GAMES[id] || isSealEarnedToday(id)) return false;

    const rows = readSeals();
    rows.push({
      id,
      day: dayKey(),
      at: Date.now()
    });

    writeSeals(rows);
    updateSealShelf();
    return true;
  }

  function numberFrom(selector) {
    const node = $(selector);
    if (!node) return null;

    const raw = String(node.textContent || "")
      .replace(/\s/g, "")
      .replace(",", ".");

    const match = raw.match(/-?\d+(?:\.\d+)?/);

    if (!match) return null;

    const value = Number(match[0]);
    return Number.isFinite(value) ? value : null;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function progressFor(id) {
    const cfg = GAMES[id];
    if (!cfg) return { ratio: 0, label: "0%", done: false };

    let current = 0;
    let target = cfg.target;
    let label = "";

    switch (id) {
      case "match3": {
        current = numberFrom("#todayMatchScore") || 0;
        const dynamicTarget = numberFrom("#todayMatchTarget");
        if (dynamicTarget && dynamicTarget > 0) target = dynamicTarget;
        label = `${Math.floor(current).toLocaleString("ru-RU")} / ${Math.floor(target).toLocaleString("ru-RU")} очков`;
        break;
      }

      case "flappy":
        current = numberFrom("#todayFlappyScore") || 0;
        label = `${Math.floor(current)} / ${target} ворот`;
        break;

      case "merge2048": {
        const tiles = $$(".ts-merge-tile")
          .map(node => Number(String(node.textContent || "").trim()))
          .filter(value => Number.isFinite(value) && value > 0);

        current = tiles.length ? Math.max(...tiles) : 0;
        label = `${Math.floor(current)} / ${target}`;
        break;
      }

      case "memory": {
        current = $$(".ts-memory-card.matched").length;
        target = 16;
        label = `${Math.floor(current / 2)} / 8 пар`;
        break;
      }

      case "snake":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} ядер`;
        break;

      case "pulse": {
        const raw = $(".ts-extra-pulse")?.textContent || "";
        const match = raw.match(/(\d+)\s*МС/i);
        const reaction = match ? Number(match[1]) : null;

        if (reaction !== null && Number.isFinite(reaction)) {
          current = reaction;
          const ratio = clamp01((850 - current) / (850 - target));
          const done = current > 0 && current <= target;

          return {
            ratio: done ? 1 : ratio,
            label: `${current} мс · цель ${target} мс`,
            done
          };
        }

        return {
          ratio: 0,
          label: `0 / ${target} мс`,
          done: false
        };
      }

      case "breakout":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} очков`;
        break;

      case "ttt":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} побед`;
        break;

      case "word":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current / 10)} / 3 слов`;
        break;

      case "colorsnap":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} очков`;
        break;

      case "stacker":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} этажей`;
        break;

      case "laserdodge": {
        const remaining = numberFrom("#todayExtraTime");
        current = remaining === null
          ? 0
          : Math.max(0, 30 - remaining);
        target = 30;
        label = `${Math.floor(current)} / ${target} секунд`;
        break;
      }

      case "quiz":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} очков`;
        break;

      case "starcatch":
        current = numberFrom("#todayExtraScore") || 0;
        label = `${Math.floor(current)} / ${target} очков`;
        break;
    }

    const ratio = target > 0 ? clamp01(current / target) : 0;

    return {
      ratio,
      label: label || `${Math.floor(current)} / ${target}`,
      done: ratio >= 0.999
    };
  }

  function setText(node, value) {
    if (node && node.textContent !== String(value)) {
      node.textContent = String(value);
    }
  }

  function ensureQuestNode(parent, id, insertionPoint = null) {
    if (!parent || !GAMES[id]) return null;

    let node = $(".today-v96-quest", parent);

    if (node && node.dataset.v96Quest !== id) {
      node.remove();
      node = null;
    }

    if (node) return node;

    const cfg = GAMES[id];
    node = document.createElement("section");
    node.className = "today-v96-quest";
    node.dataset.v96Quest = id;
    node.setAttribute("aria-label", `Дополнительное испытание ${cfg.title}`);

    node.innerHTML = `
      <div class="today-v96-quest-top">
        <div>
          <div class="today-v96-quest-kicker">
            <i aria-hidden="true"></i>
            ДОПОЛНИТЕЛЬНОЕ ИСПЫТАНИЕ
          </div>
          <h3>${cfg.seal}</h3>
          <p>${cfg.task}</p>
        </div>
        <span class="today-v96-seal" aria-hidden="true">${cfg.icon}</span>
      </div>

      <div class="today-v96-quest-meta">
        <span data-v96-quest-state>ЦЕЛЬ НЕ ВЫПОЛНЕНА</span>
        <span data-v96-quest-value>0%</span>
      </div>

      <div
        class="today-v96-quest-track"
        role="progressbar"
        aria-label="Прогресс дополнительного испытания"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="0"
        data-v96-quest-track
      >
        <i class="today-v96-quest-fill" data-v96-quest-fill></i>
      </div>

      <div class="today-v96-quest-bottom">
        <span data-v96-quest-label>Цель ещё впереди</span>
        <span>ПЕЧАТЕЙ СОБРАНО: <b data-v96-seal-count>0</b></span>
      </div>

      <details class="today-v96-tip">
        <summary>Тактика и совет</summary>
        <p>${cfg.tip}</p>
      </details>
    `;

    if (insertionPoint && insertionPoint.parentNode) {
      insertionPoint.insertAdjacentElement("afterend", node);
    } else {
      parent.appendChild(node);
    }

    return node;
  }

  function updateQuest(parent, id) {
    const cfg = GAMES[id];
    if (!cfg) return;

    const quest = ensureQuestNode(parent, id);
    if (!quest) return;

    const metric = progressFor(id);
    const wasEarnedToday = isSealEarnedToday(id);

    if (metric.done) {
      awardSeal(id);
    }

    const earned = isSealEarnedToday(id);
    quest.classList.toggle("is-complete", earned);

    const seal = $(".today-v96-seal", quest);
    if (seal) {
      const symbol = earned ? "✓" : cfg.icon;
      setText(seal, symbol);
    }

    const stateNode = $("[data-v96-quest-state]", quest);
    const percentNode = $("[data-v96-quest-value]", quest);
    const labelNode = $("[data-v96-quest-label]", quest);
    const countNode = $("[data-v96-seal-count]", quest);
    const track = $("[data-v96-quest-track]", quest);
    const fill = $("[data-v96-quest-fill]", quest);

    const percent = Math.round(metric.ratio * 100);

    setText(
      stateNode,
      earned
        ? (wasEarnedToday ? "ПЕЧАТЬ УЖЕ В КОЛЛЕКЦИИ" : "ИСПЫТАНИЕ ПРОЙДЕНО")
        : "ЦЕЛЬ НЕ ВЫПОЛНЕНА"
    );

    setText(percentNode, `${percent}%`);
    setText(labelNode, metric.label);
    setText(countNode, getSealCount());

    if (fill && fill.style.width !== `${percent}%`) {
      fill.style.width = `${percent}%`;
    }

    if (track) {
      track.setAttribute("aria-valuenow", String(percent));
    }
  }

  function ensureSealShelf(home) {
    if (!home) return null;

    let shelf = $(".today-v96-seal-shelf", home);
    if (shelf) return shelf;

    const anchor = $(".today-v95-discovery", home);
    if (!anchor) return null;

    shelf = document.createElement("section");
    shelf.className = "today-v96-seal-shelf";
    shelf.setAttribute("aria-label", "Коллекция игровых печатей");

    shelf.innerHTML = `
      <div class="today-v96-seal-shelf-left">
        <span class="today-v96-shelf-icon" aria-hidden="true">✦</span>
        <span class="today-v96-shelf-copy">
          <b>Журнал игровых испытаний</b>
          <small>Каждая игра — отдельный вызов. Печати сохраняются на этом устройстве.</small>
        </span>
      </div>
      <span class="today-v96-shelf-count">
        <strong data-v96-total-seals>0</strong>
        <small>собрано печатей</small>
      </span>
    `;

    anchor.insertAdjacentElement("afterend", shelf);
    updateSealShelf();
    return shelf;
  }

  function updateSealShelf() {
    const value = String(getSealCount());

    $$("[data-v96-total-seals]").forEach(node => {
      setText(node, value);
    });
  }

  function updateFloatingNav() {
    const nav = $("nav.bottom-nav");
    if (!nav) return;

    const chatButton = $('[data-nav="chats"]', nav);
    if (!chatButton) return;

    // The detailed SVG is added by the installer to index.html.
    // Do not repeatedly mutate the navigation on every update.
    chatButton.setAttribute("aria-label", "Сообщения и чаты");
    chatButton.title = "Открыть чаты";
  }

  function resetGameClasses() {
    const modal = $("#modal");
    if (!modal) return;

    modal.classList.remove("today-v96-playing", "today-v96-crystal");
    delete modal.dataset.v96Game;
  }

  function currentGame() {
    const host = $("#modalContent");
    if (!host) return null;

    const active = $(".ts-active-game", host);

    if (active) {
      const id = active.dataset.activeGame;
      if (GAMES[id]) return { id, parent: active, insertion: $(".ts-game-stage", active) };
    }

    const campaignGame = $(".ts-m3-game", host);

    if (campaignGame) {
      return { id: "match3", parent: campaignGame, insertion: $("#todayMatch3Result", campaignGame) };
    }

    const campaign = $(".ts-m3-campaign", host);

    if (campaign) {
      return { id: "match3", parent: campaign, insertion: null, overview: true };
    }

    return null;
  }

  function updatePresentation() {
    const host = $("#modalContent");
    const modal = $("#modal");

    if (!host || !modal) return;

    const home = $(".ts-games-home", host);

    if (home) {
      resetGameClasses();
      ensureSealShelf(home);
      updateSealShelf();
      return;
    }

    const game = currentGame();

    if (!game) {
      resetGameClasses();
      return;
    }

    state.activeId = game.id;
    state.activeNode = game.parent;

    modal.classList.add("today-v96-playing");
    modal.dataset.v96Game = game.id;

    if (game.id === "match3") {
      modal.classList.add("today-v96-crystal");
    } else {
      modal.classList.remove("today-v96-crystal");
    }

    if (!game.overview) {
      const quest = ensureQuestNode(
        game.parent,
        game.id,
        game.insertion
      );

      updateQuest(game.parent, game.id);

      if (quest) {
        // Keep the quest visually below the board or result container.
        // No native game click handler is altered.
      }
    }
  }

  function tick() {
    try {
      updatePresentation();
      updateFloatingNav();
    } catch (error) {
      console.warn("[TODAY ARCADE V96] Optional presentation layer:", error);
    }
  }

  let timer = 0;

  function setup() {
    if (timer) return;

    tick();
    timer = window.setInterval(tick, 900);

    window.addEventListener("pageshow", tick, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }

  window.TODAY_ARCADE_V96 = {
    version: VERSION,
    refresh: tick,
    games: () => Object.keys(GAMES),
    seals: () => readSeals()
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
