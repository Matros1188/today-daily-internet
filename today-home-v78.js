/* TODAY V78 — SMART FEED */
(() => {
  'use strict';

  if (window.TODAY_HOME_V78?.version === 'V78') return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const STORAGE_PREFIX = 'today-v78-saves-';
  const DENSITY_KEY = 'today-v78-density';

  let feed = null;
  let toolbar = null;
  let feedObserver = null;
  let activeFilter = 'all';
  let currentDay = '';
  let savedIds = new Set();
  let density = 'comfortable';
  let announceTimer = null;

  const state = {
    initialized: false,
    cardCount: 0,
    savedCount: 0,
    visibleCount: 0
  };

  // ------------------------------------------------------------
  // Feature 1 — Search by publication text, author and category
  // ------------------------------------------------------------

  function getSearchValue() {
    return $('[data-v78-search]', toolbar)?.value
      ?.trim()
      .toLocaleLowerCase('ru-RU') || '';
  }

  function getCardParts(card) {
    return {
      author: $('.today-post-name', card)?.textContent?.trim() || '',
      kind: $('.community-kind', card)?.textContent?.trim() || '',
      body: $('.today-post-text', card)?.textContent?.trim() || ''
    };
  }

  function matchesSearch(card, query) {
    if (!query) return true;

    const parts = getCardParts(card);
    const combined = [
      parts.author,
      parts.kind,
      parts.body
    ].join(' ').toLocaleLowerCase('ru-RU');

    return combined.includes(query);
  }

  // ------------------------------------------------------------
  // Feature 2 — Category filters
  // ------------------------------------------------------------

  function getKindKey(card) {
    return getCardParts(card).kind.toLocaleLowerCase('ru-RU');
  }

  function makeFilterButton(label, value) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'today-v78-filter-chip';
    button.dataset.v78Filter = value;
    button.textContent = label;
    button.setAttribute(
      'aria-pressed',
      String(value === activeFilter)
    );

    if (value === activeFilter) {
      button.classList.add('is-active');
    }

    return button;
  }

  function updateFilterStates() {
    $$('[data-v78-filter]', toolbar).forEach(button => {
      const active = button.dataset.v78Filter === activeFilter;

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function refreshKindFilters() {
    const host = $('[data-v78-kind-filters]', toolbar);
    if (!host) return;

    const kinds = new Map();

    $$('.today-post-card', feed).forEach(card => {
      const label = getCardParts(card).kind.trim();
      if (!label) return;

      const key = label.toLocaleLowerCase('ru-RU');

      if (!kinds.has(key)) kinds.set(key, label);
    });

    host.replaceChildren();

    [...kinds.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
      .forEach(([key, label]) => {
        host.append(makeFilterButton(label, `kind:${key}`));
      });

    if (
      activeFilter.startsWith('kind:') &&
      !kinds.has(activeFilter.slice(5))
    ) {
      activeFilter = 'all';
    }

    updateFilterStates();
  }

  // ------------------------------------------------------------
  // Feature 3 — Local, current-day bookmarks
  // Content is not copied into localStorage. Only post identifiers
  // are kept, and old day keys are removed.
  // ------------------------------------------------------------

  function getDisplayedDay() {
    const label = $('#dateLabel')?.textContent?.trim() || '';
    const match = label.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }

    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function saveStorageKey(day = currentDay) {
    return STORAGE_PREFIX + day;
  }

  function syncDay() {
    const day = getDisplayedDay();

    if (day === currentDay) return;

    currentDay = day;
    savedIds = new Set();

    try {
      const stored = JSON.parse(
        localStorage.getItem(saveStorageKey()) || '[]'
      );

      if (Array.isArray(stored)) {
        savedIds = new Set(
          stored.filter(value => typeof value === 'string')
        );
      }

      // Remove bookmarks from previous days. TODAY content is ephemeral.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);

        if (
          key &&
          key.startsWith(STORAGE_PREFIX) &&
          key !== saveStorageKey()
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn('[TODAY V78] Bookmark storage unavailable', error);
      savedIds = new Set();
    }
  }

  function cardKey(card) {
    const source = card.dataset.likeSource;
    const id = card.dataset.likeId;

    if (!source || !id) return '';

    return `${source}:${id}`;
  }

  function isSaved(card) {
    const key = cardKey(card);
    return !!key && savedIds.has(key);
  }

  function persistBookmarks() {
    try {
      localStorage.setItem(
        saveStorageKey(),
        JSON.stringify([...savedIds])
      );

      return true;
    } catch (error) {
      console.warn('[TODAY V78] Could not save bookmarks', error);
      announce('Не удалось сохранить закладку на этом устройстве.');
      return false;
    }
  }

  function updateBookmarkButton(card) {
    const button = $('[data-v78-save]', card);
    if (!button) return;

    const saved = isSaved(card);
    const icon = $('[data-v78-save-icon]', button);
    const label = $('[data-v78-save-label]', button);

    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute(
      'aria-label',
      saved ? 'Убрать из сохранённого' : 'Сохранить до конца дня'
    );

    if (icon) icon.textContent = saved ? '★' : '☆';
    if (label) label.textContent = saved ? 'Сохранено' : 'Сохранить';
  }

  function refreshBookmarkButtons() {
    $$('.today-post-card', feed).forEach(updateBookmarkButton);

    const savedButton = $('[data-v78-filter="saved"]', toolbar);

    if (savedButton) {
      const count = [...savedIds].length;
      savedButton.textContent = count
        ? `Сохранённые · ${count}`
        : 'Сохранённые';

      state.savedCount = count;
    }
  }

  function toggleBookmark(card) {
    syncDay();

    const key = cardKey(card);
    if (!key) {
      announce('Не удалось определить публикацию.');
      return;
    }

    if (savedIds.has(key)) {
      savedIds.delete(key);
      announce('Убрано из сохранённого.');
    } else {
      savedIds.add(key);
      announce('Сохранено на этом устройстве до конца дня.');
    }

    if (!persistBookmarks()) return;

    refreshBookmarkButtons();
    applyFilters();
  }

  // ------------------------------------------------------------
  // Feature 4 — Share through phone / desktop share sheet,
  // with copy-to-clipboard fallback.
  // ------------------------------------------------------------

  function getShareContent(card) {
    const parts = getCardParts(card);

    const media = $('.today-post-media', card);
    const appUrl = new URL('./', location.href).href;

    const textParts = [
      parts.author ? parts.author : 'Публикация TODAY',
      parts.kind,
      parts.body,
      '',
      'В TODAY лента живёт один день.',
      appUrl
    ].filter((value, index) => value !== '' || index === 3);

    return {
      title: `TODAY — ${parts.kind || 'публикация'}`,
      text: textParts.join('\n'),
      url: appUrl,
      image: media?.currentSrc || media?.src || ''
    };
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}

    let field = null;

    try {
      field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      field.style.top = '0';

      document.body.append(field);
      field.select();
      field.setSelectionRange(0, field.value.length);

      return !!document.execCommand('copy');
    } catch (_) {
      return false;
    } finally {
      field?.remove();
    }
  }

  async function shareCard(card, button) {
    if (button.dataset.busy === '1') return;

    button.dataset.busy = '1';
    button.disabled = true;

    const share = getShareContent(card);

    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: share.title,
            text: share.text,
            url: share.url
          });

          announce('Меню отправки открыто.');
          return;
        } catch (error) {
          // Closing the native share dialog is not an error.
          if (error?.name === 'AbortError') return;
        }
      }

      const copied = await copyText(share.text);

      if (copied) {
        announce('Текст публикации скопирован.');
      } else {
        announce('Не удалось скопировать. Попробуй выделить текст вручную.');
      }
    } finally {
      button.disabled = false;
      delete button.dataset.busy;
    }
  }

  // ------------------------------------------------------------
  // Feature 5 — Comfortable / compact feed density
  // ------------------------------------------------------------

  function applyDensity(next, persist = true) {
    density = next === 'compact' ? 'compact' : 'comfortable';

    document.documentElement.classList.toggle(
      'today-v78-compact-feed',
      density === 'compact'
    );

    const compactButton = $('[data-v78-density="compact"]', toolbar);
    const comfortableButton = $('[data-v78-density="comfortable"]', toolbar);

    if (compactButton) {
      compactButton.classList.toggle(
        'is-active',
        density === 'compact'
      );
      compactButton.setAttribute(
        'aria-pressed',
        String(density === 'compact')
      );
    }

    if (comfortableButton) {
      comfortableButton.classList.toggle(
        'is-active',
        density === 'comfortable'
      );
      comfortableButton.setAttribute(
        'aria-pressed',
        String(density === 'comfortable')
      );
    }

    if (persist) {
      try {
        localStorage.setItem(DENSITY_KEY, density);
      } catch (_) {}
    }
  }

  // ------------------------------------------------------------
  // Feature 6 — Unified results, empty states and live card handling
  // ------------------------------------------------------------

  function announce(message) {
    const status = $('[data-v78-status]', toolbar);
    if (!status) return;

    status.textContent = message;

    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      if (status.isConnected) status.textContent = '';
    }, 4400);
  }

  function createCardActions(card) {
    if ($('.today-v78-card-actions', card)) {
      updateBookmarkButton(card);
      return;
    }

    const copy = $('.community-copy', card);
    if (!copy) return;

    const row = document.createElement('div');
    row.className = 'today-v78-card-actions';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'today-v78-action';
    save.dataset.v78Save = '1';
    save.title = 'Сохраняется на этом устройстве до конца текущего дня';
    save.innerHTML = `
      <span data-v78-save-icon aria-hidden="true">☆</span>
      <span data-v78-save-label>Сохранить</span>`;

    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'today-v78-action';
    share.dataset.v78Share = '1';
    share.innerHTML = `
      <span aria-hidden="true">↗</span>
      <span>Поделиться</span>`;

    row.append(save, share);

    const oldActions = $('.today-post-actions', copy);

    if (oldActions) {
      oldActions.insertAdjacentElement('afterend', row);
    } else {
      copy.append(row);
    }

    updateBookmarkButton(card);
  }

  function processCard(card) {
    if (!card?.matches?.('.today-post-card')) return;

    createCardActions(card);
  }

  function processNode(node) {
    if (!node || node.nodeType !== 1) return;

    if (node.matches?.('.today-post-card')) {
      processCard(node);
    }

    node.querySelectorAll?.('.today-post-card').forEach(processCard);
  }

  function getCards() {
    return $$('.today-post-card', feed);
  }

  function materializeAvailableFeed() {
    // Saved posts can be anywhere in the current 48-entry query.
    // Expand V74 batches only when the user opens the saved filter.
    let guard = 8;

    while (guard-- > 0) {
      const more = $('[data-today-v74-more]', feed);
      if (!more || !more.isConnected) break;
      more.click();
    }
  }

  function applyFilters() {
    if (!feed || !toolbar) return;

    syncDay();

    const query = getSearchValue();
    const cards = getCards();

    let visible = 0;

    for (const card of cards) {
      const textMatches = matchesSearch(card, query);
      const savedMatches =
        activeFilter !== 'saved' || isSaved(card);

      const categoryMatches =
        !activeFilter.startsWith('kind:') ||
        getKindKey(card) === activeFilter.slice(5);

      const show = textMatches && savedMatches && categoryMatches;

      card.classList.toggle('today-v78-filter-hidden', !show);

      if (show) visible++;

      updateBookmarkButton(card);
    }

    const count = $('[data-v78-count]', toolbar);
    if (count) {
      count.textContent = query || activeFilter !== 'all'
        ? `Найдено ${visible} из ${cards.length}`
        : `Публикаций: ${visible}`;
    }

    const empty = $('[data-v78-empty]', toolbar);

    if (empty) {
      empty.hidden = visible !== 0;

      const message = $('[data-v78-empty-copy]', empty);

      if (message) {
        if (activeFilter === 'saved') {
          message.textContent =
            'В текущей ленте нет сохранённых публикаций. ' +
            'Закладки действуют только в течение дня.';
        } else if (query) {
          message.textContent =
            'Совпадений среди уже загруженных публикаций нет. ' +
            'Можно загрузить ещё или изменить запрос.';
        } else {
          message.textContent =
            'В этой рубрике пока нет доступных публикаций.';
        }
      }
    }

    state.cardCount = cards.length;
    state.visibleCount = visible;

    refreshBookmarkButtons();
    updateFilterStates();
  }

  function resetFilters() {
    const input = $('[data-v78-search]', toolbar);
    if (input) input.value = '';

    activeFilter = 'all';

    applyFilters();
    announce('Фильтры сброшены.');
  }

  function handleToolbarClick(event) {
    const filterButton = event.target.closest('[data-v78-filter]');

    if (filterButton && toolbar.contains(filterButton)) {
      const selected = filterButton.dataset.v78Filter || 'all';

      if (selected === 'saved') {
        materializeAvailableFeed();
        refreshKindFilters();
      }

      activeFilter = selected;
      applyFilters();
      return;
    }

    const densityButton = event.target.closest('[data-v78-density]');

    if (densityButton && toolbar.contains(densityButton)) {
      applyDensity(densityButton.dataset.v78Density);
      return;
    }

    if (
      event.target.closest('[data-v78-reset]') ||
      event.target.closest('[data-v78-empty-reset]')
    ) {
      resetFilters();
    }
  }

  function handleFeedClick(event) {
    const card = event.target.closest('.today-post-card');

    if (!card || !feed.contains(card)) return;

    const save = event.target.closest('[data-v78-save]');
    if (save) {
      event.preventDefault();
      toggleBookmark(card);
      return;
    }

    const share = event.target.closest('[data-v78-share]');
    if (share) {
      event.preventDefault();
      shareCard(card, share).catch(error => {
        console.warn('[TODAY V78] Share failed', error);
        announce('Не удалось поделиться публикацией.');
      });
    }
  }

  function createToolbar() {
    if ($('#todayV78FeedTools')) {
      toolbar = $('#todayV78FeedTools');
      return;
    }

    toolbar = document.createElement('section');
    toolbar.id = 'todayV78FeedTools';
    toolbar.className = 'today-v78-feed-tools';
    toolbar.setAttribute('aria-label', 'Поиск и фильтры ленты');

    toolbar.innerHTML = `
      <div class="today-v78-search-row">
        <label class="today-v78-search-box">
          <span class="today-v78-search-icon" aria-hidden="true">⌕</span>
          <span class="today-v78-sr-only">Поиск по ленте</span>
          <input
            type="search"
            data-v78-search
            autocomplete="off"
            maxlength="160"
            placeholder="Поиск по тексту или автору…"
            aria-label="Поиск по публикациям и авторам">
        </label>
        <button
          type="button"
          class="today-v78-reset"
          data-v78-reset>Сбросить</button>
      </div>

      <div class="today-v78-filter-heading">
        <span>Найти публикацию</span>
        <span data-v78-count aria-live="polite">Публикаций: 0</span>
      </div>

      <div class="today-v78-filter-row" role="group" aria-label="Фильтр ленты">
        <div class="today-v78-fixed-filters">
          <button
            type="button"
            class="today-v78-filter-chip is-active"
            data-v78-filter="all"
            aria-pressed="true">Все</button>
          <button
            type="button"
            class="today-v78-filter-chip"
            data-v78-filter="saved"
            aria-pressed="false">Сохранённые</button>
        </div>
        <div
          class="today-v78-kind-filters"
          data-v78-kind-filters></div>
      </div>

      <div class="today-v78-bottom-row">
        <span class="today-v78-saved-note">
          Закладки хранятся на устройстве до конца дня
        </span>
        <div class="today-v78-density" role="group" aria-label="Плотность ленты">
          <button
            type="button"
            class="today-v78-density-button is-active"
            data-v78-density="comfortable"
            aria-pressed="true">Комфортно</button>
          <button
            type="button"
            class="today-v78-density-button"
            data-v78-density="compact"
            aria-pressed="false">Компактно</button>
        </div>
      </div>

      <div class="today-v78-empty" data-v78-empty hidden>
        <span class="today-v78-empty-icon" aria-hidden="true">⌕</span>
        <span data-v78-empty-copy>Ничего не найдено.</span>
        <button
          type="button"
          class="today-v78-empty-reset"
          data-v78-empty-reset>Сбросить фильтры</button>
      </div>

      <div
        class="today-v78-status"
        data-v78-status
        role="status"
        aria-live="polite"></div>`;

    feed.parentElement.insertBefore(toolbar, feed);
  }

  function init() {
    if (state.initialized) return;

    feed = $('#communityFeed');
    if (!feed) return;

    state.initialized = true;

    syncDay();
    createToolbar();

    try {
      density = localStorage.getItem(DENSITY_KEY) || 'comfortable';
    } catch (_) {
      density = 'comfortable';
    }

    applyDensity(density, false);

    // Make existing cards interactive.
    getCards().forEach(processCard);

    refreshKindFilters();
    refreshBookmarkButtons();

    toolbar.addEventListener('click', handleToolbarClick);

    $('[data-v78-search]', toolbar)?.addEventListener(
      'input',
      applyFilters
    );

    feed.addEventListener('click', handleFeedClick);

    // V74 renders more cards as the user scrolls. This observer applies
    // V78 controls to the newly appended cards without rebinding handlers.
    if ('MutationObserver' in window) {
      feedObserver = new MutationObserver(records => {
        let needsRefresh = false;

        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            processNode(node);
            needsRefresh = true;
          }
        }

        if (needsRefresh) {
          refreshKindFilters();
          applyFilters();
        }
      });

      feedObserver.observe(feed, {
        childList: true,
        subtree: true
      });
    }

    applyFilters();

    window.TODAY_HOME_V78 = {
      version: 'V78',
      refresh() {
        syncDay();
        getCards().forEach(processCard);
        refreshKindFilters();
        applyFilters();

        return {
          version: 'V78',
          cards: state.cardCount,
          visible: state.visibleCount,
          saved: savedIds.size,
          filter: activeFilter,
          density
        };
      },
      reset: resetFilters,
      diagnose() {
        return {
          version: 'V78',
          feedAvailable: !!feed,
          toolbarAvailable: !!toolbar,
          cards: state.cardCount,
          visible: state.visibleCount,
          saved: savedIds.size,
          filter: activeFilter,
          density,
          observerAvailable: !!feedObserver
        };
      }
    };

    console.info(
      '[TODAY HOME V78] Smart Feed initialized',
      window.TODAY_HOME_V78.diagnose()
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
