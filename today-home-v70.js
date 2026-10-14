/* TODAY HOME V70 — CLEAN COMPOSER, REAL CAMERA CAPTURE, RESPONSIVE UI */
(() => {
  'use strict';
  if (window.TODAY_HOME_V70) return;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let composer = null;
  let camera = null;
  let cameraTimer = null;
  let clipObserver = null;

  const ICONS = {
    post: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    story: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><path d="M17.5 6.8h.01"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>',
    clips: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="4"/><path d="m10 8 6 4-6 4z"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    recommend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg>',
    live: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13M2.5 2.5a13.5 13.5 0 0 0 0 19M21.5 2.5a13.5 13.5 0 0 1 0 19"/></svg>',
    wall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 16l10-10 3 3L9 19l-4 1z"/><path d="m14 8 3 3"/></svg>',
    day: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8 9h8M8 12h6M8 15h5"/></svg>'
  };

  function toast(message) {
    const node = $('#toast');
    if (node) {
      node.textContent = String(message || '');
      node.classList.add('show');
      clearTimeout(window.__todayV70Toast);
      window.__todayV70Toast = setTimeout(() => node.classList.remove('show'), 3300);
    } else {
      console.info('[TODAY V70]', message);
    }
  }

  function getLocal(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function setLocal(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function iconButton(action, label) {
    return `<button type="button" class="today-v70-action" data-v70-action="${action}">
      ${ICONS[action] || ''}
      <b>${label}</b>
    </button>`;
  }

  function buildQuickBar() {
    let bar = $('#todayV69QuickBar');

    if (!bar) {
      bar = document.createElement('section');
      bar.id = 'todayV69QuickBar';
      const anchor = $('.activity-strip') || $('#homeSection');
      if (anchor) anchor.insertAdjacentElement('afterend', bar);
      else return;
    }

    bar.className = 'shell today-v70-quickbar';
    bar.setAttribute('aria-label', 'Быстрые действия TODAY');
    bar.innerHTML = `
      <div class="today-v70-quickbar-inner">
        ${iconButton('post', 'Создать')}
        ${iconButton('story', 'История')}
        ${iconButton('photo', 'Фото')}
        ${iconButton('clips', 'Клипы')}
        ${iconButton('music', 'Музыка')}
        ${iconButton('search', 'Поиск')}
        ${iconButton('recommend', 'Для тебя')}
        ${iconButton('live', 'Эфир')}
      </div>`;
  }

  function removeNoise() {
    [
      '#todayV51Tools',
      '#todayOmniverseV60Open',
      '#todayV66MediaRail',
      '#todayHomeSearch',
      '#todayHomeActivity',
      '#todayMediaV66Button'
    ].forEach(selector => {
      $$(selector).forEach(node => node.remove());
    });

    const oldCreate = $('#todayV64CreateMain');
    if (oldCreate) {
      const wrapper = oldCreate.parentElement;
      const head = wrapper?.closest('.section-head');
      const refresh = $('#peopleRefresh');

      oldCreate.remove();

      if (head && refresh && wrapper?.contains(refresh)) {
        head.append(refresh);
      }

      if (wrapper && wrapper.children.length === 0) wrapper.remove();
    }

    const tools = $('#todayV51Tools');
    if (tools) tools.remove();

    // Скрываем рекомендации до явного выбора пользователя.
    const shelf = $('#todayV67RecommendationShelf');
    if (shelf) {
      shelf.hidden = getLocal('today-v70-recommendations', 'off') !== 'on';
    }
  }

  function setRecommendations(visible, scroll = false) {
    const shelf = $('#todayV67RecommendationShelf');
    const button = $('[data-v70-action="recommend"]');

    setLocal('today-v70-recommendations', visible ? 'on' : 'off');

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

  function ensureComposer() {
    if (composer) return composer;

    composer = document.createElement('div');
    composer.id = 'todayV70Composer';
    composer.hidden = true;
    composer.innerHTML = `
      <section class="today-v70-composer-sheet" role="dialog"
               aria-modal="true" aria-labelledby="todayV70ComposerTitle">
        <header class="today-v70-composer-head">
          <div>
            <h2 id="todayV70ComposerTitle">Что публикуем?</h2>
            <p>Выбери формат — TODAY откроет нужный экран.</p>
          </div>
          <button class="today-v70-composer-close" type="button"
                  data-v70-compose-close aria-label="Закрыть">×</button>
        </header>

        <div class="today-v70-composer-grid">
          <button type="button" class="today-v70-compose-option" data-v70-compose="wall">
            <span>${ICONS.wall}</span>
            <span><b>Запись на стене</b><small>Пост в личном профиле</small></span>
          </button>

          <button type="button" class="today-v70-compose-option" data-v70-compose="story">
            <span>${ICONS.story}</span>
            <span><b>История</b><small>Фото или видео с камеры</small></span>
          </button>

          <button type="button" class="today-v70-compose-option" data-v70-compose="photo">
            <span>${ICONS.photo}</span>
            <span><b>Опубликовать фото</b><small>Фотоальбом TODAY</small></span>
          </button>

          <button type="button" class="today-v70-compose-option" data-v70-compose="clip">
            <span>${ICONS.clips}</span>
            <span><b>Загрузить клип</b><small>Вертикальное видео</small></span>
          </button>

          <button type="button" class="today-v70-compose-option" data-v70-compose="music">
            <span>${ICONS.music}</span>
            <span><b>Поделиться музыкой</b><small>Ссылка на трек</small></span>
          </button>

          <button type="button" class="today-v70-compose-option" data-v70-compose="day">
            <span>${ICONS.day}</span>
            <span><b>Рубрика дня</b><small>Вопрос, факт, история и другое</small></span>
          </button>
        </div>
      </section>`;

    composer.addEventListener('click', event => {
      if (event.target === composer || event.target.closest('[data-v70-compose-close]')) {
        closeComposer();
      }
    });

    document.body.append(composer);
    return composer;
  }

  function openComposer() {
    const node = ensureComposer();
    node.hidden = false;
    document.body.classList.add('today-v70-composer-open');
    $('[data-v70-compose-close]', node)?.focus({ preventScroll: true });
  }

  function closeComposer() {
    if (composer) composer.hidden = true;
    document.body.classList.remove('today-v70-composer-open');
  }

  async function openUploadType(type) {
    const media = window.TODAY_MEDIA_V66;
    if (!media || typeof media.open !== 'function') {
      toast('Медиатека ещё загружается. Обнови страницу.');
      return;
    }

    try {
      await media.open('upload');

      const select = $('#todayV66MediaType');
      if (!select) {
        toast('Войди в аккаунт, чтобы публиковать медиа.');
        return;
      }

      select.value = type;
      select.dispatchEvent(new Event('change', { bubbles: true }));

      const nameInput = $('#todayV66UploadForm input[name="title"]');
      nameInput?.focus({ preventScroll: true });
    } catch (error) {
      toast('Не удалось открыть загрузку: ' + String(error?.message || error).slice(0, 140));
    }
  }

  async function openMedia(tab) {
    const media = window.TODAY_MEDIA_V66;
    if (!media || typeof media.open !== 'function') {
      toast('Медиатека ещё загружается. Обнови страницу.');
      return;
    }

    try {
      await media.open(tab);
      if (tab === 'video') setupClipViewer();
    } catch (error) {
      toast('Не удалось открыть медиа: ' + String(error?.message || error).slice(0, 140));
    }
  }

  function setupClipViewer() {
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
          const playing = video.play();
          if (playing && typeof playing.catch === 'function') {
            playing.catch(() => {});
          }
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

  async function openStoryComposer() {
    const social = window.TODAY_SOCIAL;

    if (!social || typeof social.openOwnStoryComposer !== 'function') {
      toast('Истории ещё загружаются. Обнови страницу.');
      return;
    }

    try {
      await social.openOwnStoryComposer();
      window.setTimeout(addStoryCameraButton, 80);
    } catch (error) {
      toast('Не удалось открыть историю: ' + String(error?.message || error));
    }
  }

  function addStoryCameraButton() {
    const modalContent = $('#modalContent');
    const form = modalContent?.querySelector('form[data-social-form="create-story"]');
    const input = form?.querySelector('input[name="story_media"]');

    if (!form || !input) {
      toast('Открой историю в своём профиле и попробуй ещё раз.');
      return;
    }

    if (form.querySelector('[data-v70-record-story]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'today-v70-camera-btn is-primary';
    button.dataset.v70RecordStory = '1';
    button.innerHTML = `
      ${ICONS.story}
      <span>Записать с камеры</span>`;

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openCameraRecorder(input).catch(error => {
        toast('Не удалось открыть камеру: ' + String(error?.message || error));
      });
    });

    const label = input.closest('label');
    if (label) label.insertAdjacentElement('afterend', button);
    else form.insertBefore(button, input);
  }

  function cameraStatus(text) {
    const node = $('#todayV70CameraStatus');
    if (node) node.textContent = String(text || '');
  }

  function cameraButton(action) {
    return $(`[data-v70-camera="${action}"]`, $('#todayV70Camera'));
  }

  function cameraMarkup() {
    return `
      <section class="today-v70-camera-card" role="dialog" aria-modal="true"
               aria-labelledby="todayV70CameraTitle">
        <header class="today-v70-camera-header">
          <div>
            <b id="todayV70CameraTitle">Камера TODAY</b>
            <small>Сними фото или запиши историю до 30 секунд</small>
          </div>
          <button type="button" class="today-v70-camera-btn"
                  data-v70-camera="close" aria-label="Закрыть камеру">×</button>
        </header>

        <div class="today-v70-camera-stage">
          <video id="todayV70CameraLive" autoplay muted playsinline></video>
          <img id="todayV70CameraPhoto" alt="Снятый кадр" hidden>
          <video id="todayV70CameraCaptured" controls playsinline hidden></video>
        </div>

        <div id="todayV70CameraStatus" class="today-v70-camera-status" aria-live="polite">
          Запрашиваем камеру…
        </div>

        <div class="today-v70-camera-controls">
          <button type="button" class="today-v70-camera-btn"
                  data-v70-camera="photo">Снять фото</button>
          <button type="button" class="today-v70-camera-btn is-record"
                  data-v70-camera="record">● Записать видео</button>
          <button type="button" class="today-v70-camera-btn"
                  data-v70-camera="stop" disabled>Остановить</button>
          <button type="button" class="today-v70-camera-btn is-primary"
                  data-v70-camera="use" disabled>Прикрепить</button>
          <button type="button" class="today-v70-camera-btn"
                  data-v70-camera="native">Камера телефона</button>
          <button type="button" class="today-v70-camera-btn"
                  data-v70-camera="close">Отмена</button>
        </div>

        <p class="today-v70-camera-note">
          Камера работает только после разрешения браузера.
          Фото и видео не публикуются автоматически — сначала их нужно прикрепить,
          затем нажать «Опубликовать историю».
        </p>
      </section>`;
  }

  async function openCameraRecorder(input) {
    closeCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Камера недоступна в этом браузере. Используй камеру телефона.');
      input?.click();
      return;
    }

    camera = {
      input,
      stream: null,
      recorder: null,
      chunks: [],
      file: null,
      previewUrl: null,
      recording: false
    };

    const overlay = document.createElement('div');
    overlay.id = 'todayV70Camera';
    overlay.innerHTML = cameraMarkup();
    document.body.append(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeCamera();
    });

    try {
      camera.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 720 },
          height: { ideal: 1280 }
        },
        audio: true
      });

      const video = $('#todayV70CameraLive');
      video.srcObject = camera.stream;
      await video.play().catch(() => {});
      cameraStatus('Камера готова. Сними фото или начни запись видео.');
    } catch (error) {
      cameraStatus(
        'Нет доступа к камере. Разреши её в браузере или нажми «Камера телефона».'
      );
      console.warn('[TODAY V70 camera]', error);
    }

    cameraButton('photo').disabled = !camera.stream;
    cameraButton('record').disabled = !camera.stream;
  }

  function hideCapturedPreview() {
    const photo = $('#todayV70CameraPhoto');
    const video = $('#todayV70CameraCaptured');
    const live = $('#todayV70CameraLive');

    if (photo) {
      photo.hidden = true;
      photo.removeAttribute('src');
    }
    if (video) {
      video.pause();
      video.hidden = true;
      video.removeAttribute('src');
      video.load();
    }
    if (live) live.hidden = false;
  }

  function replacePendingFile(file) {
    if (!camera || !file) return;

    if (camera.previewUrl) {
      try { URL.revokeObjectURL(camera.previewUrl); } catch (_) {}
      camera.previewUrl = null;
    }

    camera.file = file;
    const type = String(file.type || '');
    camera.previewUrl = URL.createObjectURL(file);

    const photo = $('#todayV70CameraPhoto');
    const capturedVideo = $('#todayV70CameraCaptured');
    const live = $('#todayV70CameraLive');

    if (type.startsWith('image/')) {
      if (capturedVideo) {
        capturedVideo.hidden = true;
        capturedVideo.pause();
        capturedVideo.removeAttribute('src');
      }
      if (photo) {
        photo.src = camera.previewUrl;
        photo.hidden = false;
      }
      if (live) live.hidden = true;
    } else {
      if (photo) photo.hidden = true;
      if (capturedVideo) {
        capturedVideo.src = camera.previewUrl;
        capturedVideo.hidden = false;
        capturedVideo.load();
      }
      if (live) live.hidden = true;
    }

    cameraButton('use').disabled = false;
    cameraStatus(`Материал готов: ${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} МБ. Нажми «Прикрепить».`);
  }

  function capturePhoto() {
    if (!camera?.stream) return;

    const video = $('#todayV70CameraLive');
    if (!video || !video.videoWidth || !video.videoHeight) {
      cameraStatus('Камера ещё запускается. Подожди секунду.');
      return;
    }

    const canvas = document.createElement('canvas');
    const maxDimension = 1440;
    const ratio = Math.min(
      1,
      maxDimension / Math.max(video.videoWidth, video.videoHeight)
    );

    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));

    const context = canvas.getContext('2d');
    if (!context) {
      cameraStatus('Не удалось подготовить снимок.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
      if (!blob) {
        cameraStatus('Не удалось сохранить снимок. Попробуй ещё раз.');
        return;
      }

      const file = new File(
        [blob],
        `today-story-camera-${Date.now()}.jpg`,
        { type: 'image/jpeg', lastModified: Date.now() }
      );

      replacePendingFile(file);
    }, 'image/jpeg', 0.9);
  }

  function recorderMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';

    const options = [
      'video/mp4',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];

    if (typeof MediaRecorder.isTypeSupported !== 'function') return '';

    return options.find(type => MediaRecorder.isTypeSupported(type)) || '';
  }

  function startRecording() {
    if (!camera?.stream) {
      cameraStatus('Сначала разреши доступ к камере.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      cameraStatus('Запись внутри страницы не поддерживается. Используй «Камера телефона».');
      return;
    }

    try {
      camera.chunks = [];
      camera.file = null;
      hideCapturedPreview();
      cameraButton('use').disabled = true;

      const mimeType = recorderMimeType();
      const options = { videoBitsPerSecond: 1800000 };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(camera.stream, options);
      camera.recorder = recorder;
      camera.recording = true;

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) camera.chunks.push(event.data);
      };

      recorder.onerror = event => {
        cameraStatus('Ошибка записи: ' + String(event.error?.message || 'попробуй ещё раз'));
      };

      recorder.onstop = () => {
        if (!camera) return;

        camera.recording = false;
        clearTimeout(cameraTimer);
        cameraTimer = null;

        const mime = recorder.mimeType ||
          camera.chunks.find(chunk => chunk.type)?.type ||
          'video/webm';

        const blob = new Blob(camera.chunks, { type: mime });
        camera.chunks = [];

        if (!blob.size) {
          cameraStatus('Видео получилось пустым. Повтори запись.');
          cameraButton('record').disabled = false;
          cameraButton('stop').disabled = true;
          return;
        }

        if (blob.size > 25 * 1024 * 1024) {
          cameraStatus('Видео больше 25 МБ. Запиши более короткий ролик.');
          cameraButton('record').disabled = false;
          cameraButton('stop').disabled = true;
          return;
        }

        const ext = mime.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
        const file = new File(
          [blob],
          `today-story-camera-${Date.now()}.${ext}`,
          { type: mime.split(';')[0], lastModified: Date.now() }
        );

        replacePendingFile(file);
        cameraButton('record').disabled = false;
        cameraButton('stop').disabled = true;
      };

      recorder.start(250);
      cameraButton('record').disabled = true;
      cameraButton('photo').disabled = true;
      cameraButton('stop').disabled = false;
      cameraStatus('Идёт запись. Максимальная длительность — 30 секунд.');

      cameraTimer = setTimeout(() => {
        if (camera?.recorder?.state === 'recording') {
          cameraStatus('30 секунд — запись остановлена автоматически.');
          stopRecording();
        }
      }, 30000);
    } catch (error) {
      camera.recording = false;
      cameraButton('record').disabled = false;
      cameraButton('stop').disabled = true;
      cameraStatus('Не удалось начать запись: ' + String(error?.message || error));
    }
  }

  function stopRecording() {
    if (!camera?.recorder || camera.recorder.state !== 'recording') return;

    clearTimeout(cameraTimer);
    cameraTimer = null;

    try { camera.recorder.stop(); } catch (_) {}
    cameraButton('stop').disabled = true;
    cameraButton('photo').disabled = false;
    cameraStatus('Обрабатываем видео…');
  }

  function attachCameraFile() {
    if (!camera?.file || !camera.input) {
      cameraStatus('Сначала сними фото или запиши видео.');
      return;
    }

    const file = camera.file;
    const input = camera.input;

    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (error) {
      cameraStatus('Этот браузер не разрешил прикрепить запись. Открой камеру телефона.');
      console.warn('[TODAY V70 attach camera media]', error);
      return;
    }

    closeCamera();
    toast('Медиа прикреплено. Нажми «Опубликовать историю», чтобы завершить.');
  }

  function closeCamera() {
    clearTimeout(cameraTimer);
    cameraTimer = null;

    if (camera?.recorder?.state === 'recording') {
      try { camera.recorder.stop(); } catch (_) {}
    }

    if (camera?.stream) {
      camera.stream.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
    }

    if (camera?.previewUrl) {
      try { URL.revokeObjectURL(camera.previewUrl); } catch (_) {}
    }

    const overlay = $('#todayV70Camera');
    if (overlay) overlay.remove();

    camera = null;
  }

  async function handleComposerAction(action) {
    closeComposer();

    if (action === 'wall') {
      location.href = './profile.html';
      return;
    }

    if (action === 'story') {
      await openStoryComposer();
      return;
    }

    if (action === 'photo') {
      await openUploadType('photo');
      return;
    }

    if (action === 'clip') {
      await openUploadType('video');
      return;
    }

    if (action === 'music') {
      await openUploadType('music');
      return;
    }

    if (action === 'day') {
      $('#dailyGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleQuickAction(action, button) {
    if (action === 'post') {
      openComposer();
      return;
    }

    if (action === 'story') {
      await openStoryComposer();
      return;
    }

    if (action === 'photo') {
      await openUploadType('photo');
      return;
    }

    if (action === 'clips') {
      await openMedia('video');
      return;
    }

    if (action === 'music') {
      await openMedia('music');
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
      setRecommendations(
        button.getAttribute('aria-pressed') !== 'true',
        true
      );
      return;
    }

    if (action === 'live') {
      const live = window.TODAY_HOME_V69?.openLive;
      if (typeof live === 'function') {
        live();
      } else {
        toast('Модуль эфира ещё загружается.');
      }
    }
  }

  function bind() {
    document.addEventListener('click', event => {
      const cameraAction = event.target.closest('[data-v70-camera]');
      if (cameraAction && $('#todayV70Camera')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const action = cameraAction.dataset.v70Camera;

        if (action === 'close') closeCamera();
        else if (action === 'photo') capturePhoto();
        else if (action === 'record') startRecording();
        else if (action === 'stop') stopRecording();
        else if (action === 'use') attachCameraFile();
        else if (action === 'native') {
          const input = camera?.input;
          closeCamera();
          input?.click();
        }
        return;
      }

      const recordButton = event.target.closest('[data-v70-record-story]');
      if (recordButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const form = recordButton.closest('form');
        const input = form?.querySelector('input[name="story_media"]');
        if (input) {
          openCameraRecorder(input).catch(error => {
            toast('Камера: ' + String(error?.message || error));
          });
        }
        return;
      }

      const composeButton = event.target.closest('[data-v70-compose]');
      if (composeButton && composer?.contains(composeButton)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        handleComposerAction(composeButton.dataset.v70Compose)
          .catch(error => toast(String(error?.message || error)));
        return;
      }

      if (event.target.closest('[data-v70-compose-close]')) {
        closeComposer();
        return;
      }

      const actionButton = event.target.closest('[data-v70-action]');
      if (!actionButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      handleQuickAction(actionButton.dataset.v70Action, actionButton)
        .catch(error => {
          toast('Действие не выполнено: ' + String(error?.message || error));
        });
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (camera) closeCamera();
        else if (composer && !composer.hidden) closeComposer();
      }
    }, true);
  }

  function watchMediaOverlay() {
    const observer = new MutationObserver(() => {
      if (!$('.today-v66-media-grid.is-clips') && clipObserver) {
        try { clipObserver.disconnect(); } catch (_) {}
        clipObserver = null;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (document.documentElement.dataset.todayHomeV70 === 'ready') return;
    document.documentElement.dataset.todayHomeV70 = 'ready';

    removeNoise();
    buildQuickBar();
    ensureComposer();
    bind();
    setRecommendations(
      getLocal('today-v70-recommendations', 'off') === 'on',
      false
    );
    watchMediaOverlay();

    document.documentElement.classList.add('today-home-v70');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.TODAY_HOME_V70 = {
    version: 'V70',
    openComposer,
    closeComposer,
    openStoryComposer,
    openCameraRecorder,
    closeCamera,
    openMedia,
    refresh() {
      removeNoise();
      buildQuickBar();
      setRecommendations(
        getLocal('today-v70-recommendations', 'off') === 'on',
        false
      );
    }
  };
})();
