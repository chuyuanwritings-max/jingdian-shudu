// 音效：全部用代码合成（不用音频文件）。经典数独要安静、柔和：木琴、钟片一类的音色，不要爆炸声。
// make(name, sr) 返回一串 -1..1 的采样。

function env(t, a, d) { return t < a ? t / a : Math.exp(-(t - a) / d); }
const sin = (f, t) => Math.sin(2 * Math.PI * f * t);
// 木琴：基音 + 第 4 泛音，很快衰减
const mallet = (f, t, d) => (sin(f, t) + sin(f * 4, t) * 0.18 * Math.exp(-t * 30)) * env(t, 0.002, d);
// 钟片：基音 + 不和谐泛音，衰减慢一点
const bell = (f, t, d) => (sin(f, t) + sin(f * 2.76, t) * 0.25 + sin(f * 5.4, t) * 0.08) * env(t, 0.002, d);
function seq(notes, step, voice, d) {
  return (t) => {
    let s = 0;
    for (let i = 0; i < notes.length; i++) { const k = t - i * step; if (k >= 0) s += voice(notes[i], k, d); }
    return s / Math.sqrt(notes.length);
  };
}

// 白噪声（固定种子，每次合成一样）
let ns = 12345;
const noise = () => { ns = (ns * 16807) % 2147483647; return ns / 1073741823.5 - 1; };

const RECIPES = {
  // 数字方块落下：木块「嗒」——一下短促的敲击噪声 + 一个往下滑的低音
  tile: { len: 0.16, f: (t) => noise() * env(t, 0.0008, 0.006) * 0.55 + sin(260 - 500 * t, t) * env(t, 0.002, 0.035) * 0.55 + mallet(1046, t, 0.05) * 0.18 },
  // 通关：一段上扬的琶音，最后落在一个长和弦上（约 2 秒）
  fanfare: { len: 2.4, f: (t) => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.085, bell, 0.35)(t) * 0.42 + (t > 0.62 ? (bell(523, t - 0.62, 0.9) + bell(659, t - 0.62, 0.9) + bell(784, t - 0.62, 0.9) + bell(1047, t - 0.62, 0.9)) * 0.16 : 0) + sin(130, t) * env(t, 0.01, 0.6) * 0.18 },
  // 彩纸炮：「噗」一声 + 沙沙
  confetti: { len: 0.7, f: (t) => noise() * (env(t, 0.002, 0.03) * 0.5 + env(t, 0.05, 0.25) * 0.12) + sin(90 - 60 * t, t) * env(t, 0.002, 0.06) * 0.4 },
  tap: { len: 0.06, f: (t) => sin(1400, t) * env(t, 0.001, 0.012) * 0.25 },           // 按钮
  select: { len: 0.05, f: (t) => sin(1800, t) * env(t, 0.001, 0.008) * 0.15 },        // 点格子
  place: { len: 0.35, f: (t) => mallet(784, t, 0.09) * 0.5 },                          // 填对
  note: { len: 0.06, f: (t) => sin(2400, t) * env(t, 0.001, 0.01) * 0.15 },           // 记笔记：铅笔轻点
  erase: { len: 0.12, f: (t) => sin(500 - 1500 * t, t) * env(t, 0.002, 0.03) * 0.25 },
  undo: { len: 0.12, f: (t) => sin(900 - 2000 * t, t) * env(t, 0.002, 0.03) * 0.22 },
  wrong: { len: 0.28, f: (t) => (sin(220, t) + sin(233, t)) * env(t, 0.004, 0.08) * 0.28 }, // 填错：低沉、短，不刺耳
  unit: { len: 0.6, f: (t) => seq([784, 988, 1175], 0.06, mallet, 0.14)(t) * 0.5 },   // 填满一行 / 列 / 宫
  digit: { len: 0.9, f: (t) => seq([1175, 1568], 0.08, bell, 0.3)(t) * 0.35 },          // 某个数填满 9 个
  hint: { len: 0.5, f: (t) => seq([988, 1319], 0.09, bell, 0.18)(t) * 0.3 },
  win: { len: 1.8, f: (t) => seq([523, 659, 784, 1047, 1319, 1568], 0.11, bell, 0.45)(t) * 0.45 },
  lose: { len: 0.7, f: (t) => seq([440, 349], 0.16, mallet, 0.2)(t) * 0.4 },
  correct: { len: 0.5, f: (t) => seq([880, 1319], 0.07, bell, 0.16)(t) * 0.35 },       // 教学里做对
};

function make(name, sr) {
  const r = RECIPES[name];
  if (!r) return null;
  const n = Math.floor(r.len * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // 最后 10 毫秒淡出，免得「咔」一声
    const fade = Math.min(1, (n - i) / (sr * 0.01));
    out[i] = Math.max(-1, Math.min(1, r.f(i / sr) * fade));
  }
  return out;
}

module.exports = { make, NAMES: Object.keys(RECIPES) };
