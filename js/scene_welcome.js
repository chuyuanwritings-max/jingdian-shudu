// 第一次打开：先问「你玩过数独吗？」，按回答分三条路（Cc 0.5：「进游戏之后，先让玩家选自己是什么级别的」）。
//   没玩过 → 第 1 课规则（30 秒）→ 带练局（前 3 步手指带着走）
//   会一点 → 两道小测 → 推荐「简单」或「入门 + 带练」
//   很熟   → 首页，推荐「中等」
// 这里也放：小测结果、「每升一档先学一招」的弹窗。
const ui = require('./ui.js');
const S = require('./sudoku.js');
const T = require('./tutorial.js');
const store = require('./store.js');

// 每个级别推荐从哪一档开始
const REC_TIER = { new: 0, some: 1, pro: 2 };

module.exports = function (app) {
  app.recTier = () => (store.data.level ? REC_TIER[store.data.level] : -1);

  function choose(level) {
    store.data.level = level;
    store.data.seen.tutorial = true;
    store.save();
    app.sound('tap');
    if (level === 'new') app.go('lesson', { index: 0, then: 'guided', firstRun: true });
    else if (level === 'some') app.go('lesson', { quiz: true, firstRun: true });
    else { app.go('home'); app.toast('推荐你从「中等」开始'); }
  }

  const CARDS = [
    { id: 'new', title: '没玩过', sub: '从零开始，1 分钟学会第一步', icon: 'book' },
    { id: 'some', title: '会一点', sub: '做两道小题，帮你挑难度', icon: 'chart' },
    { id: 'pro', title: '很熟了', sub: '直接开始，教学留在菜单里', icon: 'medal' },
  ];

  app.scenes.welcome = {
    draw(ctx, t) {
      const th = app.th, W = app.W, H = app.H, H0 = require('./config.js').HOME;
      require('./homeart.js').draw(ctx, W, H, app.dpr);
      ui.text(ctx, app.TITLE, W / 2, app.titleY, 44, H0.title, 'center', 800);
      // 下半屏一块深色面板：「你玩过数独吗？」+ 三张卡（第一次打开才有）
      const h = 84, gap = 10, panelH = 54 + 3 * (h + gap) + 30;
      let y = Math.max(H * 0.5, app.bottom - panelH);
      ctx.fillStyle = 'rgba(8,11,10,0.55)'; ctx.fillRect(0, y - 16, W, H - y + 16);
      ui.text(ctx, '你玩过数独吗？', W / 2, y + 14, 20, H0.title, 'center', 700);
      y += 40;
      CARDS.forEach((c, i) => {
        const cy = y + i * (h + gap);
        const on = ui.button({ id: 'wel-' + c.id, x: 20, y: cy, w: W - 40, h, onTap: () => choose(c.id) });
        ctx.save();
        if (on) { ctx.translate(W / 2, cy + h / 2); ctx.scale(0.98, 0.98); ctx.translate(-W / 2, -cy - h / 2); }
        ui.fillRR(ctx, 20, cy, W - 40, h, 18, on ? 'rgba(38,80,83,0.92)' : 'rgba(20,28,27,0.9)');
        ui.rr(ctx, 20, cy, W - 40, h, 18); ctx.strokeStyle = 'rgba(224,176,64,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(62, cy + h / 2, 22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(224,176,64,0.16)'; ctx.fill();
        ui.icons[c.icon](ctx, 62, cy + h / 2, 24, H0.amber);
        ui.text(ctx, c.title, 100, cy + h / 2 - 12, 19, H0.title, 'left', 700);
        ui.text(ctx, c.sub, 100, cy + h / 2 + 14, 12, H0.sub);
        ui.icons.chevron(ctx, W - 44, cy + h / 2, 20, H0.sub);
        ctx.restore();
      });
    },
  };

  // 小测做完：两题都没错 → 简单；错过 → 入门 + 带练
  app.quizDone = (misses) => {
    const good = misses === 0;
    if (!good) { store.data.level = 'new'; store.save(); }
    app.sound(good ? 'win' : 'correct');
    app.push({
      draw(ctx, t, p) {
        const th = app.th;
        const m = app.modal(ctx, p, 268);
        ctx.beginPath(); ctx.arc(app.W / 2, m.y + 50, 26, 0, Math.PI * 2); ctx.fillStyle = good ? th.ok : th.gold; ctx.fill();
        ui.icons.check(ctx, app.W / 2, m.y + 50, 30, '#FFFFFF', 3.4);
        ui.text(ctx, good ? '两题都对！' : '差一点', app.W / 2, m.y + 100, 21, th.text, 'center', 700);
        ui.text(ctx, good ? '推荐你从「简单」开始' : '推荐从「入门」开始，第一局带着你下', app.W / 2, m.y + 130, 14, th.sub, 'center');
        const bx = m.x + 20, bw = m.w - 40;
        ui.pill(ctx, th, 'quiz-go', bx, m.y + 156, bw, 50, good ? '开始「简单」' : '开始「入门」', () => { app.pop(); app.startGame(good ? 1 : 0, good ? {} : { guided: true }); }, 'primary');
        ui.pill(ctx, th, 'quiz-learn', bx, m.y + 214, bw, 42, '先看教学', () => { app.pop(); app.go('lessons'); }, 'card');
        m.done();
      },
    });
  };

  // 每升一档，先学一招
  app.tierGate = (tier, lessonId) => {
    const L = T.LESSONS.find((x) => x.id === lessonId);
    app.push({
      onBackdrop: () => app.pop(),
      draw(ctx, t, p) {
        const th = app.th;
        const m = app.modal(ctx, p, 262);
        ui.text(ctx, '「' + S.TIERS[tier].name + '」要用一招新的', app.W / 2, m.y + 40, 19, th.text, 'center', 700);
        ui.fillRR(ctx, m.x + 40, m.y + 64, m.w - 80, 48, 14, th.soft);
        ui.text(ctx, L.name, app.W / 2, m.y + 88, 20, th.primary, 'center', 700);
        ui.text(ctx, '1 分钟：看一遍，再自己做一道', app.W / 2, m.y + 132, 13, th.sub, 'center');
        const bx = m.x + 20, bw = m.w - 40;
        ui.pill(ctx, th, 'gate-learn', bx, m.y + 152, bw, 50, '先学「' + L.name + '」', () => { app.pop(); app.go('lesson', { id: lessonId, then: { tier } }); }, 'primary');
        ui.pill(ctx, th, 'gate-skip', bx, m.y + 210, bw, 42, '我会了，直接开始', () => { app.pop(); app.startGame(tier, { skipGate: true }); }, 'card');
        m.done();
      },
    });
  };
};
