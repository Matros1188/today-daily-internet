/* TODAY CRYSTAL ENGINE V1 — MATCH RULES CORE */
/* Pure, deterministic match rules. Presentation and cloud saves remain outside. */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_ENGINE_V1 && global.TODAY_CRYSTAL_ENGINE_V1.version === '1.0.0') return;

  function findMatches(cells) {
    if (!Array.isArray(cells) || cells.length !== 64) throw new TypeError('Crystal board must contain 64 cells');
    const found = new Set(), groups = [], n = 8;
    const addRun = (indices, axis, color) => {
      if (indices.length < 3) return;
      groups.push({ indices: indices.slice(), axis, color, length: indices.length });
      for (const index of indices) found.add(index);
    };
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        const idx = r * n + c, color = cells[idx]?.color;
        if (!Number.isInteger(color)) { c++; continue; }
        let end = c + 1;
        while (end < n && cells[r * n + end]?.color === color) end++;
        if (end - c >= 3) addRun(Array.from({ length: end - c }, (_, k) => r * n + c + k), 'h', color);
        c = end;
      }
    }
    for (let c = 0; c < n; c++) {
      let r = 0;
      while (r < n) {
        const idx = r * n + c, color = cells[idx]?.color;
        if (!Number.isInteger(color)) { r++; continue; }
        let end = r + 1;
        while (end < n && cells[end * n + c]?.color === color) end++;
        if (end - r >= 3) addRun(Array.from({ length: end - r }, (_, k) => (r + k) * n + c), 'v', color);
        r = end;
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
    for (const hGroup of horizontal) {
      for (const vGroup of vertical) {
        const crossing = hGroup.indices.find(i => vGroup.indices.includes(i));
        if (crossing !== undefined) return {
          type: 'bomb', index: crossing,
          indices: [...new Set([...hGroup.indices, ...vGroup.indices])],
          label: 'КРИСТАЛЛЬНАЯ БОМБА', glyph: '✹'
        };
      }
    }
    const sorted = groups.slice().sort((a, b) => b.length - a.length);
    const group = sorted.find(g => g.length >= 6) || sorted.find(g => g.length >= 5) || sorted.find(g => g.length >= 4);
    if (!group) return null;
    const type = group.length >= 6 ? 'nova' : group.length >= 5 ? 'rainbow' : (group.axis === 'h' ? 'rocket-h' : 'rocket-v');
    const preferredIndex = Array.isArray(preferred) ? preferred.find(i => group.indices.includes(i)) : undefined;
    const index = preferredIndex !== undefined ? preferredIndex : group.indices[Math.floor((group.indices.length - 1) / 2)];
    return {
      type, index, indices: group.indices.slice(),
      label: type === 'nova' ? 'ЗВЁЗДНОЕ ЯДРО' : type === 'rainbow' ? 'ПРИЗМЕННОЕ СЕРДЦЕ' : type === 'rocket-h' ? 'ГОРИЗОНТАЛЬНАЯ РАКЕТА' : 'ВЕРТИКАЛЬНАЯ РАКЕТА',
      glyph: type === 'nova' ? '✹' : type === 'rainbow' ? '✺' : type === 'rocket-h' ? '➜' : '⬆'
    };
  }

  function expandSpecialClear(cells, seeds, targetColor = null, superCombo = false, protectedIndex = -1) {
    if (!Array.isArray(cells) || cells.length !== 64) throw new TypeError('Crystal board must contain 64 cells');
    const clear = new Set(), queue = [];
    const add = i => {
      if (!Number.isInteger(i) || i < 0 || i >= cells.length || i === protectedIndex || clear.has(i)) return;
      clear.add(i); queue.push(i);
    };
    if (Array.isArray(seeds)) seeds.forEach(add);
    if (superCombo) for (let i = 0; i < cells.length; i++) add(i);
    let cursor = 0;
    while (cursor < queue.length && cursor < 4096) {
      const i = queue[cursor++], cell = cells[i];
      if (!cell?.special) continue;
      const row = Math.floor(i / 8), col = i % 8, type = cell.special;
      if (type === 'rocket-h') { for (let c = 0; c < 8; c++) add(row * 8 + c); }
      else if (type === 'rocket-v') { for (let r = 0; r < 8; r++) add(r * 8 + col); }
      else if (type === 'bomb') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = row + dr, cc = col + dc;
          if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) add(rr * 8 + cc);
        }
      } else if (type === 'nova') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = row + dr, cc = col + dc;
          if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) add(rr * 8 + cc);
        }
        for (let c = 0; c < 8; c++) add(row * 8 + c);
        for (let r = 0; r < 8; r++) add(r * 8 + col);
      } else if (type === 'rainbow') {
        const color = Number.isInteger(targetColor) ? targetColor : cell.color;
        for (let j = 0; j < cells.length; j++) if (cells[j] && cells[j].color === color) add(j);
      }
    }
    return [...clear];
  }

  function hasValidMove(cells) {
    if (!Array.isArray(cells) || cells.length !== 64) return false;
    for (let i = 0; i < 64; i++) {
      const candidates = [i % 8 < 7 ? i + 1 : -1, i < 56 ? i + 8 : -1];
      for (const j of candidates) {
        if (j < 0) continue;
        const first = cells[i], second = cells[j];
        cells[i] = second; cells[j] = first;
        let valid = false;
        try { valid = findMatches(cells).length > 0; }
        finally { cells[i] = first; cells[j] = second; }
        if (valid) return true;
      }
    }
    return false;
  }

  function selfTest() {
    const results = [];
    const record = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail || '') });
    try {
      const board = Array(64).fill(null);
      board[0] = { color: 2 }; board[1] = { color: 2 }; board[2] = { color: 2 }; board[3] = { color: 4 };
      const found = findMatches(board);
      record('horizontal match of three', found.length === 3 && found.join(',') === '0,1,2', found.join(','));
    } catch (e) { record('horizontal match of three', false, e.message); }
    try {
      const board = Array(64).fill(null);
      [26,27,28,19,35].forEach(i => { board[i] = { color: 1 }; });
      const found = findMatches(board), plan = specialPlan(found, []);
      record('cross match makes a bomb', !!plan && plan.type === 'bomb' && plan.index === 27, JSON.stringify(plan));
    } catch (e) { record('cross match makes a bomb', false, e.message); }
    try {
      const board = Array(64).fill(null); board[27] = { color: 1, special: 'bomb' };
      const result = expandSpecialClear(board, [27]);
      record('bomb clears nine cells', result.length === 9 && result.includes(18) && result.includes(36), String(result.length));
    } catch (e) { record('bomb clears nine cells', false, e.message); }
    try {
      const board = Array.from({ length: 64 }, (_, i) => ({ color: (Math.floor(i / 8) + i % 8) % 2 }));
      const before = JSON.stringify(board), value = hasValidMove(board);
      record('move check is boolean and non-mutating', typeof value === 'boolean' && JSON.stringify(board) === before, String(value));
    } catch (e) { record('move check is boolean and non-mutating', false, e.message); }
    return { ok: results.length > 0 && results.every(item => item.ok), results };
  }

  const api = Object.freeze({
    version: '1.0.0',
    engine: 'TODAY Crystal Rules Core',
    findMatches, specialPlan, expandSpecialClear, hasValidMove, selfTest
  });
  global.TODAY_CRYSTAL_ENGINE_V1 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
