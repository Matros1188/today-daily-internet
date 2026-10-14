/* TODAY HOME V69 — COMPACT UI, MEDIA AND EXPERIMENTAL LIVE */
(() => {
  'use strict';
  if (window.TODAY_HOME_V69) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let liveOverlay = null;
  let liveSession = null;
  let clipObserver = null;
  let recommendationObserver = null;

  function toast(message) {
    const node = $('#toast');
    if (node) {
      node.textContent = String(message || '');
      node.classList.add('show');
      clearTimeout(window.__todayV69Toast);
      window.__todayV69Toast = setTimeout(() => node.classList.remove('show'), 3500);
    } else {
      console.info('[TODAY V69]', message);
    }
  }

  function randomId() {
    try {
      if (crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return 'v69-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function storageGet(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function addQuickBar() {
    if ($('#todayV69QuickBar')) return;

    const anchor = $('.activity-strip') || $('#homeSection');
    if (!anchor) return;

    const bar = document.createElement('section');
    bar.id = 'todayV69QuickBar';
    bar.className = 'shell';
    bar.setAttribute('aria-label', 'Быстрые действия TODAY');

    bar.innerHTML = `
      <div class="today-v69-quickbar-inner">
        <button class="today-v69-action" type="button" data-v69-action="post">
          <span aria-hidden="true">＋</span><b>Запись</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="story">
          <span aria-hidden="true">◉</span><b>История</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="photo">
          <span aria-hidden="true">▧</span><b>Фото</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="clips">
          <span aria-hidden="true">▷</span><b>Клипы</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="music">
          <span aria-hidden="true">♫</span><b>Музыка</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="search">
          <span aria-hidden="true">⌕</span><b>Поиск</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="recommend"
                aria-pressed="false">
          <span aria-hidden="true">✦</span><b>Для тебя</b>
        </button>
        <button class="today-v69-action" type="button" data-v69-action="live">
          <span aria-hidden="true">●</span><b>Эфир</b>
        </button>
      </div>`;

    anchor.insertAdjacentElement('afterend', bar);
  }

  function setRecommendationsVisible(visible, scroll = false) {
    const shelf = $('#todayV67RecommendationShelf');
    const button = $('[data-v69-action="recommend"]');
    storageSet('today-v69-recommendations', visible ? 'on' : 'off');

    if (shelf) shelf.hidden = !visible;

    if (button) {
      button.setAttribute('aria-pressed', String(visible));
      button.classList.toggle('is-active', visible);
    }

    if (visible) {
      const mode = $('#todayV67FeedMode');
      if (mode && mode.value !== 'for_you') {
        mode.value = 'for_you';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (scroll && shelf) {
        shelf.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function initRecommendations() {
    const active = storageGet('today-v69-recommendations', 'off') === 'on';
    setRecommendationsVisible(active, false);

    if (recommendationObserver) recommendationObserver.disconnect();

    recommendationObserver = new MutationObserver(() => {
      const visible = storageGet('today-v69-recommendations', 'off') === 'on';
      const shelf = $('#todayV67RecommendationShelf');
      if (shelf && shelf.hidden === visible) shelf.hidden = !visible;
    });

    recommendationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function openMedia(tab) {
    const media = window.TODAY_MEDIA_V66;
    if (!media || typeof media.open !== 'function') {
      toast('Медиатека ещё загружается. Обнови страницу и попробуй снова.');
      return;
    }

    try {
      await media.open(tab);
      if (tab === 'video') {
        setTimeout(setupClipVideos, 120);
      }
    } catch (error) {
      toast('Не удалось открыть медиа: ' + String(error?.message || error).slice(0, 160));
    }
  }

  function setupClipVideos() {
    const grid = $('.today-v66-media-grid.is-clips');
    if (!grid) return;

    if (clipObserver) {
      try { clipObserver.disconnect(); } catch (_) {}
      clipObserver = null;
    }

    const videos = $$('.today-v66-media-video', grid);
    videos.forEach(video => {
      video.setAttribute('playsinline', '');
      video.loop = true;
      video.muted = true;
      video.preload = 'metadata';
    });

    if (!('IntersectionObserver' in window)) return;

    clipObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          videos.forEach(other => {
            if (other !== video) other.pause();
          });
          const play = video.play();
          if (play && typeof play.catch === 'function') play.catch(() => {});
        } else {
          video.pause();
        }
      });
    }, {
      root: grid,
      threshold: [0, 0.35, 0.65, 0.9]
    });

    videos.forEach(video => clipObserver.observe(video));
  }

  function liveClient() {
    try {
      if (typeof sb !== 'undefined' && sb && typeof sb.channel === 'function') {
        return sb;
      }
    } catch (_) {}

    const config = window.TODAY_CONFIG || {};
    if (
      window.supabase &&
      config.supabaseUrl &&
      config.supabaseKey
    ) {
      return window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    }

    throw new Error('Клиент Supabase недоступен.');
  }

  function makeRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    try {
      const random = new Uint8Array(6);
      crypto.getRandomValues(random);
      for (const value of random) code += alphabet[value % alphabet.length];
    } catch (_) {
      for (let i = 0; i < 6; i++) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
    return code;
  }

  function openLive() {
    if (liveSession) {
      renderLiveRoom(liveSession);
      return;
    }

    if (liveOverlay) liveOverlay.remove();

    liveOverlay = document.createElement('div');
    liveOverlay.id = 'todayV69LiveOverlay';
    liveOverlay.setAttribute('role', 'dialog');
    liveOverlay.setAttribute('aria-modal', 'true');
    liveOverlay.setAttribute('aria-label', 'Прямой эфир TODAY');

    liveOverlay.innerHTML = `
      <section class="today-v69-live-card">
        <header class="today-v69-live-head">
          <div>
            <h2>Прямой эфир</h2>
            <p>Запусти видео с телефона или подключись к эфиру по коду.</p>
          </div>
          <button class="today-v69-live-close" type="button" data-v69-live="close"
                  aria-label="Закрыть">×</button>
        </header>

        <button class="today-v69-live-btn is-primary" type="button"
                data-v69-live="host">Выйти в эфир</button>

        <label class="today-v69-live-field">
          Код эфира
          <input id="todayV69LiveCodeInput" maxlength="12"
                 autocomplete="off" autocapitalize="characters"
                 placeholder="Например, AB23CD">
        </label>

        <button class="today-v69-live-btn" type="button"
                data-v69-live="join">Подключиться к эфиру</button>

        <p class="today-v69-live-note">
          Экспериментальная связь WebRTC через Supabase Realtime.
          Для некоторых мобильных и корпоративных сетей может потребоваться
          отдельный TURN-сервер. Запись трансляции не ведётся.
        </p>
        <div id="todayV69LiveStatus" class="today-v69-live-status" aria-live="polite"></div>
      </section>`;

    document.body.append(liveOverlay);
  }

  function liveStatus(message) {
    const node = $('#todayV69LiveStatus', liveOverlay || document);
    if (node) node.textContent = String(message || '');
  }

  function renderLiveRoom(session) {
    if (!liveOverlay) {
      liveOverlay = document.createElement('div');
      liveOverlay.id = 'todayV69LiveOverlay';
      document.body.append(liveOverlay);
    }

    const isHost = session.role === 'host';

    liveOverlay.innerHTML = `
      <section class="today-v69-live-card">
        <header class="today-v69-live-head">
          <div>
            <h2>${isHost ? 'Ты в эфире' : 'Просмотр эфира'}</h2>
            <p>${isHost
              ? 'Отправь код зрителю. Не закрывай страницу во время трансляции.'
              : 'Видео появится после установления соединения.'}</p>
          </div>
          <button class="today-v69-live-close" type="button" data-v69-live="close"
                  aria-label="Завершить эфир">×</button>
        </header>

        ${isHost ? `
          <div class="today-v69-live-code">КОД · ${session.code}</div>
          <div class="today-v69-live-actions">
            <button class="today-v69-live-btn is-primary" type="button"
                    data-v69-live="copy">Скопировать код</button>
          </div>
          <div class="today-v69-live-video-grid">
            <div class="today-v69-live-video-wrap">
              <video id="todayV69LocalVideo" autoplay muted playsinline></video>
              <b>Ты в эфире</b>
            </div>
            <div class="today-v69-live-video-wrap">
              <div id="todayV69LiveViewerCount" class="today-v69-live-code">0 / 4</div>
              <b>Зрители</b>
            </div>
          </div>
        ` : `
          <div class="today-v69-live-video-wrap">
            <video id="todayV69RemoteVideo" autoplay playsinline controls></video>
            <b>Прямой эфир TODAY</b>
          </div>
        `}

        <p id="todayV69LiveStatus" class="today-v69-live-status" aria-live="polite">
          ${isHost ? 'Ожидаем подключения зрителя…' : 'Подключаемся к эфиру…'}
        </p>
        <p class="today-v69-live-note">
          Экспериментальный эфир: до четырёх зрителей на одного ведущего.
          Надёжность соединения зависит от настроек Supabase Realtime,
          WebRTC и доступности STUN/TURN для конкретной сети.
        </p>
      </section>`;

    if (isHost) {
      const video = $('#todayV69LocalVideo', liveOverlay);
      if (video) {
        video.srcObject = session.localStream;
        const play = video.play();
        if (play?.catch) play.catch(() => {});
      }
    } else if (session.remoteStream) {
      const video = $('#todayV69RemoteVideo', liveOverlay);
      if (video) {
        video.srcObject = session.remoteStream;
        const play = video.play();
        if (play?.catch) play.catch(() => {});
      }
    }
  }

  async function subscribeLiveChannel(session) {
    const client = liveClient();
    const channel = client.channel(
      'today-v69-live-' + session.code.toLowerCase(),
      { config: { broadcast: { self: false } } }
    );

    session.channel = channel;

    channel.on('broadcast', { event: 'signal' }, event => {
      const payload = event?.payload;
      if (session !== liveSession || !payload) return;
      handleLiveSignal(session, payload).catch(error => {
        console.warn('[TODAY V69 live signal]', error);
        liveStatus('Сигнал связи: ' + String(error?.message || error).slice(0, 150));
      });
    });

    await new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Supabase Realtime не ответил за 12 секунд.'));
        }
      }, 12000);

      channel.subscribe(status => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true;
          clearTimeout(timeout);
          resolve();
        } else if (
          ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status) &&
          !settled
        ) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('Не удалось подключить канал эфира: ' + status));
        }
      });
    });
  }

  async function sendLiveSignal(session, target, type, data = {}) {
    if (!session?.channel) throw new Error('Канал эфира ещё не подключён.');

    const result = await session.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        room: session.code,
        from: session.id,
        to: target || null,
        type,
        data
      }
    });

    if (result && result !== 'ok') {
      console.warn('[TODAY V69 live broadcast]', result);
    }
  }

  function newPeer(session, remoteId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = event => {
      if (!event.candidate) return;
      const target = session.role === 'host' ? remoteId : session.hostId;
      sendLiveSignal(session, target, 'candidate', event.candidate.toJSON())
        .catch(error => console.warn('[TODAY V69 candidate]', error));
    };

    pc.onconnectionstatechange = () => {
      if (session.role === 'host') {
        const count = Array.from(session.peers.values()).filter(peer =>
          ['connected', 'connecting'].includes(peer.connectionState)
        ).length;
        const label = $('#todayV69LiveViewerCount', liveOverlay);
        if (label) label.textContent = `${count} / 4`;
        if (peerClosed(pc)) session.peers.delete(remoteId);
      } else if (['failed', 'disconnected'].includes(pc.connectionState)) {
        liveStatus('Соединение нестабильно. Попробуй подключиться ещё раз.');
      }
    };

    return pc;
  }

  function peerClosed(pc) {
    return ['failed', 'closed'].includes(pc.connectionState);
  }

  async function addCandidate(session, key, pc, candidate) {
    if (!candidate || !pc) return;

    if (!pc.remoteDescription) {
      const pending = session.pendingCandidates.get(key) || [];
      pending.push(candidate);
      session.pendingCandidates.set(key, pending);
      return;
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async function flushCandidates(session, key, pc) {
    const pending = session.pendingCandidates.get(key) || [];
    session.pendingCandidates.set(key, []);

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn('[TODAY V69 queued ICE]', error);
      }
    }
  }

  async function handleLiveSignal(session, message) {
    if (message.room !== session.code) return;
    if (message.from === session.id) return;
    if (message.to && message.to !== session.id) return;

    const from = String(message.from || '');
    const data = message.data || {};

    if (message.type === 'ended' && session.role === 'viewer') {
      liveStatus('Ведущий завершил эфир.');
      const video = $('#todayV69RemoteVideo', liveOverlay);
      if (video) video.pause();
      return;
    }

    if (message.type === 'error' && session.role === 'viewer') {
      liveStatus(data.message || 'Ведущий не смог принять подключение.');
      return;
    }

    if (session.role === 'host') {
      if (message.type === 'join') {
        if (!from || session.peers.has(from)) return;

        if (session.peers.size >= 4) {
          await sendLiveSignal(session, from, 'error', {
            message: 'В эфире уже достигнут лимит в четыре зрителя.'
          });
          return;
        }

        const pc = newPeer(session, from);
        session.peers.set(from, pc);
        session.pendingCandidates.set(from, []);

        session.localStream.getTracks().forEach(track => {
          pc.addTrack(track, session.localStream);
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendLiveSignal(
          session,
          from,
          'offer',
          pc.localDescription.toJSON()
        );

        liveStatus('Отправлено приглашение зрителю. Ожидаем соединение…');
        return;
      }

      if (message.type === 'answer') {
        const pc = session.peers.get(from);
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription(data));
        await flushCandidates(session, from, pc);
        liveStatus('Зритель подключён или завершает подключение.');
        return;
      }

      if (message.type === 'candidate') {
        const pc = session.peers.get(from);
        if (pc) await addCandidate(session, from, pc, data);
        return;
      }

      if (message.type === 'leave') {
        const pc = session.peers.get(from);
        if (pc) pc.close();
        session.peers.delete(from);
        session.pendingCandidates.delete(from);
        const label = $('#todayV69LiveViewerCount', liveOverlay);
        if (label) label.textContent = `${session.peers.size} / 4`;
      }

      return;
    }

    /* Viewer */
    if (message.type === 'offer') {
      session.hostId = from;

      if (session.pc) {
        try { session.pc.close(); } catch (_) {}
      }

      const pc = newPeer(session, 'host');
      session.pc = pc;
      session.pendingCandidates.set('host', []);

      pc.ontrack = event => {
        session.remoteStream = event.streams?.[0] || session.remoteStream;
        if (!session.remoteStream) {
          session.remoteStream = new MediaStream();
          session.remoteStream.addTrack(event.track);
        }

        const video = $('#todayV69RemoteVideo', liveOverlay);
        if (video) {
          video.srcObject = session.remoteStream;
          const play = video.play();
          if (play?.catch) play.catch(() => {});
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data));
      await flushCandidates(session, 'host', pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendLiveSignal(
        session,
        session.hostId,
        'answer',
        pc.localDescription.toJSON()
      );

      liveStatus('Ответ отправлен. Соединяем видео…');
      return;
    }

    if (message.type === 'candidate') {
      if (session.pc) await addCandidate(session, 'host', session.pc, data);
    }
  }

  async function startHost() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к камере и микрофону.');
    }

    const code = makeRoomCode();
    liveStatus('Запрашиваем доступ к камере и микрофону…');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true
    });

    const session = {
      id: randomId(),
      role: 'host',
      code,
      channel: null,
      localStream: stream,
      peers: new Map(),
      pendingCandidates: new Map(),
      hostId: null,
      pc: null,
      remoteStream: null
    };

    liveSession = session;

    try {
      await subscribeLiveChannel(session);
      renderLiveRoom(session);
      liveStatus('Эфир создан. Поделись кодом с первым зрителем.');
    } catch (error) {
      stream.getTracks().forEach(track => track.stop());
      liveSession = null;
      throw error;
    }
  }

  async function joinHost(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (code.length < 4) throw new Error('Введи корректный код эфира.');

    const session = {
      id: randomId(),
      role: 'viewer',
      code,
      channel: null,
      localStream: null,
      peers: new Map(),
      pendingCandidates: new Map(),
      hostId: null,
      pc: null,
      remoteStream: null
    };

    liveSession = session;

    try {
      await subscribeLiveChannel(session);
      renderLiveRoom(session);
      await sendLiveSignal(session, null, 'join', {});
      liveStatus('Запрос отправлен ведущему. Ожидаем соединение…');
    } catch (error) {
      liveSession = null;
      try { await session.channel?.unsubscribe(); } catch (_) {}
      throw error;
    }
  }

  async function endLive() {
    const session = liveSession;

    if (session) {
      if (session.role === 'host') {
        try { await sendLiveSignal(session, null, 'ended', {}); } catch (_) {}
      } else if (session.hostId) {
        try { await sendLiveSignal(session, session.hostId, 'leave', {}); } catch (_) {}
      }

      try {
        session.localStream?.getTracks().forEach(track => track.stop());
      } catch (_) {}

      try {
        session.peers?.forEach(pc => pc.close());
        session.pc?.close();
      } catch (_) {}

      try { await session.channel?.unsubscribe(); } catch (_) {}

      try {
        const client = liveClient();
        if (session.channel) await client.removeChannel(session.channel);
      } catch (_) {}

      if (liveSession === session) liveSession = null;
    }

    if (liveOverlay) {
      liveOverlay.remove();
      liveOverlay = null;
    }
  }

  async function copyLiveCode() {
    if (!liveSession?.code) return;

    try {
      await navigator.clipboard.writeText(liveSession.code);
      toast('Код эфира скопирован.');
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = liveSession.code;
      input.style.cssText = 'position:fixed;opacity:0;left:-9999px;top:0';
      document.body.append(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      toast(ok ? 'Код эфира скопирован.' : 'Не удалось скопировать код.');
    }
  }

  function openStory() {
    const social = window.TODAY_SOCIAL;
    if (social && typeof social.openOwnStoryComposer === 'function') {
      Promise.resolve(social.openOwnStoryComposer()).catch(error => {
        toast('Не удалось открыть историю: ' + String(error?.message || error));
      });
    } else {
      toast('Истории ещё загружаются. Обнови страницу и повтори попытку.');
    }
  }

  function handleAction(action, button) {
    if (action === 'post') {
      if (window.TODAY_HOME_V64?.openCreate) {
        window.TODAY_HOME_V64.openCreate();
      } else {
        toast('Форма публикации ещё загружается.');
      }
      return;
    }

    if (action === 'story') {
      openStory();
      return;
    }

    if (action === 'photo') {
      openMedia('upload');
      return;
    }

    if (action === 'clips') {
      openMedia('video');
      return;
    }

    if (action === 'music') {
      openMedia('music');
      return;
    }

    if (action === 'search') {
      if (window.TODAY_HOME_V64?.openSearch) {
        window.TODAY_HOME_V64.openSearch();
      } else {
        toast('Поиск ещё загружается.');
      }
      return;
    }

    if (action === 'recommend') {
      const active = button.getAttribute('aria-pressed') !== 'true';
      setRecommendationsVisible(active, active);
      return;
    }

    if (action === 'live') {
      openLive();
    }
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const liveButton = event.target.closest('[data-v69-live]');
      if (liveButton && liveOverlay?.contains(liveButton)) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }

        const action = liveButton.dataset.v69Live;

        if (action === 'close') {
          endLive();
        } else if (action === 'host') {
          liveButton.disabled = true;
          startHost().catch(error => {
            liveButton.disabled = false;
            liveStatus('Не удалось начать эфир: ' + String(error?.message || error).slice(0, 180));
          });
        } else if (action === 'join') {
          const input = $('#todayV69LiveCodeInput', liveOverlay);
          liveButton.disabled = true;
          joinHost(input?.value || '').catch(error => {
            liveButton.disabled = false;
            liveStatus('Не удалось подключиться: ' + String(error?.message || error).slice(0, 180));
          });
        } else if (action === 'copy') {
          copyLiveCode();
        }

        return;
      }

      const button = event.target.closest('[data-v69-action]');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      handleAction(button.dataset.v69Action, button);
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && liveOverlay) {
        event.preventDefault();
        endLive();
      }
    }, true);

    /* Если пользователь закрыл медиатеку, очищаем наблюдение клипов. */
    const observer = new MutationObserver(() => {
      if (!$('.today-v66-media-grid.is-clips') && clipObserver) {
        try { clipObserver.disconnect(); } catch (_) {}
        clipObserver = null;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (document.documentElement.dataset.todayHomeV69 === 'ready') return;
    document.documentElement.dataset.todayHomeV69 = 'ready';

    addQuickBar();
    bindEvents();
    initRecommendations();

    /* Старую большую панель больше не показываем. */
    const oldTools = $('#todayV51Tools');
    if (oldTools) oldTools.hidden = true;

    document.documentElement.classList.add('today-home-v69');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.TODAY_HOME_V69 = {
    version: 'V69',
    openLive,
    endLive,
    openMedia,
    refresh: () => {
      addQuickBar();
      initRecommendations();
    }
  };
})();
