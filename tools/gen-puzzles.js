// 出题库：node tools/gen-puzzles.js   → 写 js/puzzles.js
// 每道题都验过：唯一解；只用这一档及以下的招能解完；用到的最难一招正好是这一档。
// 顺便抽查解题器：每一步删掉的候选，都不能是正确答案（删错了说明某一招写错了）。
const fs = require('fs');
const path = require('path');
const S = require('../js/sudoku.js');

const COUNT = [300, 300, 300, 300, 150, 150];
const rand = S.rng(20261120);

// 抽查：一步步解，核对每一步
function audit(puzzle, solution) {
  const st = S.makeState(puzzle);
  for (let guard = 0; guard < 400 && !st.g.every(Boolean); guard++) {
    const s = S.nextStep(st, 5);
    if (!s) return true;
    if (s.place && solution[s.place.k] !== s.place.v) throw new Error(s.tech + ' 填错了 ' + S.encode(puzzle));
    if (s.elim) for (const e of s.elim) if (e.m & S.bit(solution[e.k])) throw new Error(s.tech + ' 删错了 ' + S.encode(puzzle));
    S.applyStep(st, s);
  }
  return true;
}

const tiers = [];
const report = [];
for (let t = 0; t < 6; t++) {
  const list = [], seen = new Set();
  let tries = 0, givens = 0, steps = 0, hard = 0;
  const t0 = Date.now();
  while (list.length < COUNT[t]) {
    tries++;
    const p = S.makePuzzle(rand, t);
    if (!p) continue;
    const code = S.encode(p.puzzle);
    if (seen.has(code)) continue;
    if (S.countSolutions(p.puzzle, 2) !== 1) throw new Error('不唯一 ' + code);
    audit(p.puzzle, p.solution);
    seen.add(code);
    list.push(code);
    givens += p.givens; steps += p.steps; hard += p.hardSteps;
  }
  tiers.push(list);
  const n = list.length;
  const line = `${S.TIERS[t].name}：${n} 题，试了 ${tries} 次，平均给数 ${(givens / n).toFixed(1)}，平均 ${(steps / n).toFixed(0)} 步，最难那招平均用 ${(hard / n).toFixed(1)} 次，${((Date.now() - t0) / 1000).toFixed(1)} 秒`;
  console.log(line);
  report.push(line);
}

const out = '// 题库（tools/gen-puzzles.js 生成，别手改）。每档一组，81 个字符一题，0 = 空格。\n// ' +
  report.join('\n// ') + '\nmodule.exports = ' + JSON.stringify(tiers) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'puzzles.js'), out);
console.log('写好 js/puzzles.js，' + (out.length / 1024).toFixed(0) + ' KB');
