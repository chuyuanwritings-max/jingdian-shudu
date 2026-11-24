// 数独规则层：不画图，Node 里也能跑（tools/gen-puzzles.js 出题库、test/ 里查题）。
// 核心是「按技巧解题」的解题器：每一步都从最简单的招开始试，用到的最难一招 = 这道题的难度。
// 同一个解题器也给游戏里的「提示」用：它找到的下一步，就是告诉玩家的那一步。

// ---------- 格子、单元（行 / 列 / 宫） ----------
const ROW = (k) => (k / 9) | 0;
const COL = (k) => k % 9;
const BOX = (k) => ((ROW(k) / 3) | 0) * 3 + ((COL(k) / 3) | 0);
const UNITS = []; // 0–8 行，9–17 列，18–26 宫
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
for (let b = 0; b < 9; b++) {
  const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3;
  UNITS.push(Array.from({ length: 9 }, (_, i) => (br + ((i / 3) | 0)) * 9 + bc + (i % 3)));
}
const UNITS_OF = Array.from({ length: 81 }, (_, k) => [ROW(k), 9 + COL(k), 18 + BOX(k)]);
const PEERS = Array.from({ length: 81 }, (_, k) => {
  const s = new Set([].concat(UNITS[ROW(k)], UNITS[9 + COL(k)], UNITS[18 + BOX(k)]));
  s.delete(k);
  return Array.from(s);
});
const ALL = 0x3fe; // 第 1–9 位
const bit = (v) => 1 << v;
const popcount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const digits = (m) => { const out = []; for (let v = 1; v <= 9; v++) if (m & bit(v)) out.push(v); return out; };
const unitKind = (u) => (u < 9 ? 'row' : u < 18 ? 'col' : 'box');
const UNIT_NAME = { row: '行', col: '列', box: '宫' };

// ---------- 难度档 ----------
// 档号 = 解题时用到的最难一招所在的档
const TIERS = [
  { id: 'beginner', name: '入门' },
  { id: 'easy', name: '简单' },
  { id: 'medium', name: '中等' },
  { id: 'hard', name: '困难' },
  { id: 'expert', name: '专家' },
  { id: 'master', name: '大师' },
];
const TECH = {
  fullHouse: { level: 0, name: '最后一格' },
  hiddenBox: { level: 0, name: '排除法' },
  hiddenLine: { level: 1, name: '排除法' },
  nakedSingle: { level: 1, name: '唯一候选' },
  pointing: { level: 2, name: '区块排除' },
  claiming: { level: 2, name: '区块排除' },
  nakedPair: { level: 3, name: '显性数对' },
  hiddenPair: { level: 3, name: '隐性数对' },
  nakedTriple: { level: 4, name: '显性三数组' },
  hiddenTriple: { level: 4, name: '隐性三数组' },
  xWing: { level: 4, name: 'X-Wing' },
  xyWing: { level: 5, name: 'XY-Wing' },
  swordfish: { level: 5, name: '剑鱼' },
};

// ---------- 解题状态 ----------
// g：81 格的数（0 = 空）；c：每个空格还可能是哪些数（位掩码）
function makeState(grid) {
  const g = grid.slice();
  const c = new Array(81).fill(0);
  for (let k = 0; k < 81; k++) {
    if (g[k]) continue;
    let m = ALL;
    for (const p of PEERS[k]) if (g[p]) m &= ~bit(g[p]);
    c[k] = m;
  }
  return { g, c };
}
function place(st, k, v) {
  st.g[k] = v;
  st.c[k] = 0;
  const b = ~bit(v);
  for (const p of PEERS[k]) st.c[p] &= b;
}
function applyStep(st, step) {
  if (step.place) place(st, step.place.k, step.place.v);
  if (step.elim) for (const e of step.elim) st.c[e.k] &= ~e.m;
}

