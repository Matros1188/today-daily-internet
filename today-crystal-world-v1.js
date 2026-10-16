/* TODAY CRYSTAL WORLD V2 — LEVEL MECHANICS + TARGETS */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_WORLD_V1 &&
      global.TODAY_CRYSTAL_WORLD_V1.version === '3.0.0') return;

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
      500
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
        const count = tool === 'power'
          ? (Number(active.world?.dynamic?.power || 0) >= 100 ? 1 : 0)
          : Number(active.world?.tools?.[tool] || 0);
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
      for (let id = 1; id <= 500; id++) {
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
        name:'Все 500 уровней имеют механику, цель и инструменты',
        ok:total === 500,
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


  /* TODAY CRYSTAL MECHANICS V3 WRAPPERS */

  const tcwBaseInitRun = initRun;
  const tcwBaseMarkTargets = markTargets;
  const tcwBaseBlockMarkup = blockMarkup;
  const tcwBaseExpandClear = expandClear;
  const tcwBaseApplyClear = applyClear;
  const tcwBaseCanSwap = canSwap;
  const tcwBaseCollapse = collapse;
  const tcwBaseEndTurn = endTurn;
  const tcwBaseIsComplete = isComplete;
  const tcwBaseUpdateHud = updateHud;
  const tcwBaseSelfTest = selfTest;

  const TCW_ALL = [
    'chameleon','slime','runner','timer','mill','safe','magnet',
    'whiteout','flood','gravswitch','anvil','gate','network','boss',
    'mosaic','mine','streak','wildcard','colorban','hero'
  ];

  function tcwMechanicsForLevel(level) {
    const intro = {
      10:['chameleon','slime'],
      20:['runner','timer'],
      30:['mill','chameleon'],
      40:['safe','magnet','slime'],
      50:['whiteout','flood','timer'],
      60:['gravswitch','anvil','magnet'],
      70:['gate','network','runner'],
      80:['boss','mosaic','slime'],
      90:['mine','streak','timer'],
      100:['wildcard','colorban','hero']
    };

    if (level < 10) return [];
    const start = Math.floor((level-10)/10)*10+10;
    if (level>=10 && level<=109) return intro[start] || [];

    const count = level<130 ? 3 : level<200 ? 5 :
      level<300 ? 6 : level<400 ? 7 : 9;
    const picked = new Set();
    const seed = Math.abs(Math.floor(level*17.31+level*level/47));

    for(let k=0;k<count;k++) {
      picked.add(TCW_ALL[(seed+k*7+Math.floor(level/13))%TCW_ALL.length]);
    }

    if(level>=400) {
      ['boss','timer','gate','colorban','hero'].forEach(x=>picked.add(x));
    } else if(level>=300) {
      ['boss','timer'].forEach(x=>picked.add(x));
    } else if(level>=200) {
      ['timer','wildcard'].forEach(x=>picked.add(x));
    }

    while(picked.size>count+(level>=400?5:level>=300?2:level>=200?2:0)) {
      const first=[...picked][0];
      picked.delete(first);
    }
    return [...picked];
  }

  function tcwManhattan(a,b) {
    return Math.abs(Math.floor(a/8)-Math.floor(b/8))+
      Math.abs(a%8-b%8);
  }

  function tcwNeighbors(run,index) {
    const world=run?.world;
    const result=[];
    const r=Math.floor(index/8),c=index%8;
    const candidates=[
      r>0?index-8:-1,
      c<7?index+1:-1,
      r<7?index+8:-1,
      c>0?index-1:-1
    ];

    for(const next of candidates) {
      if(next<0)continue;
      if(world.walls?.has(wallKey(index,next)))continue;
      result.push(next);
    }
    return result;
  }

  function tcwRandomAvailable(run,used,rand) {
    const world=run?.world;
    for(let k=0;k<320;k++) {
      const i=Math.floor(rand()*64);
      if(used.has(i))continue;
      if(world.blockers?.[i]||world.targets?.[i])continue;
      used.add(i);
      return i;
    }
    for(let i=0;i<64;i++) {
      if(!used.has(i)&&!world.blockers?.[i]&&!world.targets?.[i]) {
        used.add(i);
        return i;
      }
    }
    return -1;
  }

  function tcwRandomSquare(run,used,rand) {
    const world=run?.world;
    for(let k=0;k<180;k++) {
      const r=Math.floor(rand()*7),c=Math.floor(rand()*7);
      const cells=[r*8+c,r*8+c+1,(r+1)*8+c,(r+1)*8+c+1];
      if(cells.some(i=>used.has(i)||world.blockers?.[i]||world.targets?.[i]))continue;
      cells.forEach(i=>used.add(i));
      return cells;
    }
    return [];
  }

  function tcwChallengeFor(level,d) {
    if(level<30||level%9!==0)return {kind:'none',required:0};

    const possible=[];
    if(d.mechanics.includes('mill')&&d.mills.length)possible.push('mill');
    if(d.mechanics.includes('safe')&&d.safes.length)possible.push('safe');
    if(d.mechanics.includes('network')&&d.networkPath.length)possible.push('network');
    if(d.mechanics.includes('boss')&&d.boss)possible.push('boss');
    if(d.mechanics.includes('mosaic')&&d.fragments.size)possible.push('mosaic');
    if(d.mechanics.includes('mine')&&d.mineIndex>=0)possible.push('mine');
    if(!possible.length)return {kind:'none',required:0};

    const kind=possible[Math.floor(level/9)%possible.length];
    const mill=d.mills[0];
    const safe=d.safes[0];

    if(kind==='mill')return {kind,required:mill.required};
    if(kind==='safe')return {kind,required:safe.sequence.length};
    if(kind==='network')return {kind,required:Math.max(1,d.networkPath.length-2)};
    if(kind==='boss')return {kind,required:d.boss.hp};
    if(kind==='mosaic')return {kind,required:d.fragmentGoal};
    if(kind==='mine')return {kind,required:1};
    return {kind:'none',required:0};
  }

  function tcwInitDynamics(run) {
    if(!run?.world)return;
    const w=run.world;
    const level=Number(w.level||run.level?.id||1);
    const rand=seeded(level*92821+5519);
    const used=new Set([
      ...Object.keys(w.blockers||{}).map(Number),
      ...Object.keys(w.targets||{}).map(Number),
      ...(w.portals||[])
    ]);

    // Keep original walls separate; dynamic gates are rebuilt from them.
    w.baseWalls=new Set(w.walls||[]);
    w.gates=[];

    const d={
      version:'3.0.0',
      mechanics:tcwMechanicsForLevel(level),
      rand,
      turnColors:Array(7).fill(0),
      neglect:Array(7).fill(0),
      angerColor:null,
      waterline:-1,
      power:0,
      powerColor:(level+2)%7,
      streak:0,
      scoreMultiplier:1,
      turnMaxChain:0,
      turnHadSpecial:false,
      turnSwitchPending:false,
      failed:false,
      failMessage:'',
      chameleonCycle:[1,4,2],
      slimeDamagedUIDs:new Set(),
      mills:[],
      safes:[],
      magnets:[],
      whiteoutCount:0,
      switches:[],
      anvils:[],
      runners:[],
      timers:[],
      networkPath:[],
      networkProgress:0,
      boss:null,
      fragments:new Set(),
      fragmentGoal:Math.min(8,4+Math.floor(level/100)),
      fragmentsCollected:0,
      treasureOpen:false,
      mineIndex:-1,
      mineFound:false,
      heatHints:Object.create(null),
      challenge:{kind:'none',required:0},
      baseGravity:w.gravity||'down',
      bossAttackCount:0
    };

    const has=name=>d.mechanics.includes(name);
    const take=()=>tcwRandomAvailable(run,used,rand);

    if(has('chameleon')) {
      const amount=level>=400?4:level>=200?3:2;
      for(let k=0;k<amount;k++) {
        const i=take();
        if(i<0||!run.cells[i])continue;
        run.cells[i]._worldChameleon=true;
        run.cells[i]._worldChameleonStep=Math.floor(rand()*3);
        run.cells[i].color=d.chameleonCycle[run.cells[i]._worldChameleonStep];
      }
    }

    if(has('slime')) {
      const amount=level>=400?4:level>=200?3:2;
      for(let k=0;k<amount;k++) {
        const i=take();
        if(i<0||!run.cells[i])continue;
        run.cells[i]._worldSlime=true;
        run.cells[i]._worldSlimeColor=run.cells[i].color;
        run.cells[i]._worldSlimeHp=1;
      }
    }

    if(has('runner')) {
      const i=take();
      if(i>=0&&run.cells[i]) {
        run.cells[i]._worldRunner=true;
        d.runners.push(i);
      }
    }

    if(has('timer')) {
      const i=take();
      if(i>=0&&run.cells[i]) {
        run.cells[i]._worldBombTimer=level>=400?5:
          level>=200?6:Math.max(5,9-Math.floor(level/100));
        d.timers.push(i);
      }
    }

    if(has('mill')) {
      const cells=tcwRandomSquare(run,used,rand);
      if(cells.length===4) {
        d.mills.push({
          cells,
          color:(level*3+1)%7,
          charge:0,
          required:Math.min(12,6+Math.floor(level/100)),
          opened:false
        });
      }
    }

    if(has('safe')) {
      const i=take();
      if(i>=0) {
        const start=(level*3+2)%7;
        const length=level>=400?4:level>=200?3:3;
        d.safes.push({
          index:i,
          sequence:Array.from({length},(_,k)=>(start+k*2)%7),
          step:0,
          opened:false
        });
      }
    }

    if(has('magnet')) {
      const amount=level>=300?2:1;
      for(let k=0;k<amount;k++) {
        const i=take();
        if(i>=0&&run.cells[i]) {
          d.magnets.push({
            index:i,
            color:run.cells[i].color
          });
        }
      }
    }

    if(has('whiteout')) {
      const amount=level>=400?5:level>=200?4:2;
      for(let k=0;k<amount;k++) {
        const i=take();
        if(i>=0&&run.cells[i]) {
          run.cells[i]._worldWhiteout=true;
          d.whiteoutCount++;
        }
      }
    }

    if(has('flood')) {
      d.waterline=-1;
      d.maxWaterline=level>=400?4:level>=200?3:2;
      d.waterStep=level>=400?2:3;
    }

    if(has('gravswitch')) {
      const i=take();
      if(i>=0)d.switches.push(i);
    }

    if(has('anvil')) {
      d.anvils.push({
        row:0,
        col:Math.floor(rand()*8),
        active:true,
        hitCount:0
      });
    }

    if(has('gate')) {
      // A complete row of gates separates upper and lower regions.
      const row=3;
      for(let c=0;c<7;c++) {
        const a=row*8+c,b=(row+1)*8+c;
        dGateAdd(w,a,b);
      }
    }

    function dGateAdd(worldRef,a,b) {
      worldRef.gates.push({
        key:wallKey(a,b),
        closed:false,
        a,b
      });
    }

    if(has('network')) {
      let chosen=[];
      for(let row=1;row<=6&&!chosen.length;row++) {
        for(let start=0;start<=2&&!chosen.length;start++) {
          const possible=Array.from({length:6},(_,k)=>row*8+start+k);
          if(possible.some(i=>used.has(i)||w.blockers?.[i]||w.targets?.[i]))continue;
          chosen=possible;
          chosen.forEach(i=>used.add(i));
        }
      }
      d.networkPath=chosen;
    }

    if(has('boss')) {
      d.boss={
        hp:Math.min(17,8+Math.floor(level/50)),
        maxHp:Math.min(17,8+Math.floor(level/50)),
        color:(level+4)%7
      };
    }

    if(has('mosaic')) {
      for(let k=0;k<d.fragmentGoal;k++) {
        const i=take();
        if(i>=0)d.fragments.add(i);
      }
    }

    if(has('mine')) {
      const i=take();
      if(i>=0)d.mineIndex=i;
    }

    if(has('streak')) {
      d.streakEnabled=true;
    }

    if(has('wildcard')) {
      const amount=level>=400?8:level>=200?6:3;
      for(let k=0;k<amount;k++) {
        const i=take();
        if(i>=0&&run.cells[i])run.cells[i]._worldWildcard=true;
      }
    }

    if(has('colorban')) {
      d.neglectThreshold=level>=400?3:4;
    }

    if(has('hero')) {
      d.powerColor=(level*3+2)%7;
    }

    d.challenge=tcwChallengeFor(level,d);
    w.dynamic=d;
    w.tools=w.tools||{};
    w.tools.power=0;

    // Make the fixed gates active before rendering and special blasts.
    tcwSyncWalls(run);
    tcwMarkDynamicCells(run);
  }

  function tcwSyncWalls(run) {
    const w=run?.world;
    if(!w)return;
    const d=w.dynamic;

    const walls=new Set(w.baseWalls||[]);
    for(const gate of (w.gates||[])) {
      if(gate.closed)walls.add(gate.key);
    }
    w.walls=walls;
  }

  function tcwMarkDynamicCells(run) {
    const w=run?.world,d=w?.dynamic;
    if(!w||!d)return;

    for(let i=0;i<64;i++) {
      const cell=run.cells?.[i];
      if(!cell)continue;

      delete cell._worldWater;
      delete cell._worldAngry;
      delete cell._worldHeat;
      cell._worldPriority=Number(cell._worldPriority||0);

      if(d.mechanics.includes('flood')&&d.waterline>=0) {
        const row=Math.floor(i/8);
        if(row>=8-d.waterline)cell._worldWater=true;
      }

      if(d.angerColor!==null&&cell.color===d.angerColor) {
        cell._worldAngry=true;
      }

      if(d.mineIndex>=0&&!d.mineFound&&d.heatHints[i]) {
        cell._worldHeat=d.heatHints[i];
      }

      if(cell._worldWildcard)cell._worldPriority+=1;
      if(cell._worldWhiteout)cell._worldPriority+=1;
    }

    for(const key of Object.keys(w.targets||{})) {
      if(run.cells[key])run.cells[key]._worldPriority+=12;
    }
    for(const key of Object.keys(w.blockers||{})) {
      if(run.cells[key])run.cells[key]._worldPriority+=6;
    }

    for(const mill of d.mills) {
      if(mill.opened)continue;
      for(const i of mill.cells) {
        if(run.cells[i])run.cells[i]._worldPriority+=4;
      }
    }
    for(const safe of d.safes) {
      if(!safe.opened&&run.cells[safe.index])run.cells[safe.index]._worldPriority+=8;
    }
    for(const i of d.networkPath) {
      if(run.cells[i])run.cells[i]._worldPriority+=7;
    }
    if(d.boss) {
      for(const cell of run.cells) {
        if(cell)cell._worldPriority+=2;
      }
    }
  }

  function decorateGem(run,gem) {
    const d=run?.world?.dynamic;
    if(!d||!gem||run.ended||!d.mechanics)return gem;

    if(d.mechanics.includes('chameleon')&&!gem._worldChameleon&&d.rand()<0.05) {
      gem._worldChameleon=true;
      gem._worldChameleonStep=Math.floor(d.rand()*3);
      gem.color=d.chameleonCycle[gem._worldChameleonStep];
    }
    if(d.mechanics.includes('wildcard')&&!gem._worldWildcard&&d.rand()<0.09) {
      gem._worldWildcard=true;
    }
    return gem;
  }

  initRun=function(run) {
    const result=tcwBaseInitRun(run);
    tcwInitDynamics(run);
    return result;
  };

  markTargets=function(run) {
    if(run?.world?.dynamic)tcwSyncWalls(run);
    tcwBaseMarkTargets(run);
    tcwMarkDynamicCells(run);
  };

  blockMarkup=function(run,index) {
    const base=tcwBaseBlockMarkup(run,index);
    const w=run?.world,d=w?.dynamic;
    if(!d||!Number.isInteger(index))return base;

    const cell=run.cells?.[index];
    const parts=[];

    if(cell?._worldChameleon) {
      parts.push('<span class="tcw-live tcw-chameleon" title="Фишка-хамелеон" aria-hidden="true">◈</span>');
    }
    if(cell?._worldSlime) {
      parts.push('<span class="tcw-live tcw-slime" title="Слизь: распространяется, если её не повредить" aria-hidden="true">●</span>');
    }
    if(cell?._worldRunner) {
      parts.push('<span class="tcw-live tcw-runner" title="Убегающая фишка" aria-hidden="true">🐸</span>');
    }
    if(Number.isInteger(cell?._worldBombTimer)) {
      parts.push(`<span class="tcw-live tcw-timer" title="Бомба обратного отсчёта" aria-label="Бомба ${cell._worldBombTimer}">${cell._worldBombTimer}</span>`);
    }
    if(cell?._worldWhiteout) {
      parts.push('<span class="tcw-whiteout" title="Лёд скрывает цвет" aria-hidden="true">❄</span>');
    }
    if(cell?._worldWater) {
      parts.push('<span class="tcw-water" aria-hidden="true"></span>');
    }
    if(cell?._worldWildcard) {
      parts.push('<span class="tcw-live tcw-wildcard" title="Джокер: подходит к любому цвету" aria-hidden="true">✧</span>');
    }
    if(cell?._worldAngry) {
      parts.push('<span class="tcw-live tcw-angry" title="Разгневанный цвет: штраф очков" aria-hidden="true">♨</span>');
    }
    if(cell?._worldHeat) {
      parts.push(`<span class="tcw-live tcw-heat tcw-heat-${cell._worldHeat}" title="Подсказка горячо-холодно" aria-hidden="true"></span>`);
    }

    for(const mill of d.mills) {
      if(mill.cells.includes(index)&&!mill.opened) {
        const anchor=mill.cells[0]===index;
        parts.push(
          `<span class="tcw-live tcw-mill" title="Энергосборщик: ${mill.charge}/${mill.required}" aria-hidden="true">`+
          `${anchor?'⚙':'◈'}${anchor?`<small>${mill.charge}/${mill.required}</small>`:''}</span>`
        );
      }
    }

    for(const safe of d.safes) {
      if(safe.index===index&&!safe.opened) {
        parts.push(
          `<span class="tcw-live tcw-safe" title="Кодовый замок ${safe.step}/${safe.sequence.length}" aria-hidden="true">🔐<small>${safe.step}/${safe.sequence.length}</small></span>`
        );
      }
    }

    for(const magnet of d.magnets) {
      if(magnet.index===index) {
        parts.push('<span class="tcw-live tcw-magnet" title="Магнит притягивает свой цвет" aria-hidden="true">⊛</span>');
      }
    }

    if(d.switches.includes(index)) {
      parts.push('<span class="tcw-live tcw-switch" title="Переключатель гравитации" aria-hidden="true">⟳</span>');
    }

    for(const anvil of d.anvils) {
      if(anvil.active&&index===anvil.row*8+anvil.col) {
        parts.push('<span class="tcw-live tcw-anvil" title="Падающая наковальня" aria-hidden="true">⚒</span>');
      }
    }

    const pathIndex=d.networkPath.indexOf(index);
    if(pathIndex>=0) {
      const first=pathIndex===0,last=pathIndex===d.networkPath.length-1;
      parts.push(
        `<span class="tcw-live tcw-network ${pathIndex<=d.networkProgress?'is-powered':''}" title="Энергосеть" aria-hidden="true">`+
        `${first?'🔋':last?'◎':'╱'}</span>`
      );
    }

    if(d.fragments.has(index)) {
      parts.push('<span class="tcw-live tcw-fragment" title="Осколок мозаики" aria-hidden="true">✧</span>');
    }
    if(d.mineIndex===index&&!d.mineFound) {
      // Mine remains visually hidden until the player locates it.
    }

    return base+parts.join('');
  };

  expandClear=function(run,initial) {
    const base=tcwBaseExpandClear(run,initial);
    const w=run?.world,d=w?.dynamic;
    if(!d)return base;

    const clear=new Set(base);
    let changed=true,loops=0;

    while(changed&&loops++<10) {
      changed=false;
      for(const key of Object.keys(w.blockers||{})) {
        const index=Number(key);
        const block=w.blockers[index];
        if(!block||block.kind!=='blast'||!clear.has(index))continue;
        const r=Math.floor(index/8),c=index%8;

        for(let dr=-1;dr<=1;dr++) {
          for(let dc=-1;dc<=1;dc++) {
            const rr=r+dr,cc=c+dc;
            if(rr<0||rr>=8||cc<0||cc>=8)continue;
            const next=rr*8+cc;
            if(!clear.has(next)) {
              clear.add(next);
              changed=true;
            }
          }
        }
      }
    }

    return [...clear];
  };

  applyClear=function(run,indices,chain) {
    const result=tcwBaseApplyClear(run,indices,chain)||{
      bonusScore:0,message:''
    };
    const w=run?.world,d=w?.dynamic;
    if(!d)return result;

    const clear=new Set(indices||[]);
    let bonus=0, message='';
    d.turnMaxChain=Math.max(d.turnMaxChain,Number(chain||1));

    for(const i of clear) {
      const cell=run.cells?.[i];
      if(!cell)continue;

      if(cell.special)d.turnHadSpecial=true;

      if(Number.isInteger(cell.color)&&cell.color>=0&&cell.color<7) {
        d.turnColors[cell.color]++;

        if(d.mechanics.includes('hero')&&cell.color===d.powerColor) {
          d.power=Math.min(100,d.power+12);
        }

        if(d.mechanics.includes('colorban')&&d.angerColor===cell.color) {
          // The regular clear score is added by the game loop later.
          // This penalty makes the angry colour a meaningful trade-off.
          run.score=Number(run.score||0)-140;
          message='Осторожно: разгневанный цвет отнял очки!';
        }
      }

      if(cell._worldSlime) {
        d.slimeDamagedUIDs.add(String(cell.uid||i));
      }

      if(Number.isInteger(cell._worldBombTimer)&&cell._worldBombTimer<=1) {
        // Clearing this cell removes the countdown bomb before endTurn.
      }
    }

    // Whiteout reveals a cell when it or an adjacent cell is cleared.
    for(let i=0;i<64;i++) {
      const cell=run.cells?.[i];
      if(!cell?._worldWhiteout)continue;
      if(clear.has(i)||[...clear].some(j=>tcwManhattan(i,j)===1)) {
        delete cell._worldWhiteout;
        d.whiteoutCount=Math.max(0,d.whiteoutCount-1);
        bonus+=20;
      }
    }

    // Energy mills occupy a 2x2 area and require matching nearby colours.
    for(const mill of d.mills) {
      if(mill.opened)continue;
      for(const i of clear) {
        const cell=run.cells?.[i];
        if(!cell||cell.color!==mill.color)continue;
        if(mill.cells.some(target=>tcwManhattan(target,i)<=1)) {
          mill.charge++;
          bonus+=25;
          if(mill.charge>=mill.required) {
            mill.opened=true;
            message='Энергосборщик заряжен и открылся!';
          }
        }
      }
    }

    // Safe: colours must be cleared next to it in a strict code sequence.
    for(const safe of d.safes) {
      if(safe.opened)continue;
      for(const i of clear) {
        if(tcwManhattan(safe.index,i)!==1)continue;
        const colour=run.cells?.[i]?.color;
        if(colour===safe.sequence[safe.step]) {
          safe.step++;
          bonus+=35;
          if(safe.step>=safe.sequence.length) {
            safe.opened=true;
            message='Кодовый сейф открыт!';
          }
        } else {
          safe.step=0;
        }
      }
    }

    // Trigger a gravity switch by clearing next to it.
    for(const sw of d.switches) {
      if([...clear].some(i=>tcwManhattan(sw,i)<=1)) {
        d.turnSwitchPending=true;
      }
    }

    // Energy network: clear wires in order from generator to receiver.
    if(d.networkPath.length>=3) {
      let changed=true;
      while(changed) {
        changed=false;
        const nextIndex=d.networkProgress+1;
        if(nextIndex<d.networkPath.length-1&&clear.has(d.networkPath[nextIndex])) {
          d.networkProgress++;
          bonus+=40;
          changed=true;
        }
      }
      if(d.networkProgress>=d.networkPath.length-2) {
        message='Энергосеть замкнута! Приёмник получил питание.';
      }
    }

    // Boss damage is based on matching weapon-colour tiles and combos.
    if(d.boss&&d.boss.hp>0) {
      const weaponCount=[...clear].filter(i=>
        run.cells?.[i]&&run.cells[i].color===d.boss.color
      ).length;
      const specials=[...clear].filter(i=>run.cells?.[i]?.special).length;
      const damage=Math.max(
        1,
        Math.floor(clear.size/8)+Math.floor(weaponCount/3)+specials*2
      );
      d.boss.hp=Math.max(0,d.boss.hp-damage);
      if(d.boss.hp===0)message='Босс повержен!';
    }

    // Mosaic fragments disappear when collected.
    for(const i of [...d.fragments]) {
      if(clear.has(i)) {
        d.fragments.delete(i);
        d.fragmentsCollected++;
        bonus+=60;
      }
    }
    if(d.fragments.size===0&&d.fragmentsCollected>0) {
      d.treasureOpen=true;
      message='Мозаика собрана! Сундук открыт.';
    }

    // Hot/cold hunt: the hidden object is revealed only when its tile clears.
    if(d.mineIndex>=0&&!d.mineFound) {
      if(clear.has(d.mineIndex)) {
        d.mineFound=true;
        bonus+=300;
        message='Сокровище найдено!';
      } else {
        for(let i=0;i<64;i++) {
          if(clear.has(i))continue;
          const distance=tcwManhattan(i,d.mineIndex);
          if(distance<=1)d.heatHints[i]='hot';
          else if(distance===2)d.heatHints[i]='warm';
          else if(distance===3)d.heatHints[i]='cold';
        }
      }
    }

    const combined={...result,bonusScore:Number(result.bonusScore||0)+bonus};
    if(message)combined.message=message;
    return combined;
  };

  canSwap=function(run,a,b) {
    const d=run?.world?.dynamic;
    if(!tcwBaseCanSwap(run,a,b))return false;
    if(!Number.isInteger(a)||!Number.isInteger(b))return false;
    if(run.world?.walls?.has(wallKey(a,b)))return false;
    return true;
  };

  collapse=function(run,cells,makeNew) {
    const w=run?.world,d=w?.dynamic;

    if(d&&d.mechanics.includes('flood')&&d.waterline>=1) {
      const gravity=w.gravity||'down';
      const inverse={down:'up',up:'down',left:'right',right:'left'};
      w.gravity=inverse[gravity]||'up';
    }

    tcwBaseCollapse(run,cells,makeNew);

    if(d&&d.mechanics.includes('magnet')) {
      for(const magnet of d.magnets) {
        const target=magnet.index;
        const tr=Math.floor(target/8),tc=target%8;
        if(!cells[target])continue;
        if(cells[target].color===magnet.color)continue;

        const candidates=[];
        for(let r=0;r<8;r++) {
          for(const c of [tc-1,tc+1]) {
            if(c<0||c>=8)continue;
            const i=r*8+c;
            if(cells[i]?.color===magnet.color)candidates.push(i);
          }
        }
        if(candidates.length) {
          const source=candidates[Math.floor(d.rand()*candidates.length)];
          [cells[target],cells[source]]=[cells[source],cells[target]];
        }
      }
    }

    tcwSyncWalls(run);
    tcwMarkDynamicCells(run);
  };

  endTurn=function(run) {
    const base=tcwBaseEndTurn(run)||{changed:false,message:''};
    const w=run?.world,d=w?.dynamic;
    if(!d)return base;

    const messages=[];
    if(base.message)messages.push(base.message);
    const level=Number(w.level||run.level?.id||1);

    // 1. Chameleons rotate colours on every surviving tile.
    if(d.mechanics.includes('chameleon')) {
      for(const cell of run.cells||[]) {
        if(!cell?._worldChameleon)continue;
        cell._worldChameleonStep=((cell._worldChameleonStep||0)+1)%3;
        cell.color=d.chameleonCycle[cell._worldChameleonStep];
      }
    }

    // 2. Untouched slime eats a neighbouring tile and copies itself.
    if(d.mechanics.includes('slime')) {
      const slimes=(run.cells||[]).map((cell,i)=>({cell,i}))
        .filter(x=>x.cell?._worldSlime);

      for(const item of slimes) {
        const uid=String(item.cell.uid||item.i);
        if(d.slimeDamagedUIDs.has(uid))continue;

        const neighbors=tcwNeighbors(run,item.i).filter(i=>
          run.cells?.[i]&&!run.cells[i]._worldSlime&&
          !w.blockers?.[i]&&!w.targets?.[i]
        );
        if(!neighbors.length)continue;

        const target=neighbors[Math.floor(d.rand()*neighbors.length)];
        run.cells[target]._worldSlime=true;
        run.cells[target]._worldSlimeColor=item.cell._worldSlimeColor;
        run.cells[target]._worldSlimeHp=1;
        run.cells[target].color=item.cell._worldSlimeColor;

        // A spread is limited by board size and can still be removed by a match.
        if(level<200&&slimes.length>=5)break;
      }
    }
    d.slimeDamagedUIDs.clear();

    // 3. Frogs/mice escape into a neighbouring cell.
    if(d.mechanics.includes('runner')) {
      for(let i=0;i<64;i++) {
        const cell=run.cells?.[i];
        if(!cell?._worldRunner)continue;
        const options=tcwNeighbors(run,i).filter(j=>
          run.cells?.[j]&&!run.cells[j]._worldRunner&&!w.blockers?.[j]
        );
        if(options.length) {
          delete cell._worldRunner;
          const next=options[Math.floor(d.rand()*options.length)];
          run.cells[next]._worldRunner=true;
        }
        break;
      }
    }

    // 4. Countdown bombs. A zero timer is an immediate loss.
    if(d.mechanics.includes('timer')) {
      for(let i=0;i<64;i++) {
        const cell=run.cells?.[i];
        if(!Number.isInteger(cell?._worldBombTimer))continue;
        cell._worldBombTimer--;
        if(cell._worldBombTimer<=0) {
          d.failed=true;
          d.failMessage='Бомба обратного отсчёта достигла нуля. Уровень провален.';
        }
      }
      if(d.failed)messages.push(d.failMessage);
    }

    // 5. Flood rises gradually and reverses the gravity of the flooded zone.
    if(d.mechanics.includes('flood')) {
      if(w.turns>0&&w.turns%(d.waterStep||3)===0) {
        d.waterline=Math.min(d.maxWaterline||3,d.waterline+1);
      }
      if(d.waterline>=1) {
        const inverse={down:'up',up:'down',left:'right',right:'left'};
        w.gravity=inverse[d.baseGravity]||'up';
        if(d.waterline===2)messages.push('Вода поднялась: гравитация обращена вспять!');
      }
    }

    // 6. The switches rotate gravity clockwise.
    if(d.turnSwitchPending) {
      const dirs=['down','left','up','right'];
      const at=dirs.indexOf(w.gravity);
      w.gravity=dirs[(at+1+dirs.length)%dirs.length];
      d.baseGravity=w.gravity;
      d.turnSwitchPending=false;
      messages.push('Переключатель изменил направление гравитации.');
    }

    // 7. An anvil falls, crushing a gem and small obstacle.
    if(d.mechanics.includes('anvil')) {
      for(const anvil of d.anvils) {
        if(!anvil.active)continue;
        if(anvil.row<7) {
          const next=(anvil.row+1)*8+anvil.col;
          const current=anvil.row*8+anvil.col;
          if(w.walls?.has(wallKey(current,next)))continue;

          if(w.blockers?.[next])delete w.blockers[next];
          if(run.cells?.[next]) {
            run.cells[next].color=Math.floor(d.rand()*7);
            delete run.cells[next].special;
            delete run.cells[next]._worldBombTimer;
          }
          anvil.row++;
          anvil.hitCount++;
          if(anvil.row===7) {
            anvil.active=false;
            messages.push('Наковальня упёрлась в дно поля.');
          }
        }
      }
    }

    // 8. Sealed gates change state every three turns.
    if(d.mechanics.includes('gate')&&w.turns%3===0) {
      for(const gate of w.gates||[])gate.closed=!gate.closed;
      tcwSyncWalls(run);
      messages.push(
        (w.gates||[]).some(g=>g.closed)
          ? 'Гермозатворы закрылись!'
          : 'Гермозатворы открылись!'
      );
    }

    // 9. Boss counterattack places a limited amount of dirt.
    if(d.boss&&d.boss.hp>0&&w.turns%4===0&&d.bossAttackCount<4) {
      for(let k=0;k<80;k++) {
        const i=Math.floor(d.rand()*64);
        if(w.blockers?.[i]||w.targets?.[i])continue;
        w.blockers[i]={kind:'mud',hp:1,maxHp:1};
        d.bossAttackCount++;
        messages.push('Босс атакует: на поле появилась минеральная грязь.');
        break;
      }
    }

    // 10. Consecutive cascades grant a multiplier; a quiet turn resets it.
    if(d.mechanics.includes('streak')) {
      if(d.turnMaxChain>=2||d.turnHadSpecial)d.streak++;
      else d.streak=0;

      d.scoreMultiplier=d.streak>=5?5:d.streak>=3?3:d.streak>=2?2:1;

      if(d.scoreMultiplier>1) {
        messages.push('Серия очков ×'+d.scoreMultiplier+'!');
      }
    }

    // 11. Colours ignored for too long become angry.
    if(d.mechanics.includes('colorban')) {
      for(let color=0;color<7;color++) {
        if(d.turnColors[color]>0)d.neglect[color]=0;
        else d.neglect[color]++;
      }
      const threshold=d.neglectThreshold||4;
      const angry=d.neglect
        .map((value,color)=>({value,color}))
        .filter(x=>x.value>=threshold)
        .sort((a,b)=>b.value-a.value);

      d.angerColor=angry.length?angry[0].color:null;
      if(d.angerColor!==null) {
        messages.push('Цвет '+d.angerColor+' разгневан: совпадения штрафуются.');
      }
    }

    d.turnColors=Array(7).fill(0);
    d.turnMaxChain=0;
    d.turnHadSpecial=false;

    tcwMarkDynamicCells(run);
    return {
      changed:true,
      message:messages.join(' ')
    };
  };

  function isComplete(run) {
    const base=tcwBaseIsComplete(run);
    if(!base)return false;
    const d=run?.world?.dynamic;
    if(!d||d.challenge.kind==='none')return true;

    switch(d.challenge.kind) {
      case 'mill':
        return d.mills.some(x=>x.charge>=x.required);
      case 'safe':
        return d.safes.some(x=>x.opened);
      case 'network':
        return d.networkProgress>=d.challenge.required;
      case 'boss':
        return !!d.boss&&d.boss.hp<=0;
      case 'mosaic':
        return d.fragmentsCollected>=d.challenge.required;
      case 'mine':
        return d.mineFound;
      default:
        return true;
    }
  }

  function isFailed(run) {
    return !!run?.world?.dynamic?.failed;
  }

  function updateHud(run,host) {
    tcwBaseUpdateHud(run,host);

    const w=run?.world,d=w?.dynamic;
    if(!w||!d||!host?.parentElement)return;

    const panel=host.parentElement.querySelector('.tcw-panel');
    if(!panel)return;

    let box=panel.querySelector('.tcw-dynamics');
    if(!box) {
      box=document.createElement('div');
      box.className='tcw-dynamics';
      panel.appendChild(box);
    }

    const challenge=d.challenge;
    let objective='Механики уровня активны';
    let progress='';

    if(challenge.kind==='mill') {
      const m=d.mills[0];
      objective='Заряди энергосборщик';
      progress=m?`${m.charge}/${m.required}`:'';
    } else if(challenge.kind==='safe') {
      const s=d.safes[0];
      objective='Открой сейф по цветному коду';
      progress=s?`${s.step}/${s.sequence.length}`:'';
    } else if(challenge.kind==='network') {
      objective='Проложи путь энергии';
      progress=`${d.networkProgress}/${challenge.required}`;
    } else if(challenge.kind==='boss') {
      objective='Победи босса';
      progress=d.boss?`${d.boss.hp}/${d.boss.maxHp} HP`:'';
    } else if(challenge.kind==='mosaic') {
      objective='Собери осколки мозаики';
      progress=`${d.fragmentsCollected}/${challenge.required}`;
    } else if(challenge.kind==='mine') {
      objective='Найди спрятанный объект';
      progress=d.mineFound?'НАЙДЕН':'ИЩИ ПОД ФИШКАМИ';
    } else if(d.mechanics.includes('timer')) {
      objective='Следи за бомбой с таймером';
      const bomb=(run.cells||[]).find(cell=>Number.isInteger(cell?._worldBombTimer));
      progress=bomb?`таймер ${bomb._worldBombTimer}`:'';
    }

    const mechanicNames={
      chameleon:'Хамелеоны',
      slime:'Слизь',
      runner:'Убегающие фишки',
      timer:'Бомбы-таймеры',
      mill:'Энергосборщик',
      safe:'Кодовый сейф',
      magnet:'Магниты',
      whiteout:'Белый лёд',
      flood:'Затопление',
      gravswitch:'Переключатель гравитации',
      anvil:'Наковальни',
      gate:'Гермозатворы',
      network:'Энергосеть',
      boss:'Босс',
      mosaic:'Археология',
      mine:'Горячо-холодно',
      streak:'Серия очков',
      wildcard:'Джокеры',
      colorban:'Запрет цвета',
      hero:'Суперспособность'
    };

    const names=d.mechanics.map(name=>mechanicNames[name]||name);
    const boss=d.boss?`
      <div class="tcw-boss-line">
        <span>♛ БОСС</span><b>${d.boss.hp}/${d.boss.maxHp}</b>
        <i><em style="width:${Math.max(0,d.boss.hp/d.boss.maxHp*100)}%"></em></i>
      </div>`:'';

    const water=d.mechanics.includes('flood')
      ? `<span class="tcw-pill">Вода: ${Math.max(0,d.waterline+1)} ур.</span>`
      :'';

    const streak=d.mechanics.includes('streak')
      ? `<span class="tcw-pill">Серия ×${d.scoreMultiplier}</span>`
      :'';

    const anger=d.angerColor!==null
      ? `<span class="tcw-pill is-danger">Гнев цвета ${d.angerColor}</span>`
      :'';

    const network=d.mechanics.includes('network')
      ? `<span class="tcw-pill">Энергосеть ${d.networkProgress}/${Math.max(0,d.networkPath.length-2)}</span>`
      :'';

    const power=d.mechanics.includes('hero')
      ? `<div class="tcw-power-row">
          <span>⚡ СУПЕРУДАР</span>
          <i><em style="width:${d.power}%"></em></i>
          <b>${d.power}%</b>
          <button type="button" class="tcw-power-button"
            data-tcw-tool="power" ${d.power<100||run.ended||run.busy?'disabled':''}>
            АКТИВИРОВАТЬ
          </button>
        </div>`:'';

    box.innerHTML=`
      <div class="tcw-objective">
        <span class="tcw-objective-orb">✧</span>
        <div><small>ЦЕЛЬ МИССИИ</small><b>${objective}</b></div>
        <strong>${progress}</strong>
      </div>
      ${boss}
      <div class="tcw-pill-row">${water}${streak}${anger}${network}</div>
      ${power}
      <div class="tcw-mechanic-tags">
        ${names.map(name=>`<span>${name}</span>`).join('')}
      </div>`;

    box.classList.toggle('has-boss',!!d.boss);
  }

  selfTest=function() {
    const result=tcwBaseSelfTest();
    const rows=result.results||[];

    try {
      let checked=0,unique=new Set();
      for(let id=1;id<=500;id++) {
        const run={
          level:{id},
          cells:Array.from({length:64},(_,i)=>({
            uid:'test-'+id+'-'+i,
            color:(i*7+id*3)%7
          })),
          ended:false
        };
        initRun(run);
        markTargets(run);

        if(!run.world?.dynamic) {
          throw new Error('Нет динамических механик на уровне '+id);
        }
        if(!run.world.tools?.hammer) {
          throw new Error('Нет инструментов на уровне '+id);
        }
        if(id>=10&&run.world.dynamic.mechanics.length===0) {
          throw new Error('Нет новой механики на уровне '+id);
        }

        checked++;
        unique.add(run.world.dynamic.mechanics.join(','));
      }

      rows.push({
        name:'500 уровней: мир, инструменты, механики и генерация',
        ok:checked===500,
        detail:`Проверено ${checked} уровней, ${unique.size} схем механик`
      });
    } catch(e) {
      rows.push({
        name:'500 уровней: расширенный self-test',
        ok:false,
        detail:String(e.message||e)
      });
    }

    result.ok=rows.every(row=>row.ok);
    return result;
  };

  // Export new public helpers through the final API.

  const api = Object.freeze({
    version:'3.0.0',
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
    decorateGem,
    isFailed,
    selfTest
  });

  global.TODAY_CRYSTAL_WORLD_V1 = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
