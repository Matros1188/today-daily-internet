/* TODAY CRYSTAL WORLD V2 — LEVEL MECHANICS + TARGETS */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_WORLD_V1 &&
      global.TODAY_CRYSTAL_WORLD_V1.version === '2.0.0') return;

  const N = 8;
  const valid = i => Number.isInteger(i) && i >= 0 && i < 64;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const BLOCKS = {
    crate:     {name:'Деревянный ящик', glyph:'▧'},
    armor:     {name:'Бронированный блок', glyph:'⛓'},
    blast:     {name:'Взрывной кристалл', glyph:'✹'},
    mud:       {name:'Минеральная грязь', glyph:'◉'},
    ice:       {name:'Ледяная оболочка', glyph:'❄'},
    chain:     {name:'Цепной замок', glyph:'⌁'},
    fog:       {name:'Туманная печать', glyph:'◌'},
    stone:     {name:'Неподвижный камень', glyph:'⬟'},
    generator: {name:'Генератор препятствий', glyph:'✥'},
    boss:      {name:'Королевская печать', glyph:'♛'}
  };

  const MARKS = {
    jelly: {label:'Желейные клетки', glyph:'💎'},
    fog: {label:'Туманные клетки', glyph:'🌫'},
    artifact: {label:'Артефакты', glyph:'✦'},
    dig: {label:'Скрытые сокровища', glyph:'⛏'},
    mixed: {label:'Цели уровня', glyph:'✧'}
  };

  function seeded(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function profile(level) {
    if (level < 10) return {
      type:'classic', title:'Кристаллический разгон',
      goalKind:'classic', required:0, gravity:'down'
    };
    if (level <= 24) return {
      type:'jelly', title:'Очисти светящиеся клетки',
      goalKind:'targets', target:'jelly', required:4, gravity:'down'
    };
    if (level <= 44) return {
      type:'crate', title:'Разбей деревянные ящики',
      goalKind:'blockers', required:4, blockKind:'crate', gravity:'down'
    };
    if (level <= 64) return {
      type:'fog', title:'Раскрой туманные клетки',
      goalKind:'targets', target:'fog', required:4, gravity:'down'
    };
    if (level <= 84) return {
      type:'mud', title:'Пробей минеральную грязь',
      goalKind:'blockers', required:4, blockKind:'mud', gravity:'down'
    };
    if (level <= 104) return {
      type:'artifact', title:'Откопай артефакты',
      goalKind:'targets', target:'artifact', required:4, gravity:'down'
    };
    if (level <= 124) return {
      type:'portal', title:'Используй порталы',
      goalKind:'portal', required:4, gravity:'down', portals:true
    };
    if (level <= 144) return {
      type:'conveyor', title:'Преодолей движущиеся дорожки',
      goalKind:'conveyor', required:4, gravity:'down', conveyor:true
    };
    if (level <= 164) return {
      type:'stone', title:'Проложи путь через камни',
      goalKind:'blockers', required:4, blockKind:'stone',
      gravity:level % 2 ? 'right' : 'left', walls:true
    };
    if (level <= 184) return {
      type:'excavate', title:'Раскопай скрытые реликвии',
      goalKind:'targets', target:'dig', required:4, gravity:'up'
    };
    if (level <= 204) return {
      type:'generator', title:'Отключи генераторы',
      goalKind:'blockers', required:4, blockKind:'generator',
      gravity:'down'
    };
    return {
      type:'mixed', title:'Смешанное испытание',
      goalKind:'mixed', required:5, blockKind:'boss',
      gravity:['down','left','up','right'][level % 4],
      walls:true, portals:true, conveyor:true
    };
  }

  const wallKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;

  function initRun(run) {
    const level = clamp(
      Math.floor(Number(run?.level?.id) || 1),
      1,
      220
    );
    const p = profile(level);
    const random = seeded(level * 7919 + 104729);
    const used = new Set();

    function take() {
      for (let attempt = 0; attempt < 512; attempt++) {
        const i = 8 + Math.floor(random() * 48);
        if (!used.has(i)) {
          used.add(i);
          return i;
        }
      }
      for (let i = 0; i < 64; i++) {
        if (!used.has(i)) {
          used.add(i);
          return i;
        }
      }
      return 0;
    }

    const world = {
      version:'2.0.0',
      level,
      type:p.type,
      title:p.title,
      goal:{
        kind:p.goalKind,
        label:p.goalKind === 'targets'
          ? MARKS[p.target]?.label || 'Цели'
          : p.goalKind === 'blockers'
            ? 'Препятствия'
            : p.goalKind === 'portal'
              ? 'Ходы через порталы'
              : p.goalKind === 'conveyor'
                ? 'Ходы на конвейере'
                : p.goalKind === 'mixed'
                  ? 'Смешанные цели'
                  : 'Свободная игра',
        progress:0,
        required:p.required
      },
      blockers:Object.create(null),
      targets:Object.create(null),
      walls:new Set(),
      portals:[],
      gravity:p.gravity,
      conveyorRow:p.conveyor ? 2 + (level % 4) : -1,
      conveyorDir:level % 2 ? 'right' : 'left',
      rotateGravity:level >= 205,
      turns:0,
      lastMessage:'',
      tools:{hammer:2,row:1,column:1,swap:2,shuffle:1}
    };

    if (p.goalKind === 'blockers' || p.goalKind === 'mixed') {
      const amount = p.goalKind === 'mixed' ? 5 : 6;
      for (let k = 0; k < amount; k++) {
        const i = take();
        let kind = p.blockKind || 'crate';

        if (p.goalKind === 'mixed') {
          const options = ['crate','armor','blast','chain','boss'];
          kind = options[Math.floor(random() * options.length)];
        }

        world.blockers[i] = {
          kind,
          hp:kind === 'armor' || kind === 'boss' ? 2 : 1,
          maxHp:kind === 'armor' || kind === 'boss' ? 2 : 1
        };
      }
    }

    if (p.goalKind === 'targets') {
      for (let k = 0; k < p.required; k++) {
        const i = take();
        world.targets[i] = {kind:p.target};
      }
    }

    if (p.portals) {
      const a = take(), b = take();
      world.portals = [a, b];
    }

    if (p.walls) {
      for (const row of [2, 5]) {
        const col = 2 + (level % 3);
        const a = row * 8 + col;
        world.walls.add(wallKey(a, a + 1));
      }
    }

    run.world = world;
    run.worldPendingTool = '';
    run.worldToolTarget = null;
    return world;
  }

  function markTargets(run) {
    const world = run?.world;
    if (!world) return;

    for (const cell of run.cells || []) {
      if (!cell) continue;
      cell._worldPriority = 0;
      delete cell._worldWallLeft;
      delete cell._worldWallRight;
      delete cell._worldWallUp;
      delete cell._worldWallDown;
    }

    for (const rawKey of world.walls) {
      const [a, b] = rawKey.split(':').map(Number);
      if (b === a + 1) {
        if (run.cells[a]) run.cells[a]._worldWallRight = true;
        if (run.cells[b]) run.cells[b]._worldWallLeft = true;
      } else if (b === a + 8) {
        if (run.cells[a]) run.cells[a]._worldWallDown = true;
        if (run.cells[b]) run.cells[b]._worldWallUp = true;
      }
    }

    for (const key of Object.keys(world.targets)) {
      if (run.cells[key]) run.cells[key]._worldPriority = 12;
    }
    for (const key of Object.keys(world.blockers)) {
      if (run.cells[key]) {
        run.cells[key]._worldPriority =
          Math.max(6, Number(run.cells[key]._worldPriority || 0));
      }
    }
    for (const i of world.portals) {
      if (run.cells[i]) {
        run.cells[i]._worldPriority =
          Math.max(4, Number(run.cells[i]._worldPriority || 0));
      }
    }
  }

  function blockMarkup(run, index) {
    const world = run?.world;
    if (!world || !valid(index)) return '';

    const parts = [];
    const block = world.blockers[index];

    if (block) {
      const meta = BLOCKS[block.kind] || BLOCKS.crate;
      parts.push(
        `<span class="tcw-block tcw-${block.kind}" ` +
        `title="${meta.name}" aria-hidden="true">` +
        `<span class="tcw-block-glyph">${meta.glyph}</span>` +
        `${block.hp > 1
          ? `<span class="tcw-block-hp">${block.hp}</span>`
          : ''}</span>`
      );
    }

    const target = world.targets[index];
    if (target) {
      const meta = MARKS[target.kind] || MARKS.mixed;
      parts.push(
        `<span class="tcw-target tcw-target-${target.kind}" ` +
        `title="${meta.label}" aria-hidden="true">` +
        `${meta.glyph}</span>`
      );
    }

    if (world.portals.includes(index)) {
      const side = world.portals.indexOf(index) === 0 ? 'A' : 'B';
      parts.push(
        `<span class="tcw-special-tile tcw-portal" ` +
        `title="Портал ${side}" aria-hidden="true">◎<small>${side}</small></span>`
      );
    }

    if (world.conveyorRow >= 0 &&
        Math.floor(index / 8) === world.conveyorRow) {
      parts.push(
        `<span class="tcw-conveyor-mark" aria-hidden="true">` +
        `${world.conveyorDir === 'right' ? '›' : '‹'}</span>`
      );
    }

    const row = Math.floor(index / 8), col = index % 8;
    const right = col < 7 && world.walls.has(wallKey(index, index + 1));
    const down = row < 7 && world.walls.has(wallKey(index, index + 8));

    if (right) parts.push('<span class="tcw-wall tcw-wall-right" aria-hidden="true"></span>');
    if (down) parts.push('<span class="tcw-wall tcw-wall-down" aria-hidden="true"></span>');

    return parts.join('');
  }

  function expandClear(run, initial) {
    const world = run?.world;
    const clear = new Set((initial || []).filter(valid));
    if (!world) return [...clear];

    let changed = true, loops = 0;
    while (changed && loops++ < 12) {
      changed = false;

      for (const key of Object.keys(world.blockers)) {
        const index = Number(key);
        const block = world.blockers[index];
        if (!block || block.kind !== 'blast' || !clear.has(index)) continue;

        const r = Math.floor(index / 8), c = index % 8;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= 8 || cc < 0 || cc >= 8) continue;
            const next = rr * 8 + cc;
            if (!clear.has(next)) {
              clear.add(next);
              changed = true;
            }
          }
        }
      }
    }

    return [...clear];
  }

  function applyClear(run, indices, chain) {
    const world = run?.world;
    if (!world) return {bonusScore:0, message:''};

    const clear = new Set(indices || []);
    let removed = 0, targetCount = 0, message = '';

    for (const key of Object.keys(world.targets)) {
      const i = Number(key);
      if (clear.has(i)) {
        delete world.targets[i];
        targetCount++;
      }
    }

    for (const key of Object.keys(world.blockers)) {
      const i = Number(key);
      if (!clear.has(i)) continue;

      const block = world.blockers[i];
      if (!block) continue;

      block.hp--;
      if (block.hp <= 0) {
        delete world.blockers[i];
        removed++;

        if (block.kind === 'generator') {
          message = 'Генератор отключён — энергия больше не создаёт препятствия!';
        } else if (block.kind === 'blast') {
          message = 'Цепной взрыв! Взрывной кристалл задел соседние клетки.';
        } else if (block.kind === 'boss') {
          message = 'Королевская печать разрушена!';
        }
      }
    }

    const goal = world.goal;

    if (goal.kind === 'blockers') {
      goal.progress += removed;
    } else if (goal.kind === 'targets') {
      goal.progress += targetCount;
    } else if (goal.kind === 'mixed') {
      goal.progress += removed + targetCount;
    }

    goal.progress = Math.min(goal.required, goal.progress);

    if (!message && removed > 0) {
      message = `Препятствий разрушено: ${removed}.`;
    } else if (!message && targetCount > 0) {
      message = `Целей найдено: ${targetCount}.`;
    }

    world.lastMessage = message;
    return {
      bonusScore:removed * 120 + targetCount * 80,
      message,
      removed,
      targetCount
    };
  }

  function canSwap(run, a, b) {
    const world = run?.world;
    if (!world || !valid(a) || !valid(b)) return true;

    if (world.walls.has(wallKey(a, b))) return false;

    const hardBlocks = new Set([
      'crate','armor','stone','generator','boss','chain','mud'
    ]);

    const left = world.blockers[a];
    const right = world.blockers[b];

    if (left && hardBlocks.has(left.kind)) return false;
    if (right && hardBlocks.has(right.kind)) return false;

    return true;
  }

  function collapse(run, cells, makeNew) {
    const world = run?.world;
    if (!world || !Array.isArray(cells) || cells.length !== 64) return;

    const gravity = world.gravity || 'down';
    const fresh = typeof makeNew === 'function'
      ? makeNew
      : () => ({color:0});

    const processLine = indices => {
      const survivors = indices.map(i => cells[i]).filter(Boolean);
      for (let k = 0; k < indices.length; k++) {
        cells[indices[k]] = survivors[k] || fresh();
      }
    };

    if (gravity === 'down' || gravity === 'up') {
      for (let c = 0; c < 8; c++) {
        const indices = [];
        if (gravity === 'down') {
          for (let r = 7; r >= 0; r--) indices.push(r * 8 + c);
        } else {
          for (let r = 0; r < 8; r++) indices.push(r * 8 + c);
        }
        processLine(indices);
      }
    } else {
      for (let r = 0; r < 8; r++) {
        const indices = [];
        if (gravity === 'right') {
          for (let c = 7; c >= 0; c--) indices.push(r * 8 + c);
        } else {
          for (let c = 0; c < 8; c++) indices.push(r * 8 + c);
        }
        processLine(indices);
      }
    }

    // Порталы перебрасывают кристаллы между двумя позициями.
    if (world.portals.length === 2) {
      const [a, b] = world.portals;
      [cells[a], cells[b]] = [cells[b], cells[a]];
    }

    // Конвейер сдвигает один ряд после гравитационного падения.
    if (world.conveyorRow >= 0) {
      const row = world.conveyorRow;
      const start = row * 8;
      const line = cells.slice(start, start + 8);

      if (world.conveyorDir === 'right') {
        for (let c = 7; c >= 1; c--) cells[start + c] = line[c - 1];
        cells[start] = fresh();
      } else {
        for (let c = 0; c < 7; c++) cells[start + c] = line[c + 1];
        cells[start + 7] = fresh();
      }
    }

    markTargets(run);
  }

  function endTurn(run) {
    const world = run?.world;
    if (!world) return {changed:false, message:''};

    world.turns++;
    let message = '';

    if (world.goal.kind === 'portal' && world.portals.length === 2) {
      world.goal.progress = Math.min(
        world.goal.required,
        world.goal.progress + 1
      );
    }

    if (world.goal.kind === 'conveyor' && world.conveyorRow >= 0) {
      world.goal.progress = Math.min(
        world.goal.required,
        world.goal.progress + 1
      );
    }

    if (world.rotateGravity && world.turns % 3 === 0) {
      const directions = ['down','left','up','right'];
      const at = directions.indexOf(world.gravity);
      world.gravity = directions[(at + 1) % directions.length];
      message = `Гравитация изменилась: ${world.gravity.toUpperCase()}.`;
    }

    return {changed:false, message};
  }

  function shuffle(run) {
    const cells = run?.cells;
    if (!Array.isArray(cells) || cells.length !== 64) return false;

    const colors = cells.map(cell => cell?.color ?? 0);

    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = colors.slice();

      for (let i = candidate.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
      }

      for (let i = 0; i < 64; i++) {
        if (cells[i]) cells[i].color = candidate[i];
      }

      const engine = global.TODAY_CRYSTAL_ENGINE_V1;
      if (
        engine &&
        engine.findMatches(cells).length === 0 &&
        engine.hasValidMove(cells)
      ) return true;
    }

    return false;
  }

  function isComplete(run) {
    const world = run?.world;
    return !world ||
      world.goal.required <= 0 ||
      world.goal.progress >= world.goal.required;
  }

  function updateHud(run, host) {
    if (!run?.world || !host?.parentElement) return;

    const parent = host.parentElement;
    let panel = parent.querySelector('.tcw-panel');

    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'tcw-panel';
      panel.setAttribute('aria-label', 'Механики уровня');
      parent.insertBefore(panel, host);

      panel.addEventListener('click', event => {
        const button = event.target.closest('[data-tcw-tool]');
        if (!button || button.disabled || !panel.__run) return;

        const active = panel.__run;
        const tool = button.dataset.tcwTool;
        const count = Number(active.world?.tools?.[tool] || 0);
        if (!count || active.ended || active.busy) return;

        if (tool === 'shuffle' && active.worldActions?.shuffle) {
          active.worldActions.shuffle();
          return;
        }

        active.worldPendingTool = tool;
        active.worldToolTarget = null;

        const status = document.getElementById('todayMatchStatus');
        if (status) {
          const messages = {
            hammer:'Молот: выбери клетку для удара.',
            row:'Очистка ряда: выбери любую клетку в нужном ряду.',
            column:'Очистка столбца: выбери клетку в нужном столбце.',
            swap:'Бесплатная перестановка: сначала выбери первый кристалл.'
          };
          status.textContent = messages[tool] || 'Выбери клетку на поле.';
        }

        updateHud(active, host);
      });
    }

    panel.__run = run;

    const world = run.world;
    const goal = world.goal;
    const amount = `${goal.progress} / ${goal.required}`;
    const ratio = goal.required
      ? Math.min(100, goal.progress / goal.required * 100)
      : 100;

    const gravity = {
      down:'↓ вниз',
      up:'↑ вверх',
      left:'← влево',
      right:'→ вправо'
    }[world.gravity] || '↓ вниз';

    const toolList = [
      ['hammer','МОЛОТ','✦'],
      ['row','РЯД','↔'],
      ['column','СТОЛБЕЦ','↕'],
      ['swap','ОБМЕН','⇄'],
      ['shuffle','МЕШАТЬ','⤨']
    ];

    panel.innerHTML =
      `<div class="tcw-panel-top">` +
        `<div class="tcw-world-title">` +
          `<span class="tcw-world-orb">✧</span>` +
          `<span><b>${world.title}</b>` +
          `<small>МИССИЯ ${world.level} · ГРАВИТАЦИЯ ${gravity}</small></span>` +
        `</div>` +
        `<div class="tcw-progress"><b>${amount}</b>` +
          `<span class="tcw-progress-track"><i style="width:${ratio}%"></i></span>` +
        `</div>` +
      `</div>` +
      `<div class="tcw-tools">` +
        toolList.map(([id, label, glyph]) => {
          const count = Number(world.tools[id] || 0);
          const active = run.worldPendingTool === id;
          return `<button type="button" class="tcw-tool ${active?'is-active':''}" ` +
            `data-tcw-tool="${id}" ${count <= 0 || run.ended ? 'disabled' : ''}>` +
            `<span>${glyph}</span><b>${label}</b><small>×${count}</small></button>`;
        }).join('') +
      `</div>`;

    panel.classList.toggle('tcw-panel-busy', !!run.busy);
  }

  function selfTest() {
    const results = [];
    let total = 0;

    try {
      for (let id = 1; id <= 220; id++) {
        const run = {
          level:{id},
          cells:Array.from({length:64}, (_, i) => ({
            color:(i * 7 + id * 3) % 6
          }))
        };

        initRun(run);
        markTargets(run);
        if (!run.world || !run.world.goal) {
          throw new Error('Не создан объект мира для уровня ' + id);
        }
        if (!run.world.tools || run.world.tools.hammer < 1) {
          throw new Error('Не созданы инструменты уровня ' + id);
        }
        total++;
      }

      results.push({
        name:'Все 220 уровней имеют механику, цель и инструменты',
        ok:total === 220,
        detail:`Проверено уровней: ${total}`
      });
    } catch (error) {
      results.push({
        name:'Генерация 220 уровней',
        ok:false,
        detail:String(error.message || error)
      });
    }

    return {
      ok:results.length > 0 && results.every(x => x.ok),
      results
    };
  }

  const api = Object.freeze({
    version:'2.0.0',
    initRun,
    markTargets,
    blockMarkup,
    expandClear,
    applyClear,
    canSwap,
    collapse,
    endTurn,
    shuffle,
    isComplete,
    updateHud,
    selfTest
  });

  global.TODAY_CRYSTAL_WORLD_V1 = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
