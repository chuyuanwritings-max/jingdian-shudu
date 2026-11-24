// 首页（0.7 精简，主页与过场设计_Fable_1.0.md 第三部分）：主页图 + 游戏名 + 一个会变的大按钮 + 一行小字 + 两个小图标。
// 能点的从 8 个减到 4 个：大按钮（继续 / 接着学 / 新游戏）、小字（新游戏 › / 换难度 ›）、左下「今日」、右下「更多」。
// 主页的颜色跟着主页图走，不跟主题走（主题只管进了游戏以后的棋盘）。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const T = require('./tutorial.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const HA = require('./homeart.js');
const LY = require('./layout.js');

module.exports = function (app) {
  app.TITLE = '数独'; // 名字定了以后改这里
  let H0 = C.HOME; // 每帧按主页图换（暗底 / 亮底）
  // 游戏名的位置：布局表 home.title（界面编辑器里能拖）；欢迎页、开场过场也对齐它
  Object.defineProperty(app, 'titleY', { get: () => { const r = LY.rect('home.title'); return r.y + r.h / 2; } });
  let coldStart = true; // 冷启动的那一次：亮的那块「啪」地点亮（0.3 秒，不拦操作）

  // 大按钮写什么：有没做完的一局 → 继续；新手引导没走完 → 接着学；其他 → 新游戏（直接开推荐那一档）
  function mainAction() {
    const cur = store.data.current;
    if (cur && !cur.done) {
      const label = (cur.mode === 'daily' ? '每日挑战 · ' : cur.mode === 'challenge' ? '好友挑战 · ' : '') + S.TIERS[cur.tier].name + ' · ' + app.fmt(cur.elapsed);
      return { title: '继续', sub: label, go: () => app.continueGame(), link: '新游戏 ›' };
    }
    if (store.data.level === 'new' && !store.data.lessons.rules) {
      return { title: '接着学', sub: '第 1 课 · 规则', go: () => app.go('lesson', { index: 0, then: 'guided' }), link: '' };
    }
    const tier = store.data.lastTier != null ? store.data.lastTier : Math.max(0, app.recTier ? app.recTier() : 1);
    return { title: '新游戏', sub: S.TIERS[tier].name, go: () => app.startGame(tier), link: '换难度 ›' };
  }

  // 「更多」：半屏面板，六行
  // 「更多」：半屏面板。每行一个固定的 id（more-lessons……），以后加行不打乱
  app.moreSheet = () => app.push({
    onBackdrop: () => app.pop(),
    draw(ctx, t, p) {
      const th = app.th;
      const learned = T.BASIC.filter((L) => store.data.lessons[L.id]).length;
      const rows = [
        ['lessons', '教学', '基础 ' + learned + ' / ' + T.BASIC.length, () => app.go('lessons')],
        ['progress', '进度表', '最近玩什么、胜率', () => app.go('progress')],
        ['look', '主题', th.name, () => app.go('look', { back: { name: 'home' } })],
        ['stats', '战绩', '', () => app.go('stats')],
        ['brain', '数独练脑', '', () => app.go('brain')],
        ['settings', '设置', '', () => app.settingsSheet({ name: 'home' })],
      ];
      // 小屏（iPhone SE）行矮一点，整张面板不超过屏幕 85%
      const rowH = Math.max(44, Math.min(56, Math.floor((app.H * 0.85 - 74 - (app.H - app.bottom)) / rows.length)));
      const h = 58 + rows.length * rowH + 16 + (app.H - app.bottom);
      const y = app.sheet(ctx, p, h, '');
      rows.forEach(([id, name, sub, go], i) => {
        const ry = y + 26 + i * rowH;
        const on = ui.button({ id: 'more-' + id, x: 12, y: ry, w: app.W - 24, h: rowH - 4, onTap: () => { app.pop(); go(); } });
        if (on) ui.fillRR(ctx, 12, ry, app.W - 24, rowH - 4, 12, th.soft);
        ui.text(ctx, name, 32, ry + (rowH - 4) / 2, 17, th.text, 'left', 600);
        if (sub) ui.text(ctx, sub, app.W - 52, ry + (rowH - 4) / 2, 13, th.sub, 'right');
        ui.icons.chevron(ctx, app.W - 34, ry + (rowH - 4) / 2, 18, th.faint);
      });
    },
  });

  // 今日小图标：日历，里面写今天的日期；今天没做右上一个琥珀小点，做完变 ✓
  function drawToday(ctx, cx, cy, on) {
    const d = new Date(), done = !!store.data.daily[store.dateKey(d)];
    ctx.save();
    if (on) { ctx.translate(cx, cy); ctx.scale(0.92, 0.92); ctx.translate(-cx, -cy); }
    ui.stroke(ctx, H0.title, 2);
    ui.rr(ctx, cx - 15, cy - 13, 30, 28, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 15, cy - 5); ctx.lineTo(cx + 15, cy - 5); ctx.stroke();
    ui.text(ctx, String(d.getDate()), cx, cy + 5, 13, H0.title, 'center', 700);
    if (done) { ctx.beginPath(); ctx.arc(cx + 15, cy - 13, 7, 0, Math.PI * 2); ctx.fillStyle = H0.amber; ctx.fill(); ui.icons.check(ctx, cx + 15, cy - 13, 9, '#141A17', 2); }
    else { ctx.beginPath(); ctx.arc(cx + 15, cy - 13, 4.5, 0, Math.PI * 2); ctx.fillStyle = H0.amber; ctx.fill(); }
    ctx.restore();
    ui.text(ctx, '今日', cx, cy + 30, 11, H0.sub, 'center');
  }
  // 对战：两个小人头对着，中间一道闪电似的斜线
  function drawDuo(ctx, cx, cy, on) {
    ctx.save();
    if (on) { ctx.translate(cx, cy); ctx.scale(0.92, 0.92); ctx.translate(-cx, -cy); }
    ui.stroke(ctx, H0.title, 2);
    for (const dx of [-8, 8]) {
      ctx.beginPath(); ctx.arc(cx + dx, cy - 6, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + dx, cy + 12, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.strokeStyle = H0.amber; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(cx + 2, cy - 14); ctx.lineTo(cx - 2, cy - 2); ctx.lineTo(cx + 2, cy - 2); ctx.lineTo(cx - 2, cy + 10); ctx.stroke();
    ctx.restore();
    ui.text(ctx, '对战', cx, cy + 30, 11, H0.sub, 'center');
  }
  function drawRank(ctx, cx, cy, on) {
    ctx.save();
    if (on) { ctx.translate(cx, cy); ctx.scale(0.92, 0.92); ctx.translate(-cx, -cy); }
    ui.icons.trophy(ctx, cx, cy, 30, H0.title, 1);
    ctx.restore();
    ui.text(ctx, '好友榜', cx, cy + 30, 11, H0.sub, 'center');
  }
  function drawMore(ctx, cx, cy, on) {
    ctx.save();
    if (on) { ctx.translate(cx, cy); ctx.scale(0.92, 0.92); ctx.translate(-cx, -cy); }
    ui.stroke(ctx, H0.title, 2.4);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx - 13, cy + i * 8); ctx.lineTo(cx + 13, cy + i * 8); ctx.stroke(); }
    ctx.restore();
    ui.text(ctx, '更多', cx, cy + 30, 11, H0.sub, 'center');
  }

  app.scenes.home = {
    enter() { this.t0 = P.now(); this.cold = coldStart && !!store.data.seen.open; coldStart = false; },
    // 进主页后呼吸光播 6 秒就停（省电）；冷启动那一下 0.4 秒
    live(t) { return t - this.t0 < 6000; },
    draw(ctx, t) {
      const W = app.W, H = app.H;
      const art = HA.draw(ctx, W, H, app.dpr);
      H0 = HA.colors();
      const L = art.lit, e = t - this.t0;
      // 亮的那一块：一团很淡的琥珀光，4 秒一次呼吸
      ctx.save();
      ctx.globalAlpha = 0.15 * (0.5 - 0.5 * Math.cos((e / 4000) * Math.PI * 2));
      const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.s * 1.6);
      gr.addColorStop(0, H0.amber); gr.addColorStop(1, 'rgba(224,176,64,0)');
      ctx.fillStyle = gr; ctx.fillRect(L.x - L.s * 2, L.y - L.s * 2, L.s * 4, L.s * 4);
      ctx.restore();
      // 冷启动：先压暗，第 6 帧亮的那块「啪」地点亮（只闪它周围），一声轻「叮」
      if (this.cold && e < 400) {
        if (e < 100) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, W, H); }
        else {
          if (!this.dinged) { this.dinged = true; app.sound('bell9', 0.3); }
          const k = 1 - (e - 100) / 300;
          ctx.save(); ctx.globalAlpha = 0.25 * k;
          ctx.fillStyle = H0.flash; ctx.beginPath(); ctx.arc(L.x, L.y, L.s * (1 + (1 - k) * 0.8), 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      // 游戏名（字号跟着框的高度走）
      const rt = LY.rect('home.title');
      ui.text(ctx, app.TITLE, rt.x + rt.w / 2, rt.y + rt.h / 2, Math.round(rt.h), H0.title, 'center', 800);
      // 大按钮
      const a = mainAction();
      const rm = LY.rect('home.main');
      const bw = Math.round(rm.w), bh = Math.round(rm.h), bx = Math.round(rm.x), by = Math.round(rm.y);
      const on = ui.button({ id: 'home-main', x: bx, y: by, w: bw, h: bh, onTap: a.go });
      ctx.save();
      const mx = bx + bw / 2;
      if (on) { ctx.translate(mx, by + bh / 2); ctx.scale(0.97, 0.97); ctx.translate(-mx, -by - bh / 2); }
      ui.fillRR(ctx, bx, by, bw, bh, Math.min(18, bh / 2), H0.button);
      const mk = LY.k('home.main', rm);
      ui.text(ctx, a.title, mx, by + bh / 2 - 7 * mk, Math.round(20 * mk), H0.buttonText, 'center', 800);
      ctx.globalAlpha = 0.7;
      ui.text(ctx, a.sub, mx, by + bh / 2 + 14 * mk, Math.round(12 * mk), H0.buttonText, 'center', 600);
      ctx.restore();
      // 一行小字
      const rl = LY.rect('home.link');
      if (a.link) {
        const lon = ui.button({ id: 'home-link', x: rl.x, y: rl.y, w: rl.w, h: rl.h, onTap: () => app.difficultySheet() });
        ui.text(ctx, a.link, rl.x + rl.w / 2, rl.y + rl.h / 2, Math.round(14 * LY.k('home.link', rl)), lon ? H0.title : H0.sub, 'center', 600);
      }
      // 两个小图标（图标在框的上半，字在下面）
      const rd = LY.rect('home.daily'), ro = LY.rect('home.more');
      const tOn = ui.button({ id: 'home-daily', x: rd.x, y: rd.y, w: rd.w, h: rd.h, onTap: () => app.go('daily') });
      drawToday(ctx, rd.x + rd.w / 2, rd.y + 26, tOn);
      const mOn = ui.button({ id: 'home-more', x: ro.x, y: ro.y, w: ro.w, h: ro.h, onTap: () => app.moreSheet() });
      drawMore(ctx, ro.x + ro.w / 2, ro.y + 26, mOn);
      // 对战、好友榜（Cc：「好友榜也应该放在主页上……对战模式……都应该放在主页上」）
      const rv = LY.rect('home.duo'), rr2 = LY.rect('home.rank');
      const vOn = ui.button({ id: 'home-duo', x: rv.x, y: rv.y, w: rv.w, h: rv.h, onTap: () => app.duoSheet() });
      drawDuo(ctx, rv.x + rv.w / 2, rv.y + 26, vOn);
      const kOn = ui.button({ id: 'home-rank', x: rr2.x, y: rr2.y, w: rr2.w, h: rr2.h, onTap: () => app.go('rank') });
      drawRank(ctx, rr2.x + rr2.w / 2, rr2.y + 26, kOn);
      // 版本号（Cc：「主页上记得写版本号」）
      const rver = LY.rect('home.ver');
      ui.text(ctx, 'v' + C.VERSION, rver.x + rver.w / 2, rver.y + rver.h / 2, 10, H0.sub, 'center');
    },
  };
};
