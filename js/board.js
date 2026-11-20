// 一局的数据和规则：填数、笔记、撤销、橡皮、提示、计分、错几次。不画图。
const S = require('./sudoku.js');
const C = require('./config.js');

// opts: { mode: 'normal' | 'daily' | 'lesson', tier, idx, date, puzzle: '81 位字符串' }
function create(opts) {
  const puzzle = S.decode(opts.puzzle);
  const sol = opts.solution ? S.decode(opts.solution) : S.solve(puzzle);
  return {
    mode: opts.mode || 'normal', tier: opts.tier || 0, idx: opts.idx || 0, date: opts.date || '',
    puzzle: opts.puzzle, sol: sol.join(''),
    vals: puzzle.slice(), given: puzzle.map(Boolean), notes: new Array(81).fill(0),
    mistakes: 0, elapsed: 0, score: 0, hintsLeft: C.RULES.freeHints, hintsUsed: 0,
    scored: new Array(81).fill(false), missed: new Array(81).fill(false), lastCorrectAt: 0,
    history: [], done: false, lost: false, revives: 0, selected: -1,
  };
}

const solAt = (b, k) => +b.sol[k];
const isRight = (b, k) => b.vals[k] !== 0 && b.vals[k] === solAt(b, k);
const isWrong = (b, k) => b.vals[k] !== 0 && b.vals[k] !== solAt(b, k);
const locked = (b, k) => b.given[k] || isRight(b, k);

// 每个数在盘上（对的）出现了几次：填满 9 个的数字键变灰
function counts(b) {
  const n = new Array(10).fill(0);
  for (let k = 0; k < 81; k++) if (isRight(b, k)) n[b.vals[k]]++;
  return n;
}
// 盘上对的数（题目 + 填对的），给提示用
function rightGrid(b) {
  return b.vals.map((v, k) => (isRight(b, k) ? v : 0));
}

function remember(b, cells) {
  b.history.push(cells.map((k) => ({ k, v: b.vals[k], n: b.notes[k] })));
  if (b.history.length > C.RULES.undoLimit) b.history.shift();
}

// 在 k 格按数字 v。返回发生了什么，画面层照着放效果
function input(b, k, v, noteMode, settings) {
  if (b.done || b.lost || k < 0 || locked(b, k)) return { kind: 'none' };
  if (noteMode) {
    if (b.vals[k]) return { kind: 'none' };
    remember(b, [k]);
    b.notes[k] ^= S.bit(v);
    return { kind: 'note', on: !!(b.notes[k] & S.bit(v)) };
  }
  if (b.vals[k] === v) return { kind: 'none' };
  const touched = [k];
  const right = v === solAt(b, k);
  // 填对时，同行同列同宫的这个数的笔记自动擦掉（设置里可关）
  const autoClear = right && (!settings || settings.autoNotes !== false);
  if (autoClear) for (const p of S.PEERS[k]) if (b.notes[p] & S.bit(v)) touched.push(p);
  remember(b, touched);
  b.vals[k] = v;
  b.notes[k] = 0;
  if (!right) {
    b.mistakes++;
    b.missed[k] = true;
    if (settings && settings.mistakeLimit !== false && b.mistakes >= C.RULES.maxMistakes) b.lost = true;
    return { kind: 'wrong', lost: b.lost };
  }
  const cleared = [];
  if (autoClear) for (const p of S.PEERS[k]) if (b.notes[p] & S.bit(v)) { b.notes[p] &= ~S.bit(v); cleared.push(p); }
  return Object.assign({ kind: 'correct', cleared }, award(b, k, v));
}

// 填对以后：算分、看有没有填满一行 / 列 / 宫、某个数满 9 个、赢了没
function award(b, k, v, noScore) {
  const base = C.SCORE.base[b.tier] || 20;
  let gain = 0;
  const units = S.UNITS_OF[k].filter((u) => S.UNITS[u].every((x) => isRight(b, x)));
  const digitDone = counts(b)[v] === 9 ? v : 0;
  if (!noScore && !b.scored[k]) {
    const dt = (b.elapsed - b.lastCorrectAt) / 1000;
    gain = Math.round(base * C.speedMultiplier(dt) * (b.missed[k] ? C.SCORE.afterMistake : 1));
    gain += units.length * base * C.SCORE.unitBonus;
    if (digitDone) gain += base * C.SCORE.digitBonus;
    b.score += gain;
  }
  b.scored[k] = true;
  b.lastCorrectAt = b.elapsed;
  const win = b.vals.every((x, i) => isRight(b, i));
  if (win) b.done = true;
  return { gain, units, digitDone, win };
}

function erase(b, k) {
  if (b.done || k < 0 || locked(b, k)) return false;
  if (!b.vals[k] && !b.notes[k]) return false;
  remember(b, [k]);
  b.vals[k] = 0;
  b.notes[k] = 0;
  return true;
}

function undo(b) {
  if (b.done || !b.history.length) return -1;
  const cells = b.history.pop();
  for (const c of cells) { b.vals[c.k] = c.v; b.notes[c.k] = c.n; }
  return cells[0].k;
}

// 提示：找下一步（不填）。返回 { place:{k,v}, text, cells, tech }
function findHint(b) {
  return S.hintFor(rightGrid(b), b.sol.split('').map(Number));
}
// 提示第二步：直接填上（这一格不给分）
function fillHint(b, k, v) {
  remember(b, [k]);
  b.vals[k] = v;
  b.notes[k] = 0;
  for (const p of S.PEERS[k]) b.notes[p] &= ~S.bit(v);
  return Object.assign({ kind: 'correct', cleared: [] }, award(b, k, v, true));
}

// 错 3 次后看广告：错误数减 1，接着做
function revive(b) {
  b.lost = false;
  b.mistakes = Math.max(0, C.RULES.maxMistakes - 1);
  b.revives++;
}

module.exports = { create, input, erase, undo, findHint, fillHint, revive, counts, rightGrid, isRight, isWrong, locked, solAt };
