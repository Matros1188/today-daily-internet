/* TODAY V80 — DAILY DISCOVERY */
(() => {
  'use strict';

  if (window.TODAY_HOME_V80?.version === 'V80') return;

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const FAVORITE_PREFIX = 'today-v80-favorites-';
  const DENSITY_KEY = 'today-v80-density';
  const SORT_KEY = 'today-v80-sort';

  const root = document.documentElement;

  let grid = null;
  let toolbar = null;
  let gridObserver = null;

  let dayKey = '';
  let favorites = new Set();
  let activeFilter = 'all';
  let sortMode = 'recommended';
  let density = 'comfortable';
  let nextOriginalOrder = 0;
  let messageTimer = null;

  const state = {
    version: 'V80',
    initialized: false,
    total: 0,
    visible: 0,
    favoriteCount: 0,
    categories: 0
  };

  // ------------------------------------------------------------
  // Feature 1 — Day-aware favorites
  // Store IDs only. No publication content or user profile data.
  // ------------------------------------------------------------

  function getDayKey() {
    const dateLabel = $('#dateLabel')?.textContent?.trim() || '';
    const match = dateLabel.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }

    const now = new Date();

    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  function favoriteStorageKey(day = dayKey) {
    return FAVORITE_PREFIX + day;
  }

  function loadFavorites() {
    favorites = new Set();

    try {
      const stored = JSON.parse(
        localStorage.getItem(favoriteStorageKey()) || '[]'
      );

      if (Array.isArray(stored)) {
        favorites = new Set(
          stored.filter(
            value => typeof value === 'string' && value.length < 500
          )
        );
      }
    } catch (error) {
      console.warn('[TODAY V80] Favorites unavailable', error);
    }
  }

  function cleanExpiredFavorites() {
    try {
      const keepKey = favoriteStorageKey();
      const remove = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (
          key &&
          key.startsWith(FAVORITE_PREFIX) &&
          key !== keepKey
        ) {
          remove.push(key);
        }
      }

      remove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn('[TODAY V80] Old favorites cleanup failed', error);
    }
  }

  function syncDay() {
    const nextDay = getDayKey();

    if (nextDay === dayKey) return;

    const hadDay = !!dayKey;
    dayKey = nextDay;

    loadFavorites();
    cleanExpiredFavorites();

    // Daily cards and favorites change at the day boundary.
    // Avoid carrying old filters over to a new daily experience.
    if (hadDay && toolbar) {
      const search = $('[data-v80-search]', toolbar);
      if (search) search.value = '';

      activeFilter = 'all';

      try {
        sortMode = localStorage.getItem(SORT_KEY) || 'recommended';
      } catch (_) {
        sortMode = 'recommended';
      }
    }
  }

  function persistFavorites() {
    try {
      localStorage.setItem(
        favoriteStorageKey(),
        JSON.stringify([...favorites])
      );

      return true;
    } catch (error) {
      console.warn('[TODAY V80] Could not save favorites', error);
      announce('Не удалось сохранить избранное на этом устройстве.');
      return false;
    }
  }

  // ------------------------------------------------------------
  // Stable IDs, category keys and original card order
  // ------------------------------------------------------------

  function getCards() {
    if (!grid) return [];
    return $$('.daily-card', grid);
  }

  function cardId(card) {
    const count = $('.count-pill[id^="count-"]', card);
    const value = count?.id?.replace(/^count-/, '');

    if (value) return value;

    const title = $('h3', card)?.textContent?.trim() || '';
    return title ? `title:${title.toLocaleLowerCase('ru-RU')}` : '';
  }

  function cardKind(card) {
    if (!card) return '';

    const found = Array.from(card.classList).find(
      value => value.startsWith('kind-') && value.length > 5
    );

    return found ? found.slice(5) : 'other';
  }

  function categoryLabel(card) {
    return $('.kind-pill', card)?.textContent?.trim() || 'Другое';
  }

  function cardTitle(card) {
    return $('h3', card)?.textContent?.trim() || '';
  }

  function cardBody(card) {
    return $('.card-body', card)?.textContent?.trim() || '';
  }

  function activityScore(card) {
    const text = $('.count-pill', card)?.textContent || '';
    const match = text.replace(/\s/g, '').match(/\d+/);

    return match ? Number(match[0]) : 0;
  }

  function prepareCard(card) {
    if (!card?.matches?.('.daily-card')) return;

    const nextId = cardId(card);
    const nextKind = cardKind(card);

    if (
      card.dataset.v80Prepared !== '1' ||
      card.dataset.v80Day !== dayKey
    ) {
      card.dataset.v80Prepared = '1';
      card.dataset.v80Day = dayKey;
      card.dataset.v80Id = nextId;
      card.dataset.v80Kind = nextKind;
      card.dataset.v80OriginalOrder = String(nextOriginalOrder++);
    }

    if (!card.dataset.v80Id) card.dataset.v80Id = nextId;
    if (!card.dataset.v80Kind) card.dataset.v80Kind = nextKind;

    ensureFavoriteButton(card);
  }

  function prepareAllCards() {
    getCards().forEach(prepareCard);
  }

  function ensureFavoriteButton(card) {
    const head = $('.card-head', card);
    if (!head) return;

    let button = $('[data-v80-favorite]', head);

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'today-v80-favorite';
      button.dataset.v80Favorite = '1';
      button.innerHTML = `
        <span data-v80-star aria-hidden="true">☆</span>
        <span data-v80-favorite-label>В избранное</span>`;

      head.append(button);
    }

    updateFavoriteButton(card);
  }

  function isFavorite(card) {
    const id = card?.dataset?.v80Id || cardId(card);
    return !!id && favorites.has(id);
  }

  function updateFavoriteButton(card) {
    const button = $('[data-v80-favorite]', card);
    if (!button) return;

    const saved = isFavorite(card);
    const star = $('[data-v80-star]', button);
    const label = $('[data-v80-favorite-label]', button);

    button.classList.toggle('is-favorite', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute(
      'aria-label',
      saved ? 'Убрать рубрику из избранного' : 'Добавить рубрику в избранное'
    );

    if (star) star.textContent = saved ? '★' : '☆';
    if (label) label.textContent = saved ? 'В избранном' : 'В избранное';
  }

  // ------------------------------------------------------------
  // Feature 2 — Search across category, title and description
  // ------------------------------------------------------------

  function searchQuery() {
    return $('[data-v80-search]', toolbar)?.value
      ?.trim()
      .toLocaleLowerCase('ru-RU') || '';
  }

  function matchesSearch(card, query) {
    if (!query) return true;

    const text = [
      categoryLabel(card),
      cardTitle(card),
      cardBody(card)
    ].join(' ').toLocaleLowerCase('ru-RU');

    return text.includes(query);
  }

  // ------------------------------------------------------------
  // Feature 3 — Smart category filters
  // ------------------------------------------------------------

  function makeCategoryButton(kind, label) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'today-v80-filter-chip';
    button.dataset.v80Filter = `kind:${kind}`;
    button.textContent = label;
    button.setAttribute(
      'aria-pressed',
      String(activeFilter === `kind:${kind}`)
    );

    if (activeFilter === `kind:${kind}`) {
      button.classList.add('is-active');
    }

    return button;
  }

  function buildCategoryFilters() {
    if (!toolbar || !grid) return;

    const holder = $('[data-v80-categories]', toolbar);
    if (!holder) return;

    const categories = new Map();

    getCards().forEach(card => {
      const kind = card.dataset.v80Kind || cardKind(card);
      const label = categoryLabel(card);

      if (kind && !categories.has(kind)) {
        categories.set(kind, label);
      }
    });

    holder.replaceChildren();

    [...categories.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'))
      .forEach(([kind, label]) => {
        holder.append(makeCategoryButton(kind, label));
      });

    state.categories = categories.size;

    if (
      activeFilter.startsWith('kind:') &&
      !categories.has(activeFilter.slice(5))
    ) {
      activeFilter = 'all';
    }

    updateFilterButtons();
  }

  function updateFilterButtons() {
    if (!toolbar) return;

    $$('[data-v80-filter]', toolbar).forEach(button => {
      const active = button.dataset.v80Filter === activeFilter;

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  // ------------------------------------------------------------
  // Feature 4 — Stable sorting: original, active, alphabetical
  // ------------------------------------------------------------

  function sortCards() {
    const cards = getCards();

    if (cards.length < 2) return;

    cards.sort((a, b) => {
      if (sortMode === 'active') {
        const score = activityScore(b) - activityScore(a);

        if (score) return score;
      }

      if (sortMode === 'alphabetical') {
        const titleComparison = cardTitle(a).localeCompare(
          cardTitle(b),
          'ru',
          { sensitivity: 'base' }
        );

        if (titleComparison) return titleComparison;
      }

      return (
        Number(a.dataset.v80OriginalOrder || 0) -
        Number(b.dataset.v80OriginalOrder || 0)
      );
    });

    // Do not append cards that are already in the target order.
    // This prevents MutationObserver loops.
    const current = getCards();

    const unchanged = current.length === cards.length &&
      current.every((card, index) => card === cards[index]);

    if (unchanged) return;

    const fragment = document.createDocumentFragment();

    cards.forEach(card => fragment.append(card));
    grid.append(fragment);
  }

  function applySortSelection() {
    const select = $('[data-v80-sort]', toolbar);
    if (select) select.value = sortMode;
  }

  // ------------------------------------------------------------
  // Feature 5 — Compact / comfortable card density
  // ------------------------------------------------------------

  function applyDensity(next, persist = true) {
    density = next === 'compact' ? 'compact' : 'comfortable';

    root.classList.toggle(
      'today-v80-compact',
      density === 'compact'
    );

    $$('[data-v80-density]', toolbar).forEach(button => {
      const active = button.dataset.v80Density === density;

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if (persist) {
      try {
        localStorage.setItem(DENSITY_KEY, density);
      } catch (_) {}
    }
  }

  // ------------------------------------------------------------
  // Feature 6 — Unified result count, reset and mobile awareness
  // ------------------------------------------------------------

  function announce(message) {
    const status = $('[data-v80-status]', toolbar);
    if (!status) return;

    status.textContent = message;

    clearTimeout(messageTimer);

    messageTimer = setTimeout(() => {
      if (status.isConnected) status.textContent = '';
    }, 4000);
  }

  function anyFilterActive() {
    return !!searchQuery() || activeFilter !== 'all';
  }

  function syncMobileFilterMode() {
    // V72 intentionally limits the mobile home to six cards.
    // Search and category filters need access to matches among all 12.
    // This class reveals filtered matches without changing the actual
    // cards, action buttons or their original click handlers.
    root.classList.toggle(
      'today-v80-filtering',
      anyFilterActive()
    );
  }

  function applyFilters() {
    if (!grid || !toolbar) return;

    syncDay();
    prepareAllCards();

    const query = searchQuery();
    const cards = getCards();

    let visible = 0;

    for (const card of cards) {
      const id = card.dataset.v80Id || cardId(card);
      const kind = card.dataset.v80Kind || cardKind(card);

      const textMatch = matchesSearch(card, query);

      const categoryMatch =
        activeFilter !== 'saved' &&
        (
          activeFilter === 'all' ||
          activeFilter === `kind:${kind}`
        );

      const favoriteMatch =
        activeFilter === 'saved' && favorites.has(id);

      const show = textMatch && (categoryMatch || favoriteMatch);

      card.classList.toggle('today-v80-card-hidden', !show);

      if (show) visible++;

      updateFavoriteButton(card);
    }

    const count = $('[data-v80-count]', toolbar);

    if (count) {
      if (anyFilterActive()) {
        count.textContent = `Найдено ${visible} из ${cards.length}`;
      } else {
        count.textContent = `${cards.length} рубрик сегодня`;
      }
    }

    const empty = $('[data-v80-empty]', toolbar);

    if (empty) {
      empty.hidden = visible !== 0;

      const copy = $('[data-v80-empty-copy]', empty);

      if (copy) {
        if (activeFilter === 'saved') {
          copy.textContent =
            'Пока нет избранных рубрик за сегодняшний день. ' +
            'Нажми ☆ на карточке, чтобы добавить её.';
        } else if (query) {
          copy.textContent =
            'Подходящих рубрик не найдено. Измени запрос или сбрось фильтры.';
        } else {
          copy.textContent =
            'Для выбранного фильтра пока нет доступных рубрик.';
        }
      }
    }

    const clear = $('[data-v80-clear]', toolbar);
    if (clear) clear.disabled = !anyFilterActive();

    const favoriteCount = $('[data-v80-favorite-count]', toolbar);
    if (favoriteCount) {
      favoriteCount.textContent = `Избранное: ${favorites.size}`;
    }

    state.total = cards.length;
    state.visible = visible;
    state.favoriteCount = favorites.size;

    syncMobileFilterMode();
    updateFilterButtons();
    applySortSelection();
  }

  function toggleFavorite(card) {
    syncDay();
    prepareCard(card);

    const id = card.dataset.v80Id || cardId(card);

    if (!id) {
      announce('Не удалось определить эту рубрику.');
      return;
    }

    if (favorites.has(id)) {
      favorites.delete(id);
    } else {
      favorites.add(id);
    }

    if (!persistFavorites()) return;

    updateFavoriteButton(card);
    applyFilters();

    announce(
      favorites.has(id)
        ? 'Рубрика добавлена в избранное до конца дня.'
        : 'Рубрика удалена из избранного.'
    );
  }

  function resetFilters() {
    const search = $('[data-v80-search]', toolbar);
    if (search) search.value = '';

    activeFilter = 'all';

    applyFilters();
    announce('Фильтры сброшены.');
  }

  function processNewCards(records) {
    let changed = false;

    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        if (node.matches?.('.daily-card')) {
          prepareCard(node);
          changed = true;
        }

        node.querySelectorAll?.('.daily-card').forEach(card => {
          prepareCard(card);
          changed = true;
        });
      });
    });

    if (!changed) return;

    buildCategoryFilters();
    sortCards();
    applyFilters();
  }

  function createToolbar() {
    if ($('#todayV80DailyTools')) {
      toolbar = $('#todayV80DailyTools');
      return;
    }

    toolbar = document.createElement('section');

    toolbar.id = 'todayV80DailyTools';
    toolbar.className = 'today-v80-daily-tools';
    toolbar.setAttribute('aria-label', 'Поиск и настройка рубрик');

    toolbar.innerHTML = `
      <div class="today-v80-topline">
        <div class="today-v80-heading">
          <span class="today-v80-heading-mark" aria-hidden="true">✦</span>
          <div>
            <strong>Найди свой TODAY</strong>
            <small>Настрой ленту дня под себя</small>
          </div>
        </div>

        <span
          class="today-v80-result-count"
          data-v80-count
          aria-live="polite">12 рубрик сегодня</span>
      </div>

      <div class="today-v80-search-row">
        <label class="today-v80-search-box">
          <span aria-hidden="true">⌕</span>
          <span class="today-v80-sr-only">Поиск по рубрикам</span>
          <input
            type="search"
            data-v80-search
            maxlength="120"
            autocomplete="off"
            placeholder="Название, тема или описание…"
            aria-label="Поиск по ежедневным рубрикам">
        </label>

        <button
          type="button"
          class="today-v80-clear"
          data-v80-clear
          disabled>Сбросить</button>
      </div>

      <div class="today-v80-filter-label">
        <span>Фильтры</span>
        <span data-v80-favorite-count>Избранное: 0</span>
      </div>

      <div class="today-v80-chip-row" role="group" aria-label="Фильтр рубрик">
        <div class="today-v80-pinned-filters">
          <button
            type="button"
            class="today-v80-filter-chip is-active"
            data-v80-filter="all"
            aria-pressed="true">Все рубрики</button>

          <button
            type="button"
            class="today-v80-filter-chip"
            data-v80-filter="saved"
            aria-pressed="false">★ Избранное</button>
        </div>

        <div
          class="today-v80-category-filters"
          data-v80-categories></div>
      </div>

      <div class="today-v80-controls-row">
        <label class="today-v80-sort">
          <span>Сортировка</span>
          <select data-v80-sort aria-label="Порядок рубрик">
            <option value="recommended">Как задумано</option>
            <option value="active">По активности</option>
            <option value="alphabetical">По алфавиту</option>
          </select>
        </label>

        <div class="today-v80-density-group" role="group" aria-label="Размер карточек">
          <button
            type="button"
            class="today-v80-density-button is-active"
            data-v80-density="comfortable"
            aria-pressed="true">Комфортно</button>

          <button
            type="button"
            class="today-v80-density-button"
            data-v80-density="compact"
            aria-pressed="false">Компактно</button>
        </div>
      </div>

      <div class="today-v80-empty" data-v80-empty hidden>
        <span class="today-v80-empty-mark" aria-hidden="true">⌕</span>
        <strong>Ничего не найдено</strong>
        <p data-v80-empty-copy></p>
        <button type="button" data-v80-reset-empty>
          Показать все рубрики
        </button>
      </div>

      <div
        class="today-v80-status"
        data-v80-status
        role="status"
        aria-live="polite"></div>
    `;

    grid.insertAdjacentElement('beforebegin', toolbar);
  }

  function bindEvents() {
    toolbar.addEventListener('click', event => {
      const filterButton = event.target.closest('[data-v80-filter]');

      if (filterButton && toolbar.contains(filterButton)) {
        activeFilter = filterButton.dataset.v80Filter || 'all';
        applyFilters();
        return;
      }

      const densityButton = event.target.closest('[data-v80-density]');

      if (densityButton && toolbar.contains(densityButton)) {
        applyDensity(densityButton.dataset.v80Density);
        applyFilters();
        return;
      }

      if (
        event.target.closest('[data-v80-clear]') ||
        event.target.closest('[data-v80-reset-empty]')
      ) {
        resetFilters();
      }
    });

    $('[data-v80-search]', toolbar)?.addEventListener(
      'input',
      applyFilters
    );

    $('[data-v80-sort]', toolbar)?.addEventListener(
      'change',
      event => {
        const value = event.target.value;

        sortMode = [
          'recommended',
          'active',
          'alphabetical'
        ].includes(value) ? value : 'recommended';

        try {
          localStorage.setItem(SORT_KEY, sortMode);
        } catch (_) {}

        sortCards();
        applyFilters();

        announce(
          sortMode === 'active'
            ? 'Рубрики отсортированы по активности.'
            : sortMode === 'alphabetical'
              ? 'Рубрики отсортированы по алфавиту.'
              : 'Возвращён исходный порядок рубрик.'
        );
      }
    );

    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-v80-favorite]');

      if (!button || !grid.contains(button)) return;

      const card = button.closest('.daily-card');
      if (!card) return;

      event.preventDefault();
      event.stopPropagation();

      toggleFavorite(card);
    });
  }

  function init() {
    if (state.initialized) return;

    grid = $('#dailyGrid');
    if (!grid) return;

    state.initialized = true;

    syncDay();
    createToolbar();

    try {
      density = localStorage.getItem(DENSITY_KEY) || 'comfortable';
      sortMode = localStorage.getItem(SORT_KEY) || 'recommended';
    } catch (_) {
      density = 'comfortable';
      sortMode = 'recommended';
    }

    if (!['recommended', 'active', 'alphabetical'].includes(sortMode)) {
      sortMode = 'recommended';
    }

    prepareAllCards();
    buildCategoryFilters();
    applyDensity(density, false);
    applySortSelection();
    bindEvents();
    sortCards();
    applyFilters();

    // The daily grid is rendered asynchronously by app.js.
    // Observe only direct child changes to avoid reacting to button-label
    // and star-icon changes inside existing cards.
    if ('MutationObserver' in window) {
      gridObserver = new MutationObserver(processNewCards);

      gridObserver.observe(grid, {
        childList: true
      });
    }

    window.TODAY_HOME_V80 = {
      version: 'V80',

      refresh() {
        syncDay();
        prepareAllCards();
        buildCategoryFilters();
        sortCards();
        applyFilters();
        return this.diagnose();
      },

      reset: resetFilters,

      diagnose() {
        return {
          version: 'V80',
          gridAvailable: !!grid,
          toolbarAvailable: !!toolbar,
          totalRubrics: state.total,
          visibleRubrics: state.visible,
          favorites: state.favoriteCount,
          categories: state.categories,
          filter: activeFilter,
          sort: sortMode,
          density,
          observerAvailable: !!gridObserver,
          mobileFiltering: root.classList.contains('today-v80-filtering')
        };
      }
    };

    if (new URLSearchParams(location.search).has('diagnostics')) {
      console.info('[TODAY V80 diagnostics]', window.TODAY_HOME_V80.diagnose());
    }

    console.info(
      '[TODAY HOME V80] Daily Discovery initialized',
      window.TODAY_HOME_V80.diagnose()
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
