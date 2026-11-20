// 主题：上面一块小棋盘实时预览，下面 7 个主题方块（颜色 + 质地一整套，学 Sudoku 2 的皮肤）。点一下立刻换。
const ui = require('./ui.js');
const C = require('./config.js');
const store = require('./store.js');
const Paper = require('./paper.js');
const DB = require('./drawboard.js');
const T = require('./tutorial.js');

module.exports = function (app) {
  let back = null;
  let sampleT = 0;
  // 预览盘：像一道真题，选中一格、有笔记、有自己填的数
  const vals = T.SOL.map((v, k) => ((k * 7) % 5 < 2 ? v : 0));
  const given = vals.map(Boolean);
  vals[30] = T.SOL[30];
  vals[58] = T.SOL[58];
  const notes = new Array(81).fill(0);
  notes[31] = (1 << 2) | (1 << 5) | (1 << 8);
  notes[49] = (1 << 1) | (1 << 4);

  // 一个主题方块：页面底 + 质地，中间一小块棋盘（棋盘色 + 质地 + 格线），写一个题目数字和一个自己填的数字
  function themeTile(ctx, th, tm, x, y, w, h, selected, locked) {
    const dpr = app.dpr;
    ctx.save();
    ui.rr(ctx, x, y, w, h, 14);
    ctx.clip();
    ctx.fillStyle = tm.bg; ctx.fillRect(x, y, w, h);
    Paper.fill(ctx, tm.texture, dpr, !!tm.pageDark, x, y, w, h);
    const bx = x + w * 0.16, by = y + h * 0.14, bs = Math.min(w * 0.68, h * 0.62);
    ui.fillRR(ctx, bx, by, bs, bs, 6, tm.board);
    ctx.save(); ui.rr(ctx, bx, by, bs, bs, 6); ctx.clip();
    Paper.fill(ctx, tm.boardTexture, dpr, !!tm.boardDark, bx, by, bs, bs);
    ctx.strokeStyle = tm.lineThin; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) { ctx.moveTo(bx + (bs * i) / 3, by); ctx.lineTo(bx + (bs * i) / 3, by + bs); ctx.moveTo(bx, by + (bs * i) / 3); ctx.lineTo(bx + bs, by + (bs * i) / 3); }
    ctx.stroke();
    ctx.fillStyle = Paper.rgba(tm.primary, tm.boardDark ? 0.36 : 0.3);
    ctx.fillRect(bx + bs / 3, by + bs / 3, bs / 3, bs / 3);
    ctx.restore();
    ui.rr(ctx, bx, by, bs, bs, 6); ctx.strokeStyle = tm.lineBold; ctx.lineWidth = 1.5; ctx.stroke();
    const fs = bs * 0.26;
    ui.text(ctx, '5', bx + bs / 6, by + bs / 6 + 1, fs, tm.given, 'center', 500);
    ui.text(ctx, '7', bx + bs / 2, by + bs / 2 + 1, fs, tm.user, 'center', 400);
    ui.text(ctx, '3', bx + (bs * 5) / 6, by + (bs * 5) / 6 + 1, fs, tm.given, 'center', 500);
    ui.text(ctx, tm.name, x + w / 2, y + h - 13, 12, tm.text, 'center', 600);
    if (locked) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y, w, h);
      ctx.beginPath(); ctx.arc(x + w - 14, y + 14, 11, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,34,40,0.78)'; ctx.fill();
      ui.icons.lock(ctx, x + w - 14, y + 15, 13, '#FFFFFF');
    }
    ctx.restore();
    ui.rr(ctx, x, y, w, h, 14);
    ctx.lineWidth = selected ? 3 : 1;
    ctx.strokeStyle = selected ? th.primary : 'rgba(0,0,0,0.14)';
    ctx.stroke();
    if (selected) {
      ctx.beginPath(); ctx.arc(x + w - 14, y + 14, 11, 0, Math.PI * 2); ctx.fillStyle = th.primary; ctx.fill();
      ui.icons.check(ctx, x + w - 14, y + 14, 14, th.primaryText, 2.2);
    }
  }

  app.scenes.look = {
    enter(args) { back = args.back || { name: 'home' }; },
    draw(ctx) {
      const th = app.th, W = app.W, set = store.data.settings;
      app.header(ctx, '主题', () => app.go(back.name, back.args || {}));
      let y = app.headerY + app.headerH + 8;
      // 主题方块：一行 4 个，两行
      const cols = 4, gap = 10, tw = (W - 32 - gap * (cols - 1)) / cols, tH = tw * 1.18;
      const gridH = tH * 2 + gap + 30 + 96; // 下面还有一行「数字方块」A / B
      const size = Math.max(135, Math.min(270, Math.floor((app.bottom - 16 - y - gridH - 20) / 9) * 9));
      DB.draw(ctx, th, { x: Math.round((W - size) / 2), y, size }, { vals, given, notes, wrong: () => false, selected: 30, sameHighlight: set.sameHighlight, now: app.now, tileStyle: set.tileStyle }, app.dpr);
      y += size + 20;
      const unlocked = C.THEMES.filter((t) => store.data.themes[t.id]).length;
      ui.text(ctx, '已解锁 ' + unlocked + ' / ' + C.THEMES.length + ' · 结算页看视频解锁更多', W / 2, y, 12, th.sub, 'center');
      y += 18;
      C.THEMES.forEach((tm, i) => {
        const x = 16 + (i % cols) * (tw + gap), ty = y + Math.floor(i / cols) * (tH + gap);
        const have = !!store.data.themes[tm.id];
        const on = ui.button({ id: 'look-theme-' + tm.id, x, y: ty, w: tw, h: tH, onTap: () => {
          if (!have) { app.toast('完成一局后，在结算页看视频解锁'); return; }
          set.theme = tm.id; store.save(); app.sound('tap');
        } });
        ctx.save();
        if (on) { ctx.translate(x + tw / 2, ty + tH / 2); ctx.scale(0.95, 0.95); ctx.translate(-x - tw / 2, -ty - tH / 2); }
        themeTile(ctx, th, tm, x, ty, tw, tH, set.theme === tm.id, !have);
        ctx.restore();
      });
      // 数字方块样式：先给 Cc 选，选定后这一行拿掉
      y += tH * 2 + gap + 18;
      ui.text(ctx, '数字方块（先选一种，选定后这一行会拿掉）', 20, y, 13, th.sub, 'left', 600);
      y += 14;
      const bw = (W - 32 - 12) / 2, bh = 62;
      [['A', '象牙块'], ['B', '彩色块']].forEach(([id, name], i) => {
        const x = 16 + i * (bw + 12);
        const on = ui.button({ id: 'look-tile-' + id, x, y, w: bw, h: bh, onTap: () => { set.tileStyle = id; store.save(); app.sound('tile'); app.animate(400); sampleT = app.now; } });
        ui.card(ctx, x, y, bw, bh, 14, th);
        if (set.tileStyle === id) { ui.rr(ctx, x, y, bw, bh, 14); ctx.strokeStyle = th.primary; ctx.lineWidth = 3; ctx.stroke(); }
        // 示范：两块方块
        const cs = 44;
        DB.sampleTile(ctx, th, id, x + 12, y + (bh - cs) / 2, cs, 7, set.tileStyle === id ? sampleT : 0, app.now);
        DB.sampleTile(ctx, th, id, x + 12 + cs + 2, y + (bh - cs) / 2, cs, 4, 0, app.now);
        ui.text(ctx, id + ' ' + name, x + 12 + cs * 2 + 14, y + bh / 2, 15, on ? th.primary : th.text, 'left', 600);
      });
    },
  };
};
