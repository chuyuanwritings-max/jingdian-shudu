// 弹层：选难度、设置、看广告（假倒计时）、错 3 次、学完一课。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const store = require('./store.js');
const Paper = require('./paper.js');
const T = require('./tutorial.js');

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
};

module.exports = function (app) {
  // 底部抽屉：从下往上滑出来，背后变暗
  function sheet(ctx, p, h, title) {
    const th = app.th;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 * p) + ')';
    ctx.fillRect(0, 0, app.W, app.H);
    const y = app.H - h * ui.ease.out(p);
    ui.fillRR(ctx, 0, y, app.W, h + 24, 20, th.card);
    ui.fillRR(ctx, app.W / 2 - 18, y + 8, 36, 4, 2, th.lineThin);
    if (title) ui.text(ctx, title, app.W / 2, y + 36, 17, th.text, 'center', 600);
    ui.button({ id: 'sheet-body', x: 0, y, w: app.W, h: h + 24 }); // 点抽屉本身不关
    return y;
  }
  // 居中的卡片
  function modal(ctx, p, h) {
    const th = app.th;
    ctx.fillStyle = 'rgba(0,0,0,' + (0.38 * p) + ')';
    ctx.fillRect(0, 0, app.W, app.H);
    const w = Math.min(340, app.W - 40);
    const s = 0.94 + 0.06 * ui.ease.back(p);
    const x = (app.W - w) / 2, y = (app.H - h) / 2;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate(app.W / 2, app.H / 2);
    ctx.scale(s, s);
    ctx.translate(-app.W / 2, -app.H / 2);
    ui.fillRR(ctx, x, y, w, h, 20, th.card);
    ui.button({ id: 'modal-body', x, y, w, h });
    return { x, y, w, h, done: () => ctx.restore() };
  }

  // ---------- 选难度 ----------
  app.difficultySheet = () => app.push({
    onBackdrop: () => app.pop(),
    draw(ctx, t, p) {
      const th = app.th, rowH = 56, h = 64 + rowH * 6 + 70 + (app.H - app.bottom);
      const y = sheet(ctx, p, h, '选择难度');
      S.TIERS.forEach((tier, i) => {
        const ry = y + 60 + i * rowH;
        const on = ui.button({ id: 'tier-' + i, x: 16, y: ry, w: app.W - 32, h: rowH - 6, onTap: () => { app.pop(); app.startGame(i); } });
        ui.fillRR(ctx, 16, ry, app.W - 32, rowH - 6, 14, on ? th.sel : th.soft);
        ui.text(ctx, tier.name, 36, ry + (rowH - 6) / 2, 17, th.text, 'left', 600);
        const st = store.data.stats[i];
        const sub = st.won ? '最好 ' + fmt(st.best) + ' · 赢 ' + st.won + ' 局' : '还没玩过';
        ui.text(ctx, sub, app.W - 52, ry + (rowH - 6) / 2, 13, th.sub, 'right');
        // 推荐（按第一次打开时选的级别）、这一档要先会的新招
        ctx.font = ui.font(17, 600);
        let bx = 36 + ctx.measureText(tier.name).width + 10;
        if (app.recTier && app.recTier() === i) { ui.fillRR(ctx, bx, ry + 13, 40, 22, 11, th.primary); ui.text(ctx, '推荐', bx + 20, ry + 24, 11, th.primaryText, 'center', 700); bx += 46; }
        const need = T.TIER_LESSON[i];
        if (need && !store.data.lessons[need]) { const L = T.LESSONS.find((x) => x.id === need); ui.text(ctx, '新招：' + L.name, bx, ry + 24, 11, th.gold, 'left', 600); }
        ui.icons.chevron(ctx, app.W - 34, ry + (rowH - 6) / 2, 18, th.faint);
      });
      const cy = y + 64 + rowH * 6 + 6;
      ui.pill(ctx, th, 'tier-cancel', 16, cy, app.W - 32, 48, '取消', () => app.pop(), 'card');
    },
  });

  // ---------- 设置 ----------
  const TOGGLES = [
    ['mistakeLimit', '错 3 次算输', '关掉就不限次数'],
    ['autoNotes', '自动擦笔记', '填对一个数，同行同列同宫的这个笔记擦掉'],
    ['sameHighlight', '高亮相同数字', ''],
    ['reduceMotion', '简洁动效', '过场只播短的，不震屏、不闪'],
    ['showTimer', '显示计时', ''],
    ['sound', '声音', ''],
    ['vibrate', '震动', ''],
  ];
  function toggle(ctx, x, y, on, th) {
    ui.fillRR(ctx, x, y, 48, 28, 14, on ? th.primary : th.lineThin);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(on ? x + 34 : x + 14, y + 14, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  app.settingsSheet = (back) => app.push({
    onBackdrop: () => app.pop(),
    draw(ctx, t, p) {
      const th = app.th, rowH = 50;
      const h = 56 + rowH * TOGGLES.length + 62 + 66 + (app.H - app.bottom);
      const y = sheet(ctx, p, h, '设置');
      const set = store.data.settings;
      TOGGLES.forEach(([key, label, sub], i) => {
        const ry = y + 54 + i * rowH;
        ui.button({
          id: 'set-' + key, x: 0, y: ry, w: app.W, h: rowH,
          onTap: () => {
            set[key] = !set[key];
            if (key === 'sound') P.setMuted(!set.sound);
            if (key === 'vibrate') P.setVibrate(set.vibrate);
            store.save();
            app.sound('tap');
          },
        });
        ui.text(ctx, label, 24, ry + (sub ? 17 : rowH / 2), 16, th.text, 'left', 500);
        if (sub) ui.text(ctx, sub, 24, ry + 36, 12, th.sub);
        toggle(ctx, app.W - 72, ry + rowH / 2 - 14, set[key] !== false, th);
      });
      // 主题（颜色 + 质地一整套，单独一页，能实时预览）
      const ly = y + 54 + rowH * TOGGLES.length + 4;
      const on = ui.button({ id: 'set-look', x: 16, y: ly, w: app.W - 32, h: 52, onTap: () => { app.pop(); app.go('look', { back: back || { name: app.sceneName } }); } });
      ui.fillRR(ctx, 16, ly, app.W - 32, 52, 14, on ? th.sel : th.soft);
      ui.text(ctx, '主题', 32, ly + 26, 16, th.text, 'left', 600);
      ui.text(ctx, th.name, app.W - 52, ly + 26, 14, th.sub, 'right');
      ui.icons.chevron(ctx, app.W - 36, ly + 26, 18, th.faint);
      ui.pill(ctx, th, 'set-done', 16, ly + 62, app.W - 32, 48, '完成', () => app.pop(), 'primary');
    },
  });

  // ---------- 看广告（假倒计时；真广告接 platform.showRewardedAd） ----------
  // what：看完能得到什么（写在倒计时下面）
  app.showAd = (slot, what, onReward, onSkip) => {
    const real = P.showRewardedAd(C.ADS[slot], onReward, onSkip || (() => app.toast('没看完，就不给了')));
    if (real) return;
    const t0 = P.now(), total = C.ADS.fakeSeconds * 1000;
    let finished = false;
    app.push({
      live: () => true,
      draw(ctx, t, p) {
        const th = app.th;
        ctx.fillStyle = 'rgba(12,14,18,' + (0.94 * p) + ')';
        ctx.fillRect(0, 0, app.W, app.H);
        const left = Math.max(0, Math.ceil((total - (t - t0)) / 1000));
        ui.text(ctx, '广告占位（正式版放微信激励视频）', app.W / 2, app.H / 2 - 70, 14, 'rgba(255,255,255,0.6)', 'center');
        ui.text(ctx, String(left || '✓'), app.W / 2, app.H / 2 - 10, 56, '#FFFFFF', 'center', 300);
        ui.text(ctx, '看完可得：' + what, app.W / 2, app.H / 2 + 50, 16, '#FFFFFF', 'center', 500);
        // 关闭 = 不要奖励
        const on = ui.button({ id: 'ad-close', x: app.W - 64, y: app.headerY, w: 52, h: 44, onTap: () => { finished = true; app.pop(); (onSkip || (() => app.toast('没看完，就不给了')))(); } });
        ui.fillRR(ctx, app.W - 58, app.headerY + 6, 40, 32, 16, on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)');
        ui.icons.close(ctx, app.W - 38, app.headerY + 22, 22, '#FFFFFF');
        if (!finished && t - t0 >= total) {
          finished = true;
          setTimeout(() => { app.pop(); onReward(); }, 250);
        }
      },
    });
  };

  // ---------- 错 3 次 ----------
  app.lostModal = (b, handlers) => app.push({
    draw(ctx, t, p) {
      const th = app.th;
      const m = modal(ctx, p, 300);
      ui.text(ctx, '错了 ' + C.RULES.maxMistakes + ' 次', app.W / 2, m.y + 44, 22, th.text, 'center', 700);
      ui.text(ctx, '这一局到这里了。想接着做吗？', app.W / 2, m.y + 78, 14, th.sub, 'center');
      const bx = m.x + 20, bw = m.w - 40;
      const on = ui.button({ id: 'lost-revive', x: bx, y: m.y + 108, w: bw, h: 52, onTap: () => { app.pop(); handlers.revive(); } });
      ui.fillRR(ctx, bx, m.y + 108, bw, 52, 16, th.primary);
      if (on) ui.fillRR(ctx, bx, m.y + 108, bw, 52, 16, 'rgba(0,0,0,0.1)');
      ui.icons.video(ctx, bx + 40, m.y + 134, 24, 'rgba(255,255,255,0.35)');
      ui.text(ctx, '看广告，再给一次机会', app.W / 2 + 12, m.y + 134, 17, th.primaryText, 'center', 600);
      ui.pill(ctx, th, 'lost-restart', bx, m.y + 172, bw, 48, '重新开始这一题', () => { app.pop(); handlers.restart(); }, 'soft');
      ui.pill(ctx, th, 'lost-new', bx, m.y + 230, bw, 48, '换一题', () => { app.pop(); handlers.fresh(); }, 'card');
      m.done();
    },
  });

  // ---------- 通用确认 ----------
  app.confirm = (title, sub, yes, onYes) => app.push({
    onBackdrop: () => app.pop(),
    draw(ctx, t, p) {
      const th = app.th;
      const m = modal(ctx, p, 196);
      ui.text(ctx, title, app.W / 2, m.y + 40, 19, th.text, 'center', 700);
      ui.wrap(ctx, sub, app.W / 2, m.y + 64, m.w - 40, 14, 20, th.sub, 400, 'center');
      const bw = (m.w - 52) / 2;
      ui.pill(ctx, th, 'cf-no', m.x + 20, m.y + 124, bw, 48, '取消', () => app.pop(), 'soft');
      ui.pill(ctx, th, 'cf-yes', m.x + 32 + bw, m.y + 124, bw, 48, yes, () => { app.pop(); onYes(); }, 'primary');
      m.done();
    },
  });

  app.fmt = fmt;
  app.sheet = sheet;
  app.modal = modal;
};