// 一个单元里，数 v 还能放在哪几格
function spots(st, u, v) {
  const out = [];
  for (const k of UNITS[u]) if (!st.g[k] && st.c[k] & bit(v)) out.push(k);
  return out;
}
function unitHas(st, u, v) {
  for (const k of UNITS[u]) if (st.g[k] === v) return true;
  return false;
}
// 把「要删掉的候选」整理成 [{k, m}]，一个都删不掉就返回 null
function elims(st, cells, mask, except) {
  const out = [];
  for (const k of cells) {
    if (except && except.indexOf(k) >= 0) continue;
    if (!st.g[k] && st.c[k] & mask) out.push({ k, m: st.c[k] & mask });
  }
  return out.length ? out : null;
}

// ---------- 各招 ----------
function fullHouse(st) {
  for (let u = 0; u < 27; u++) {
    let empty = -1, n = 0, used = 0;
    for (const k of UNITS[u]) { if (st.g[k]) used |= bit(st.g[k]); else { n++; empty = k; } }
    if (n === 1) {
      const v = digits(ALL & ~used)[0];
      if (v && st.c[empty] & bit(v)) return { tech: 'fullHouse', unit: u, place: { k: empty, v }, cells: UNITS[u] };
    }
  }
  return null;
}
function hiddenSingle(st, from, to, tech) {
  for (let u = from; u < to; u++) {
    for (let v = 1; v <= 9; v++) {
      if (unitHas(st, u, v)) continue;
      const s = spots(st, u, v);
      if (s.length === 1) return { tech, unit: u, place: { k: s[0], v }, cells: UNITS[u], digit: v };
    }
  }
  return null;
}
function nakedSingle(st) {
  for (let k = 0; k < 81; k++) {
    if (!st.g[k] && popcount(st.c[k]) === 1) return { tech: 'nakedSingle', place: { k, v: digits(st.c[k])[0] }, cells: PEERS[k].concat([k]) };
  }
  return null;
}
// 区块排除：宫里 v 只在同一行（列）→ 这一行（列）在别的宫里不能是 v；反过来也一样
function lockedCandidates(st) {
  for (let b = 18; b < 27; b++) {
    for (let v = 1; v <= 9; v++) {
      const s = spots(st, b, v);
      if (s.length < 2) continue;
      for (const line of [ROW, COL]) {
        const l0 = line(s[0]);
        if (s.every((k) => line(k) === l0)) {
          const u = line === ROW ? l0 : 9 + l0;
          const e = elims(st, UNITS[u], bit(v), UNITS[b]);
          if (e) return { tech: 'pointing', unit: b, unit2: u, digit: v, elim: e, cells: UNITS[b], focus: s };
        }
      }
    }
  }
  for (let u = 0; u < 18; u++) {
    for (let v = 1; v <= 9; v++) {
      const s = spots(st, u, v);
      if (s.length < 2) continue;
      const b0 = BOX(s[0]);
      if (s.every((k) => BOX(k) === b0)) {
        const e = elims(st, UNITS[18 + b0], bit(v), UNITS[u]);
        if (e) return { tech: 'claiming', unit: u, unit2: 18 + b0, digit: v, elim: e, cells: UNITS[u], focus: s };
      }
    }
  }
  return null;
}
// 显性 n 数组：n 格的候选合起来只有 n 个数 → 同单元别的格删掉这些数
function nakedSubset(st, n, tech) {
  for (let u = 0; u < 27; u++) {
    const empty = UNITS[u].filter((k) => !st.g[k] && popcount(st.c[k]) <= n && popcount(st.c[k]) >= 2);
    const found = combos(empty, n, (set) => {
      let m = 0;
      for (const k of set) m |= st.c[k];
      if (popcount(m) !== n) return null;
      const e = elims(st, UNITS[u], m, set);
      return e ? { tech, unit: u, elim: e, cells: UNITS[u], focus: set, digits: digits(m) } : null;
    });
    if (found) return found;
  }
  return null;
}
// 隐性 n 数组：n 个数在这个单元里只出现在同样 n 格 → 这 n 格删掉别的数
function hiddenSubset(st, n, tech) {
  for (let u = 0; u < 27; u++) {
    const ds = [];
    for (let v = 1; v <= 9; v++) {
      if (unitHas(st, u, v)) continue;
      const s = spots(st, u, v);
      if (s.length >= 2 && s.length <= n) ds.push(v);
    }
    const found = combos(ds, n, (vs) => {
      const cells = new Set();
      let m = 0;
      for (const v of vs) { m |= bit(v); for (const k of spots(st, u, v)) cells.add(k); }
      if (cells.size !== n) return null;
      const set = Array.from(cells);
      const e = [];
      for (const k of set) if (st.c[k] & ~m) e.push({ k, m: st.c[k] & ~m });
      return e.length ? { tech, unit: u, elim: e, cells: UNITS[u], focus: set, digits: vs } : null;
    });
    if (found) return found;
  }
  return null;
}
// 鱼（X-Wing = 2，剑鱼 = 3）：v 在 n 行里都只出现在同样 n 列 → 这 n 列别的行删掉 v（行列互换也一样）
function fish(st, n, tech) {
  for (let v = 1; v <= 9; v++) {
    for (const [base, cover] of [[0, 9], [9, 0]]) {
      const lines = [];
      for (let i = 0; i < 9; i++) {
        const s = spots(st, base + i, v);
        if (s.length >= 2 && s.length <= n) lines.push({ i, s });
      }
      const found = combos(lines, n, (set) => {
        const covers = new Set();
        for (const l of set) for (const k of l.s) covers.add(base === 0 ? COL(k) : ROW(k));
        if (covers.size !== n) return null;
        const own = [].concat(...set.map((l) => UNITS[base + l.i]));
        const e = [];
        for (const ci of covers) {
          const r = elims(st, UNITS[cover + ci], bit(v), own);
          if (r) e.push(...r);
        }
        return e.length ? { tech, digit: v, elim: e, cells: own, focus: [].concat(...set.map((l) => l.s)) } : null;
      });
      if (found) return found;
    }
  }
  return null;
}
// XY-Wing：枢纽格 {x,y}，两个钳子 {x,z}、{y,z} 都看得见枢纽 → 两个钳子都看得见的格删掉 z
function xyWing(st) {
  const bi = [];
  for (let k = 0; k < 81; k++) if (!st.g[k] && popcount(st.c[k]) === 2) bi.push(k);
  for (const p of bi) {
    const [x, y] = digits(st.c[p]);
    const wings = bi.filter((k) => k !== p && PEERS[p].indexOf(k) >= 0);
    for (const a of wings) {
      if (!(st.c[a] & bit(x)) || st.c[a] & bit(y)) continue;
      const z = digits(st.c[a] & ~bit(x))[0];
      for (const b of wings) {
        if (b === a || st.c[b] !== (bit(y) | bit(z))) continue;
        const common = PEERS[a].filter((k) => k !== p && PEERS[b].indexOf(k) >= 0);
        const e = elims(st, common, bit(z));
        if (e) return { tech: 'xyWing', digit: z, elim: e, cells: [p, a, b], focus: [p, a, b] };
      }
    }
  }
  return null;
}
// 从 arr 里挑 n 个的所有组合，fn 返回非 null 就停
function combos(arr, n, fn) {
  const pick = [];
  function go(i) {
    if (pick.length === n) return fn(pick.slice());
    for (let j = i; j <= arr.length - (n - pick.length); j++) {
      pick.push(arr[j]);
      const r = go(j + 1);
      pick.pop();
      if (r) return r;
    }
    return null;
  }
  return arr.length >= n ? go(0) : null;
}

