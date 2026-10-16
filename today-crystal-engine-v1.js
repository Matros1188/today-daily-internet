/* TODAY CRYSTAL ENGINE V2 — MATCH RULES CORE */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_ENGINE_V1 &&
      global.TODAY_CRYSTAL_ENGINE_V1.version === '2.0.0') return;

  const N = 8;
  const valid = i => Number.isInteger(i) && i >= 0 && i < 64;

  function findMatches(cells) {
    if (!Array.isArray(cells) || cells.length !== 64) {
      throw new TypeError('Crystal board must contain 64 cells');
    }

    const found = new Set(), groups = [];

    const addGroup = (indices, axis, color) => {
      groups.push({
        indices: indices.slice(),
        axis,
        color,
        length: indices.length
      });
      indices.forEach(i => found.add(i));
    };

    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        const color = cells[r * N + c]?.color;
        if (!Number.isInteger(color)) { c++; continue; }

        let end = c + 1;
        while (end < N && cells[r * N + end]?.color === color) end++;

        if (end - c >= 3) {
          addGroup(
            Array.from({length: end - c}, (_, k) => r * N + c + k),
            'h',
            color
          );
        }
        c = end;
      }
    }

    for (let c = 0; c < N; c++) {
      let r = 0;
      while (r < N) {
        const color = cells[r * N + c]?.color;
        if (!Number.isInteger(color)) { r++; continue; }

        let end = r + 1;
        while (end < N && cells[end * N + c]?.color === color) end++;

        if (end - r >= 3) {
          addGroup(
            Array.from({length: end - r}, (_, k) => (r + k) * N + c),
            'v',
            color
          );
        }
        r = end;
      }
    }

    // Квадрат одного цвета 2x2 создаёт самолёт.
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const a = r * N + c;
        const b = a + 1;
        const d = a + N;
        const e = d + 1;
        const color = cells[a]?.color;
        if (
          Number.isInteger(color) &&
          cells[b]?.color === color &&
          cells[d]?.color === color &&
          cells[e]?.color === color
        ) {
          addGroup([a, b, d, e], 'sq', color);
        }
      }
    }

    const result = [...found].sort((a, b) => a - b);
    result.groups = groups;
    return result;
  }

  function specialPlan(matches, preferred = []) {
    const groups = Array.isArray(matches?.groups) ? matches.groups : [];
    const horizontal = groups.filter(g => g.axis === 'h');
    const vertical = groups.filter(g => g.axis === 'v');

    // Пересечение горизонтальной и вертикальной линий — бомба.
    for (const h of horizontal) {
      for (const v of vertical) {
        const crossing = h.indices.find(i => v.indices.includes(i));
        if (crossing !== undefined) {
          return {
            type: 'bomb',
            index: crossing,
            indices: [...new Set([...h.indices, ...v.indices])],
            label: 'КРИСТАЛЛЬНАЯ БОМБА',
            glyph: '✹'
          };
        }
      }
    }

    const square = groups.find(g => g.axis === 'sq');
    if (square) {
      const pref = Array.isArray(preferred)
        ? preferred.find(i => square.indices.includes(i))
        : undefined;
      const index = pref !== undefined ? pref : square.indices[2];
      return {
        type: 'plane',
        index,
        indices: square.indices.slice(),
        label: 'КРИСТАЛЛЬНЫЙ САМОЛЁТ',
        glyph: '✈'
      };
    }

    const sorted = groups.slice().sort((a, b) => b.length - a.length);
    const group =
      sorted.find(g => g.length >= 6) ||
      sorted.find(g => g.length >= 5) ||
      sorted.find(g => g.length >= 4);

    if (!group) return null;

    const type = group.length >= 6
      ? 'nova'
      : group.length >= 5
        ? 'rainbow'
        : group.axis === 'h'
          ? 'rocket-h'
          : 'rocket-v';

    const pref = Array.isArray(preferred)
      ? preferred.find(i => group.indices.includes(i))
      : undefined;
    const index = pref !== undefined
      ? pref
      : group.indices[Math.floor((group.indices.length - 1) / 2)];

    const labels = {
      nova: ['ЗВЁЗДНОЕ ЯДРО', '✹'],
      rainbow: ['ПРИЗМЕННОЕ СЕРДЦЕ', '✺'],
      'rocket-h': ['ГОРИЗОНТАЛЬНАЯ РАКЕТА', '➜'],
      'rocket-v': ['ВЕРТИКАЛЬНАЯ РАКЕТА', '⬆']
    };

    return {
      type, index,
      indices: group.indices.slice(),
      label: labels[type][0],
      glyph: labels[type][1]
    };
  }

  function mostFrequentColor(cells) {
    const counts = new Map();
    for (const cell of cells) {
      if (cell && Number.isInteger(cell.color)) {
        counts.set(cell.color, (counts.get(cell.color) || 0) + 1);
      }
    }
    let best = null, count = -1;
    for (const [color, amount] of counts) {
      if (amount > count) { best = color; count = amount; }
    }
    return best;
  }

  function expandSpecialClear(
    cells,
    seeds,
    targetColor = null,
    superCombo = false,
    protectedIndex = -1
  ) {
    if (!Array.isArray(cells) || cells.length !== 64) {
      throw new TypeError('Crystal board must contain 64 cells');
    }

    const clear = new Set(), queue = [];
    const add = i => {
      if (!valid(i) || i === protectedIndex || clear.has(i)) return;
      clear.add(i);
      queue.push(i);
    };

    (Array.isArray(seeds) ? seeds : []).forEach(add);

    if (superCombo) {
      for (let i = 0; i < 64; i++) add(i);
      return [...clear];
    }

    const specialSeeds = [...new Set(seeds || [])]
      .filter(i => cells[i]?.special);
    const seedSet = new Set(specialSeeds);

    function cross(r, c) {
      add(r * N + c);
      for (let cc = c - 1; cc >= 0; cc--) {
        if (cells[r * N + cc + 1]?._worldWallLeft) break;
        add(r * N + cc);
      }
      for (let cc = c + 1; cc < N; cc++) {
        if (cells[r * N + cc]?._worldWallLeft) break;
        add(r * N + cc);
      }
      for (let rr = r - 1; rr >= 0; rr--) {
        if (cells[(rr + 1) * N + c]?._worldWallUp) break;
        add(rr * N + c);
      }
      for (let rr = r + 1; rr < N; rr++) {
        if (cells[rr * N + c]?._worldWallUp) break;
        add(rr * N + c);
      }
    }

    function square(r, c, radius) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
            add(rr * N + cc);
          }
        }
      }
    }

    function row(r) {
      for (let c = 0; c < N; c++) {
        if (c > 0 && cells[r * N + c]?._worldWallLeft) break;
        add(r * N + c);
      }
      for (let c = N - 1; c >= 0; c--) {
        if (c < N - 1 && cells[r * N + c + 1]?._worldWallLeft) break;
        add(r * N + c);
      }
    }

    function column(c) {
      for (let r = 0; r < N; r++) {
        if (r > 0 && cells[r * N + c]?._worldWallUp) break;
        add(r * N + c);
      }
      for (let r = N - 1; r >= 0; r--) {
        if (r < N - 1 && cells[(r + 1) * N + c]?._worldWallUp) break;
        add(r * N + c);
      }
    }

    function targetFor(source) {
      const candidates = cells
        .map((cell, i) => ({
          i,
          priority: Number(cell?._worldPriority || 0)
        }))
        .filter(x => cells[x.i] && x.i !== source)
        .sort((a, b) => b.priority - a.priority || a.i - b.i);

      if (!candidates.length) return source;
      if (candidates[0].priority > 0) return candidates[0].i;
      return candidates[(source * 13 + 17) % candidates.length].i;
    }

    function rainbowColor(source, requested) {
      if (Number.isInteger(requested)) return requested;
      const counts = new Map();
      for (const cell of cells) {
        if (cell && Number.isInteger(cell.color)) {
          counts.set(cell.color, (counts.get(cell.color) || 0) + 1);
        }
      }
      let best = null, count = -1;
      for (const [color, amount] of counts) {
        if (amount > count) { best = color; count = amount; }
      }
      return best ?? cells[source]?.color;
    }

    function activate(index, type, requestedColor) {
      const r = Math.floor(index / N), c = index % N;

      if (type === 'rocket-h') { row(r); return; }
      if (type === 'rocket-v') { column(c); return; }
      if (type === 'bomb') { square(r, c, 1); return; }
      if (type === 'nova') { square(r, c, 1); cross(r, c); return; }

      if (type === 'rainbow') {
        const color = rainbowColor(index, requestedColor);
        for (let j = 0; j < 64; j++) {
          if (cells[j] && cells[j].color === color) add(j);
        }
        return;
      }

      if (type === 'plane') {
        const target = targetFor(index);
        const tr = Math.floor(target / N), tc = target % N;
        add(target);
        cross(tr, tc);
      }
    }

    // Комбинации двух одновременно поменянных спецкристаллов.
    if (specialSeeds.length >= 2) {
      const a = specialSeeds[0], b = specialSeeds[1];
      const ta = cells[a]?.special, tb = cells[b]?.special;
      const rainbowA = ta === 'rainbow', rainbowB = tb === 'rainbow';

      if (rainbowA && rainbowB) {
        for (let i = 0; i < 64; i++) add(i);
      } else if (rainbowA || rainbowB) {
        const other = rainbowA ? b : a;
        const type = cells[other]?.special;
        const color = cells[other]?.color;
        for (let i = 0; i < 64; i++) {
          if (cells[i]?.color === color) activate(i, type, color);
        }
      } else if (
        (ta === 'rocket-h' || ta === 'rocket-v') &&
        (tb === 'rocket-h' || tb === 'rocket-v')
      ) {
        cross(Math.floor(a / N), a % N);
        cross(Math.floor(b / N), b % N);
      } else if (
        (ta === 'bomb' && (tb === 'rocket-h' || tb === 'rocket-v')) ||
        (tb === 'bomb' && (ta === 'rocket-h' || ta === 'rocket-v'))
      ) {
        const bomb = ta === 'bomb' ? a : b;
        const r = Math.floor(bomb / N), c = bomb % N;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
              row(rr);
              column(cc);
            }
          }
        }
      } else if (ta === 'bomb' && tb === 'bomb') {
        square(Math.floor(a / N), a % N, 2);
        square(Math.floor(b / N), b % N, 2);
      } else if (ta === 'plane' && tb === 'plane') {
        const targets = cells
          .map((cell, i) => ({
            i,
            priority: Number(cell?._worldPriority || 0)
          }))
          .filter(x => cells[x.i] && x.i !== a && x.i !== b)
          .sort((x, y) => y.priority - x.priority || x.i - y.i)
          .slice(0, 3);
        for (const target of targets) {
          const r = Math.floor(target.i / N), c = target.i % N;
          add(target.i);
          cross(r, c);
        }
      } else {
        activate(a, ta, targetColor);
        activate(b, tb, targetColor);
      }
    }

    let cursor = 0;
    while (cursor < queue.length && cursor < 4096) {
      const i = queue[cursor++];
      const cell = cells[i];
      if (!cell?.special) continue;

      // Уже учтённые две совмещённые детали не активируем второй раз.
      if (specialSeeds.length >= 2 && seedSet.has(i)) continue;
      activate(i, cell.special, targetColor);
    }

    return [...clear];
  }

  function hasValidMove(cells) {
    if (!Array.isArray(cells) || cells.length !== 64) return false;

    for (let i = 0; i < 64; i++) {
      const candidates = [
        i % 8 < 7 ? i + 1 : -1,
        i < 56 ? i + 8 : -1
      ];

      for (const j of candidates) {
        if (j < 0) continue;
        const a = cells[i], b = cells[j];
        cells[i] = b;
        cells[j] = a;
        let validMove = false;
        try { validMove = findMatches(cells).length > 0; }
        finally { cells[i] = a; cells[j] = b; }
        if (validMove) return true;
      }
    }

    return false;
  }

  function selfTest() {
    const results = [];
    const record = (name, ok, detail = '') =>
      results.push({name, ok: !!ok, detail: String(detail || '')});

    try {
      const board = Array(64).fill(null);
      [0, 1, 2].forEach(i => board[i] = {color: 2});
      const found = findMatches(board);
      record('horizontal match', found.length === 3);
    } catch (e) {
      record('horizontal match', false, e.message);
    }

    try {
      const board = Array(64).fill(null);
      [0, 1, 8, 9].forEach(i => board[i] = {color: 1});
      const plan = specialPlan(findMatches(board));
      record('square 2x2 creates plane', plan?.type === 'plane');
    } catch (e) {
      record('square 2x2 creates plane', false, e.message);
    }

    try {
      const board = Array(64).fill(null);
      [26, 27, 28, 19, 35].forEach(i => board[i] = {color: 1});
      const plan = specialPlan(findMatches(board));
      record('L/T intersection creates bomb',
        plan?.type === 'bomb' && plan.index === 27);
    } catch (e) {
      record('L/T intersection creates bomb', false, e.message);
    }

    try {
      const board = Array(64).fill(null);
      board[27] = {color: 1, special: 'bomb'};
      const cleared = expandSpecialClear(board, [27]);
      record('bomb 3x3', cleared.length === 9);
    } catch (e) {
      record('bomb 3x3', false, e.message);
    }

    try {
      const board = Array(64).fill(null);
      board[27] = {color: 1, special: 'bomb'};
      board[28] = {color: 2, special: 'rocket-h'};
      const cleared = expandSpecialClear(board, [27, 28]);
      record('bomb + rocket expanded combo', cleared.length >= 25);
    } catch (e) {
      record('bomb + rocket expanded combo', false, e.message);
    }

    try {
      const board = Array.from(
        {length: 64},
        (_, i) => ({color: i === 27 ? 2 : 1,
                    special: i === 27 ? 'rainbow' : null})
      );
      const cleared = expandSpecialClear(board, [27]);
      record('rainbow selects the most common color',
        cleared.length === 64);
    } catch (e) {
      record('rainbow selects the most common color', false, e.message);
    }

    return {
      ok: results.length > 0 && results.every(x => x.ok),
      results
    };
  }

  const api = Object.freeze({
    version: '2.0.0',
    engine: 'TODAY Crystal Rules Core',
    findMatches,
    specialPlan,
    expandSpecialClear,
    hasValidMove,
    selfTest
  });

  global.TODAY_CRYSTAL_ENGINE_V1 = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
