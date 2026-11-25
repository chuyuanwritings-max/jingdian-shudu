// 心法三问 ①：「永远选甲 / 永远选乙」两种机器人在同一批题上各打一遍。用游戏自己的 board.js 算分。
const R = '/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/经典数独/原型/js/';
const S = require(R + 'sudoku.js'), Board = require(R + 'board.js'), bank = require(R + 'puzzles.js'), fbank = require(R + 'focus_bank.js');
const SEC = { fullHouse: 4, hiddenBox: 8, hiddenLine: 12, nakedSingle: 18, pointing: 35, claiming: 35, nakedPair: 50, hiddenPair: 50 }; // 报告 A5 拍的每步秒数（未校准）
const settings = { mistakeLimit: true, autoNotes: true };
function play(pz, tier, bot, seed) {
  const rand = S.rng(seed);
  const b = Board.create({ mode: 'normal', tier, puzzle: pz });
  let guard = 0;
  while (!b.done && !b.lost && guard++ < 200) {
    const st = S.makeState(Board.rightGrid(b));
    let s = S.nextStep(st, 5), sim = null;
    // 这一步只删候选：接着解到能填的一格（时间累加）
    let t = 0, place = null;
    const st2 = S.makeState(Board.rightGrid(b));
    while (!place) { const x = S.nextStep(st2, 5); if (!x) break; t += SEC[x.tech] || 60; if (x.place) place = x.place; else S.applyStep(st2, x); }
    if (!place) break;
    if (bot === 'hint') { b.elapsed += 3000; const r = Board.fillHint ? Board.fillHint(b, place.k, place.v) : null; continue; }
    if (bot === 'fast' && t > 8) {
      // 抢快：难的一步不细想，4 秒内在候选最少的空格里猜一个
      let best = -1, bc = 10; for (let k = 0; k < 81; k++) if (!st.g[k] && S.popcount(st.c[k]) < bc) { bc = S.popcount(st.c[k]); best = k; }
      const cands = S.digits(st.c[best]); const v = cands[Math.floor(rand() * cands.length)];
      b.elapsed += 4000; Board.input(b, best, v, false, settings);
      if (b.vals[best] !== +b.sol[best]) b.vals[best] = 0; // 两秒后自己拿掉
      continue;
    }
    b.elapsed += (bot === 'fast' ? 4 : t) * 1000;
    Board.input(b, place.k, place.v, false, settings);
  }
  return { win: b.done, lost: b.lost, score: b.score, min: b.elapsed / 60000, mistakes: b.mistakes };
}
const out = {};
for (const [name, tier, list] of [['入门', 0, bank[0].slice(0, 60)], ['中等', 2, fbank[2].slice(0, 60)], ['困难', 3, fbank[3].slice(0, 60)]]) {
  for (const bot of ['careful', 'fast', 'hint']) {
    const rs = list.map((pz, i) => play(pz, tier, bot, i + 1));
    const w = rs.filter((r) => r.win);
    out[name + '·' + bot] = { 赢率: Math.round(100 * w.length / rs.length) + '%', 赢局平均分: w.length ? Math.round(w.reduce((a, r) => a + r.score, 0) / w.length) : 0, 赢局平均分钟: w.length ? +(w.reduce((a, r) => a + r.min, 0) / w.length).toFixed(1) : 0, 平均错: +(rs.reduce((a, r) => a + r.mistakes, 0) / rs.length).toFixed(1) };
  }
}
console.table(out);
