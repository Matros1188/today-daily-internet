
/* TODAY ARCADE V91 — IMMERSIVE EDITION */
(() => {
  "use strict";

  const VERSION = "20261015190031";

  const GAME_IDS = new Set([
    "match3", "flappy", "merge2048", "memory",
    "snake", "pulse", "breakout", "ttt", "word",
    "colorsnap", "stacker", "laserdodge", "quiz", "starcatch"
  ]);

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

  const state = {
    active: false,
    gameId: null,
    direct: false,
    dispatchingOriginal: false,
    syntheticExit: false,
    observer: null,
    audio: null,
    lastScore: null,
    lastStatus: "",
    feedbackTimer: 0,
    bootStarted: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);

  function gameFromUrl() {
    try {
      const id = new URL(location.href).searchParams.get("arcade");
      return GAME_IDS.has(id) ? id : null;
    } catch (_) {
      return null;
    }
  }

  function cleanUrl() {
    const url = new URL(location.href);
    url.searchParams.delete("arcade");
    url.searchParams.delete("reset");
    return url.pathname + url.search + url.hash;
  }

  function routeUrl(id) {
    const url = new URL(location.href);
    url.searchParams.delete("reset");
    url.searchParams.set("arcade", id);
    return url.href;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeBest(id) {
    try {
      if (id !== "match3") {
        return Math.max(
          0,
          Number(localStorage.getItem("today-game-best-" + id) || 0)
        );
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

  function haptic(pattern = 8) {
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
    } catch (_) {}
  }

  function soundEnabled() {
    try {
      return localStorage.getItem("today-arcade-sound-v91") === "1";
    } catch (_) {
      return false;
    }
  }

  function updateSoundButton() {
    const button = $(".today-arcade-sound");
    if (!button) return;

    const enabled = soundEnabled();

    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.setAttribute(
      "aria-label",
      enabled ? "Выключить звуковые эффекты" : "Включить звуковые эффекты"
    );

    const icon = button.querySelector("[data-sound-icon]");
    const label = button.querySelector("[data-sound-label]");

    if (icon) icon.textContent = enabled ? "♫" : "♪";
    if (label) label.textContent = enabled ? "ЗВУК ВКЛ" : "ЗВУК ВЫКЛ";
  }

  function playTone(kind) {
    if (!soundEnabled()) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!state.audio) state.audio = new AudioContextClass();
      if (state.audio.state === "suspended") state.audio.resume();

      const ctx = state.audio;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      const startFrequency = kind === "score" ? 520 : 280;
      const endFrequency = kind === "score" ? 820 : 210;

      oscillator.type = kind === "score" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.10);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(
        kind === "score" ? 0.055 : 0.022,
        now + 0.012
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + (kind === "score" ? 0.16 : 0.08)
      );

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + (kind === "score" ? 0.17 : 0.08));
    } catch (_) {}
  }

  function toggleSound() {
    const next = !soundEnabled();

    try {
      localStorage.setItem("today-arcade-sound-v91", next ? "1" : "0");
    } catch (_) {}

    updateSoundButton();
    if (next) playTone("tap");
  }

  function updateRouteClasses(enabled) {
    document.documentElement.classList.toggle("today-arcade-route", enabled);
    document.body.classList.toggle("today-arcade-route", enabled);

    const modal = $("#modal");
    if (modal) modal.classList.toggle("today-arcade-route", enabled);
  }

  function installUrlState(id, direct) {
    const url = new URL(location.href);
    url.searchParams.delete("reset");
    url.searchParams.set("arcade", id);

    const oldState =
      history.state && typeof history.state === "object"
        ? { ...history.state }
        : {};

    oldState.__todayArcadeRouteV91 = { gameId: id, direct: !!direct };

    if (direct) history.replaceState(oldState, "", url.href);
    else history.pushState(oldState, "", url.href);
  }

  function createHeader(panel, gameId) {
    if (!panel || !GAME_IDS.has(gameId)) return;

    if (panel.querySelector(".today-arcade-topbar")) {
      panel.dataset.todayArcadeDecorated = gameId;
      updateSoundButton();
      return;
    }

    const originalHeading = panel.querySelector(".ts-panel-head h2");
    const originalSubtitle = panel.querySelector(".ts-panel-head p");

    const title =
      String(originalHeading?.textContent || "").trim() ||
      GAME_NAMES[gameId] ||
      "TODAY ARCADE";

    const subtitle = String(originalSubtitle?.textContent || "").trim();
    const record = safeBest(gameId);

    const header = document.createElement("header");
    header.className = "today-arcade-topbar";
    header.setAttribute("aria-label", "Панель игровой страницы");

    header.innerHTML = `
      <button type="button" class="today-arcade-back"
        data-today-arcade-back aria-label="Вернуться в каталог игр">
        <span aria-hidden="true">‹</span>
        <span class="today-arcade-back-label">АРКАДА</span>
      </button>
      <div class="today-arcade-title-stack">
        <small class="today-arcade-kicker">
          TODAY ORIGINALS · ${gameId.toUpperCase()}
        </small>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="today-arcade-tools">
        <div class="today-arcade-record">
          <small>РЕКОРД</small>
          <b>${record.toLocaleString("ru-RU")}</b>
        </div>
        <button type="button" class="today-arcade-sound"
          data-today-arcade-sound aria-pressed="false">
          <span data-sound-icon aria-hidden="true">♪</span>
          <span data-sound-label>ЗВУК ВЫКЛ</span>
        </button>
      </div>
    `;

    panel.prepend(header);
    panel.classList.add("today-arcade-panel");
    panel.dataset.todayArcadeDecorated = gameId;

    const oldToolbar = panel.querySelector(".ts-active-game .ts-game-toolbar");
    if (oldToolbar) oldToolbar.hidden = true;

    state.lastScore = readCurrentScore();
    state.lastStatus = readCurrentStatus();

    updateSoundButton();
  }

  function decorateActiveGame() {
    if (!state.active || !state.gameId) return;

    const host = $("#modalContent");
    if (!host) return;

    const panel = host.querySelector(".ts-panel");

    if (!panel || panel.querySelector(".ts-games-home")) return;

    if (
      panel.dataset.todayArcadeDecorated === state.gameId &&
      panel.querySelector(".today-arcade-topbar")
    ) {
      updateSoundButton();
      return;
    }

    createHeader(panel, state.gameId);
  }

  function makeGameLinks() {
    if (state.active) return;

    const home = $(".ts-games-home");
    if (!home) return;

    home.querySelectorAll(
      '[data-social-act="play-game"][data-game]'
    ).forEach(node => {
      const id = node.dataset.game;
      if (!GAME_IDS.has(id)) return;

      const href = routeUrl(id);

      if (node.tagName === "A") {
        if (node.href !== href) node.href = href;
        node.setAttribute(
          "aria-label",
          "Открыть отдельную игровую страницу: " + (GAME_NAMES[id] || id)
        );
        return;
      }

      const link = document.createElement("a");
      link.href = href;
      link.className = node.className;
      link.dataset.socialAct = "play-game";
      link.dataset.game = id;
      link.textContent = node.textContent || "Играть ↗";
      link.setAttribute(
        "aria-label",
        "Открыть отдельную игровую страницу: " + (GAME_NAMES[id] || id)
      );

      node.replaceWith(link);
    });
  }

  function readCurrentScore() {
    const node = $(
      "#todayMergeScore, #todayMatchScore, #todayMemoryScore, " +
      "#todayFlappyScore, #todayExtraScore, #todayMatch3Score"
    );

    if (!node) return null;

    const text = String(node.textContent || "").replace(/[^\d-]/g, "");
    const value = Number(text);

    return Number.isFinite(value) ? value : null;
  }

  function readCurrentStatus() {
    const node = $(
      "#todayExtraStatus, #todayMatchStatus, #todayMemoryStatus, " +
      "#todayFlappyStatus, #todayMatch3Status, .ts-game-status"
    );

    return String(node?.textContent || "").trim();
  }

  function pulseStage() {
    const stage = $(".ts-game-stage");
    if (!stage) return;

    stage.classList.remove("today-arcade-feedback");
    void stage.offsetWidth;
    stage.classList.add("today-arcade-feedback");

    if (state.feedbackTimer) clearTimeout(state.feedbackTimer);

    state.feedbackTimer = setTimeout(() => {
      stage.classList.remove("today-arcade-feedback");
    }, 430);
  }

  function animateTextNode(node, className) {
    if (!node) return;

    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);

    setTimeout(() => node.classList.remove(className), 380);
  }

  function inspectGameFeedback() {
    if (!state.active) return;

    const panel = $("#modalContent .ts-panel");
    if (!panel) return;

    const newScore = readCurrentScore();

    if (newScore !== null) {
      if (state.lastScore !== null && newScore > state.lastScore) {
        pulseStage();
        haptic([10, 20, 10]);
        playTone("score");

        const scoreNode = $(
          "#todayMergeScore, #todayMatchScore, #todayMemoryScore, " +
          "#todayFlappyScore, #todayExtraScore, #todayMatch3Score"
        );

        animateTextNode(scoreNode, "today-arcade-number-pop");
      }

      state.lastScore = newScore;
    }

    const status = readCurrentStatus();

    if (status && status !== state.lastStatus) {
      const statusNode = $(
        "#todayExtraStatus, #todayMatchStatus, #todayMemoryStatus, " +
        "#todayFlappyStatus, #todayMatch3Status, .ts-game-status"
      );

      animateTextNode(statusNode, "today-arcade-text-pop");
      state.lastStatus = status;
    }
  }

  function stopRunningGame() {
    try {
      if (typeof window.__TODAY_STOP_ACTIVE_GAME_V26 === "function") {
        window.__TODAY_STOP_ACTIVE_GAME_V26();
      }
    } catch (_) {}

    if (state.gameId === "match3") {
      const exitButton = $("#todaySocialExitTop");

      if (exitButton) {
        try {
          state.syntheticExit = true;
          exitButton.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window
            })
          );
        } catch (_) {
        } finally {
          state.syntheticExit = false;
        }
      }
    }
  }

  function clearRouteUi() {
    stopRunningGame();

    state.active = false;
    state.gameId = null;
    state.direct = false;
    state.lastScore = null;
    state.lastStatus = "";

    updateRouteClasses(false);
  }

  function showGameHub() {
    clearRouteUi();

    try {
      if (
        window.TODAY_SOCIAL &&
        typeof window.TODAY_SOCIAL.openMiniGames === "function"
      ) {
        window.TODAY_SOCIAL.openMiniGames();
      } else {
        location.href = cleanUrl();
      }
    } catch (error) {
      console.warn("[TODAY ARCADE V91] Не удалось открыть каталог", error);
      location.href = cleanUrl();
    }
  }

  function backToHub() {
    if (!state.active) return;

    if (state.direct) {
      const url = cleanUrl();

      const oldState =
        history.state && typeof history.state === "object"
          ? { ...history.state }
          : {};

      delete oldState.__todayArcadeRouteV91;
      history.replaceState(oldState, "", url);

      showGameHub();
      return;
    }

    history.back();
  }

  function startGameRoute(id, direct, launchNode) {
    if (!GAME_IDS.has(id) || !launchNode) return;

    if (state.active) {
      if (state.gameId === id) return;
      stopRunningGame();
    }

    state.active = true;
    state.gameId = id;
    state.direct = !!direct;
    state.lastScore = null;
    state.lastStatus = "";

    installUrlState(id, !!direct);
    updateRouteClasses(true);

    // Existing game handlers remain responsible for game rules and saves.
    state.dispatchingOriginal = true;

    try {
      launchNode.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
    } finally {
      state.dispatchingOriginal = false;
    }

    requestAnimationFrame(() => {
      decorateActiveGame();
      updateSoundButton();
      inspectGameFeedback();
    });
  }

  function onCaptureClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (state.syntheticExit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (state.dispatchingOriginal) return;

    const launch = target.closest(
      '[data-social-act="play-game"][data-game]'
    );

    if (launch && GAME_IDS.has(launch.dataset.game)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      startGameRoute(launch.dataset.game, false, launch);
      return;
    }

    if (!state.active) return;

    const back = target.closest("[data-today-arcade-back]");

    if (back) {
      event.preventDefault();
      event.stopImmediatePropagation();
      backToHub();
      return;
    }

    const sound = target.closest("[data-today-arcade-sound]");

    if (sound) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleSound();
      return;
    }

    const oldBack = target.closest('[data-social-act="mini-games"]');

    if (oldBack) {
      event.preventDefault();
      event.stopImmediatePropagation();
      backToHub();
      return;
    }

    if (
      target.closest(
        "#modal.today-arcade-route .ts-active-game, " +
        "#modal.today-arcade-route .ts-panel"
      ) &&
      target.closest("button, a")
    ) {
      haptic(7);
      playTone("tap");
    }
  }

  function bootDeepLink(id, attempts = 0) {
    if (!GAME_IDS.has(id)) return;

    const social = window.TODAY_SOCIAL;

    if (!social || typeof social.openMiniGames !== "function") {
      if (attempts < 70) {
        setTimeout(() => bootDeepLink(id, attempts + 1), 100);
      } else {
        console.warn("[TODAY ARCADE V91] Игровой модуль не загрузился");
      }
      return;
    }

    // Catalogue creation reuses the existing, tested game engines.
    social.openMiniGames();

    const tryLaunch = iteration => {
      const button = $(
        '.ts-games-home [data-social-act="play-game"][data-game="' + id + '"]'
      );

      if (button) {
        const savedRoute = history.state?.__todayArcadeRouteV91;

        const direct =
          savedRoute && savedRoute.gameId === id
            ? !!savedRoute.direct
            : true;

        startGameRoute(id, direct, button);
        return;
      }

      if (iteration < 60) {
        setTimeout(() => tryLaunch(iteration + 1), 100);
      } else {
        console.warn("[TODAY ARCADE V91] Не найден запуск игры:", id);
      }
    };

    setTimeout(() => tryLaunch(0), 60);
  }

  function onPopState() {
    const nextGame = gameFromUrl();

    if (nextGame) {
      if (!state.active || state.gameId !== nextGame) {
        if (state.active) clearRouteUi();
        bootDeepLink(nextGame);
      }
      return;
    }

    if (state.active) showGameHub();
  }

  function installObserver() {
    const host = $("#modalContent");
    if (!host || state.observer) return;

    state.observer = new MutationObserver(() => {
      if (state.active) {
        decorateActiveGame();
        inspectGameFeedback();
      } else {
        makeGameLinks();
      }
    });

    state.observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true
    });

    makeGameLinks();
  }

  function setup() {
    if (state.bootStarted) return;
    state.bootStarted = true;

    document.addEventListener("click", onCaptureClick, true);
    window.addEventListener("popstate", onPopState);

    installObserver();

    const id = gameFromUrl();
    if (id) bootDeepLink(id);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }

  window.TODAY_ARCADE_V91 = {
    version: VERSION,
    games: Array.from(GAME_IDS),

    open(id) {
      if (!GAME_IDS.has(id)) return;

      const button = $(
        '.ts-games-home [data-social-act="play-game"][data-game="' + id + '"]'
      );

      if (button) {
        startGameRoute(id, false, button);
      } else if (window.TODAY_SOCIAL?.openMiniGames) {
        window.TODAY_SOCIAL.openMiniGames();

        setTimeout(() => {
          const candidate = $(
            '.ts-games-home [data-social-act="play-game"][data-game="' + id + '"]'
          );

          if (candidate) startGameRoute(id, false, candidate);
        }, 80);
      }
    }
  };
})();
