/* TODAY PROFILE V116.4 — TABS UNDER AVATAR + SVG ICONS */
(() => {
  'use strict';

  if (window.TODAY_PROFILE_V116?.installed) return;

  const root = document.getElementById('todayProfilePage');
  if (!root) return;

  const PRIMARY_ORDER = ['messages', 'videos', 'music', 'clips', 'pictures'];
  const ICONS = {
    messages: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="16" cy="12" r="1" fill="currentColor"/></svg>',
    videos: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><rect x="3" y="6" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="m15 10 6-3v10l-6-3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8 9 4 3-4 3V9Z" fill="currentColor"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M9 17V5l11-2v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 8l11-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="6.5" cy="18" rx="2.8" ry="2" transform="rotate(-18 6.5 18)" stroke="currentColor" stroke-width="1.8"/><ellipse cx="17.5" cy="15" rx="2.8" ry="2" transform="rotate(-18 17.5 15)" stroke="currentColor" stroke-width="1.8"/></svg>',
    clips: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><path d="M4 7.5h16v12H4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m4 7.5 2-4h16l-2 4M9 3.5l-2 4m7-4-2 4m7-4-2 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="m10 11 5 2.5-5 2.5v-5Z" fill="currentColor"/></svg>',
    pictures: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="9" r="1.7" stroke="currentColor" stroke-width="1.6"/><path d="m4 17 5-5 3.5 3 3.5-4 4 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  const LABELS = {
    messages: [ICONS.messages, 'Мои сообщения'],
    videos: [ICONS.videos, 'Мои видео'],
    music: [ICONS.music, 'Моя музыка'],
    clips: [ICONS.clips, 'Мои клипы'],
    pictures: [ICONS.pictures, 'Мои картинки']
  };

  const toLightId = {posts: 'pictures', daily: 'clips'};

  let trackedNav = null;
  let originalButtons = [];
  let activeSynthetic = null;
  let queued = false;

  function getNav() {
    return root.querySelector('.today-profile-v63-tabs');
  }

  function getMore() {
    return root.querySelector('.today-profile-v63-more');
  }

  function getOriginals(nav) {
    if (!nav || nav === trackedNav) return;

    trackedNav = nav;
    originalButtons = Array.from(
      nav.querySelectorAll('button[data-profile-tab]')
    ).map((button, index) => ({
      button,
      index,
      id: button.dataset.profileTab,
      icon: button.querySelector('span')?.textContent || '',
      label: button.querySelector('b')?.textContent || ''
    }));

    // Удаляем наш маркер на новой перерисованной панели.
    originalButtons.forEach(record => {
      delete record.button.dataset.profileV116Mapped;
    });
  }

  function removeGeneratedLinks(more) {
    if (!more) return;
    more.querySelectorAll('[data-profile-v116-secondary="1"]')
      .forEach(button => button.remove());
  }

  function addSecondaryLink(more, id, label) {
    if (!more || more.querySelector(`[data-profile-tab="${id}"]`)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.profileTab = id;
    button.dataset.profileV116Secondary = '1';
    button.textContent = label;

    const before = more.querySelector('[data-profile-tab="collection"]');
    if (before) more.insertBefore(button, before);
    else more.appendChild(button);
  }

  function ensureLightSecondary(more) {
    if (!more) return;
    addSecondaryLink(more, 'posts', 'Моя стена');
    addSecondaryLink(more, 'daily', 'Сегодня');
  }

  function applyNavigation(nav) {
    const current = new Map();

    originalButtons.forEach(record => {
      const button = record.button;
      const newId = toLightId[record.id] || record.id;
      button.dataset.profileTab = newId;

      if (LABELS[newId]) {
        const pair = LABELS[newId];
        const icon = button.querySelector('span');
        const label = button.querySelector('b');

        if (icon) {
          // SVG устанавливается один раз: наблюдатель не зацикливается.
          if (icon.dataset.profileSvgIcon !== newId) {
            icon.innerHTML = pair[0];
            icon.dataset.profileSvgIcon = newId;
          }
          if (icon.getAttribute('aria-hidden') !== 'true') {
            icon.setAttribute('aria-hidden', 'true');
          }
        }
        if (label) {
          if (label.textContent !== pair[1]) label.textContent = pair[1];
        } else {
          const b = document.createElement('b');
          b.textContent = pair[1];
          button.appendChild(b);
        }
      }

      button.dataset.profileV116Mapped = '1';
      current.set(newId, button);
    });

    const desired = PRIMARY_ORDER
      .map(id => current.get(id))
      .filter(Boolean);

    const actual = Array.from(
      nav.querySelectorAll('button[data-profile-tab]')
    );

    // Не перемещаем элементы без необходимости, чтобы избежать циклов observer.
    if (
      actual.length !== desired.length ||
      actual.some((button, i) => button !== desired[i])
    ) {
      desired.forEach(button => nav.appendChild(button));
    }

    nav.setAttribute(
      'aria-label',
      'Мои сообщения, видео, музыка, клипы и картинки'
    );

    ensureLightSecondary(getMore());
  }

  function syncActive(nav, activeButton) {
    if (!nav) return;
    nav.querySelectorAll('button[data-profile-tab]').forEach(button => {
      const active = button === activeButton;
      button.classList.toggle('active', active);
      if (button.hasAttribute('aria-pressed')) {
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function displayClips(button, nav) {
    const content = root.querySelector('#todayProfileTabContent');
    if (!content) return;

    activeSynthetic = 'clips';
    syncActive(nav, button);

    content.innerHTML = `
      <div class="today-profile-panel today-profile-v63-panel">
        <button type="button" class="today-profile-v63-back"
          data-profile-tab="posts">← Моя стена</button>
        <div class="today-profile-v63-empty">
          <span class="today-profile-v63-empty-icon" aria-hidden="true">▶</span>
          <small>МОЙ МЕДИААРХИВ</small>
          <h2>Мои клипы</h2>
          <p>Раздел подготовлен для коротких видео.
          На текущей версии личной страницы ещё не подключена
          загрузка и хранение видеоклипов.</p>
          <button type="button" class="today-profile-primary"
            data-profile-tab="posts">Создать запись</button>
        </div>
      </div>`;
  }

  function displayPictures(button, nav) {
    const content = root.querySelector('#todayProfileTabContent');
    if (!content) return;

    // Находим существующую кнопку стены и используем действующий
    // обработчик профиля, чтобы получить свежий список записей.
    const wallButton = getMore()?.querySelector(
      'button[data-profile-tab="posts"]'
    );

    if (wallButton) wallButton.click();

    const cards = Array.from(
      root.querySelectorAll('#todayProfileTabContent .today-profile-wall-post')
    );

    const photos = [];
    const seen = new Set();

    cards.forEach(card => {
      const img = card.querySelector('img');
      if (!img) return;

      const url = img.currentSrc || img.src || img.getAttribute('src') || '';
      if (!url || seen.has(url)) return;
      seen.add(url);

      const body = card.querySelector('p')?.textContent?.trim() || 'Моя картинка';
      photos.push({
        url,
        title: body.replace(/\s+/g, ' ').slice(0, 90)
      });
    });

    activeSynthetic = 'pictures';
    syncActive(nav, button);

    const gallery = photos.length
      ? `<div class="today-profile-v116-gallery">
          ${photos.map((photo, i) => `
            <a class="today-profile-v116-gallery-item"
               href="${String(photo.url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
               target="_blank" rel="noopener noreferrer"
               aria-label="Открыть картинку ${i + 1}">
              <img src="${String(photo.url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
                   alt="${String(photo.title).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
                   loading="lazy" decoding="async">
              <span>${String(photo.title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
            </a>`).join('')}
        </div>`
      : `<div class="today-profile-v63-empty">
           <span class="today-profile-v63-empty-icon" aria-hidden="true">▧</span>
           <small>МОЯ ГАЛЕРЕЯ</small>
           <h2>Пока нет картинок</h2>
           <p>Фотографии из личных записей появятся здесь.
           Добавь фото к своей публикации, чтобы оно попало в галерею.</p>
           <button type="button" class="today-profile-primary"
             data-profile-tab="posts">Добавить картинку</button>
         </div>`;

    content.innerHTML = `
      <div class="today-profile-panel today-profile-v63-panel">
        <button type="button" class="today-profile-v63-back"
          data-profile-tab="posts">← Моя стена</button>
        <div class="today-profile-v63-section-head">
          <div>
            <small>ТВОЯ ЛИЧНАЯ ГАЛЕРЕЯ</small>
            <h2>Мои картинки</h2>
            <p>Фотографии из личных публикаций.</p>
          </div>
          <span aria-hidden="true">▧</span>
        </div>
        ${gallery}
      </div>`;
  }

  // Перехватываем только две новые вкладки и только в светлой теме.
  root.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest('button[data-profile-tab]')
      : null;
    if (!button) return;

    const nav = button.closest('.today-profile-v63-tabs');
    if (!nav || !root.contains(nav)) return;

    const id = button.dataset.profileTab;
    if (id !== 'clips' && id !== 'pictures') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (id === 'clips') displayClips(button, nav);
    else displayPictures(button, nav);
  }, true);

  function tune() {
    const nav = getNav();

    if (!nav) {
      trackedNav = null;
      originalButtons = [];
      return;
    }

    getOriginals(nav);

    applyNavigation(nav);
  }

  function scheduleTune() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      tune();
    });
  }

  const pageObserver = new MutationObserver(scheduleTune);
  pageObserver.observe(root, {childList: true, subtree: true});

  const themeObserver = new MutationObserver(scheduleTune);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-today-theme']
  });

  tune();

  window.TODAY_PROFILE_V116 = {
    installed: true,
    version: 'V116.4',
    refresh: tune
  };
})();
