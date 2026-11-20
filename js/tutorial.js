// 教学：五课（简单难度要用到的招）。学 Good Sudoku：盘上只亮相关的格，手指指着点，一屏最多两行字。
// 每课是一串「步」：
//   演示步 { text, show, focus, rays, strike, demo:{k,v} }      → 看手指演示，点「下一步」
//   练习步 { text, show, focus, actions:[{cell}|{num}|{note}], says:[...] } → 自己点，点对了往下走
// show = 盘上显示哪些格（其余是空格）；focus = 亮着的格（其余变淡）；rays = 「划掉」的行列。
// 所有盘面都从同一个完整解 SOL 里取数，所以一定前后一致、合规则。
const S = require('./sudoku.js');

const SOL = S.randomSolution(S.rng(20261120));
const cellsOf = (u) => S.UNITS[u];
const R = (r) => r, Cc = (c) => 9 + c, B = (b) => 18 + b;
const at = (r, c) => r * 9 + c;
const rand = S.rng(7);
// 题目一样的「散落」给数：让盘面看起来像真题，但都变淡
function scatter(n, avoid) {
  const out = [];
  const order = S.shuffle(Array.from({ length: 81 }, (_, k) => k), rand);
  for (const k of order) { if (out.length >= n) break; if (!avoid || avoid.indexOf(k) < 0) out.push(k); }
  return out;
}
const where = (box, v) => cellsOf(B(box)).find((k) => SOL[k] === v);
const uniq = (a) => Array.from(new Set(a));
const minus = (a, b) => a.filter((x) => b.indexOf(x) < 0);

// ---------- 第 1 课 · 规则 ----------
function lessonRules() {
  const base = scatter(28);
  const row = 4, col = 6, box = 2;
  const rowCells = cellsOf(R(row)), colCells = cellsOf(Cc(col)), boxCells = cellsOf(B(box));
  const blank = rowCells[3];
  return [
    { text: '数独是 9×9 的格子。粗线把它分成 9 个「宫」，每宫 3×3。', show: base, focus: null },
    { text: '规则只有一条：每一行，1 到 9 各出现一次。', show: uniq(base.concat(rowCells)), focus: rowCells },
    { text: '每一列，也是 1 到 9 各一次。', show: uniq(base.concat(colCells)), focus: colCells },
    { text: '每一宫，也是 1 到 9 各一次。不用算术，只用推理。', show: uniq(base.concat(boxCells)), focus: boxCells },
    {
      text: '试试看：这一行缺了一个数。先点空格，再点下面的数字。',
      show: minus(uniq(base.concat(rowCells)), [blank]), focus: rowCells,
      actions: [{ cell: blank }, { num: SOL[blank] }],
      says: ['先点这一行的空格', '1 到 9 里，这一行少了哪个？点它'],
    },
  ];
}

// ---------- 第 2 课 · 最后一格 ----------
function lessonLastCell() {
  const col = 2, box = 7, box2 = 3;
  const colCells = cellsOf(Cc(col)), boxCells = cellsOf(B(box)), box2Cells = cellsOf(B(box2));
  const b1 = colCells[6], b2 = boxCells[4], b3 = box2Cells[2];
  const base = scatter(24, colCells.concat(boxCells));
  const free = minus(uniq(scatter(30, box2Cells).concat(box2Cells)), [b3]);
  return [
    {
      text: '一列只剩一个空格时，缺哪个数一眼就看出来。',
      show: minus(uniq(base.concat(colCells)), [b1]), focus: colCells, demo: { k: b1, v: SOL[b1] },
    },
    {
      text: '这一宫也只剩一格。它缺哪个数？',
      show: minus(uniq(base.concat(boxCells)), [b2]), focus: boxCells,
      actions: [{ cell: b2 }, { num: SOL[b2] }], says: ['点这一宫的空格', '这一宫少了哪个数？'],
    },
    {
      text: '这次不帮你亮了：盘上有一个宫只差一格，找到它，填上。',
      show: free, focus: null,
      actions: [{ cell: b3 }, { num: SOL[b3] }], says: ['先找：哪一宫只剩一个空格？', '它缺哪个数？'],
      handDelay: 8000,
    },
  ];
}

