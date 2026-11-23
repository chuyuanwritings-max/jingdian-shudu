// 出「一招题库」：node tools/gen-focus.js → 写 js/focus_bank.js
// 每档挑这一档那一招「非用不可」次数多的题（config.FOCUS 的 min）：简单要用唯一候选 ≥3 次、中等区块排除 ≥3 次、困难数对 ≥2 次。
// 和主题库一样都验过：唯一解；只用这一档及以下的招能解完；每一步删的候选都不是正确答案。不和主题库重复。
const fs = require('fs');
const path = require('path');
const S = require('../js/sudoku.js');
const C = require('../js/config.js');
const main = require('../js/puzzles.js');

const COUNT = 150;
const rand = S.rng(20261123);
function audit(puzzle, solution) {
  const st = S.makeState(puzzle);
  for (let guard = 0; guard < 400 && !st.g.every(Boolean); guard++) {
    const s = S.nextStep(st, 5);
    if (!s) return;
    if (s.place && solution[s.place.k] !== s.place.v) throw new Error(s.tech + ' 填错了 ' + S.encode(puzzle));
    if (s.elim) for (const e of s.elim) if (e.m & S.bit(solution[e.k])) throw new Error(s.tech + ' 删错了 ' + S.encode(puzzle));
    S.applyStep(st, s);
  }
}
const out = [[]], report = [];
for (let t = 1; t <= 3; t++) {
  const F = C.FOCUS[t], seen = new Set(main[t]), list = [];
  let tries = 0, uses = 0;
  const t0 = Date.now();
  while (list.length < COUNT) {
    tries++;
    const p = S.makePuzzle(rand, t);
    if (!p) continue;
    const code = S.encode(p.puzzle);
    if (seen.has(code)) continue;
    const n = S.focusCells(p.puzzle, F.techs).length;
    if (n < F.min) continue;
    if (S.countSolutions(p.puzzle, 2) !== 1) throw new Error('不唯一 ' + code);
    audit(p.puzzle, p.solution);
    seen.add(code); list.push(code); uses += n;
    if (list.length % 25 === 0) console.log(S.TIERS[t].name + ' ' + list.length + '/' + COUNT + '（试了 ' + tries + ' 次）');
  }
  out.push(list);
  const line = S.TIERS[t].name + '：' + COUNT + ' 题，「' + F.name + '」平均要用 ' + (uses / COUNT).toFixed(1) + ' 次，试了 ' + tries + ' 次，' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒';
  console.log(line); report.push(line);
}
const txt = '// 一招题库（tools/gen-focus.js 生成，别手改）。下标 = 难度档；入门不另出（排除法每一步都用）。\n// ' + report.join('\n// ') + '\nmodule.exports = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'focus_bank.js'), txt);
console.log('写好 js/focus_bank.js，' + (txt.length / 1024).toFixed(0) + ' KB');
