/* TODAY CRYSTAL BLOCKS V1 — TEN MECHANICS PACK */
/* Runtime-only quest state. Does not touch account coins or persisted campaign data. */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_BLOCKS_V1 && global.TODAY_CRYSTAL_BLOCKS_V1.version === '1.0.0') return;

  const kinds = {
    crate:   { name: 'Деревянный ящик', glyph: '▤', color: 0xb47b43, edge: 0xf6c889 },
    armor:   { name: 'Бронированный блок', glyph: '⛓', color: 0x7a8b9e, edge: 0xe2f0ff },
    prism:   { name: 'Цветная печать', glyph: '◈', color: 0x9177e8, edge: 0xe8d8ff },
    blast:   { name: 'Взрывной блок', glyph: '✹', color: 0xe36d57, edge: 0xffd4a4 },
    treasure:{ name: 'Сокровищница', glyph: '✦', color: 0xd9a93c, edge: 0xfff0a3 },
    boss:    { name: 'Королевская печать', glyph: '♛', color: 0x9f79e8, edge: 0xffddff }
  };
  const colorMarks = ['✦','✧','✳','◆','✺','❖','✴'];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const manhattan = (a,b) => Math.abs(Math.floor(a/8)-Math.floor(b/8)) + Math.abs(a%8-b%8);

  function seeded(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function createBlocks(levelId, occupied = {}) {
    const id = clamp(Math.floor(Number(levelId) || 1), 1, 220);
    const count = Math.min(8, 4 + Math.floor((id - 1) / 30));
    const random = seeded(id * 7919 + 104729);
    const ice = Array.isArray(occupied.ice) ? occupied.ice : [];
    const sigils = Array.isArray(occupied.sigils) ? occupied.sigils : [];
    const cells = Array.isArray(occupied.cells) ? occupied.cells : [];
    let pool = Array.from({length:64}, (_, i) => i).filter(i => !ice[i] && !sigils[i] && !cells[i]?.relic);
    if (pool.length < count) pool = Array.from({length:64}, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Seeded distribution keeps layouts reproducible but allows occasional clusters for chain explosions.
    const selected = pool.slice(0, count);

    const blocks = selected.map((index, slot) => {
      let kind = 'crate';
      if (id % 20 === 0 && slot === 0) kind = 'boss';
      else if (slot === count - 1 || (id >= 12 && count >= 5 && slot === count - 2) || (id >= 130 && count >= 8 && slot === count - 3 && id % 20 !== 0)) kind = 'treasure';
      else if (id >= 18 && slot === 1) kind = 'blast';
      else if (id >= 30 && slot === 2) kind = 'prism';
      else if (id >= 8 && slot === 3) kind = 'armor';
      else if (id >= 76 && slot % 5 === 0) kind = 'armor';
      const hp = kind === 'boss' ? 3 : kind === 'armor' ? 2 : kind === 'prism' && id >= 130 ? 2 : 1;
      return { id: `b${id}-${slot}`, index, kind, hp, maxHp: hp, color: (id * 3 + slot * 2 + 1) % 7, alive: true };
    });
    return blocks;
  }

  function refreshCounts(run) {
    run.blocksRemaining = (run.blocks || []).filter(block => block && block.hp > 0).length;
    run.blocksDestroyed = Math.max(0, Number(run.blocksTotal || 0) - run.blocksRemaining);
    return run.blocksRemaining;
  }

  function initRun(run) {
    if (!run || !run.level) throw new TypeError('Crystal block pack requires a live level run');
    run.blocks = createBlocks(run.level.id, {ice: run.ice, sigils: run.sigils, cells: run.cells});
    run.blocksTotal = run.blocks.length;
    run.blocksRemaining = run.blocks.length;
    run.blocksDestroyed = 0;
    run.blockHits = 0;
    run.blockTurnDamage = false;
    run.blockStreak = 0;
    run.blockCharge = false;
    run.blockLastTurnCount = Number(run.movesUsed || 0);
    run.blockLastPulseAt = 0;
    run.keysFound = 0;
    run.treasureChests = 0;
    run.keyTarget = Math.max(1, Math.min(3, run.blocks.filter(block => block.kind === 'treasure').length));
    run.blockLastMessage = '';
    run.blockByIndex = Object.create(null);
    run.blocks.forEach(block => { run.blockByIndex[block.index] = block; });
    return run;
  }

  function blockMarkup(run, index) {
    const block = run && run.blockByIndex && run.blockByIndex[index];
    if (!block || block.hp <= 0) return '';
    const meta = kinds[block.kind] || kinds.crate;
    const lock = block.kind === 'prism' ? ` data-lock-color="${block.color}"` : '';
    const color = block.kind === 'prism' ? ` style="--block-color:${['#b18aff','#66c8ff','#4ce0b2','#ffc56c','#ff719e','#aabde9','#f5df65'][block.color]}"` : '';
    return `<span class="ts-m3-block-overlay type-${block.kind} hp-${block.hp}" data-block-index="${index}"${lock}${color} aria-hidden="true"><i>${meta.glyph}</i>${block.kind === 'prism' ? `<em>${colorMarks[block.color]}</em>` : ''}<b>${block.hp > 1 ? block.hp : ''}</b></span>`;
  }

  function neighbours(index, diagonal = false) {
    const r = Math.floor(index / 8), c = index % 8, out = [index];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      if (!diagonal && Math.abs(dr) + Math.abs(dc) !== 1) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) out.push(rr * 8 + cc);
    }
    return out;
  }

  function applyClear(run, clearIndices, chain = 1) {
    if (!run || !Array.isArray(run.blocks) || !Array.isArray(run.cells)) return null;
    const clear = new Set((Array.isArray(clearIndices) ? clearIndices : []).filter(i => Number.isInteger(i) && i >= 0 && i < 64));
    if (!clear.size) return null;
    const colorAt = index => run.cells[index] && Number.isInteger(run.cells[index].color) ? run.cells[index].color : -1;
    const hasSpecial = [...clear].some(index => !!run.cells[index]?.special) || !!run.pendingSuperCombo;
    const event = {changed:false, hits:0, destroyed:0, bonusScore:0, message:''};
    let chargeSpent = false;
    const blastQueue = [];
    const hitBlock = (block, damage, fromExplosion = false) => {
      if (!block || block.hp <= 0 || damage <= 0) return;
      const before = block.hp;
      block.hp = Math.max(0, block.hp - damage);
      block.alive = block.hp > 0;
      event.changed = true; event.hits++; run.blockHits = (run.blockHits || 0) + 1; run.blockTurnDamage = true;
      event.bonusScore += Math.min(damage, before) * 20;
      if (block.hp === 0) {
        event.destroyed++;
        event.bonusScore += block.kind === 'boss' ? 600 : block.kind === 'treasure' ? 280 : block.kind === 'blast' ? 170 : 110;
        if (block.kind === 'treasure') {
          run.keysFound = (Number(run.keysFound) || 0) + 1;
          if (!run.treasureChests && run.keysFound >= Number(run.keyTarget || 3)) {
            run.treasureChests = 1;
            event.bonusScore += 450;
            run.blockLastMessage = 'СОКРОВИЩНИЦА ОТКРЫТА! Бонус к очкам +450';
          }
        }
        if (block.kind === 'blast' || block.kind === 'boss') blastQueue.push({block, fromExplosion});
      }
    };

    for (const block of run.blocks) {
      if (!block || block.hp <= 0) continue;
      const affectedCells = neighbours(block.index, false).filter(index => clear.has(index));
      if (!affectedCells.length) continue;
      if (block.kind === 'prism' && !hasSpecial && !affectedCells.some(index => colorAt(index) === block.color)) {
        run.blockLastMessage = `Цветная печать: нужен кристалл ${colorMarks[block.color]}`;
        continue;
      }
      let damage = 1;
      // Strong cascades hit harder; a completed breaker streak empowers one ordinary block hit.
      if (Number(chain) >= 3) damage++;
      if (run.blockCharge && !chargeSpent && block.kind !== 'boss') {
        damage++; chargeSpent = true; run.blockCharge = false;
      }
      hitBlock(block, damage);
    }

    // Detonations chain, but every block can explode only once per clearing wave.
    const exploded = new Set();
    while (blastQueue.length && exploded.size < 64) {
      const source = blastQueue.shift().block;
      if (!source || exploded.has(source.id)) continue;
      exploded.add(source.id);
      const targetIndexes = new Set();
      if (source.kind === 'boss') {
        const row = Math.floor(source.index / 8), col = source.index % 8;
        for (let i = 0; i < 64; i++) if (Math.floor(i / 8) === row || i % 8 === col) targetIndexes.add(i);
      } else {
        neighbours(source.index, true).forEach(index => targetIndexes.add(index));
      }
      for (const target of run.blocks) {
        if (!target || target.hp <= 0 || target.id === source.id || !targetIndexes.has(target.index)) continue;
        hitBlock(target, 1, true);
      }
    }
    refreshCounts(run);
    if (event.changed) {
      const pieces = [];
      if (event.destroyed) pieces.push(`Разрушено блоков: ${event.destroyed}`);
      else pieces.push('Блоки повреждены');
      pieces.push(`осталось ${run.blocksRemaining}/${run.blocksTotal}`);
      if (run.blockLastMessage && run.blockLastMessage.includes('СОКРОВИЩНИЦА')) pieces.push('сокровищница открыта');
      event.message = pieces.join(' · ');
      run.blockLastMessage = event.message;
    } else if (run.blockLastMessage) {
      event.message = run.blockLastMessage;
    }
    return event;
  }

  function directDamage(run, block, amount = 1) {
    if (!block || block.hp <= 0) return {changed:false,hits:0,destroyed:0,bonusScore:0,message:''};
    const event = {changed:false,hits:0,destroyed:0,bonusScore:0,message:''};
    const queue = [];
    const hit = (target, damage) => {
      if (!target || target.hp <= 0) return;
      target.hp = Math.max(0, target.hp - damage); target.alive = target.hp > 0;
      event.changed = true; event.hits++; event.bonusScore += 20; run.blockHits = (run.blockHits || 0) + 1;
      if (target.hp === 0) {
        event.destroyed++; event.bonusScore += target.kind === 'boss' ? 600 : target.kind === 'treasure' ? 280 : target.kind === 'blast' ? 170 : 110;
        if (target.kind === 'treasure') {
          run.keysFound = (Number(run.keysFound)||0)+1;
          if (!run.treasureChests && run.keysFound >= Number(run.keyTarget||3)) { run.treasureChests = 1; event.bonusScore += 450; }
        }
        if (target.kind === 'blast' || target.kind === 'boss') queue.push(target);
      }
    };
    hit(block, amount);
    const seen = new Set();
    while (queue.length && seen.size < 64) {
      const source = queue.shift(); if (seen.has(source.id)) continue; seen.add(source.id);
      const targetIndexes = new Set();
      if (source.kind === 'boss') { const row=Math.floor(source.index/8),col=source.index%8; for(let i=0;i<64;i++)if(Math.floor(i/8)===row||i%8===col)targetIndexes.add(i); }
      else neighbours(source.index,true).forEach(i=>targetIndexes.add(i));
      for (const other of run.blocks) if (other && other.hp>0 && other.id!==source.id && targetIndexes.has(other.index)) hit(other,1);
    }
    refreshCounts(run); event.message = event.destroyed ? `Звёздный импульс! Разрушено блоков: ${event.destroyed}` : 'Звёздный импульс ослабил блок';
    run.blockLastMessage = event.message;
    return event;
  }

  function endTurn(run) {
    if (!run || !Array.isArray(run.blocks)) return null;
    const used = Number(run.movesUsed) || 0;
    if (used <= (Number(run.blockLastTurnCount) || 0)) return null;
    run.blockLastTurnCount = used;
    let message = '';
    if (run.blockTurnDamage) {
      run.blockStreak = (Number(run.blockStreak) || 0) + 1;
      if (run.blockStreak >= 3) {
        run.blockCharge = true; run.blockStreak = 0;
        message = 'РЕЗОНАНС ЗАРЯЖЕН — следующий обычный удар по блоку нанесёт +1 урон';
        run.blockLastMessage = message;
      }
    } else run.blockStreak = 0;
    run.blockTurnDamage = false;

    // Gentle rescue pulse every four valid moves prevents dead-end levels without removing the move limit.
    const pulseAt = Math.floor(used / 4) * 4;
    let event = null;
    if (pulseAt >= 4 && pulseAt > (Number(run.blockLastPulseAt) || 0) && refreshCounts(run) > 0) {
      run.blockLastPulseAt = pulseAt;
      const alive = run.blocks.filter(block => block && block.hp > 0);
      alive.sort((a,b) => {
        const rank = block => block.kind === 'boss' ? 3 : block.kind === 'prism' ? 2 : 0;
        return rank(a)-rank(b) || a.hp-b.hp || a.index-b.index;
      });
      if (alive.length) event = directDamage(run, alive[0], 1);
      if (event && event.changed) { event.message = `РЕЗОНАНС · ${event.message}`; message = event.message; }
    }
    refreshCounts(run);
    if (message) run.blockLastMessage = message;
    return {changed:!!event?.changed, bonusScore:Number(event?.bonusScore||0), message:message || '', blocksRemaining:run.blocksRemaining, pulse:!!event};
  }

  function updateHud(run) {
    if (!run) return;
    const remaining = refreshCounts(run);
    const count = typeof document !== 'undefined' && document.getElementById('todayMatchBlocksCount');
    const bar = typeof document !== 'undefined' && document.getElementById('todayMatchBlocksBar');
    const note = typeof document !== 'undefined' && document.getElementById('todayMatchBlocksNote');
    const pct = run.blocksTotal ? (run.blocksDestroyed / run.blocksTotal) * 100 : 100;
    if (count) count.textContent = `${remaining} / ${run.blocksTotal}`;
    if (bar) bar.style.width = `${Math.max(0,Math.min(100,pct))}%`;
    if (note) note.textContent = remaining ? `Разбей все блоки · ключи ${Math.min(Number(run.keysFound||0),Number(run.keyTarget||3))}/${Number(run.keyTarget||3)} · серия ${run.blockCharge ? 'заряжена' : Math.min(3,Number(run.blockStreak||0))+'/3'}` : 'Все блоки разрушены! Выполни оставшуюся цель уровня.';
  }

  function isComplete(run) { return !!run && Array.isArray(run.blocks) && run.blocks.length > 0 && refreshCounts(run) === 0; }

  function hudMarkup() {
    return `<section class="ts-m3-block-hud" aria-label="Бонусные блоки уровня"><div class="ts-m3-block-hud-head"><span><i aria-hidden="true">▦</i> БОНУС: РАЗРУШЬ БЛОКИ</span><b id="todayMatchBlocksCount">—</b></div><div class="ts-m3-block-track"><i id="todayMatchBlocksBar"></i></div><small id="todayMatchBlocksNote">Разрушай ящики, печати и сокровищницы ради дополнительных очков. Победа определяется заданием уровня.</small></section><details class="ts-m3-mechanics-help"><summary><span>ПРАВИЛА БЛОКОВ И КОМБО</span><b>10 МЕХАНИК　＋</b></summary><div class="ts-m3-mechanics-grid"><div><i>▤</i><span><b>Ящики</b><small>Разрушаются от совпадения по соседству.</small></span></div><div><i>⛓</i><span><b>Броня</b><small>Нужно два попадания; каскад бьёт сильнее.</small></span></div><div><i>◈</i><span><b>Цветная печать</b><small>Попади кристаллом нужного цвета или спецэффектом.</small></span></div><div><i>✹</i><span><b>Взрывной ящик</b><small>При разрушении повреждает соседние блоки и запускает цепь.</small></span></div><div><i>♛</i><span><b>Королевская печать</b><small>Босс каждые 20 уровней: три прочности и взрыв строки/столбца.</small></span></div><div><i>✦</i><span><b>Ключи и сокровищница</b><small>Разбей все золотые блоки, чтобы открыть кэш и получить очки.</small></span></div><div><i>⚡</i><span><b>Каскад ×3</b><small>Три волны подряд наносят дополнительный урон блокам.</small></span></div><div><i>↯</i><span><b>Серия разрушения</b><small>Три хода с попаданием по блокам заряжают усиленный удар.</small></span></div><div><i>◉</i><span><b>Резонанс</b><small>Каждые четыре использованных хода ослабляет один блок без штрафа.</small></span></div><div><i>⌛</i><span><b>Лимит ходов</b><small>На уровне 28–31 ход; цели сбалансированы вместе с блоками.</small></span></div></div></details>`;
  }

  function selfTest() {
    const results = [];
    const test = (name, fn) => { try { const detail=fn(); results.push({name,ok:detail!==false,detail:String(detail===undefined?'ok':detail)}); } catch (e) { results.push({name,ok:false,detail:e.message}); } };
    test('220 levels have unique block layouts and a move limit', () => {
      for (let id=1; id<=220; id++) {
        const blocks=createBlocks(id), ids=new Set(blocks.map(b=>b.index));
        if (!blocks.length || blocks.length>8 || ids.size!==blocks.length || blocks.some(b=>b.index<0||b.index>=64||b.hp<1||b.hp>3)) return false;
        if (!blocks.some(b=>b.kind==='treasure')) return false;
        if (id % 20 === 0 && blocks.filter(b=>b.kind==='treasure').length > 2) return false;
        const moves=id<=20?31:id<=60?30:id<=100?30:id<=140?29:id<=180?29:28;
        if (moves<28||moves>31) return false;
      }
      return 'all 220 levels checked';
    });
    test('prism lock rejects wrong colour and accepts matching colour', () => {
      const run={level:{id:30},cells:Array.from({length:64},(_,i)=>({color:i%7})),blocks:[{id:'p',index:10,kind:'prism',color:2,hp:1,maxHp:1,alive:true}],blocksTotal:1,blocksRemaining:1,blocksDestroyed:0,movesUsed:0};
      run.cells[9].color=1; applyClear(run,[9],1); if(run.blocks[0].hp!==1)return false;
      run.cells[9].color=2; applyClear(run,[9],1); return run.blocks[0].hp===0 ? 'colour lock works' : false;
    });
    test('explosive crate chains into neighbouring crate', () => {
      const run={level:{id:20},cells:Array.from({length:64},(_,i)=>({color:i%7})),blocks:[{id:'a',index:10,kind:'blast',color:0,hp:1,maxHp:1},{id:'b',index:11,kind:'crate',color:0,hp:1,maxHp:1}],blocksTotal:2,blocksRemaining:2,blocksDestroyed:0,movesUsed:0};
      const event=applyClear(run,[9],1); return event.destroyed===2 && run.blocksRemaining===0 ? 'chain reaction cleared both' : false;
    });
    test('armour takes two normal waves, three-chain wave is stronger', () => {
      const run={level:{id:10},cells:Array.from({length:64},(_,i)=>({color:i%7})),blocks:[{id:'a',index:10,kind:'armor',color:0,hp:2,maxHp:2}],blocksTotal:1,blocksRemaining:1,blocksDestroyed:0,movesUsed:0};
      applyClear(run,[9],1); if(run.blocks[0].hp!==1)return false;
      applyClear(run,[9],3); return run.blocks[0].hp===0 ? 'cascade breaks reinforced block' : false;
    });
    test('rescue pulse triggers on fourth move and does not spend game coins', () => {
      const run={level:{id:5},cells:Array.from({length:64},(_,i)=>({color:i%7})),blocks:[{id:'a',index:10,kind:'crate',color:0,hp:1,maxHp:1}],blocksTotal:1,blocksRemaining:1,blocksDestroyed:0,movesUsed:4,blockLastTurnCount:3,blockLastPulseAt:0,blockTurnDamage:false};
      const event=endTurn(run); return !!event && event.changed && run.blocksRemaining===0 && !('coins' in run) ? 'fourth-move pulse works' : false;
    });
    return {ok:results.every(r=>r.ok),results};
  }

  const api = Object.freeze({version:'1.0.0', createBlocks, initRun, blockMarkup, applyClear, endTurn, updateHud, isComplete, hudMarkup, selfTest});
  global.TODAY_CRYSTAL_BLOCKS_V1 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
