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
      actions: [{ cell: blank }, { num: SOL[blank] }], hl: { cells: rowCells },
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
      actions: [{ cell: b2 }, { num: SOL[b2] }], hl: { cells: boxCells }, says: ['点这一宫的空格', '这一宫少了哪个数？'],
    },
    {
      text: '这次不帮你亮了：盘上有一个宫只差一格，找到它，填上。',
      show: free, focus: null,
      actions: [{ cell: b3 }, { num: SOL[b3] }], says: ['先找：哪一宫只剩一个空格？', '它缺哪个数？'],
      handDelay: 5000,
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
    { text: '亮着的这一宫还没有 ' + h.v + '。' + h.v + ' 能放哪？', show, focus, hl: { cells: cellsOf(B(box)), digit: h.v } },
    { text: '每个 ' + h.v + ' 都划掉自己那一行、那一列。', show, focus, rays: h.rays, hl: { cells: cellsOf(B(box)), digit: h.v } },
    { text: '只剩一格没被划掉——' + h.v + ' 就放这里。这叫「排除法」。', show, focus, rays: h.rays, demo: { k: t, v: h.v }, hl: { cells: cellsOf(B(box)), digit: h.v } },
    {
      text: '轮到你：亮着的这一宫，' + h2.v + ' 放哪？', hl: { cells: cellsOf(B(box2)), digit: h2.v },
      show: uniq(base2.concat(h2.givers)), focus: cellsOf(B(box2)).concat(h2.givers), rays: h2.rays, raysAfterMiss: true,
      actions: [{ cell: t2 }, { num: h2.v }], says: ['看亮着的 ' + h2.v + '，它们划掉了哪些行和列？', '填 ' + h2.v],
    },
    {
      text: '有数的格子也不能放。亮着的这一宫，' + v3 + ' 放哪？', hl: { cells: cellsOf(B(box3)), digit: v3 },
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
      actions: [{ cell: k2 }, { num: SOL[k2] }], hl: { cells: [k2] }, says: ['点亮着的那一格', '1–9 里，哪个数它的行、列、宫都没有？'], strikeAfterMiss: k2,
    },
    {
      text: '再来一个。',
      show: uniq(scatter(10, peersOf(k3)).concat(p3)), focus: peersOf(k3), mark: k3,
      actions: [{ cell: k3 }, { num: SOL[k3] }], hl: { cells: [k3] }, says: ['点亮着的那一格', '它只能是几？'], strikeAfterMiss: k3,
    },
  ];
}

// ---------- 第 5 课 · 笔记（0.5 砍短：先看效果，再自己记一个）----------
// X 只剩两种可能 {a, w}，笔记已经记好；Y 和 X 同一行，Y = w。演示填 Y = w → X 的笔记 w 自动擦掉 → X 只剩 a
function lessonNotes() {
  const X = at(2, 1), Y = at(2, 7);
  const a = SOL[X], w = SOL[Y];
  const colW = cellsOf(Cc(S.COL(X))).find((k) => SOL[k] === w);
  const boxW = cellsOf(B(S.BOX(X))).find((k) => SOL[k] === w);
  const hide = uniq([X, Y, colW, boxW].concat(scatter(26, S.PEERS[X].concat([X, Y]))));
  const show = minus(Array.from({ length: 81 }, (_, k) => k), hide);
  const focus = cellsOf(R(2)).concat(cellsOf(Cc(S.COL(X))), cellsOf(B(S.BOX(X))));
  const pre = {};
  pre[X] = S.bit(a) | S.bit(w);
  // 第三步自己记：另找一个空格 Z（不在 X 那一行），记下它的正确答案
  const Z = hide.find((k) => k !== X && k !== Y && S.ROW(k) !== 2);
  return [
    { text: '格子里的小字叫「笔记」：一时定不下来，就把可能的数先记下。', show, focus, mark: X, notesPre: pre },
    { text: '同一行填上 ' + w + ' 以后，笔记里的 ' + w + ' 会自己擦掉。', show, focus, notesPre: pre, demo: { k: Y, v: w } },
    { text: '只剩 ' + a + ' 了，把它填上。', show: show.concat([Y]), focus, mark: X, notesPre: (() => { const o = {}; o[X] = S.bit(a); return o; })(),
      actions: [{ cell: X }, { num: a }], hl: { cells: [X], digit: a }, says: ['点亮着的格子', '填 ' + a] },
    { text: '你也记一个：打开「笔记」，在亮着的格子里记下 ' + SOL[Z] + '。', show: show.concat([Y, X]), focus: null, mark: Z, noteTool: true,
      actions: [{ note: true }, { cell: Z }, { num: SOL[Z] }], hl: { cells: [Z], digit: SOL[Z] }, says: ['点「笔记」，打开它', '点亮着的格子', '点 ' + SOL[Z] + '，它会变成小字'] },
  ];
}