// ---------- 第 3 课 · 排除法 ----------
// 在宫 box 里找数 v：别的宫里的 v 会把自己那一行、那一列「划掉」，宫里只剩一格没被划 → 就是它
function hatch(box, target, extraInside) {
  const v = SOL[target];
  const br = Math.floor(box / 3), bc = box % 3;
  const band = [0, 1, 2].filter((i) => i !== bc).map((i) => br * 3 + i); // 同一横排的两个宫
  const stack = [0, 1, 2].filter((i) => i !== br).map((i) => i * 3 + bc); // 同一竖排的两个宫
  const givers = band.concat(stack).map((b) => where(b, v));
  const rays = band.map((b) => ({ k: where(b, v), dir: 'row' })).concat(stack.map((b) => ({ k: where(b, v), dir: 'col' })));
  return { v, givers, rays, inside: extraInside || [] };
}
function lessonHatch() {
  const box = 4, t = cellsOf(B(box))[2];
  const h = hatch(box, t);
  const inside = cellsOf(B(box)).filter((k) => k !== t && S.ROW(k) !== S.ROW(t) && S.COL(k) !== S.COL(t)).slice(0, 2);
  const base = scatter(16, cellsOf(B(box)).concat(h.givers));
  const show = uniq(base.concat(h.givers, inside));
  const focus = cellsOf(B(box)).concat(h.givers);
  // 练习 1：另一宫、另一个数
  const box2 = 0, t2 = cellsOf(B(box2))[7];
  const h2 = hatch(box2, t2);
  const base2 = scatter(16, cellsOf(B(box2)).concat(h2.givers));
  // 练习 2：只用一横一竖两个「划线」，剩下的格子被宫里已有的数挡住
  const box3 = 8, t3 = cellsOf(B(box3))[0];
  const v3 = SOL[t3];
  const g3 = [where(6, v3), where(2, v3)]; // 一个同横排、一个同竖排
  const crossed = cellsOf(B(box3)).filter((k) => S.ROW(k) === S.ROW(g3[0]) || S.COL(k) === S.COL(g3[1]));
  const fill3 = cellsOf(B(box3)).filter((k) => k !== t3 && crossed.indexOf(k) < 0);
  const base3 = scatter(14, cellsOf(B(box3)).concat(g3, cellsOf(R(S.ROW(t3))), cellsOf(Cc(S.COL(t3)))));
  return [
    { text: '亮着的宫里还没有 ' + h.v + '。' + h.v + ' 能放在哪一格？', show, focus },
    { text: '每个 ' + h.v + ' 都把自己那一行、那一列「划掉」：同一行、同一列不能再有 ' + h.v + '。', show, focus, rays: h.rays },
    { text: '宫里只剩一格没被划掉——' + h.v + ' 就放这里。这招叫「排除法」。', show, focus, rays: h.rays, demo: { k: t, v: h.v } },
    {
      text: '轮到你：左上这一宫的 ' + h2.v + ' 放在哪？',
      show: uniq(base2.concat(h2.givers)), focus: cellsOf(B(box2)).concat(h2.givers), rays: h2.rays, raysAfterMiss: true,
      actions: [{ cell: t2 }, { num: h2.v }], says: ['看亮着的 ' + h2.v + '，它们划掉了哪些行和列？', '填 ' + h2.v],
    },
    {
      text: '宫里已经有数的格子也不能放。右下这一宫的 ' + v3 + ' 放哪？',
      show: uniq(base3.concat(g3, fill3)), focus: cellsOf(B(box3)).concat(g3),
      rays: [{ k: g3[0], dir: 'row' }, { k: g3[1], dir: 'col' }], raysAfterMiss: true,
      actions: [{ cell: t3 }, { num: v3 }], says: ['划掉的、已经有数的，都不行。剩哪一格？', '填 ' + v3],
    },
  ];
}