// 按从易到难的顺序找下一步（最多试到 maxLevel 档的招）
const ORDER = [
  (st) => fullHouse(st),
  (st) => hiddenSingle(st, 18, 27, 'hiddenBox'),
  (st) => hiddenSingle(st, 0, 18, 'hiddenLine'),
  (st) => nakedSingle(st),
  (st) => lockedCandidates(st),
  (st) => nakedSubset(st, 2, 'nakedPair'),
  (st) => hiddenSubset(st, 2, 'hiddenPair'),
  (st) => nakedSubset(st, 3, 'nakedTriple'),
  (st) => hiddenSubset(st, 3, 'hiddenTriple'),
  (st) => fish(st, 2, 'xWing'),
  (st) => xyWing(st),
  (st) => fish(st, 3, 'swordfish'),
];
const ORDER_LEVEL = [0, 0, 1, 1, 2, 3, 3, 4, 4, 4, 5, 5];
function nextStep(st, maxLevel) {
  const max = maxLevel === undefined ? 5 : maxLevel;
  for (let i = 0; i < ORDER.length; i++) {
    if (ORDER_LEVEL[i] > max) break;
    const s = ORDER[i](st);
    if (s) { s.level = TECH[s.tech].level; return s; }
  }
  return null;
}

// 给一道题定级：一直用最简单能用的招解到底。返回 { solved, level, steps, hardSteps }
function grade(grid, maxLevel) {
  const st = makeState(grid);
  let level = 0, steps = 0, hardSteps = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (st.g.every(Boolean)) return { solved: true, level, steps, hardSteps };
    for (let k = 0; k < 81; k++) if (!st.g[k] && !st.c[k]) return { solved: false, level, steps, hardSteps };
    const s = nextStep(st, maxLevel);
    if (!s) return { solved: false, level, steps, hardSteps };
    if (s.level > level) { level = s.level; hardSteps = 0; }
    if (s.level === level) hardSteps++;
    applyStep(st, s);
    steps++;
  }
  return { solved: false, level, steps, hardSteps };
}

