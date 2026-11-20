// 外观：上面一块小棋盘实时预览，下面三排方块：配色、背景颜色、质地。点一下立刻换。
const ui = require('./ui.js');
const C = require('./config.js');
const store = require('./store.js');
const Paper = require('./paper.js');
const DB = require('./drawboard.js');
const T = require('./tutorial.js');

module.exports = function (app) {
  let back = null;
  // 预览盘：一道题的样子，选中一格、有笔记，看得出高亮和数字颜色
  const vals = T.SOL.map((v, k) => ((k * 7) % 5 < 2 ? v : 0));
  const given = vals.map(Boolean);
  vals[30] = T.SOL[30];
  const notes = new Array(81).fill(0);
  notes[31] = (1 << 2) | (1 << 5) | (1 << 8);
  notes[49] = (1 << 1) | (1 << 4);

  function square(ctx, th, id, x, y, s, selected, drawInside, label, onTap, locked) {
    const on = ui.button({ id, x, y: y - 4, w: s, h: s + 26, onTap });
    ctx.save();
    if (on) { ctx.translate(x + s / 2, y + s / 2); ctx.scale(0.94, 0.94); ctx.translate(-x - s / 2, -y - s / 2); }
    ui.rr(ctx, x, y, s, s, 12);
    ctx.save(); ctx.clip(); drawInside(x, y, s); ctx.restore();
    ui.rr(ctx, x, y, s, s, 12);
    ctx.lineWidth = selected ? 3 : 1;
    ctx.strokeStyle = selected ? th.primary : 'rgba(0,0,0,0.12)';
    ctx.stroke();
    if (selected) {
      ctx.beginPath(); ctx.arc(x + s - 8, y + 8, 9, 0, Math.PI * 2); ctx.fillStyle = th.primary; ctx.fill();
      ui.icons.check(ctx, x + s - 8, y + 8, 12, '#FFFFFF', 2);
    }
    if (locked) {
      // 没解锁：整块蒙一层，右下角一个小锁
      ui.fillRR(ctx, x, y, s, s, 12, 'rgba(255,255,255,0.45)');
      ctx.beginPath(); ctx.arc(x + s - 9, y + s - 9, 10, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,44,52,0.75)'; ctx.fill();
      ui.icons.lock(ctx, x + s - 9, y + s - 8, 12, '#FFFFFF');
    }
    ctx.restore();
    ui.text(ctx, label, x + s / 2, y + s + 13, 12, selected ? th.primary : th.sub, 'center', selected ? 600 : 400);
  }

  app.scenes.look = {
    enter(args) { back = args.back || { name: 'home' }; },
    draw(ctx) {
      const th = app.th, W = app.W, set = store.data.settings;
      app.header(ctx, '外观', () => app.go(back.name, back.args || {}));
      let y = app.headerY + app.headerH + 8;
      // 预览
      const size = Math.max(135, Math.min(252, Math.floor((app.bottom - y - 330) / 9) * 9));
      const geo = { x: Math.round((W - size) / 2), y, size };
      DB.draw(ctx, th, geo, { vals, given, notes, wrong: (k) => k === 12 && false, selected: 30, sameHighlight: set.sameHighlight, now: app.now, texture: set.texture, dark: app.isDark() }, app.dpr);
      y += size + 18;

      const s = Math.min(52, (W - 32 - 6 * 10) / 7);
      const row = (title, items) => {
        ui.text(ctx, title, 20, y + 8, 15, th.text, 'left', 600);
        y += 24;
        const gap = (W - 32 - items.length * s) / Math.max(1, items.length - 1);
        items.forEach((it, i) => it(16 + i * (s + gap), y));
        y += s + 34;
      };
      // 配色（数字、高亮的颜色）
      row('配色', C.THEMES.map((tm) => (x, yy) => {
        const have = store.data.themes[tm.id];
        square(ctx, th, 'look-theme-' + tm.id, x, yy, s, set.theme === tm.id, (qx, qy, qs) => {
          ctx.fillStyle = tm.id === 'night' ? tm.board : th.board; ctx.fillRect(qx, qy, qs, qs);
          ui.text(ctx, '5', qx + qs * 0.33, qy + qs * 0.5, qs * 0.42, tm.given, 'center', 500);
          ui.text(ctx, '7', qx + qs * 0.68, qy + qs * 0.5, qs * 0.42, tm.user, 'center', 400);
          ctx.fillStyle = tm.primary; ctx.fillRect(qx, qy + qs - 7, qs, 7);
        }, tm.name, () => {
          if (!have) { app.toast('完成一局后，在结算页看视频解锁'); return; }
          set.theme = tm.id; store.save(); app.sound('tap');
        }, !have);
      }));
      // 背景颜色
      const dark = app.isDark();
      row('背景颜色' + (dark ? '（夜间配色下不换）' : ''), Paper.PAPERS.map((pp) => (x, yy) => {
        square(ctx, th, 'look-paper-' + pp.id, x, yy, s, set.paper === pp.id && !dark, (qx, qy, qs) => {
          ctx.fillStyle = pp.bg; ctx.fillRect(qx, qy, qs, qs);
          ui.fillRR(ctx, qx + qs * 0.22, qy + qs * 0.22, qs * 0.56, qs * 0.56, 5, pp.board);
        }, pp.name, () => { set.paper = pp.id; store.save(); app.sound('tap'); if (dark) app.toast('换回浅色配色就能看到'); });
      }));
      // 质地
      row('质地', Paper.TEXTURES.map((tx) => (x, yy) => {
        square(ctx, th, 'look-tex-' + tx.id, x, yy, s, set.texture === tx.id, (qx, qy, qs) => {
          ctx.fillStyle = th.board; ctx.fillRect(qx, qy, qs, qs);
          // 质地方块里放大两倍，看得清
          ctx.save(); ctx.translate(qx, qy); ctx.scale(2, 2);
          Paper.fill(ctx, tx.id, app.dpr, dark, 0, 0, qs / 2, qs / 2);
          ctx.restore();
          if (tx.id === 'hand') {
            ctx.strokeStyle = th.lineBold; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(qx + qs * 0.5, qy + 6); ctx.quadraticCurveTo(qx + qs * 0.53, qy + qs * 0.5, qx + qs * 0.49, qy + qs - 6); ctx.stroke();
          }
        }, tx.name, () => { set.texture = tx.id; store.save(); app.sound('tap'); });
      }));
    },
  };
};