// ---------- 第 4 课 · 唯一候选 ----------
// 给格子 k 挑一些同行、同列、同宫的格子显示，正好凑齐 8 个别的数，而且没有哪一行 / 列 / 宫只差 k 这一格
function cover(k) {
  const need = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  need.delete(SOL[k]);
  const peers = S.shuffle(S.PEERS[k].slice(), rand);
  const pick = [];
  for (const p of peers) if (need.has(SOL[p])) { need.delete(SOL[p]); pick.push(p); }
  return pick;
}
function lessonNaked() {
  const k = at(1, 4), k2 = at(6, 1), k3 = at(4, 7);
  const p = cover(k), p2 = cover(k2), p3 = cover(k3);
  const peersOf = (x) => S.PEERS[x].concat([x]);
  const show = uniq(scatter(10, peersOf(k)).concat(p));
  return [
    { text: '看这一格：它的行、列、宫里，1–9 已经出现了 8 个。', show, focus: peersOf(k), strike: k },
    { text: '只剩 ' + SOL[k] + ' 没出现——这一格只能是 ' + SOL[k] + '。这招叫「唯一候选」。', show, focus: peersOf(k), strike: k, demo: { k, v: SOL[k] } },
    {
      text: '轮到你：亮着的这一格只能填几？',
      show: uniq(scatter(10, peersOf(k2)).concat(p2)), focus: peersOf(k2), mark: k2,
      actions: [{ cell: k2 }, { num: SOL[k2] }], says: ['点亮着的那一格', '1–9 里，哪个数它的行、列、宫都没有？'], strikeAfterMiss: k2,
    },
    {
      text: '再来一个。',
      show: uniq(scatter(10, peersOf(k3)).concat(p3)), focus: peersOf(k3), mark: k3,
      actions: [{ cell: k3 }, { num: SOL[k3] }], says: ['点亮着的那一格', '它只能是几？'], strikeAfterMiss: k3,
    },
  ];
}

// ---------- 第 5 课 · 笔记 ----------
// X 只剩两种可能 {a, w}；Y 和 X 同一行，Y = w。先在 X 记下 a 和 w，再填 Y = w → X 的笔记 w 自动擦掉 → X 只剩 a
function lessonNotes() {
  const X = at(2, 1), Y = at(2, 7);
  const a = SOL[X], w = SOL[Y];
  const colW = cellsOf(Cc(S.COL(X))).find((k) => SOL[k] === w);
  const boxW = cellsOf(B(S.BOX(X))).find((k) => SOL[k] === w);
  const hide = uniq([X, Y, colW, boxW].concat(scatter(26, S.PEERS[X].concat([X, Y]))));
  const show = minus(Array.from({ length: 81 }, (_, k) => k), hide);
  const low = Math.min(a, w), high = Math.max(a, w);
  const focus = cellsOf(R(2)).concat(cellsOf(Cc(S.COL(X))), cellsOf(B(S.BOX(X))));
  return [
    {
      text: '有的格子一时定不下来。亮着的这一格可能是 ' + low + '，也可能是 ' + high + '。用「笔记」把它们记下来。',
      show, focus, mark: X, noteTool: true,
      actions: [{ note: true }, { cell: X }, { num: low }, { num: high }],
      says: ['点「笔记」，打开它', '点亮着的格子', '点 ' + low + '，记下来', '再点 ' + high],
    },
    {
      text: '现在关掉笔记，在同一行的这一格填 ' + w + '。看看左边的笔记会怎样。',
      show, focus, mark: Y, noteTool: true,
      actions: [{ note: false }, { cell: Y }, { num: w }],
      says: ['点「笔记」，关掉它', '点这一格', '填 ' + w],
    },
    {
      text: '笔记里的 ' + w + ' 自动擦掉了（同一行不能再有 ' + w + '）。只剩 ' + a + '，把它填上。',
      show, focus, mark: X, noteTool: true,
      actions: [{ cell: X }, { num: a }], says: ['点那一格', '填 ' + a],
    },
  ];
}

const LESSONS = [
  { id: 'rules', name: '规则', sub: '每行、每列、每宫 1–9 各一个', build: lessonRules },
  { id: 'last', name: '最后一格', sub: '只剩一个空，缺哪个数？', build: lessonLastCell },
  { id: 'hatch', name: '排除法', sub: '别处的数把行和列划掉', build: lessonHatch },
  { id: 'naked', name: '唯一候选', sub: '这一格只剩一种可能', build: lessonNaked },
  { id: 'notes', name: '笔记', sub: '记下可能的数，会自动擦', build: lessonNotes },
];
// 提示里用到的招 → 去哪一课学
const TECH_LESSON = { fullHouse: 'last', hiddenBox: 'hatch', hiddenLine: 'hatch', nakedSingle: 'naked' };

module.exports = { SOL, LESSONS, TECH_LESSON };