// ---------- 玩家这一步用的是哪一招（思维链）----------
// 招的叫法统一给玩家看（显性 / 隐性数对都叫「数对」）
const TECH_SHOW = { fullHouse: '最后一格', hiddenBox: '排除法', hiddenLine: '排除法', nakedSingle: '唯一候选', pointing: '区块排除', claiming: '区块排除',
  nakedPair: '数对', hiddenPair: '数对', nakedTriple: '三数组', hiddenTriple: '三数组', xWing: 'X-Wing', xyWing: 'XY-Wing', swordfish: '剑鱼' };
// 这一格 k 现在是不是一眼就能定下 v：最后一格 → 宫内排除 → 行列排除 → 唯一候选（从简单到难）
function singleAt(st, k, v) {
  if (st.g[k] || !(st.c[k] & bit(v))) return null;
  for (const u of UNITS_OF[k]) { let n = 0; for (const x of UNITS[u]) if (!st.g[x]) n++; if (n === 1) return { tech: 'fullHouse', unit: u, place: { k, v } }; }
  const b = UNITS_OF[k][2];
  if (spots(st, b, v).length === 1) return { tech: 'hiddenBox', unit: b, digit: v, place: { k, v } };
  for (const u of UNITS_OF[k].slice(0, 2)) if (spots(st, u, v).length === 1) return { tech: 'hiddenLine', unit: u, digit: v, place: { k, v } };
  if (popcount(st.c[k]) === 1) return { tech: 'nakedSingle', place: { k, v } };
  return null;
}
// 玩家刚把 v 填进 k（grid 里 k 还是空的）：在这个盘面上，最简单是怎么想出来的。
// 先看这一格能不能一眼定；不能就用「删候选」的招一步步推（不先填别的格），直到它能定。
// 返回 { show 招名, tech, level, chain 删候选的步骤（只留和这一格有关的）, final 最后一眼定的那一步 }；推不出来（猜的）返回 null
function explain(grid, k, v) {
  const st = makeState(grid), chain = [];
  for (let guard = 0; guard < 60; guard++) {
    const fin = singleAt(st, k, v);
    if (fin) {
      fin.level = TECH[fin.tech].level;
      // 只留和这一格有关的删除：删的是这一单元里的 v，或者删的是这一格自己
      const cellsU = fin.unit !== undefined ? UNITS[fin.unit] : [];
      const rel = chain.filter((s) => s.elim.some((e) => e.k === k || (cellsU.indexOf(e.k) >= 0 && e.m & bit(v))));
      const used = rel.length ? rel : chain.slice(-1);
      let top = fin;
      used.forEach((s) => { if (s.level > top.level) top = s; });
      return { show: TECH_SHOW[top.tech], tech: top.tech, level: top.level, chain: used, final: fin, all: chain.length };
    }
    let s = null;
    for (let i = 4; i < ORDER.length && !s; i++) s = ORDER[i](st); // 第 4 个起是删候选的招（区块排除……）
    if (!s) return null;
    s.level = TECH[s.tech].level;
    chain.push(s);
    applyStep(st, s);
  }
  return null;
}