// ---------- 第 6 课 · 区块排除（中等要用）----------
// 宫 A 里的 v 只能在 r 这一排 → 这一排的别处都不能是 v → 宫 B 里的 v 只剩一格
function lessonPointing() {
  const v = SOL[at(0, 0)]; // 用左上角那个数
  const rA = 0; // A = 左上宫，v 在第 0 排
  const kB = cellsOf(B(1)).find((k) => SOL[k] === v); // B = 上中宫
  const kC = cellsOf(B(2)).find((k) => SOL[k] === v); // C = 右上宫
  const rB = S.ROW(kB);
  // 宫 A 另外两排填满 → v 只能在第 0 排
  const fillA = cellsOf(B(0)).filter((k) => S.ROW(k) !== rA);
  // 宫 B：v 那一排的另外两格填上；C 的 v 显示出来挡住它那一排
  const fillB = cellsOf(B(1)).filter((k) => S.ROW(k) === rB && k !== kB);
  const zone = cellsOf(B(0)).filter((k) => S.ROW(k) === rA);
  const avoidV = (ks) => ks.filter((k) => SOL[k] !== v);
  const base = avoidV(scatter(14, cellsOf(B(0)).concat(cellsOf(B(1)), cellsOf(B(2)), cellsOf(R(0)), cellsOf(R(1)), cellsOf(R(2)))));
  const show = uniq(base.concat(fillA, fillB, [kC]));
  const focus = cellsOf(B(0)).concat(cellsOf(B(1)), cellsOf(B(2)));
  const rowRay = [{ k: zone[0], dir: 'row' }];
  const rowCRay = [{ k: kC, dir: 'row' }];
  return [
    { text: '左上这一宫下面两排满了，' + v + ' 只能在最上面一排（金色）。', show, focus, zone, hl: { cells: cellsOf(B(0)), digit: v } },
    { text: v + ' 一定在金色格子里——这一排别处都不能是 ' + v + '。', show, focus, zone, rays: rowRay, hl: { cells: zone, digit: v } },
    {
      text: '亮着的这一宫，' + v + ' 放哪？', hl: { cells: cellsOf(B(1)), digit: v },
      show, focus, zone, rays: rowRay.concat(rowCRay),
      actions: [{ cell: kB }, { num: v }], says: ['上面一排不行、' + v + ' 那一排不行……剩哪一格？', '填 ' + v],
    },
  ];
}

