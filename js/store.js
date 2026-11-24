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
  seen: { tutorial: false }, // 0.7 起还会记：open 开场看过、cutLesson、cutTier{}、clearTier{}
  next: [0, 0, 0, 0, 0, 0], // 每档下一题从题库第几题开始
}, P.load(KEY) || {});
// 老存档缺的字段补上（设置要逐项补，不然老存档会把新加的开关整个盖掉）
const SETTINGS = { mistakeLimit: true, autoNotes: true, sameHighlight: true, showTimer: true, sound: true, vibrate: true, theme: 'paper', tileStyle: 'B', reduceMotion: false, chainLight: true };
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
// 最近的对局流水（进度表用）：{ d 日期, t 档, w 1 赢 / 0 输或没下完, m 模式 }，最多留 300 条
function logGame(b, w) {
  if (!b || b.mode === 'lesson' || b.logged) return;
  b.logged = true; // 同一局只记一次（重开、换局可能先后各调一次）
  const log = data.log || (data.log = []);
  log.push({ d: dateKey(new Date()), t: b.tier, w: w ? 1 : 0, m: b.mode });
  if (log.length > 300) log.splice(0, log.length - 300);
  uploadProgress();
}
// 连续天数（Fable 竞品对照：照 Wordle、多邻国的「连续 N 天」）：哪天赢过任意一局就算这天有。
// 今天还没赢不算断，从昨天往前数
function dayStreak() {
  const won = {};
  (data.log || []).forEach((e) => { if (e.w) won[e.d] = 1; });
  let n = 0, d = new Date();
  if (!won[dateKey(d)]) d = new Date(Date.now() - 864e5);
  while (won[dateKey(d)]) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
}
// 进度表：最近 7 天玩了几局、赢了几局、最常玩哪一档
function recent(days) {
  const from = dateKey(new Date(Date.now() - (days - 1) * 864e5));
  const list = (data.log || []).filter((x) => x.d >= from);
  const byTier = {};
  list.forEach((x) => { byTier[x.t] = (byTier[x.t] || 0) + 1; });
  let tier = -1, n = 0;
  for (const t in byTier) if (byTier[t] >= n) { n = byTier[t]; tier = +t; }
  if (tier < 0 && list.length === 0 && (data.log || []).length) tier = data.log[data.log.length - 1].t;
  return { games: list.length, won: list.filter((x) => x.w).length, tier };
}
// 给好友看的进度（微信好友数据，开放数据域里画）
function uploadProgress() {
  const r = recent(7);
  P.uploadKV('progress', JSON.stringify({ tier: r.tier, week: r.games, won: r.won, t: Math.floor(Date.now() / 1000) }));
}

function startGame(tier, mode) {
  // 开新的普通局 / 每日：搁着的那局就算没做完（挑战、对战不动它）
  if (data.shelf && mode !== 'duo' && mode !== 'challenge') { logGame(data.shelf, 0); data.shelf = null; }
  const cur = data.current;
  if (cur && !cur.done && cur.mode === 'normal') data.stats[cur.tier].streak = 0;
  if (cur && !cur.done) logGame(cur, 0); // 上一局没下完就换掉：算没做完
  if (mode === 'normal') data.stats[tier].played++;
  save();
}
function recordWin(b) {
  const s = data.stats[b.tier];
  if (b.mode === 'normal') {
    s.won++;
    if (b.mistakes === 0 && b.revives === 0) s.perfect++;
    s.total += b.elapsed;
    // 带练第一局是只有约 21 个空的小题：不进最快纪录、最高分
    if (!b.guided && (!s.best || b.elapsed < s.best)) { s.best = b.elapsed; b.newBest = true; }
    if (!b.guided && b.score > s.bestScore) { s.bestScore = b.score; b.newBestScore = true; }
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    P.uploadScore('best_' + S.TIERS[b.tier].id, s.bestScore, { time: s.best });
  } else if (b.mode === 'challenge') {
    data.challenges = (data.challenges || 0) + 1;
  } else if (b.mode === 'duo') {
    data.duos = (data.duos || 0) + 1;
  } else if (b.mode === 'daily') {
    const old = data.daily[b.date];
    if (!old || b.score > old.score) data.daily[b.date] = { time: b.elapsed, score: b.score }; // 再玩一次：只留最好的一次
    P.uploadScore('daily_' + b.date.slice(0, 7), monthScore(b.date.slice(0, 7)));
  }
  // 做完的题记下自己的成绩：朋友发来同一题的成绩时，直接并排比（不用再做一遍）
  const fin = data.finished || (data.finished = {});
  fin[b.puzzle] = { time: b.elapsed, mistakes: b.mistakes, score: b.score, tier: b.tier, at: Date.now() };
  const keys = Object.keys(fin);
  if (keys.length > 60) keys.sort((a, c) => fin[a].at - fin[c].at).slice(0, keys.length - 60).forEach((k) => delete fin[k]);
  b.firstToday = !(data.log || []).some((e) => e.w && e.d === dateKey(new Date())); // 今天第一次赢：结算页报连续天数
  logGame(b, 1);
  data.current = null;
  save();
}
function recordLoss(b) {
  if (b.mode === 'normal') data.stats[b.tier].streak = 0;
  logGame(b, 0);
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

module.exports = { data, save, startGame, recordWin, recordLoss, dateKey, dailyPick, monthScore, recent, logGame, dayStreak };