// 「本局一招」的关键格：一直用最简单能用的招解到底，记下哪些格子是「非用这一招不可」才填得出来的。
// 填数的招（排除法、唯一候选）：解题器用它填的格子就是关键格（更简单的招都用不上时才轮到它）。
// 删候选的招（区块排除、数对）：用完它以后填出的第一格算一个关键格（就是这一招解开的那一格）。
function focusCells(grid, techs) {
  const st = makeState(grid), keys = [];
  let pending = false;
  for (let guard = 0; guard < 400 && !st.g.every(Boolean); guard++) {
    const s = nextStep(st, 5);
    if (!s) break;
    const mine = techs.indexOf(s.tech) >= 0;
    if (s.place) {
      if (mine || pending) keys.push(s.place.k);
      pending = false;
    } else if (mine) pending = true;
    applyStep(st, s);
  }
  return keys;
}

// ---------- 暴力：数解、出完整解 ----------
function candMask(g, k) {
  let m = ALL;
  for (const p of PEERS[k]) if (g[p]) m &= ~bit(g[p]);
  return m;
}
function countSolutions(g0, limit, out) {
  const g = g0.slice();
  let n = 0;
  (function go() {
    let best = -1, bm = 0, bc = 10;
    for (let k = 0; k < 81; k++) {
      if (g[k]) continue;
      const m = candMask(g, k), c = popcount(m);
      if (c === 0) return;
      if (c < bc) { bc = c; best = k; bm = m; if (c === 1) break; }
    }
    if (best < 0) { n++; if (out && n === 1) out.push(g.slice()); return; }
    for (let v = 1; v <= 9 && n < limit; v++) if (bm & bit(v)) { g[best] = v; go(); g[best] = 0; }
  })();
  return n;
}
function solve(grid) {
  const out = [];
  countSolutions(grid, 1, out);
  return out[0] || null;
}
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function randomSolution(rand) {
  const g = new Array(81).fill(0);
  (function go() {
    let best = -1, bm = 0, bc = 10;
    for (let k = 0; k < 81; k++) {
      if (g[k]) continue;
      const m = candMask(g, k), c = popcount(m);
      if (c === 0) return false;
      if (c < bc) { bc = c; best = k; bm = m; }
    }
    if (best < 0) return true;
    for (const v of shuffle(digits(bm), rand)) { g[best] = v; if (go()) return true; }
    g[best] = 0;
    return false;
  })();
  return g;
}

// 出一道 tier 档的题：从完整解开始，成对（中心对称，看着整齐）挖空；
// 每挖一对都要保证：还是唯一解、而且只用这一档及以下的招能解完。挖不动了再看是不是正好这一档。
const MIN_GIVENS = [40, 34, 28, 25, 22, 21];
function makePuzzle(rand, tier) {
  const sol = randomSolution(rand);
  const g = sol.slice();
  const order = shuffle(Array.from({ length: 41 }, (_, k) => k), rand);
  let givens = 81;
  for (const k of order) {
    const pair = k === 40 ? [40] : [k, 80 - k];
    if (givens - pair.length < MIN_GIVENS[tier]) continue;
    const keep = pair.map((x) => g[x]);
    pair.forEach((x) => (g[x] = 0));
    if (countSolutions(g, 2) !== 1 || !grade(g, tier).solved) pair.forEach((x, i) => (g[x] = keep[i]));
    else givens -= pair.length;
  }
  const r = grade(g, tier);
  if (!r.solved || r.level !== tier) return null;
  return { puzzle: g, solution: sol, givens, steps: r.steps, hardSteps: r.hardSteps };
}

