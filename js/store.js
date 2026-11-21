// 存档：设置、每档战绩、每日挑战、教学进度、解锁的配色、正在玩的那一局。
const P = require('./platform.js');
const S = require('./sudoku.js');
const C = require('./config.js');

const KEY = 'jingdian-shudu-v1';
const blankStats = () => ({ played: 0, won: 0, perfect: 0, best: 0, total: 0, streak: 0, bestStreak: 0, bestScore: 0 });

const data = Object.assign({
  settings: null,
  stats: S.TIERS.map(blankStats),
  daily: {}, // '2026-11-20': { time, score }
  lessons: {}, // 'rules': true
  themes: {},
  current: null, // 正在玩的那一局（board.js 的对象）
  seen: { tutorial: false },
  next: [0, 0, 0, 0, 0, 0], // 每档下一题从题库第几题开始
}, P.load(KEY) || {});
// 老存档缺的字段补上（设置要逐项补，不然老存档会把新加的开关整个盖掉）
const SETTINGS = { mistakeLimit: true, autoNotes: true, sameHighlight: true, showTimer: true, sound: true, vibrate: true, theme: 'paper', tileStyle: 'A' };
data.settings = Object.assign({}, SETTINGS, data.settings || {});
// 0.1 / 0.2 的老主题名换成新的；免费主题一定在
const OLD_THEME = { morning: 'paper', night: 'chalk', mint: 'paper', apricot: 'paper', lilac: 'paper' };
if (OLD_THEME[data.settings.theme]) data.settings.theme = OLD_THEME[data.settings.theme];
delete data.settings.paper; delete data.settings.texture; delete data.settings.hatch;
data.themes = data.themes || {};
C.THEMES.forEach((t) => { if (t.free) data.themes[t.id] = true; });
if (!C.THEMES.some((t) => t.id === data.settings.theme)) data.settings.theme = 'paper';
data.stats = S.TIERS.map((_, i) => Object.assign(blankStats(), (data.stats || [])[i] || {}));

function save() { P.save(KEY, data); }

// 开一局：算一次「已玩」。如果上一局没下完就被替换，算输（连胜清零）
function startGame(tier, mode) {
  const cur = data.current;
  if (cur && !cur.done && cur.mode === 'normal') data.stats[cur.tier].streak = 0;
  if (mode === 'normal') data.stats[tier].played++;
  save();
}
function recordWin(b) {
  const s = data.stats[b.tier];
  if (b.mode === 'normal') {
    s.won++;
    if (b.mistakes === 0 && b.revives === 0) s.perfect++;
    s.total += b.elapsed;
    if (!s.best || b.elapsed < s.best) { s.best = b.elapsed; b.newBest = true; }
    if (b.score > s.bestScore) { s.bestScore = b.score; b.newBestScore = true; }
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    P.uploadScore('best_' + S.TIERS[b.tier].id, s.bestScore, { time: s.best });
  } else if (b.mode === 'challenge') {
    data.challenges = (data.challenges || 0) + 1;
  } else if (b.mode === 'daily') {
    data.daily[b.date] = { time: b.elapsed, score: b.score };
    P.uploadScore('daily_' + b.date.slice(0, 7), monthScore(b.date.slice(0, 7)));
  }
  data.current = null;
  save();
}
function recordLoss(b) {
  if (b.mode === 'normal') data.stats[b.tier].streak = 0;
  save();
}
function monthScore(ym) {
  let s = 0;
  for (const d in data.daily) if (d.slice(0, 7) === ym) s += data.daily[d].score;
  return s;
}

// 每日挑战：日期 → 哪一档、题库第几题（同一天大家同一题）
function dateKey(d) {
  const m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
function dailyPick(key, bank) {
  const d = new Date(key + 'T12:00:00');
  const tier = C.DAILY_TIER[d.getDay()];
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  // 从题库后半段挑，和普通局（从前往后出）尽量不撞
  const list = bank[tier];
  const half = Math.floor(list.length / 2);
  return { tier, idx: half + (h % (list.length - half)) };
}

module.exports = { data, save, startGame, recordWin, recordLoss, dateKey, dailyPick, monthScore };