// ---------- 第 7 课 · 数对（困难要用）----------
// 一排里只剩三个空：两格只能是 {a,b}，第三格本来是 {a,b,c} → a、b 被那两格「包了」→ 第三格只能是 c
function lessonPair() {
  const R0 = 4;
  const row = cellsOf(R(R0));
  const p = row[1], q = row[4], t = row[7];
  const a = SOL[p], b = SOL[q], c = SOL[t];
  // p、q 要看得到 c（同列里显示 c）；t 不能看到 a、b
  const cInCol = (k) => cellsOf(Cc(S.COL(k))).find((x) => SOL[x] === c);
  const blockers = [cInCol(p), cInCol(q)];
  const avoid = row.concat(cellsOf(Cc(S.COL(t))), cellsOf(B(S.BOX(t))));
  const base = scatter(16, avoid.concat(blockers)).filter((k) => SOL[k] !== a && SOL[k] !== b || (S.COL(k) !== S.COL(t) && S.BOX(k) !== S.BOX(t)));
  const show = uniq(minus(row, [p, q, t]).concat(blockers, base));
  const focus = row.concat(blockers);
  const pre = {};
  pre[p] = S.bit(a) | S.bit(b); pre[q] = S.bit(a) | S.bit(b); pre[t] = S.bit(a) | S.bit(b) | S.bit(c);
  const strike = {}; strike[t] = S.bit(a) | S.bit(b);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return [
    { text: '这一排只剩三个空。左边两格都只能是 ' + lo + ' 或 ' + hi + '（它们那一列已经有 ' + c + ' 了）。', show, focus, notesPre: pre, zone: [p, q] },
    { text: lo + ' 和 ' + hi + ' 被这两格「包了」：不管谁是谁，这一排的别处都不能再是 ' + lo + '、' + hi + '。这叫「数对」。', show, focus, notesPre: pre, zone: [p, q], strikeNotes: strike },
    { text: '那右边这一格只能是几？', show, focus, notesPre: pre, zone: [p, q], strikeNotes: strike, mark: t, hl: { cells: [t] },
      actions: [{ cell: t }, { num: c }], says: ['点右边那一格', '划掉 ' + lo + '、' + hi + ' 以后，只剩哪个？'] },
  ];
}

// 技能分两栏（2026-11-24 Cc：「分几个基础技能以及几个进阶技能，简单明了一点……就要最简单、最基础的几个新手技能」
// 「进阶技能跟高级技能不用学。基础技能是可以点进去学的，或者是新手第一关可以进去学的」）。
// 题库统计：排除法 + 最后一格占每一档九成步数，唯一候选从中等起大多数盘要用 → 基础 = 规则（含最后一格）、排除法、唯一候选（含笔记）；
// 进阶 = 区块排除、数对：不弹窗、不自动演示，教学页最下面想看再点。高级（X-Wing 等）以后再说。
// in：并进哪一课（学完那一课一起打勾；点到它直接去那一课）
const LESSONS = [
  { id: 'rules', name: '规则', sub: '每行、每列、每宫 1–9 各一个', build: () => lessonRules().concat(lessonLastCell()), group: 'basic' },
  { id: 'last', name: '最后一格', sub: '只剩一个空，缺哪个数？', build: lessonLastCell, in: 'rules' },
  { id: 'hatch', name: '排除法', sub: '别处的数把行和列划掉', build: lessonHatch, group: 'basic' },
  { id: 'naked', name: '唯一候选', sub: '这一格只剩一种可能（顺便学笔记）', build: () => lessonNaked().concat(lessonNotes()), group: 'basic' },
  { id: 'notes', name: '笔记', sub: '记下可能的数，会自动擦', build: lessonNotes, in: 'naked' },
  { id: 'pointing', name: '区块排除', sub: '中等会用到：一宫里的数挤在一排', build: lessonPointing, group: 'adv' },
  { id: 'pair', name: '数对', sub: '困难会用到：两格包了两个数', build: lessonPair, group: 'adv' },
];
const BASIC = LESSONS.filter((L) => L.group === 'basic');
const ADV = LESSONS.filter((L) => L.group === 'adv');
// 进阶招不用学：不再在第一次玩中等、困难前弹「先学一招」
const TIER_LESSON = {};
// 提示里用到的招 → 去哪一课学
const TECH_LESSON = { fullHouse: 'last', hiddenBox: 'hatch', hiddenLine: 'hatch', nakedSingle: 'naked', pointing: 'pointing', claiming: 'pointing', nakedPair: 'pair', hiddenPair: 'pair' };

// 「会一点」的人做的两道小测：从排除法、唯一候选两课里各拿一道练习
function quizSteps() {
  const h = lessonHatch(), n = lessonNaked();
  // 小测不主动给手指（点错一次才出来），不然等于把答案告诉他
  return [
    Object.assign({}, h[3], { text: '第 1 题：' + h[3].text.replace('轮到你：', ''), handDelay: 1e9 }),
    Object.assign({}, n[2], { text: '第 2 题：亮着的这一格只能填几？', handDelay: 1e9 }),
  ];
}

module.exports = { SOL, LESSONS, BASIC, ADV, TECH_LESSON, TIER_LESSON, quizSteps };