// 新人带练第一局：只用「最后一格」（某一行 / 列 / 宫只剩一个空格）就能做完——第 1 课只教了这一招
// （检验报告 C7：原来的入门题 150 道里 132 道开局第一步就得用第 2 课才教的排除法）。从一个解出发随机挖空，挖到挖不动为止（约 21 格）
function fullHouseOnly(g0) {
  const g = g0.slice();
  for (let changed = true; changed;) {
    changed = false;
    for (const u of UNITS) {
      const empty = u.filter((k) => !g[k]);
      if (empty.length !== 1) continue;
      let m = 0;
      u.forEach((k) => { if (g[k]) m |= bit(g[k]); });
      for (let d = 1; d <= 9; d++) if (!(m & bit(d))) { g[empty[0]] = d; break; }
      changed = true;
    }
  }
  return g.every(Boolean);
}
function firstGamePuzzle(sol, seed) {
  const g = sol.slice(), rand = rng(seed);
  for (const k of shuffle(Array.from({ length: 81 }, (_, i) => i), rand)) {
    const v = g[k];
    g[k] = 0;
    if (!fullHouseOnly(g)) g[k] = v;
  }
  return g;
}

// 题库存成 81 个字符的字符串（0 = 空）
const encode = (g) => g.join('');
const decode = (s) => Array.from(s, (ch) => +ch);

// ---------- 给玩家的提示 ----------
// grid：盘上「对的」数（题目 + 玩家填对的；填错的不算）。返回 { step, place, text, cells }
function hintFor(grid, solution) {
  const st = makeState(grid);
  const step = nextStep(st, 5);
  let target = step && step.place;
  if (!target) {
    // 这一步只是删候选：接着往下解，直到有一格能填上
    const sim = makeState(grid);
    for (let guard = 0; guard < 200 && !target; guard++) {
      const s = nextStep(sim, 5);
      if (!s) break;
      if (s.place) target = s.place;
      else applyStep(sim, s);
    }
  }
  if (!target) {
    // 超出所有招：直接挑候选最少的空格
    let best = -1, bc = 10;
    for (let k = 0; k < 81; k++) if (!grid[k] && popcount(st.c[k]) < bc) { bc = popcount(st.c[k]); best = k; }
    if (best < 0) return null;
    target = { k: best, v: solution[best] };
  }
  return { step, place: target, text: hintText(step, target), cells: step ? step.cells : [target.k] };
}
// 对局里的提示：一行、14 字以内，不写招名、不写「宫」（检验报告 C5）；要看的地方盘上亮着，招名在「学这招 ›」里
function hintText(step, place) {
  if (!step) return '这一格直接告诉你';
  const d = step.digit;
  switch (step.tech) {
    case 'fullHouse': return '亮着的 9 格只缺一个数';
    case 'hiddenBox':
    case 'hiddenLine': return '亮着的空格里，' + d + ' 只能放一处';
    case 'nakedSingle': return '这一格只剩一个数能填';
    case 'pointing':
    case 'claiming': return '亮着的格子里，' + d + ' 只在一条线上';
    case 'nakedPair':
    case 'hiddenPair': return '这两格只能是 ' + step.digits.join(' 和 ');
    case 'nakedTriple':
    case 'hiddenTriple': return '这三格只能是 ' + step.digits.join('、');
    case 'xWing':
    case 'swordfish': return d + ' 只能在亮着的几格里';
    case 'xyWing': return '亮着的三格夹住了 ' + d;
    default: return '看亮着的地方';
  }
}

module.exports = {
  focusCells, explain, singleAt, TECH_SHOW,
  ROW, COL, BOX, UNITS, UNITS_OF, PEERS, ALL, bit, popcount, digits, TIERS, TECH,
  makeState, place, applyStep, nextStep, grade, countSolutions, solve, rng, shuffle,
  randomSolution, makePuzzle, firstGamePuzzle, fullHouseOnly, encode, decode, hintFor, candMask, MIN_GIVENS,
};
