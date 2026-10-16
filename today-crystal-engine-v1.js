/* TODAY CRYSTAL ENGINE V3 — WILDCARDS + SPECIAL COMBOS */
(function (global) {
  'use strict';
  if (global.TODAY_CRYSTAL_ENGINE_V1 &&
      global.TODAY_CRYSTAL_ENGINE_V1.version === '3.0.0') return;

  const N = 8;
  const COLORS = [0,1,2,3,4,5,6];
  const validIndex = i => Number.isInteger(i) && i >= 0 && i < 64;
  const hasColor = cell => cell && Number.isInteger(cell.color);
  const isWildcard = cell => !!cell?._worldWildcard;

  function wallBetween(cells, a, b, axis) {
    if (axis === 'h') {
      const right = Math.max(a, b);
      return !!cells[right]?._worldWallLeft;
    }
    const bottom = Math.max(a, b);
    return !!cells[bottom]?._worldWallUp;
  }

  function findMatches(cells) {
    if (!Array.isArray(cells) || cells.length !== 64) {
      throw new TypeError('Crystal board must contain 64 cells');
    }

    const found = new Set();
    const groups = [];
    const groupKeys = new Set();

    function addGroup(indices, axis, color) {
      if (indices.length < 3) return;
      const sorted = [...indices].sort((a, b) => a - b);
      const key = axis + ':' + sorted.join(',');
      if (groupKeys.has(key)) return;
      groupKeys.add(key);
      groups.push({
        indices: sorted,
        axis,
        color,
        length: sorted.length
      });
      sorted.forEach(i => found.add(i));
    }

    function scanLine(indices, axis) {
      for (const color of COLORS) {
        let run = [];

        const flush = () => {
          if (run.length >= 3) addGroup(run, axis, color);
          run = [];
        };

        for (const i of indices) {
          const cell = cells[i];
          const usable = hasColor(cell) &&
            (isWildcard(cell) || cell.color === color);

          if (!usable) {
            flush();
            continue;
          }

          if (
            run.length &&
            wallBetween(cells, run[run.length - 1], i, axis)
          ) {
            flush();
          }
          run.push(i);
        }
        flush();
      }
    }

    for (let r = 0; r < N; r++) {
      scanLine(Array.from({length:N}, (_,c) => r*N+c), 'h');
    }
    for (let c = 0; c < N; c++) {
      scanLine(Array.from({length:N}, (_,r) => r*N+c), 'v');
    }

    // A 2x2 block of the same colour creates a plane.
    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const indices = [
          r*N+c, r*N+c+1,
          (r+1)*N+c, (r+1)*N+c+1
        ];
        const tiles = indices.map(i => cells[i]);
        if (!tiles.every(hasColor)) continue;

        const candidates = tiles
          .filter(tile => !isWildcard(tile))
          .map(tile => tile.color);
        const colours = candidates.length ? [...new Set(candidates)] : COLORS;

        const colour = colours.find(value =>
          tiles.every(tile => isWildcard(tile) || tile.color === value)
        );

        if (colour !== undefined) {
          addGroup(indices, 'sq', colour);
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

    for (const h of horizontal) {
      for (const v of vertical) {
        const crossing = h.indices.find(i => v.indices.includes(i));
        if (crossing !== undefined) {
          return {
            type:'bomb',
            index:crossing,
            indices:[...new Set([...h.indices,...v.indices])],
            label:'КРИСТАЛЛЬНАЯ БОМБА',
            glyph:'✹'
          };
        }
      }
    }

    const square = groups.find(g => g.axis === 'sq');
    if (square) {
      const chosen = Array.isArray(preferred)
        ? preferred.find(i => square.indices.includes(i))
        : undefined;
      return {
        type:'plane',
        index:chosen !== undefined ? chosen : square.indices[2],
        indices:square.indices.slice(),
        label:'КРИСТАЛЛЬНЫЙ САМОЛЁТ',
        glyph:'✈'
      };
    }

    const sorted = groups
      .filter(g => g.axis === 'h' || g.axis === 'v')
      .sort((a,b) => b.length - a.length);

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

    const labels = {
      nova:['ЗВЁЗДНОЕ ЯДРО','✹'],
      rainbow:['ПРИЗМЕННОЕ СЕРДЦЕ','✺'],
      'rocket-h':['ГОРИЗОНТАЛЬНАЯ РАКЕТА','➜'],
      'rocket-v':['ВЕРТИКАЛЬНАЯ РАКЕТА','⬆']
    };

    const chosen = Array.isArray(preferred)
      ? preferred.find(i => group.indices.includes(i))
      : undefined;

    return {
      type,
      index:chosen !== undefined
        ? chosen
        : group.indices[Math.floor((group.indices.length - 1) / 2)],
      indices:group.indices.slice(),
      label:labels[type][0],
      glyph:labels[type][1]
    };
  }

  function mostFrequentColor(cells) {
    const counts = new Map();
    for (const cell of cells) {
      if (hasColor(cell)) {
        counts.set(cell.color, (counts.get(cell.color) || 0) + 1);
      }
    }
    let best = null, bestCount = -1;
    for (const [color,count] of counts) {
      if (count > bestCount) {
        best = color;
        bestCount = count;
      }
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

    const clear = new Set();
    const queue = [];
    const activated = new Set();
    const input = [...new Set(
      (Array.isArray(seeds) ? seeds : []).filter(validIndex)
    )];

    const add = i => {
      if (!validIndex(i) || i === protectedIndex || clear.has(i)) return;
      clear.add(i);
      queue.push(i);
    };

    input.forEach(add);

    if (superCombo) {
      for (let i = 0; i < 64; i++) add(i);
      return [...clear];
    }

    function connected(a, b) {
      const ar = Math.floor(a/8), ac = a%8;
      const br = Math.floor(b/8), bc = b%8;
      if (Math.abs(ar-br) + Math.abs(ac-bc) !== 1) return false;
      if (ar === br) return !wallBetween(cells,a,b,'h');
      return !wallBetween(cells,a,b,'v');
    }

    function addRow(r, center) {
      add(center);
      for (let c = center%8+1; c < 8; c++) {
        const a = r*8+c-1, b = r*8+c;
        if (!connected(a,b)) break;
        add(b);
      }
      for (let c = center%8-1; c >= 0; c--) {
        const a = r*8+c+1, b = r*8+c;
        if (!connected(a,b)) break;
        add(b);
      }
    }

    function row(r) {
      const start = r*8;
      for (let c=0;c<8;c++) {
        if (c && !connected(start+c-1,start+c)) {
          continue;
        }
        add(start+c);
      }
    }

    function column(c) {
      for (let r=0;r<8;r++) {
        const i=r*8+c;
        if (r && !connected((r-1)*8+c,i)) continue;
        add(i);
      }
    }

    function lineRow(r) {
      for (let c=0;c<8;c++) {
        const i=r*8+c;
        if (c && !connected(i-1,i)) {
          // The current cell starts a new, separate board segment.
        }
        add(i);
      }
    }

    function radius(center,range) {
      const r=Math.floor(center/8), c=center%8;
      for(let dr=-range;dr<=range;dr++) {
        for(let dc=-range;dc<=range;dc++) {
          const rr=r+dr, cc=c+dc;
          if(rr<0||rr>=8||cc<0||cc>=8)continue;
          const i=rr*8+cc;
          if(i===center) { add(i); continue; }

          // Do not let a blast cross a closed wall.
          const mr=Math.abs(dr), mc=Math.abs(dc);
          let pathOk=false;

          if(mr===0) pathOk=connected(center,i);
          else if(mc===0) pathOk=connected(center,i);
          else {
            const viaA=(r+dr)*8+c;
            const viaB=r*8+(c+dc);
            pathOk=(
              connected(center,viaA)&&connected(viaA,i)
            )||(
              connected(center,viaB)&&connected(viaB,i)
            );
          }
          if(pathOk)add(i);
        }
      }
    }

    function chooseTarget(source) {
      const candidates = cells
        .map((cell,i)=>({
          i,
          priority:Number(cell?._worldPriority||0)
        }))
        .filter(x=>cells[x.i]&&x.i!==source)
        .sort((a,b)=>b.priority-a.priority||a.i-b.i);

      if(!candidates.length)return source;
      if(candidates[0].priority>0)return candidates[0].i;
      return candidates[(source*13+17)%candidates.length].i;
    }

    function rainbowColor(source, requested) {
      if(Number.isInteger(requested))return requested;
      return mostFrequentColor(cells) ?? cells[source]?.color;
    }

    function activate(i,type,requestedColor) {
      if(!validIndex(i)||activated.has(i))return;
      activated.add(i);

      const r=Math.floor(i/8), c=i%8;

      if(type==='rocket-h') {
        lineRow(r);
        return;
      }
      if(type==='rocket-v') {
        column(c);
        return;
      }
      if(type==='bomb') {
        radius(i,1);
        return;
      }
      if(type==='nova') {
        radius(i,1);
        lineRow(r);
        column(c);
        return;
      }
      if(type==='rainbow') {
        const color=rainbowColor(i,requestedColor);
        if(Number.isInteger(color)) {
          for(let j=0;j<64;j++) {
            if(cells[j]&&(cells[j].color===color||cells[j]._worldWildcard))add(j);
          }
        }
        return;
      }
      if(type==='plane') {
        const target=chooseTarget(i);
        add(target);
        const tr=Math.floor(target/8), tc=target%8;
        lineRow(tr);
        column(tc);
      }
    }

    const specialSeeds=input.filter(i=>cells[i]?.special);
    const specialSet=new Set(specialSeeds);

    if(specialSeeds.length>=2) {
      const a=specialSeeds[0], b=specialSeeds[1];
      const ta=cells[a]?.special, tb=cells[b]?.special;
      const rainbowA=ta==='rainbow', rainbowB=tb==='rainbow';

      if(rainbowA&&rainbowB) {
        for(let i=0;i<64;i++)add(i);
      } else if(rainbowA||rainbowB) {
        const other=rainbowA?b:a;
        const type=cells[other]?.special;
        const color=cells[other]?.color;
        for(let i=0;i<64;i++) {
          if(cells[i]&&cells[i].color===color) {
            add(i);
            activate(i,type,color);
          }
        }
      } else if (
        (ta==='rocket-h'||ta==='rocket-v') &&
        (tb==='rocket-h'||tb==='rocket-v')
      ) {
        lineRow(Math.floor(a/8));
        column(a%8);
        lineRow(Math.floor(b/8));
        column(b%8);
      } else if (
        (ta==='bomb'&&(tb==='rocket-h'||tb==='rocket-v')) ||
        (tb==='bomb'&&(ta==='rocket-h'||ta==='rocket-v'))
      ) {
        const bomb=ta==='bomb'?a:b;
        const r=Math.floor(bomb/8), c=bomb%8;
        for(let dr=-1;dr<=1;dr++) {
          for(let dc=-1;dc<=1;dc++) {
            const rr=r+dr, cc=c+dc;
            if(rr>=0&&rr<8&&cc>=0&&cc<8) {
              lineRow(rr);
              column(cc);
            }
          }
        }
      } else if(ta==='bomb'&&tb==='bomb') {
        radius(a,2);
        radius(b,2);
      } else if(ta==='plane'&&tb==='plane') {
        const targets=cells
          .map((cell,i)=>({
            i,
            priority:Number(cell?._worldPriority||0)
          }))
          .filter(x=>cells[x.i]&&x.i!==a&&x.i!==b)
          .sort((x,y)=>y.priority-x.priority||x.i-y.i)
          .slice(0,3);

        for(const target of targets) {
          add(target.i);
          lineRow(Math.floor(target.i/8));
          column(target.i%8);
        }
      } else {
        activate(a,ta,targetColor);
        activate(b,tb,targetColor);
      }
    }

    let cursor=0;
    while(cursor<queue.length&&cursor<4096) {
      const i=queue[cursor++];
      const type=cells[i]?.special;
      if(!type||activated.has(i))continue;
      if(specialSeeds.length>=2&&specialSet.has(i))continue;
      activate(i,type,targetColor);
    }

    return [...clear];
  }

  function hasValidMove(cells) {
    if(!Array.isArray(cells)||cells.length!==64)return false;

    for(let i=0;i<64;i++) {
      const candidates=[i%8<7?i+1:-1,i<56?i+8:-1];
      for(const j of candidates) {
        if(j<0)continue;
        if(wallBetween(cells,i,j,j===i+1?'h':'v'))continue;
        const a=cells[i], b=cells[j];
        cells[i]=b; cells[j]=a;
        let ok=false;
        try { ok=findMatches(cells).length>0; }
        finally { cells[i]=a; cells[j]=b; }
        if(ok)return true;
      }
    }
    return false;
  }

  function selfTest() {
    const results=[];
    const record=(name,ok,detail='')=>
      results.push({name,ok:!!ok,detail:String(detail||'')});

    try {
      const cells=Array(64).fill(null);
      [0,1,2].forEach(i=>cells[i]={color:1});
      record('Линия из трёх',findMatches(cells).length===3);
    } catch(e) {
      record('Линия из трёх',false,e.message);
    }

    try {
      const cells=Array(64).fill(null);
      cells[0]={color:1};cells[1]={color:1};
      cells[2]={color:4,_worldWildcard:true};
      record('Джокер соединяет разные цвета',
        findMatches(cells).includes(2));
    } catch(e) {
      record('Джокер соединяет разные цвета',false,e.message);
    }

    try {
      const cells=Array(64).fill(null);
      [0,1,8,9].forEach(i=>cells[i]={color:3});
      record('Квадрат 2x2 создаёт самолёт',
        specialPlan(findMatches(cells))?.type==='plane');
    } catch(e) {
      record('Квадрат 2x2 создаёт самолёт',false,e.message);
    }

    try {
      const cells=Array(64).fill(null);
      [26,27,28,19,35].forEach(i=>cells[i]={color:2});
      const plan=specialPlan(findMatches(cells));
      record('Пересечение создаёт бомбу',
        plan?.type==='bomb'&&plan.index===27);
    } catch(e) {
      record('Пересечение создаёт бомбу',false,e.message);
    }

    try {
      const cells=Array(64).fill(null);
      cells[27]={color:1,special:'bomb'};
      record('Бомба 3x3',
        expandSpecialClear(cells,[27]).length===9);
    } catch(e) {
      record('Бомба 3x3',false,e.message);
    }

    try {
      const cells=Array(64).fill(null);
      cells[27]={color:1,special:'bomb'};
      cells[28]={color:2,special:'rocket-h'};
      record('Комбинация бомба + ракета',
        expandSpecialClear(cells,[27,28]).length>=25);
    } catch(e) {
      record('Комбинация бомба + ракета',false,e.message);
    }

    try {
      const cells=Array.from({length:64},(_,i)=>({
        color:i===27?5:1,
        special:i===27?'rainbow':null
      }));
      record('Радуга находит самый частый цвет',
        expandSpecialClear(cells,[27]).length>=63);
    } catch(e) {
      record('Радуга находит самый частый цвет',false,e.message);
    }

    try {
      const cells=Array.from({length:64},(_,i)=>({
        color:(Math.floor(i/8)+i%8)%2
      }));
      const before=JSON.stringify(cells);
      const value=hasValidMove(cells);
      record('Проверка хода не портит поле',
        typeof value==='boolean'&&before===JSON.stringify(cells));
    } catch(e) {
      record('Проверка хода не портит поле',false,e.message);
    }

    return {
      ok:results.length>0&&results.every(x=>x.ok),
      results
    };
  }

  const api=Object.freeze({
    version:'3.0.0',
    engine:'TODAY Crystal Rules Core V3',
    findMatches,
    specialPlan,
    expandSpecialClear,
    hasValidMove,
    selfTest
  });

  global.TODAY_CRYSTAL_ENGINE_V1=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
