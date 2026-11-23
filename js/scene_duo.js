// 约好友一起做（0.9，Cc：「我跟我女朋友，我们俩可以同时开始做」）
// 不用服务器：邀请卡里写好「几点几分开始」，两部手机各自按自己的时钟倒计时（手机时间都对过网，差不到一秒），到点同时揭开同一道题。
// 题目到点才揭开（邀请卡上的图也是空盘），谁都偷看不了。各算各的用时；做完「把成绩发给他」，他做完才看得到（复用挑战卡）。
const P = require('./platform.js');
const ui = require('./ui.js');
const S = require('./sudoku.js');
const Board = require('./board.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const focusBank = require('./focus_bank.js');
const DB = require('./drawboard.js');

const DELAYS = [1, 3, 5]; // 几分钟后开始
const EMPTY = '0'.repeat(81);

// 邀请链接：d = 档.题号.开始时间（秒），p = 题目
function encodeDuo(duo) { return { d: [duo.tier, duo.idx, duo.at].join('.'), p: duo.puzzle }; }
function decodeDuo(q) {
  if (!q || !q.d) return null;
  const [tier, idx, at] = String(q.d).split('.').map(Number);
  if (!(tier >= 0 && tier < 6) || !(at > 1.7e9)) return null;
  const puzzle = q.p && /^[0-9]{81}$/.test(q.p) ? q.p : null;
  if (!puzzle || S.countSolutions(S.decode(puzzle), 2) !== 1) return null;
  return { tier, idx: idx || 0, at, puzzle };
}
const hhmm = (sec) => { const d = new Date(sec * 1000); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

module.exports = function (app) {
  // ---------- 发邀请：选难度、选几分钟后开始 ----------
  let pick = null; // { tier, delay }
  app.duoSheet = () => {
    pick = { tier: store.data.lastTier != null ? store.data.lastTier : Math.max(0, app.recTier ? app.recTier() : 1), delay: 1 };
    app.push({
      onBackdrop: () => app.pop(),
      draw(ctx, t, p) {
        const th = app.th, W = app.W;
        const h = 330 + (app.H - app.bottom);
        const y = app.sheet(ctx, p, h, '约好友一起做');
        ui.text(ctx, '同一道题，到点两边同时开始，各算各的用时', W / 2, y + 62, 13, th.sub, 'center');
        ui.text(ctx, '难度', 20, y + 92, 13, th.sub, 'left', 600);
        const gap = 6, cw = (W - 32 - gap * 5) / 6;
        S.TIERS.forEach((tr, i) => {
          const x = 16 + i * (cw + gap), cy = y + 106;
          ui.button({ id: 'duo-tier-' + i, x, y: cy, w: cw, h: 36, onTap: () => { pick.tier = i; } });
          ui.fillRR(ctx, x, cy, cw, 36, 18, i === pick.tier ? th.primary : th.soft);
          ui.text(ctx, tr.name, x + cw / 2, cy + 18, 13, i === pick.tier ? th.primaryText : th.primary, 'center', 600);
        });
        ui.text(ctx, '什么时候开始', 20, y + 164, 13, th.sub, 'left', 600);
        const dw = (W - 32 - gap * 2) / 3;
        DELAYS.forEach((m, i) => {
          const x = 16 + i * (dw + gap), cy = y + 178;
          ui.button({ id: 'duo-delay-' + m, x, y: cy, w: dw, h: 40, onTap: () => { pick.delay = m; } });
          ui.fillRR(ctx, x, cy, dw, 40, 20, m === pick.delay ? th.primary : th.soft);
          ui.text(ctx, m + ' 分钟后', x + dw / 2, cy + 20, 14, m === pick.delay ? th.primaryText : th.primary, 'center', 600);
        });
        ui.pill(ctx, th, 'duo-send', 16, y + 240, W - 32, 54, '发邀请（' + hhmm(Math.ceil(Date.now() / 1000) + pick.delay * 60) + ' 开始）', () => { app.pop(); createDuo(pick.tier, pick.delay); }, 'primary');
      },
    });
  };
  function createDuo(tier, delay) {
    // 简单 / 中等 / 困难从一招题库里随便挑一题；其他档从主题库前半段挑
    const fb = focusBank[tier];
    let idx, puzzle;
    if (fb && fb.length) { const i = Math.floor(Math.random() * fb.length); idx = 1000 + i; puzzle = fb[i]; }
    else { const half = Math.floor(bank[tier].length / 2); idx = Math.floor(Math.random() * half); puzzle = bank[tier][idx]; }
    const duo = { tier, idx, puzzle, at: Math.ceil(Date.now() / 1000) + delay * 60, host: true };
    store.data.duo = duo;
    store.save();
    app.go('duo');
    invite(duo);
  }
  function invite(duo) {
    const tn = S.TIERS[duo.tier].name;
    const title = '约你 ' + hhmm(duo.at) + ' 一起做一道「' + tn + '」数独，同一道题同时开始';
    const img = app.makeShareImage({ puzzle: EMPTY, tier: duo.tier }, ['约你一起做', hhmm(duo.at) + ' 开始'], '「' + tn + '」数独\n同一道题，到点才揭开', '来一起做');
    app.shareCard(title, encodeDuo(duo), img, '发邀请');
  }

  // ---------- 朋友点开邀请 ----------
  app.openDuo = (q) => {
    const d = decodeDuo(q);
    if (!d) return false;
    const cur = store.data.duo;
    if (!(cur && cur.puzzle === d.puzzle)) { store.data.duo = Object.assign(d, { host: false }); store.save(); }
    app.go('duo');
    return true;
  };

  function startDuo() {
    const duo = store.data.duo;
    if (!duo) return;
    store.data.seen.tutorial = true;
    if (!store.data.level) store.data.level = 'some';
    store.startGame(duo.tier, 'duo');
    const nb = Board.create({ mode: 'duo', tier: duo.tier, idx: duo.idx, puzzle: duo.puzzle });
    nb.duo = { at: duo.at };
    store.data.current = nb;
    store.data.duo = null;
    store.save();
    app.sound('lamp');
    app.buzz('heavy');
    app.go('play', { board: nb });
  }

  // ---------- 等候室：倒计时，到点揭开 ----------
  let lastTick = -1, lateAtEnter = false;
  app.scenes.duo = {
    enter() {
      const duo = store.data.duo;
      lastTick = -1;
      lateAtEnter = !!duo && Date.now() > duo.at * 1000 + 3000; // 进来时已经过点 3 秒以上：不自动开，让他自己点
    },
    live: () => true,
    draw(ctx, t) {
      const th = app.th, W = app.W, duo = store.data.duo;
      app.header(ctx, '约好一起做', () => app.go(store.data.seen.tutorial ? 'home' : 'welcome'));
      if (!duo) { ui.text(ctx, '这一局已经开始或者取消了', W / 2, app.H / 2, 15, th.sub, 'center'); return; }
      const left = duo.at * 1000 - Date.now(), tn = S.TIERS[duo.tier].name;
      let y = app.headerY + app.headerH + 18;
      ui.text(ctx, duo.host ? '邀请发出去了，到点一起开始' : '朋友约你一起做', W / 2, y, 15, th.sub, 'center');
      ui.text(ctx, '「' + tn + '」数独 · 同一道题', W / 2, y + 34, 22, th.text, 'center', 700);
      y += 66;
      // 倒计时（最后 3 秒每秒一声）
      if (left > 0) {
        ui.text(ctx, mmss(left), W / 2, y + 36, 56, th.primary, 'center', 800);
        ui.text(ctx, hhmm(duo.at) + ' 开始', W / 2, y + 80, 13, th.sub, 'center');
        const s = Math.ceil(left / 1000);
        if (s <= 3 && s !== lastTick) { lastTick = s; app.sound('tick' + (4 - s)); }
      } else if (!lateAtEnter) {
        startDuo();
        return;
      } else {
        ui.text(ctx, '已经开始 ' + mmss(-left) + ' 了', W / 2, y + 36, 30, th.text, 'center', 700);
        ui.text(ctx, '现在开始也行，各算各的用时', W / 2, y + 76, 13, th.sub, 'center');
      }
      y += 104;
      // 盖着的棋盘：到点才揭开题目
      const avail = app.bottom - 16 - y - 130;
      const size = Math.max(160, Math.min(W - 80, Math.floor(avail / 9) * 9)), bx = Math.round((W - size) / 2);
      DB.draw(ctx, th, { x: bx, y, size }, { vals: new Array(81).fill(0), given: new Array(81).fill(false), notes: null, wrong: () => false, selected: -1, now: t }, app.dpr);
      ui.fillRR(ctx, bx + size / 2 - 92, y + size / 2 - 24, 184, 48, 24, th.card);
      ui.icons.lock(ctx, bx + size / 2 - 66, y + size / 2, 18, th.sub);
      ui.text(ctx, '到点才揭开题目', bx + size / 2 + 10, y + size / 2, 15, th.text, 'center', 600);
      y += size + 18;
      if (left <= 0) ui.pill(ctx, th, 'duo-start', 16, y, W - 32, 54, '开始', () => startDuo(), 'primary');
      else if (duo.host) ui.pill(ctx, th, 'duo-resend', 16, y, W - 32, 50, '再发一次邀请', () => invite(duo), 'card');
      else if (!store.data.lessons.rules) ui.pill(ctx, th, 'duo-learn', 16, y, W - 32, 50, '没玩过？先花 30 秒学规则', () => app.go('lesson', { index: 0, then: 'duo', firstRun: true }), 'card');
      ui.text(ctx, '做完把成绩发给对方：他做完才看得到你的用时', W / 2, y + 72, 12, th.sub, 'center');
    },
  };

  app.duoHooks = { encodeDuo, decodeDuo, startDuo, current: () => store.data.duo };
};
