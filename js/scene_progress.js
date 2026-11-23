// 进度表（0.9，Cc：「展示大家最近都在挑战哪个难度、打了多少局、胜率怎么样」）
// 上面：我自己最近 7 天（几局、胜率、最常玩哪一档）+ 每一档的总局数和胜率。
// 下面：好友最近在玩什么（微信好友数据，只能在开放数据域里画；浏览器预览放几条示例）。
const P = require('./platform.js');
const ui = require('./ui.js');
const S = require('./sudoku.js');
const store = require('./store.js');

const SAMPLE = [ // 浏览器预览用的示例好友
  { name: '小林', tier: 2, week: 12, won: 9 },
  { name: '阿珍', tier: 3, week: 5, won: 3 },
  { name: '老周', tier: 1, week: 21, won: 20 },
];
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

module.exports = function (app) {
  let odBox = null;
  function askFriends(box) {
    if (!P.hasOpenData) return;
    const od = P.openDataCanvas(), th = app.th;
    od.width = Math.round(box.w * app.dpr);
    od.height = Math.round(box.h * app.dpr);
    P.postOpenData({ type: 'progress', key: 'progress', dpr: app.dpr, tiers: S.TIERS.map((x) => x.name), colors: { card: th.card, soft: th.soft, text: th.text, sub: th.sub, gold: th.gold, primary: th.primary } });
  }

  app.scenes.progress = {
    enter() { odBox = null; },
    live: () => P.hasOpenData,
    draw(ctx) {
      const th = app.th, W = app.W;
      app.header(ctx, '进度表', () => app.go('home'));
      let y = app.headerY + app.headerH + 10;
      // ---- 我：最近 7 天 ----
      const r = store.recent(7);
      ui.card(ctx, 16, y, W - 32, 120, 16, th);
      ui.text(ctx, '我 · 最近 7 天', 32, y + 22, 14, th.sub, 'left', 600);
      const cols = [
        [String(r.games), '局'],
        [pct(r.won, r.games), '胜率'],
        [r.tier >= 0 ? S.TIERS[r.tier].name : '—', '最常玩'],
      ];
      const cw = (W - 32) / 3;
      cols.forEach(([v, l], i) => {
        const cx = 16 + cw * (i + 0.5);
        ui.text(ctx, v, cx, y + 64, 26, i === 2 ? th.primary : th.text, 'center', 700);
        ui.text(ctx, l, cx, y + 96, 12, th.sub, 'center');
      });
      y += 132;
      // ---- 我最常用的招（小樱每一步认出来的，做完一局记一次）----
      const tt = store.data.techTotal || {};
      const top = Object.keys(tt).sort((a, c) => tt[c] - tt[a]).slice(0, 4);
      ui.card(ctx, 16, y, W - 32, 58, 16, th);
      ui.text(ctx, '我最常用的招', 32, y + 18, 13, th.sub, 'left', 600);
      ui.text(ctx, top.length ? top.map((n) => n + ' ' + tt[n]).join(' · ') : '做完一局，小樱就帮你记下来', 32, y + 40, 14, top.length ? th.text : th.faint, 'left', 600);
      y += 70;
      // ---- 每一档（普通局）：玩了几局、赢了几局 ----
      const tiers = S.TIERS.map((tr, i) => ({ name: tr.name, s: store.data.stats[i] })).filter((x) => x.s.played > 0);
      const rowH = 30, th2 = 30 + Math.max(1, tiers.length) * rowH + 8;
      ui.card(ctx, 16, y, W - 32, th2, 16, th);
      ui.text(ctx, '每一档（普通局）', 32, y + 18, 13, th.sub, 'left', 600);
      ui.text(ctx, '局数', W - 150, y + 18, 12, th.sub, 'right');
      ui.text(ctx, '胜率', W - 36, y + 18, 12, th.sub, 'right');
      if (!tiers.length) ui.text(ctx, '还没玩过', 32, y + 30 + rowH / 2, 14, th.faint);
      tiers.forEach((x, i) => {
        const ry = y + 30 + i * rowH + rowH / 2;
        ui.text(ctx, x.name, 32, ry, 15, th.text, 'left', 600);
        ui.text(ctx, String(x.s.played), W - 150, ry, 15, th.text, 'right', 600);
        ui.text(ctx, pct(x.s.won, x.s.played), W - 36, ry, 15, th.text, 'right', 600);
      });
      y += th2 + 16;
      // ---- 好友最近在玩什么 ----
      ui.text(ctx, '好友最近在玩', 20, y, 15, th.text, 'left', 700);
      y += 14;
      const box = { x: 16, y, w: W - 32, h: Math.max(120, app.bottom - 16 - y) };
      ui.card(ctx, box.x, box.y, box.w, box.h, 16, th);
      const od = P.openDataCanvas();
      if (od) {
        // 微信里：开放数据域画好的好友列表贴进来
        if (!odBox || odBox.w !== box.w || odBox.h !== box.h) { odBox = box; askFriends(box); }
        ctx.drawImage(od, 0, 0, od.width, od.height, box.x, box.y, box.w, box.h);
      } else {
        ui.text(ctx, '示例 · 微信里显示你真的好友（他们也玩过才有）', box.x + box.w / 2, box.y + 20, 11, th.sub, 'center');
        SAMPLE.forEach((f, i) => friendRow(ctx, th, box.x + 12, box.y + 36 + i * 60, box.w - 24, f.name, f.tier, f.week, f.won));
      }
    },
  };
  function friendRow(ctx, th, x, y, w, name, tier, week, won) {
    ui.fillRR(ctx, x, y, w, 52, 12, th.soft);
    ctx.beginPath(); ctx.arc(x + 28, y + 26, 16, 0, Math.PI * 2); ctx.fillStyle = th.faint; ctx.fill();
    ui.text(ctx, name.slice(0, 1), x + 28, y + 26, 14, '#FFFFFF', 'center', 700);
    ui.text(ctx, name, x + 54, y + 17, 15, th.text, 'left', 600);
    ui.text(ctx, '最近在玩「' + S.TIERS[tier].name + '」', x + 54, y + 37, 12, th.sub);
    ui.text(ctx, '本周 ' + week + ' 局', x + w - 14, y + 17, 14, th.text, 'right', 600);
    ui.text(ctx, '胜率 ' + pct(won, week), x + w - 14, y + 37, 12, th.sub, 'right');
  }
};
