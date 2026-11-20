// 首页：标题、每日挑战卡、继续 / 新游戏、四块入口（教学、练脑、战绩、好友榜）。
const ui = require('./ui.js');
const S = require('./sudoku.js');
const store = require('./store.js');
const bank = require('./puzzles.js');

module.exports = function (app) {
  app.scenes.home = {
    draw(ctx, t) {
      const th = app.th, W = app.W;
      // 左上设置（右上是微信胶囊）
      const y0 = app.headerY;
      const on = ui.button({ id: 'home-settings', x: 6, y: y0, w: 48, h: 44, onTap: () => app.settingsSheet() });
      if (on) ui.fillRR(ctx, 10, y0 + 4, 36, 36, 18, th.soft);
      ui.icons.gear(ctx, 28, y0 + 22, 24, th.sub);

      // 标题
      let y = y0 + 44 + 26;
      ui.text(ctx, '数独', W / 2, y + 18, 40, th.text, 'center', 700);
      ui.text(ctx, '每天一题 · 让脑子动一动', W / 2, y + 58, 14, th.sub, 'center');
      y += 92;

      // 每日挑战卡
      const today = store.dateKey(new Date());
      const pick = store.dailyPick(today, bank);
      const doneToday = !!store.data.daily[today];
      const ym = today.slice(0, 7);
      const d = new Date();
      const daysIn = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const doneMonth = Object.keys(store.data.daily).filter((k) => k.slice(0, 7) === ym).length;
      const ch = 96;
      const pd = ui.button({ id: 'home-daily', x: 16, y, w: W - 32, h: ch, onTap: () => app.go('daily') });
      ui.card(ctx, 16, y, W - 32, ch, 18, th);
      if (pd) ui.fillRR(ctx, 16, y, W - 32, ch, 18, th.rel);
      ui.icons.calendar(ctx, 46, y + 32, 26, th.primary);
      ui.text(ctx, '每日挑战', 68, y + 32, 17, th.text, 'left', 600);
      ui.text(ctx, (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + S.TIERS[pick.tier].name + (doneToday ? ' · 已完成 ✓' : ''), 32, y + 66, 13, doneToday ? th.ok : th.sub);
      ui.icons.trophy(ctx, W - 60, y + 40, 40, doneMonth >= daysIn ? th.gold : th.primary, doneMonth / daysIn);
      ui.text(ctx, '本月 ' + doneMonth + '/' + daysIn, W - 60, y + 74, 12, th.sub, 'center');
      y += ch + 18;

      // 继续 / 新游戏
      const cur = store.data.current;
      if (cur && !cur.done) {
        const bh = 62;
        const pc = ui.button({ id: 'home-continue', x: 16, y, w: W - 32, h: bh, onTap: () => app.continueGame() });
        ctx.save();
        if (pc) { ctx.translate(W / 2, y + bh / 2); ctx.scale(0.98, 0.98); ctx.translate(-W / 2, -y - bh / 2); }
        ui.fillRR(ctx, 16, y, W - 32, bh, 18, th.primary);
        ui.text(ctx, '继续游戏', W / 2, y + 23, 18, th.primaryText, 'center', 600);
        const label = (cur.mode === 'daily' ? '每日挑战 · ' : '') + S.TIERS[cur.tier].name + ' · ' + app.fmt(cur.elapsed);
        ui.text(ctx, label, W / 2, y + 44, 12, 'rgba(255,255,255,0.8)', 'center');
        ctx.restore();
        y += bh + 12;
        ui.pill(ctx, th, 'home-new', 16, y, W - 32, 54, '新游戏', () => app.difficultySheet(), 'card');
        y += 54 + 22;
      } else {
        ui.pill(ctx, th, 'home-new', 16, y, W - 32, 60, '新游戏', () => app.difficultySheet(), 'primary');
        y += 60 + 22;
      }

      // 四块入口
      const tiles = [
        { id: 'lessons', label: '教学', sub: '五课学会', icon: 'book' },
        { id: 'brain', label: '数独练脑', sub: '研究怎么说', icon: 'brain' },
        { id: 'stats', label: '战绩', sub: '每档统计', icon: 'chart' },
        { id: 'rank', label: '好友榜', sub: '和好友比', icon: 'medal' },
      ];
      const gap = 12, tw = (W - 32 - gap) / 2, tH = Math.min(84, Math.max(64, (app.bottom - 30 - y - gap) / 2));
      tiles.forEach((tl, i) => {
        const x = 16 + (i % 2) * (tw + gap), ty = y + Math.floor(i / 2) * (tH + gap);
        const p = ui.button({ id: 'home-' + tl.id, x, y: ty, w: tw, h: tH, onTap: () => app.go(tl.id) });
        ui.card(ctx, x, ty, tw, tH, 16, th);
        if (p) ui.fillRR(ctx, x, ty, tw, tH, 16, th.rel);
        ui.icons[tl.icon](ctx, x + 30, ty + tH / 2, 26, th.primary);
        ui.text(ctx, tl.label, x + 54, ty + tH / 2 - 10, 16, th.text, 'left', 600);
        ui.text(ctx, tl.sub, x + 54, ty + tH / 2 + 12, 12, th.sub);
      });
    },
  };
};
