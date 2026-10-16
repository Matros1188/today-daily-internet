/* TODAY CRYSTAL PHASER V3 — BREAKABLE BLOCK RENDERER */
(() => {
  'use strict';
  if (window.__TODAY_CRYSTAL_PHASER && window.__TODAY_CRYSTAL_PHASER.version === '3.0.0') return;

  const CDN = 'https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js';
  const colors = [
    {a:0xf0ddff,b:0xb18aff,c:0x6744d9,line:0xeadcff},
    {a:0xd8f6ff,b:0x66c8ff,c:0x2360d5,line:0xd5f5ff},
    {a:0xd7ffe8,b:0x4ce0b2,c:0x16856f,line:0xd5fff0},
    {a:0xfff2bf,b:0xffc56c,c:0xd9752d,line:0xfff0c9},
    {a:0xffd9e5,b:0xff719e,c:0xc72f68,line:0xffe0eb},
    {a:0xf4f8ff,b:0xaabde9,c:0x667db9,line:0xffffff},
    {a:0xfff9cb,b:0xf5df65,c:0xb98728,line:0xfff8cf}
  ];
  const shapes = [
    [[0,-1],[.68,-.47],[.49,.40],[0,.96],[-.49,.40],[-.68,-.47]],
    [[0,-1],[.28,-.47],[.84,-.64],[.56,-.12],[1,.14],[.47,.36],[.52,.88],[0,.57],[-.52,.88],[-.47,.36],[-1,.14],[-.56,-.12],[-.84,-.64],[-.28,-.47]],
    [[0,-1],[.78,-.52],[.78,.45],[0,.94],[-.78,.45],[-.78,-.52]],
    [[0,-1],[.24,-.48],[.79,-.57],[.47,-.12],[.91,.18],[.42,.37],[.48,.91],[0,.57],[-.48,.91],[-.42,.37],[-.91,.18],[-.47,-.12],[-.79,-.57],[-.24,-.48]],
    [[0,-1],[.56,-.69],[.92,-.16],[.76,.48],[0,.98],[-.76,.48],[-.92,-.16],[-.56,-.69]],
    [[0,-1],[.61,-.61],[.48,.15],[0,.96],[-.48,.15],[-.61,-.61]],
    [[0,-1],[.63,-.62],[.84,.13],[.40,.76],[0,.99],[-.40,.76],[-.84,.13],[-.63,-.62]]
  ];
  const glyphs = {nova:'✹',bomb:'✦',rainbow:'✺','rocket-h':'➜','rocket-v':'↑'};
  let active = null;
  let failedBoard = null;
  let latest = null;
  let phaserState = 'idle';
  let scriptEl = null;
  let checkQueued = false;

  function snapshot(run) {
    if (!run || !Array.isArray(run.cells)) return null;
    return {
      levelId: Number(run.level && run.level.id) || 1,
      selected: Number.isInteger(run.selected) ? run.selected : -1,
      cells: run.cells.map(cell => cell ? {
        uid: String(cell.uid), color: Math.max(0, Math.min(colors.length - 1, Number(cell.color) || 0)),
        special: cell.special || '', relic: !!cell.relic, echo: !!cell.echo
      } : null),
      ice: Array.isArray(run.ice) ? run.ice.slice(0,64) : Array(64).fill(0),
      sigils: Array.isArray(run.sigils) ? run.sigils.slice(0,64) : Array(64).fill(0),
      blocks: Array.isArray(run.blocks) ? run.blocks.filter(block => block && block.hp > 0).map(block => ({index:block.index,kind:block.kind,hp:block.hp,maxHp:block.maxHp,color:block.color})) : [],
      paused: !!run.paused, ended: !!run.ended
    };
  }

  function warnFallback(reason) {
    console.warn('[TODAY Crystal Phaser] Renderer fallback; legacy board remains active.', reason || '');
    if (active) {
      const old = active;
      failedBoard = old.board;
      active = null;
      try { old.resizeObserver && old.resizeObserver.disconnect(); } catch (_) {}
      try { if (old.startupTimeout) clearTimeout(old.startupTimeout); } catch (_) {}
      try { old.game && old.game.destroy(true); } catch (_) {}
      try { old.wrap && old.wrap.classList.remove('arc5-phaser-ready'); } catch (_) {}
      try { old.viewport && old.viewport.remove(); } catch (_) {}
    }
  }

  function loadPhaser(callback) {
    if (window.Phaser && window.Phaser.Game && window.Phaser.Scale) { callback(true); return; }
    if (phaserState === 'failed') { callback(false); return; }
    if (phaserState === 'loading') {
      (window.__TODAY_PHASER_WAITERS || (window.__TODAY_PHASER_WAITERS = [])).push(callback);
      return;
    }
    phaserState = 'loading';
    window.__TODAY_PHASER_WAITERS = [callback];
    scriptEl = document.createElement('script');
    scriptEl.src = CDN;
    scriptEl.async = true;
    scriptEl.crossOrigin = 'anonymous';
    scriptEl.onload = () => {
      const ok = !!(window.Phaser && window.Phaser.Game && window.Phaser.Scale);
      phaserState = ok ? 'ready' : 'failed';
      const waiters = (window.__TODAY_PHASER_WAITERS || []).splice(0);
      waiters.forEach(fn => { try { fn(ok); } catch (error) { console.error(error); } });
    };
    scriptEl.onerror = () => {
      phaserState = 'failed';
      const waiters = (window.__TODAY_PHASER_WAITERS || []).splice(0);
      waiters.forEach(fn => { try { fn(false); } catch (_) {} });
    };
    document.head.appendChild(scriptEl);
  }

  function cellGlyph(special) { return glyphs[special] || ''; }
  function toHex(n) { return '#' + Number(n).toString(16).padStart(6, '0'); }
  function path(g, pts) {
    if (!pts || pts.length < 3) return;
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
  }
  function fillPoly(g, pts, color, alpha=1, stroke=null, strokeAlpha=1, lineWidth=1) {
    path(g, pts); g.fillStyle(color, alpha); g.fillPath();
    if (stroke !== null) { path(g, pts); g.lineStyle(lineWidth, stroke, strokeAlpha); g.strokePath(); }
  }

  function teardown() {
    if (!active) return;
    const old = active; active = null;
    try { old.resizeObserver && old.resizeObserver.disconnect(); } catch (_) {}
    try { if (old.startupTimeout) clearTimeout(old.startupTimeout); } catch (_) {}
    try { old.game && old.game.destroy(true); } catch (_) {}
    try { old.wrap && old.wrap.classList.remove('arc5-phaser-ready'); } catch (_) {}
    try { old.viewport && old.viewport.remove(); } catch (_) {}
  }

  function locateBoard() {
    const board = document.getElementById('todayMatchBoard');
    const modal = board && board.closest('#modal');
    if (!board || !board.isConnected || !board.closest('.ts-m3-game[data-match3-level]')) return null;
    if (modal && modal.classList.contains('hidden')) return null;
    const wrap = board.closest('.ts-m3-board-wrap');
    if (!wrap) return null;
    return {board, wrap};
  }

  function positionViewport(target) {
    if (!target || !target.board.isConnected || !target.wrap.isConnected) return;
    const b = target.board.getBoundingClientRect(), w = target.wrap.getBoundingClientRect();
    if (b.width < 40 || b.height < 40) return;
    Object.assign(target.viewport.style, {
      left: Math.round(b.left - w.left) + 'px',
      top: Math.round(b.top - w.top) + 'px',
      width: Math.round(b.width) + 'px',
      height: Math.round(b.height) + 'px'
    });
    if (target.game && target.game.scale) {
      const width = Math.max(1, Math.round(b.width)), height = Math.max(1, Math.round(b.height));
      if (Math.abs((target.game.scale.width || 0) - width) > 1 || Math.abs((target.game.scale.height || 0) - height) > 1) {
        try { target.game.scale.resize(width, height); } catch (_) {}
      }
    }
  }

  function mountBoard(found) {
    if (active && active.board === found.board) { positionViewport(active); return; }
    failedBoard = null;
    teardown();
    const viewport = document.createElement('div');
    viewport.className = 'today-crystal-phaser-viewport';
    viewport.setAttribute('role', 'grid');
    viewport.setAttribute('aria-label', 'Crystal Rescue — игровое поле 8 на 8. Нажми или коснись кристалла, затем соседнего.');
    viewport.tabIndex = 0;
    found.wrap.appendChild(viewport);
    const target = {board:found.board, wrap:found.wrap, viewport, game:null, scene:null, resizeObserver:null, created:false, startupTimeout:null};
    active = target;
    positionViewport(target);
    if (window.ResizeObserver) {
      target.resizeObserver = new ResizeObserver(() => positionViewport(target));
      target.resizeObserver.observe(found.board);
      target.resizeObserver.observe(found.wrap);
    }
    loadPhaser(ok => {
      if (active !== target || !target.board.isConnected) return;
      if (!ok) { warnFallback('Phaser CDN could not be loaded.'); return; }
      target.startupTimeout = window.setTimeout(() => {
        if (active === target && !target.created) warnFallback('Phaser scene startup timed out.');
      }, 8000);
      try { createGame(target); } catch (error) { warnFallback(error); }
    });
  }

  function createGame(target) {
    const Phaser = window.Phaser;
    if (!Phaser || !Phaser.Game) throw new Error('Phaser API unavailable');
    const sceneConfig = {
      key: 'TodayCrystalBoard',
      create: function () {
        const scene = this;
        if (active !== target || !target.board.isConnected) { try { target.game && target.game.destroy(true); } catch (_) {} return; }
        scene.snapshotData = latest;
        scene.gemNodes = new Map();
        scene.lastPositions = new Map();
        scene.bursts = [];
        scene.boardG = scene.add.graphics();
        scene.tileG = scene.add.graphics();
        scene.overlayG = scene.add.graphics();
        scene.selectionG = scene.add.graphics();
        scene.blockG = scene.add.graphics();
        scene.boardLayout = null;
        scene._queuedSnapshot = latest;
        let pointerStart = null;
        scene.drawBoard = function (s, animate) { drawBoard(scene, s, animate); };
        scene.scale.on('resize', () => {
          if (!scene.snapshotData || active !== target) return;
          try { drawBoard(scene, scene.snapshotData, false); } catch (error) { warnFallback(error); }
        });
        scene.input.on('pointerdown', pointer => {
          if (!scene.boardLayout || !latest || latest.ended || latest.paused) { pointerStart = null; return; }
          const index = indexAt(scene.boardLayout, pointer.x, pointer.y);
          if (index < 0) { pointerStart = null; return; }
          pointerStart = {index, x:pointer.x, y:pointer.y, id:pointer.id};
        });
        scene.input.on('pointerup', pointer => {
          const start = pointerStart;
          pointerStart = null;
          if (!start || !scene.boardLayout || !latest || latest.ended || latest.paused) return;
          const end = indexAt(scene.boardLayout, pointer.x, pointer.y);
          if (end < 0) return;
          try { target.viewport.focus({preventScroll:true}); } catch (_) { try { target.viewport.focus(); } catch (__) {} }
          if (end === start.index) { activateIndex(end); return; }
          const dr = Math.abs(Math.floor(end / 8) - Math.floor(start.index / 8));
          const dc = Math.abs((end % 8) - (start.index % 8));
          const movement = Math.hypot(pointer.x - start.x, pointer.y - start.y);
          const isNeighborSwipe = dr + dc === 1 && movement >= Math.max(10, scene.boardLayout.cell * 0.18);
          if (!isNeighborSwipe) { activateIndex(end); return; }
          // First select, then swap: the existing rule engine remains the authority.
          Promise.resolve(activateIndex(start.index))
            .then(() => new Promise(resolve => requestAnimationFrame(() => resolve())))
            .then(() => activateIndex(end))
            .catch(error => console.warn('[TODAY Crystal Phaser V2] Swipe input error:', error));
        });
        if (scene.input.keyboard) {
          scene.focusIndex = Math.max(0, latest && latest.selected >= 0 ? latest.selected : 27);
          scene.input.keyboard.on('keydown', event => {
            if (!scene.boardLayout || !latest) return;
            const k = event.key;
            if (k === 'ArrowLeft') scene.focusIndex = Math.max(0, scene.focusIndex - 1);
            else if (k === 'ArrowRight') scene.focusIndex = Math.min(63, scene.focusIndex + 1);
            else if (k === 'ArrowUp') scene.focusIndex = Math.max(0, scene.focusIndex - 8);
            else if (k === 'ArrowDown') scene.focusIndex = Math.min(63, scene.focusIndex + 8);
            else if (k === 'Enter' || k === ' ') { event.preventDefault(); activateIndex(scene.focusIndex); return; }
            else return;
            event.preventDefault(); drawBoard(scene, latest, false);
          });
        }
        target.scene = scene;
        try { if (latest) drawBoard(scene, latest, false); } catch (error) { warnFallback(error); return; }
        target.created = true;
        if (target.startupTimeout) { clearTimeout(target.startupTimeout); target.startupTimeout = null; }
        // Hide the accessible DOM fallback only after Phaser has produced a scene.
        requestAnimationFrame(() => {
          if (active === target && target.viewport.isConnected && target.created) {
            target.wrap.classList.add('arc5-phaser-ready');
            target.viewport.dataset.renderer = 'phaser-4';
          }
        });
      },
      update: function (time, delta) {
        const scene = this;
        if (scene.glints && scene.glints.length) {
          for (const glint of scene.glints) {
            glint.phase += delta * glint.speed;
            glint.node.setAlpha(.12 + (Math.sin(glint.phase) + 1) * .19);
          }
        }
      }
    };
    const width = Math.max(200, target.viewport.clientWidth || target.board.clientWidth || 360);
    const height = Math.max(200, target.viewport.clientHeight || target.board.clientHeight || width);
    target.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: target.viewport,
      width, height,
      transparent: true,
      backgroundColor: '#080d1e',
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH, width, height },
      fps: { target: 60, forceSetTimeOut: false },
      scene: sceneConfig
    });
    positionViewport(target);
  }

  function layoutFor(scene) {
    const w = Math.max(1, scene.scale.width || scene.game.config.width || 360);
    const h = Math.max(1, scene.scale.height || scene.game.config.height || 360);
    const size = Math.min(w, h);
    const boardSize = size * .965;
    const bx = (w - boardSize) / 2, by = (h - boardSize) / 2;
    const pad = Math.max(7, boardSize * .030);
    const gap = Math.max(3, Math.min(6, boardSize * .014));
    const cell = (boardSize - pad * 2 - gap * 7) / 8;
    return {w,h,size,boardSize,bx,by,pad,gap,cell,x0:bx+pad,y0:by+pad,step:cell+gap};
  }

  function indexAt(l, x, y) {
    const gx = x - l.x0, gy = y - l.y0;
    if (gx < 0 || gy < 0) return -1;
    const c = Math.floor(gx / l.step), r = Math.floor(gy / l.step);
    if (r < 0 || r > 7 || c < 0 || c > 7) return -1;
    if (gx - c*l.step > l.cell || gy - r*l.step > l.cell) return -1;
    return r*8+c;
  }

  function activateIndex(index) {
    if (!active || !active.board || !active.board.isConnected) return false;
    const bridge = window.__TODAY_CRYSTAL_GAMEPLAY_V2;
    if (bridge && typeof bridge.isActive === 'function' && bridge.isActive(active.board) && typeof bridge.tap === 'function') {
      try {
        const result = bridge.tap(index);
        if (result && typeof result.catch === 'function') result.catch(error => console.warn('[TODAY Crystal Phaser V2] Input bridge error:', error));
        return result === false ? false : (result || true);
      } catch (error) {
        console.warn('[TODAY Crystal Phaser V2] Direct input failed; using accessible fallback.', error);
      }
    }
    // Accessible legacy fallback is deliberately retained if Phaser or the bridge is unavailable.
    const button = active.board.querySelector('[data-i="' + index + '"]');
    if (button && typeof button.click === 'function') { button.click(); return true; }
    return false;
  }

  function gemPoints(x, y, radius, colorIndex) {
    const shape = shapes[colorIndex % shapes.length];
    return shape.map(p => ({x:x+p[0]*radius, y:y+p[1]*radius}));
  }

  function drawGem(scene, node, cell, x, y, radius, selected) {
    const g = node.gfx; g.clear();
    const palette = colors[cell.color] || colors[0];
    const r = radius * .82;
    g.fillStyle(palette.b, .12); g.fillCircle(0, radius*.06, r*1.24);
    g.fillStyle(0x00040b, .34);
    fillPoly(g, gemPoints(0, radius*.13, r, cell.color), 0x00040b, .34);
    const p = gemPoints(0, 0, r, cell.color);
    fillPoly(g, p, palette.c, 1, palette.line, .88, Math.max(1.1, radius*.052));
    const top = [p[0],p[1],{x:0,y:-r*.04},p[p.length-1]];
    fillPoly(g, top, palette.a, .84);
    const leftFacet = [p[p.length-1],{x:-r*.04,y:-r*.02},p[Math.floor(p.length/2)]];
    fillPoly(g, leftFacet, palette.b, .50);
    const center = {x:0,y:r*.03};
    const rightFacet = [p[1],p[2],center,{x:0,y:-r*.04}];
    fillPoly(g, rightFacet, palette.c, .34);
    const lower = [center,p[Math.min(4,p.length-1)],p[Math.floor(p.length/2)]];
    fillPoly(g, lower, palette.c, .22);
    g.lineStyle(Math.max(1, radius*.036), 0xffffff, .52);
    g.beginPath(); g.moveTo(-r*.31,-r*.55); g.lineTo(-r*.05,-r*.75); g.strokePath();
    g.lineStyle(Math.max(.8,radius*.022), 0xffffff, .27);
    g.beginPath(); g.moveTo(0,-r*.94); g.lineTo(0,r*.77); g.strokePath();
    if (selected) {
      g.lineStyle(Math.max(2, radius*.09), 0xd7ff52, .92); g.strokeCircle(0,0,r*1.31);
      g.lineStyle(Math.max(1, radius*.025), 0xffffff, .8); g.strokeCircle(0,0,r*1.43);
      g.fillStyle(0xd7ff52,.13); g.fillCircle(0,0,r*1.22);
    }
    if (cell.special) {
      g.fillStyle(0x11132c,.96); g.fillCircle(r*.64,-r*.66,r*.31);
      g.lineStyle(Math.max(1,radius*.035),0xe5dcff,.9); g.strokeCircle(r*.64,-r*.66,r*.31);
      if (node.badge) { node.badge.setText(cellGlyph(cell.special)); node.badge.setVisible(true); node.badge.setPosition(r*.64,-r*.66); node.badge.setFontSize(Math.max(9,Math.round(r*.43))); }
    } else if (node.badge) node.badge.setVisible(false);
  }

  function drawBoard(scene, s, animate) {
    if (!scene || !s || !scene.boardG) return;
    scene.snapshotData = s;
    const l = layoutFor(scene); scene.boardLayout = l;
    scene.boardG.clear(); scene.tileG.clear(); scene.overlayG.clear(); scene.selectionG.clear();
    const radius = Math.max(8,l.size*.028);
    scene.boardG.fillStyle(0x050916,.75); scene.boardG.fillRoundedRect(l.bx,l.by,l.boardSize,l.boardSize,radius);
    scene.boardG.lineStyle(Math.max(1,l.size*.003),0x8da4ff,.34); scene.boardG.strokeRoundedRect(l.bx+.5,l.by+.5,l.boardSize-1,l.boardSize-1,radius);
    scene.boardG.lineStyle(1,0xffffff,.035); scene.boardG.strokeRoundedRect(l.bx+4,l.by+4,l.boardSize-8,l.boardSize-8,Math.max(5,radius-3));
    for (let i=0;i<64;i++) {
      const r=Math.floor(i/8), c=i%8, x=l.x0+c*l.step, y=l.y0+r*l.step, cellW=l.cell;
      scene.tileG.fillStyle(0x1b2342,.74); scene.tileG.fillRoundedRect(x,y,cellW,cellW,Math.max(4,cellW*.15));
      scene.tileG.lineStyle(1,0x9baaff,.12); scene.tileG.strokeRoundedRect(x+.5,y+.5,cellW-1,cellW-1,Math.max(4,cellW*.15));
      const cell=s.cells[i];
      if (!cell) {
        scene.tileG.fillStyle(0x030716,.38); scene.tileG.fillRoundedRect(x+2,y+2,cellW-4,cellW-4,Math.max(3,cellW*.12));
        continue;
      }
    }

    const live = new Set();
    for (let i=0;i<64;i++) {
      const cell=s.cells[i]; if (!cell) continue;
      const r=Math.floor(i/8), c=i%8, x=l.x0+c*l.step+l.cell/2, y=l.y0+r*l.step+l.cell/2;
      const uid=String(cell.uid);
      let node=scene.gemNodes.get(uid), isNew=!node;
      if (!node) {
        const gfx=scene.add.graphics();
        const container=scene.add.container(x,y,[gfx]);
        const badge=scene.add.text(0,0,'',{fontFamily:'Arial, sans-serif',fontSize:'12px',fontStyle:'bold',color:'#ffffff',stroke:'#16142d',strokeThickness:2,align:'center'}).setOrigin(.5).setVisible(false);
        container.add(badge);
        node={gfx,badge,container, color:cell.color, x, y}; scene.gemNodes.set(uid,node);
        if (animate) { container.setAlpha(0); container.setScale(.48); }
      }
      live.add(uid);
      const fromX=node.container.x, fromY=node.container.y;
      drawGem(scene,node,cell,x,y,l.cell*.46,s.selected===i);
      node.color=cell.color; node.x=x; node.y=y;
      if (animate && !isNew && (Math.abs(fromX-x)+Math.abs(fromY-y)>1)) {
        scene.tweens.add({targets:node.container,x,y,duration:190,ease:'Back.Out'});
      } else if (animate && isNew) {
        node.container.setPosition(x,y);
        scene.tweens.add({targets:node.container,alpha:1,scale:1,duration:260,ease:'Back.Out',delay:Math.min(110,(i%8)*8)});
      } else { node.container.setPosition(x,y); node.container.setAlpha(1); node.container.setScale(1); }
      if (s.ice[i]) {
        scene.overlayG.fillStyle(0x9ceeff,.13); scene.overlayG.fillRoundedRect(x-l.cell*.43,y-l.cell*.43,l.cell*.86,l.cell*.86,Math.max(4,l.cell*.14));
        scene.overlayG.lineStyle(Math.max(1,l.cell*.025),0xc8f5ff,.6); scene.overlayG.strokeRoundedRect(x-l.cell*.43,y-l.cell*.43,l.cell*.86,l.cell*.86,Math.max(4,l.cell*.14));
        scene.overlayG.lineStyle(Math.max(1,l.cell*.018),0xe8fbff,.48); scene.overlayG.beginPath();scene.overlayG.moveTo(x-l.cell*.2,y-l.cell*.26);scene.overlayG.lineTo(x+l.cell*.08,y+l.cell*.02);scene.overlayG.lineTo(x-l.cell*.06,y+l.cell*.28);scene.overlayG.strokePath();
        if (Number(s.ice[i])>1) { scene.overlayG.fillStyle(0x132c4c,.95);scene.overlayG.fillCircle(x+l.cell*.30,y-l.cell*.30,l.cell*.14); }
      }
      if (s.sigils[i]) {
        scene.overlayG.fillStyle(0x17132c,.94);scene.overlayG.fillCircle(x-l.cell*.30,y-l.cell*.30,l.cell*.17);
        scene.overlayG.lineStyle(Math.max(1,l.cell*.025),0xc6a7ff,.88);scene.overlayG.strokeCircle(x-l.cell*.30,y-l.cell*.30,l.cell*.17);
        scene.overlayG.lineStyle(Math.max(1,l.cell*.024),0xf0dbff,.9);scene.overlayG.beginPath();scene.overlayG.moveTo(x-l.cell*.39,y-l.cell*.31);scene.overlayG.lineTo(x-l.cell*.30,y-l.cell*.40);scene.overlayG.lineTo(x-l.cell*.21,y-l.cell*.31);scene.overlayG.lineTo(x-l.cell*.30,y-l.cell*.22);scene.overlayG.closePath();scene.overlayG.strokePath();
      }
      if (cell.relic) {
        scene.overlayG.fillStyle(0xffed9c,.95);scene.overlayG.fillCircle(x+l.cell*.31,y+l.cell*.29,l.cell*.095);
        scene.overlayG.lineStyle(Math.max(1,l.cell*.025),0xfff7d1,.95);scene.overlayG.strokeCircle(x+l.cell*.31,y+l.cell*.29,l.cell*.14);
      }
      if (cell.echo) {
        scene.overlayG.lineStyle(Math.max(1,l.cell*.025),0x8ff9f0,.9);scene.overlayG.strokeCircle(x-l.cell*.30,y+l.cell*.30,l.cell*.105);
        scene.overlayG.lineStyle(Math.max(1,l.cell*.018),0xe5ffff,.85);scene.overlayG.beginPath();scene.overlayG.moveTo(x-l.cell*.30,y+l.cell*.18);scene.overlayG.lineTo(x-l.cell*.30,y+l.cell*.42);scene.overlayG.moveTo(x-l.cell*.42,y+l.cell*.30);scene.overlayG.lineTo(x-l.cell*.18,y+l.cell*.30);scene.overlayG.strokePath();
      }
    }

    // Remove spent gems with a tiny burst, without replacing the authoritative game-state logic.
    for (const [uid,node] of Array.from(scene.gemNodes.entries())) {
      if (live.has(uid)) continue;
      if (animate && node.container.visible && node.container.alpha>.05) {
        spawnBurst(scene,node.container.x,node.container.y,node.color);
        scene.tweens.add({targets:node.container,alpha:0,scale:.22,duration:155,ease:'Cubic.In',onComplete:()=>{node.container.destroy();}});
      } else { try { node.container.destroy(); } catch (_) {} }
      scene.gemNodes.delete(uid);
    }
    scene.lastPositions.clear();
    for (const [uid,node] of scene.gemNodes.entries()) scene.lastPositions.set(uid,{x:node.container.x,y:node.container.y,color:node.color});

    if (s.selected >= 0 && s.selected < 64) {
      const rr=Math.floor(s.selected/8),cc=s.selected%8,x=l.x0+cc*l.step+l.cell/2,y=l.y0+rr*l.step+l.cell/2;
      scene.selectionG.lineStyle(Math.max(2,l.cell*.055),0xd7ff52,.8);scene.selectionG.strokeRoundedRect(x-l.cell*.46,y-l.cell*.46,l.cell*.92,l.cell*.92,Math.max(6,l.cell*.19));
    }
    if (scene.focusIndex !== undefined && target.viewport === document.activeElement) {
      const rr=Math.floor(scene.focusIndex/8),cc=scene.focusIndex%8,x=l.x0+cc*l.step+l.cell/2,y=l.y0+rr*l.step+l.cell/2;
      scene.selectionG.lineStyle(Math.max(1,l.cell*.022),0xffffff,.25);scene.selectionG.strokeRoundedRect(x-l.cell*.49,y-l.cell*.49,l.cell*.98,l.cell*.98,Math.max(6,l.cell*.19));
    }
    if (s.paused || s.ended) {
      scene.overlayG.fillStyle(0x070b18,.20);scene.overlayG.fillRoundedRect(l.bx,l.by,l.boardSize,l.boardSize,radius);
    }
    // Draw breakable blockers above the crystal layer, while keeping the crystal visible underneath.
    const bg = scene.blockG;
    if (bg) {
      bg.clear();
      for (const block of (Array.isArray(s.blocks) ? s.blocks : [])) {
        if (!block || block.hp <= 0 || block.index < 0 || block.index >= 64) continue;
        const row=Math.floor(block.index/8), col=block.index%8, x=l.x0+col*l.step+2, y=l.y0+row*l.step+2, w=l.cell-4;
        const palette = block.kind==='boss' ? [0x56316f,0xffdcff] : block.kind==='prism' ? [0x3b2c69,0xd7c0ff] : block.kind==='blast' ? [0x672d32,0xffb08c] : block.kind==='treasure' ? [0x72531d,0xffe79b] : block.kind==='armor' ? [0x364b5e,0xdcecff] : [0x5b412c,0xf4c68e];
        bg.fillStyle(palette[0], .44); bg.fillRoundedRect(x,y,w,w,Math.max(4,w*.14));
        bg.lineStyle(Math.max(1,w*.035),palette[1],.92); bg.strokeRoundedRect(x+.5,y+.5,w-1,w-1,Math.max(4,w*.14));
        bg.lineStyle(Math.max(1,w*.024),0xffffff,.38);
        if (block.kind==='armor') { bg.beginPath();bg.moveTo(x+w*.24,y+w*.24);bg.lineTo(x+w*.76,y+w*.24);bg.lineTo(x+w*.70,y+w*.62);bg.lineTo(x+w*.5,y+w*.79);bg.lineTo(x+w*.30,y+w*.62);bg.closePath();bg.strokePath(); }
        else if (block.kind==='prism') { bg.beginPath();bg.moveTo(x+w*.5,y+w*.19);bg.lineTo(x+w*.80,y+w*.5);bg.lineTo(x+w*.5,y+w*.81);bg.lineTo(x+w*.2,y+w*.5);bg.closePath();bg.strokePath();bg.fillStyle([0xb18aff,0x66c8ff,0x4ce0b2,0xffc56c,0xff719e,0xaabde9,0xf5df65][block.color||0],.8);bg.fillCircle(x+w*.5,y+w*.5,w*.10); }
        else if (block.kind==='blast') { bg.strokeCircle(x+w*.5,y+w*.5,w*.20); for(let k=0;k<8;k++){const a=Math.PI*k/4;bg.beginPath();bg.moveTo(x+w*.5+Math.cos(a)*w*.26,y+w*.5+Math.sin(a)*w*.26);bg.lineTo(x+w*.5+Math.cos(a)*w*.38,y+w*.5+Math.sin(a)*w*.38);bg.strokePath();} }
        else if (block.kind==='treasure') { bg.beginPath();bg.moveTo(x+w*.5,y+w*.22);bg.lineTo(x+w*.73,y+w*.5);bg.lineTo(x+w*.5,y+w*.78);bg.lineTo(x+w*.27,y+w*.5);bg.closePath();bg.strokePath(); }
        else if (block.kind==='boss') { bg.strokeCircle(x+w*.5,y+w*.5,w*.27);bg.strokeCircle(x+w*.5,y+w*.5,w*.14);bg.beginPath();bg.moveTo(x+w*.5,y+w*.15);bg.lineTo(x+w*.5,y+w*.85);bg.moveTo(x+w*.15,y+w*.5);bg.lineTo(x+w*.85,y+w*.5);bg.strokePath(); }
        else { bg.beginPath();bg.moveTo(x+w*.18,y+w*.25);bg.lineTo(x+w*.82,y+w*.25);bg.moveTo(x+w*.18,y+w*.48);bg.lineTo(x+w*.82,y+w*.48);bg.moveTo(x+w*.18,y+w*.71);bg.lineTo(x+w*.82,y+w*.71);bg.strokePath(); }
        // Durability pips in the top-right corner make reinforced targets instantly readable.
        for (let p=0;p<Math.min(3,block.hp);p++){bg.fillStyle(0x111827,.96);bg.fillCircle(x+w*.76-p*w*.13,y+w*.16,Math.max(1.5,w*.045));bg.fillStyle(palette[1],1);bg.fillCircle(x+w*.76-p*w*.13,y+w*.16,Math.max(1,w*.025));}
      }
      try { scene.children.bringToTop(bg); if (scene.selectionG) scene.children.bringToTop(scene.selectionG); } catch (_) {}
    }
  }

  function spawnBurst(scene,x,y,colorIndex) {
    const palette=colors[colorIndex]||colors[0];
    for(let i=0;i<5;i++){
      const dot=scene.add.circle(x,y,Math.max(1.4,scene.boardLayout.cell*.035),i%2?palette.a:palette.b,.92);
      const angle=(Math.PI*2*i/5)+(Math.random()-.5)*.45,dist=scene.boardLayout.cell*(.42+Math.random()*.32);
      scene.tweens.add({targets:dot,x:x+Math.cos(angle)*dist,y:y+Math.sin(angle)*dist,alpha:0,scale:.18,duration:260+Math.random()*100,ease:'Cubic.Out',onComplete:()=>dot.destroy()});
    }
  }

  function checkBoard() {
    if (checkQueued) return;
    checkQueued = true;
    Promise.resolve().then(() => {
      checkQueued = false;
      const found = locateBoard();
      if (!found) { if (active) teardown(); failedBoard = null; return; }
      if (failedBoard === found.board) return;
      if (!active || active.board !== found.board) mountBoard(found);
      else positionViewport(active);
    });
  }

  window.__TODAY_CRYSTAL_PHASER = {
    version: '3.0.0',
    renderer: 'phaser-4.2.1-blocks-v3',
    update(run, animate=true) {
      latest = snapshot(run);
      if (active && active.scene && latest) {
        try { active.scene.drawBoard(latest, !!animate); }
        catch (error) { warnFallback(error); }
      }
    },
    stop: teardown,
    status: () => ({version:'3.0.0', phaser:phaserState, mounted:!!active, ready:!!(active && active.created)})
  };

  const observer = new MutationObserver(checkBoard);
  if (document.body) observer.observe(document.body, {childList:true,subtree:true});
  const modalNode = document.getElementById('modal');
  if (modalNode) new MutationObserver(checkBoard).observe(modalNode, {attributes:true,attributeFilter:['class']});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',checkBoard,{once:true});
  else checkBoard();
})();
