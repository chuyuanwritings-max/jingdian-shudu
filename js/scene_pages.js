// 局外各页：结算、每日挑战日历、战绩、好友榜、数独练脑。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const LY = require('./layout.js');

module.exports = function (app) {
  // ---------- 结算 ----------
  let res = null;
  app.scenes.result = {
    enter(args) {
      res = { b: args.board, t0: P.now(), fromCut: !!args.fromCut };
      // 从通关过场硬切过来：页面安静，一声很轻的「嗒」，按钮晚 20 帧再出来（反差回落）
      if (res.fromCut) { app.sound('soft'); res.icon = app.cutTileImg(56, { body: '#E9C25A', edge: '#A9832A', ink: '#3A2A08' }, { check: true, bars: res.b.tier + 1 }); }
    },
    live: (t) => t - res.t0 < 1200,
    ready: () => !res.fromCut || P.now() - res.t0 > 330,
    // 位置都从布局表来（界面编辑器里能拖）：顶上的勾、标题、分数、数据卡、三个按钮、解锁主题
    draw(ctx, t) {
      const th = app.th, b = res.b, R = LY.rect;
      const p = Math.min(1, (t - res.t0) / 900);
      const ri = R('result.icon'), rh = R('result.head'), rs = R('result.score'), rc = R('result.stats');
      const rShare = R('result.share'), rAgain = R('result.again'), rHome = R('result.home'), rTheme = R('result.theme');
      const icx = ri.x + ri.w / 2, icy = ri.y + ri.h / 2, isz = Math.min(ri.w, ri.h);
      if (res.icon) {
        // 过场里那块金方块缩在页面顶上
        const iw = res.icon.width / app.dpr, ih = res.icon.height / app.dpr, k = isz / 68;
        ctx.drawImage(res.icon, 0, 0, res.icon.width, res.icon.height, icx - iw * k / 2, icy - ih * k / 2, iw * k, ih * k);
      } else {
        // 勾：圆从小弹到大
        const s = ui.ease.back(Math.min(1, (t - res.t0) / 450)) * isz / 68;
        ctx.save(); ctx.translate(icx, icy); ctx.scale(s, s);
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fillStyle = th.ok; ctx.fill();
        ui.icons.check(ctx, 0, 0, 40, '#FFFFFF', 4);
        ctx.restore();
      }
      const hk = LY.k('result.head', rh), sk = LY.k('result.score', rs), ck = LY.k('result.stats', rc);
      const hx = rh.x + rh.w / 2, hy = rh.y + rh.h * 0.29;
      const tierName = S.TIERS[b.tier].name;
      if (b.challenge) {
        // ---- 好友挑战：两人对比（两张卡放在数据卡的位置）----
        const r = app.challengeResult(b);
        ui.text(ctx, r.win ? '你赢了！' : '差一点', hx, hy, Math.round(28 * hk), r.win ? th.ok : th.text, 'center', 700);
        ui.text(ctx, (r.tie ? '和朋友一样快' + (r.win ? '，错得不比他多' : '，但错得多一点') : (r.win ? '比朋友快了 ' : '比朋友慢了 ') + app.fmt(r.diff)) + ' · 「' + tierName + '」', hx, rh.y + rh.h * 0.77, Math.round(14 * hk), th.sub, 'center');
        const cw = (rc.w - 10) / 2, chh = Math.min(rc.h, 128);
        [['你', b.elapsed, b.mistakes, r.win], ['朋友', b.challenge.time, b.challenge.mistakes, !r.win]].forEach(([who, tm, mis, best], i) => {
          const x = rc.x + i * (cw + 10), y = rc.y;
          ui.card(ctx, x, y, cw, chh, 16, th);
          if (best) { ui.rr(ctx, x, y, cw, chh, 16); ctx.strokeStyle = th.gold; ctx.lineWidth = 3; ctx.stroke(); ui.icons.trophy(ctx, x + cw - 24, y + 24, 22, th.gold, 1); }
          ui.text(ctx, who, x + 18, y + 26, 15, th.sub, 'left', 600);
          ui.text(ctx, app.fmt(tm), x + cw / 2, y + 70, 32, th.text, 'center', 700);
          ui.text(ctx, mis ? '错 ' + mis + ' 次' : '一次没错', x + cw / 2, y + 104, 13, th.sub, 'center');
        });
        if (!app.scenes.result.ready()) { app.animate(400); return; } // 按钮晚 20 帧
        ui.pill(ctx, th, 'res-reply', rShare.x, rShare.y, rShare.w, rShare.h, r.win ? '发回去，让他再来' : '发回去挑战他', () => app.shareChallenge(b, true), 'primary');
        ui.pill(ctx, th, 'res-again', rAgain.x, rAgain.y, rAgain.w, rAgain.h, '再来一局', () => app.startGame(b.tier), 'card');
        ui.pill(ctx, th, 'res-home', rHome.x, rHome.y, rHome.w, rHome.h, '回首页', () => app.go('home'), 'card');
      } else {
        ui.text(ctx, '完成！', hx, hy, Math.round(28 * hk), th.text, 'center', 700);
        ui.text(ctx, (b.mode === 'daily' ? '每日挑战 · ' + b.date.slice(5).replace('-', '月') + '日 · ' : b.mode === 'duo' ? '约好一起做 · ' : '') + tierName, hx, rh.y + rh.h * 0.77, Math.round(14 * hk), th.sub, 'center');
        // 分数滚上去
        const shown = res.fromCut ? b.score : Math.round(b.score * ui.ease.out(p));
        ui.text(ctx, String(shown), rs.x + rs.w / 2, rs.y + rs.h * 0.33, Math.round(44 * sk), th.primary, 'center', 700);
        ui.text(ctx, b.newBestScore ? '本档最高分！' : '分', rs.x + rs.w / 2, rs.y + rs.h * 0.83, Math.round(13 * sk), b.newBestScore ? th.gold : th.sub, 'center', 600);
        // 数据卡：行高跟着卡的高度走
        const st = store.data.stats[b.tier];
        const rows = b.mode === 'daily'
          ? [['用时', app.fmt(b.elapsed)], ['错误', String(b.mistakes)], ['本月完成', Object.keys(store.data.daily).filter((k) => k.slice(0, 7) === b.date.slice(0, 7)).length + ' 天']]
          : [['用时', app.fmt(b.elapsed) + (b.newBest ? '  新纪录' : '')], ['本档最好', app.fmt(st.best)], ['错误', String(b.mistakes)], ['连胜', st.streak + ' 局']];
        // 本局一招：第一行写用上了几处，后面是累计
        if (b.focus) {
          const f = b.focus, tot = (store.data.techUses || {})[f.lesson] || f.got.length;
          rows.unshift(['本局一招', f.name + ' ' + (f.keys.length > 9 ? f.got.length + ' 次' : f.got.length + '/' + f.keys.length) + ' · 累计 ' + tot + ' 次']);
        }
        const rowH = (rc.h - 10) / Math.max(4, rows.length);
        ui.card(ctx, rc.x, rc.y, rc.w, rows.length * rowH + 10, 16, th);
        rows.forEach((r, i) => {
          const ry = rc.y + 5 + i * rowH + rowH / 2;
          ui.text(ctx, r[0], rc.x + 20, ry, Math.round(15 * ck), th.sub);
          ui.text(ctx, r[1], rc.x + rc.w - 20, ry, Math.round(16 * ck), r[1].indexOf('新纪录') >= 0 ? th.gold : th.text, 'right', 600);
        });
        // 按钮：发给朋友挑战这一题（主按钮）；再来一局 / 回首页并排
        if (!app.scenes.result.ready()) { app.animate(400); return; } // 按钮晚 20 帧
        if (b.mode === 'duo') ui.pill(ctx, th, 'res-share', rShare.x, rShare.y, rShare.w, rShare.h, '把成绩发给他（他做完才看得到）', () => app.shareChallenge(b, false, 'duo'), 'primary');
        else ui.pill(ctx, th, 'res-share', rShare.x, rShare.y, rShare.w, rShare.h, '发给朋友挑战这一题', () => app.shareChallenge(b), 'primary');
        if (b.mode === 'daily') ui.pill(ctx, th, 'res-cal', rAgain.x, rAgain.y, rAgain.w, rAgain.h, '回日历', () => app.go('daily'), 'card');
        else if (b.mode === 'duo') ui.pill(ctx, th, 'res-again', rAgain.x, rAgain.y, rAgain.w, rAgain.h, '再约一局', () => app.duoSheet(), 'card');
        else ui.pill(ctx, th, 'res-again', rAgain.x, rAgain.y, rAgain.w, rAgain.h, '再来一局', () => app.startGame(b.tier), 'card');
        ui.pill(ctx, th, 'res-home', rHome.x, rHome.y, rHome.w, rHome.h, '回首页', () => app.go('home'), 'card');
      }
      // 结算页的激励视频：解锁一套配色
      const locked = C.THEMES.filter((tm) => !store.data.themes[tm.id]);
      if (locked.length) {
        const tm = locked[0], x = rTheme.x, y = rTheme.y, w = rTheme.w, h = rTheme.h;
        const on = ui.button({ id: 'res-theme', x, y, w, h, onTap: () => app.showAd('theme', '「' + tm.name + '」主题', () => {
          store.data.themes[tm.id] = true;
          store.data.settings.theme = tm.id;
          store.save();
          app.toast('已换上「' + tm.name + '」主题，设置里可以换回');
        }) });
        ui.fillRR(ctx, x, y, w, h, 16, on ? th.sel : th.soft);
        ui.icons.video(ctx, x + 28, y + h / 2, 22, th.gold);
        ctx.beginPath(); ctx.arc(x + w - 28, y + h / 2, 11, 0, Math.PI * 2); ctx.fillStyle = tm.primary; ctx.fill();
        ui.text(ctx, '看视频，解锁「' + tm.name + '」主题', x + w / 2, y + h / 2, 15, th.primary, 'center', 600);
      }
    },
  };

  // ---------- 每日挑战 ----------
  let cal = null; // { y, m, sel }
  app.scenes.daily = {
    enter() {
      const d = new Date();
      cal = { y: d.getFullYear(), m: d.getMonth(), sel: store.dateKey(d) };
    },
    draw(ctx, t) {
      const th = app.th, W = app.W;
      app.header(ctx, '每日挑战', () => app.go('home'));
      const today = new Date();
      const ym = cal.y + '-' + (cal.m + 1 < 10 ? '0' : '') + (cal.m + 1);
      const daysIn = new Date(cal.y, cal.m + 1, 0).getDate();
      const done = Object.keys(store.data.daily).filter((k) => k.slice(0, 7) === ym).length;
      let y = app.headerY + app.headerH + 8;
      // 奖杯
      const full = done >= daysIn;
      ui.icons.trophy(ctx, W / 2, y + 44, 70, full ? th.gold : th.primary, done / daysIn);
      ui.text(ctx, full ? '本月奖杯到手！' : '做完这个月每一天，拿到 ' + (cal.m + 1) + ' 月奖杯', W / 2, y + 100, 13, full ? th.gold : th.sub, 'center', 600);
      ui.text(ctx, done + ' / ' + daysIn, W / 2, y + 122, 15, th.text, 'center', 700);
      y += 146;
      // 月份切换
      const canNext = cal.y < today.getFullYear() || (cal.y === today.getFullYear() && cal.m < today.getMonth());
      ui.text(ctx, cal.y + ' 年 ' + (cal.m + 1) + ' 月', W / 2, y + 18, 17, th.text, 'center', 600);
      const pl = ui.button({ id: 'cal-prev', x: 20, y, w: 48, h: 36, onTap: () => { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } } });
      ctx.save(); ctx.translate(44, y + 18); ctx.scale(-1, 1); ui.icons.chevron(ctx, 0, 0, 20, pl ? th.primary : th.sub); ctx.restore();
      if (canNext) {
        const pr = ui.button({ id: 'cal-next', x: W - 68, y, w: 48, h: 36, onTap: () => { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } } });
        ui.icons.chevron(ctx, W - 44, y + 18, 20, pr ? th.primary : th.sub);
      }
      y += 46;
      // 星期
      const cw = (W - 32) / 7;
      '日一二三四五六'.split('').forEach((d, i) => ui.text(ctx, d, 16 + (i + 0.5) * cw, y, 12, th.sub, 'center'));
      y += 18;
      const first = new Date(cal.y, cal.m, 1).getDay();
      const todayKey = store.dateKey(today);
      const ch = Math.min(cw, 48);
      for (let day = 1; day <= daysIn; day++) {
        const idx = first + day - 1;
        const cx = 16 + (idx % 7 + 0.5) * cw, cy = y + Math.floor(idx / 7) * ch + ch / 2;
        const key = ym + '-' + (day < 10 ? '0' : '') + day;
        const future = key > todayKey;
        const isDone = !!store.data.daily[key];
        if (!future) ui.button({ id: 'day-' + day, x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, onTap: () => { cal.sel = key; } });
        if (isDone) { ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.fillStyle = th.primary; ctx.fill(); }
        if (key === cal.sel) { ctx.beginPath(); ctx.arc(cx, cy, 19, 0, Math.PI * 2); ctx.strokeStyle = th.primary; ctx.lineWidth = 2; ctx.stroke(); }
        if (isDone) ui.icons.check(ctx, cx, cy, 18, th.primaryText);
        else ui.text(ctx, String(day), cx, cy, 15, future ? th.faint : key === todayKey ? th.primary : th.text, 'center', key === todayKey ? 700 : 400);
      }
      // 开始按钮
      const by = app.bottom - 14 - 56;
      const pick = store.dailyPick(cal.sel, bank);
      const parts = cal.sel.split('-');
      const label = (+parts[1]) + '月' + (+parts[2]) + '日 · ' + S.TIERS[pick.tier].name;
      const cur = store.data.current;
      const rec = store.data.daily[cal.sel];
      if (cur && !cur.done && cur.mode === 'daily' && cur.date === cal.sel) ui.pill(ctx, th, 'daily-go', 16, by, W - 32, 56, '继续 · ' + label, () => app.continueGame(), 'primary');
      else if (rec) ui.pill(ctx, th, 'daily-go', 16, by, W - 32, 56, '已完成 ' + app.fmt(rec.time) + ' · 再玩一次', () => startDaily(cal.sel), 'soft');
      else ui.pill(ctx, th, 'daily-go', 16, by, W - 32, 56, '开始 · ' + label, () => startDaily(cal.sel), 'primary');
    },
  };
  function startDaily(key) {
    const pick = store.dailyPick(key, bank);
    app.startGame(pick.tier, { mode: 'daily', idx: pick.idx, date: key });
  }

  // ---------- 战绩 ----------
  let statTier = 0;
  app.scenes.stats = {
    draw(ctx) {
      const th = app.th, W = app.W;
      app.header(ctx, '战绩', () => app.go('home'));
      let y = app.headerY + app.headerH + 10;
      y = tierChips(ctx, th, y, S.TIERS.map((x) => x.name), statTier, (i) => { statTier = i; });
      const s = store.data.stats[statTier];
      const cells = [
        ['已玩', s.played], ['赢', s.won],
        ['胜率', s.played ? Math.round((s.won / s.played) * 100) + '%' : '—'], ['无错误赢', s.perfect],
        ['最好用时', s.best ? app.fmt(s.best) : '—'], ['平均用时', s.won ? app.fmt(s.total / s.won) : '—'],
        ['当前连胜', s.streak], ['最长连胜', s.bestStreak],
        ['最高分', s.bestScore || '—'], ['每日挑战完成', Object.keys(store.data.daily).length + ' 天'],
      ];
      const gap = 10, cw = (W - 32 - gap) / 2, chh = Math.min(76, (app.bottom - 20 - y - gap * 4) / 5);
      cells.forEach((c, i) => {
        const x = 16 + (i % 2) * (cw + gap), cy = y + Math.floor(i / 2) * (chh + gap);
        ui.card(ctx, x, cy, cw, chh, 14, th);
        ui.text(ctx, c[0], x + 16, cy + 20, 12, th.sub);
        ui.text(ctx, String(c[1]), x + 16, cy + chh - 22, 22, th.text, 'left', 700);
      });
    },
  };
  function tierChips(ctx, th, y, names, sel, onSel) {
    const W = app.W, gap = 6, cw = (W - 32 - gap * (names.length - 1)) / names.length;
    names.forEach((n, i) => {
      const x = 16 + i * (cw + gap);
      ui.button({ id: 'chip-' + i, x, y, w: cw, h: 34, onTap: () => onSel(i) });
      ui.fillRR(ctx, x, y, cw, 34, 17, i === sel ? th.primary : th.soft);
      ui.text(ctx, n, x + cw / 2, y + 17, 13, i === sel ? th.primaryText : th.primary, 'center', 600);
    });
    return y + 34 + 14;
  }

  // ---------- 好友榜 ----------
  let rankTab = 0;
  const RANK_TABS = S.TIERS.map((x) => x.name).concat(['每日']);
  function rankKey() {
    if (rankTab < 6) return 'best_' + S.TIERS[rankTab].id;
    return 'daily_' + store.dateKey(new Date()).slice(0, 7);
  }
  let odSize = null;
  app.scenes.rank = {
    enter() { askRank(); },
    live: () => P.hasOpenData, // 开放数据域的画布会自己变，要一直贴
    draw(ctx) {
      const th = app.th, W = app.W;
      app.header(ctx, '好友排行榜', () => app.go('home'));
      let y = app.headerY + app.headerH + 10;
      const names = RANK_TABS;
      const gap = 4, cw = (W - 32 - gap * (names.length - 1)) / names.length;
      names.forEach((n, i) => {
        const x = 16 + i * (cw + gap);
        ui.button({ id: 'rtab-' + i, x, y, w: cw, h: 32, onTap: () => { rankTab = i; askRank(); } });
        ui.fillRR(ctx, x, y, cw, 32, 16, i === rankTab ? th.primary : th.soft);
        ui.text(ctx, n, x + cw / 2, y + 16, 12, i === rankTab ? th.primaryText : th.primary, 'center', 600);
      });
      y += 46;
      const h = app.bottom - 20 - y;
      ui.card(ctx, 16, y, W - 32, h, 16, th);
      const od = P.openDataCanvas();
      if (od) {
        // 微信里：开放数据域画好的好友榜贴到这块卡片里
        ctx.drawImage(od, 0, 0, od.width, od.height, 16, y, W - 32, h);
        odSize = { w: W - 32, h };
      } else {
        // 浏览器预览：没有好友数据，只列自己的成绩
        ui.icons.medal(ctx, W / 2, y + 44, 34, th.primary);
        ui.text(ctx, '好友排行榜要在微信里打开才看得到', W / 2, y + 90, 15, th.text, 'center', 600);
        ui.text(ctx, '（微信规定好友成绩只能在微信里显示）', W / 2, y + 114, 12, th.sub, 'center');
        ui.text(ctx, '你自己的成绩', 36, y + 158, 14, th.sub, 'left', 600);
        let ry = y + 186;
        if (rankTab < 6) {
          const s = store.data.stats[rankTab];
          rankRow(ctx, th, ry, 1, '我', s.bestScore ? s.bestScore + ' 分' : '还没成绩', s.best ? app.fmt(s.best) : '');
        } else {
          const ym = store.dateKey(new Date()).slice(0, 7);
          rankRow(ctx, th, ry, 1, '我', store.monthScore(ym) + ' 分', '本月');
        }
      }
    },
  };
  function rankRow(ctx, th, y, n, name, score, sub) {
    const W = app.W;
    ui.fillRR(ctx, 28, y, W - 56, 52, 12, th.soft);
    ui.text(ctx, String(n), 50, y + 26, 16, th.gold, 'center', 700);
    ui.text(ctx, name, 76, y + 26, 15, th.text, 'left', 600);
    ui.text(ctx, score, W - 44, y + 18, 15, th.text, 'right', 700);
    ui.text(ctx, sub, W - 44, y + 37, 11, th.sub, 'right');
  }
  function askRank() {
    if (!P.hasOpenData) return;
    const od = P.openDataCanvas();
    const w = app.W - 32, h = app.bottom - 20 - (app.headerY + app.headerH + 56);
    od.width = Math.round(w * app.dpr);
    od.height = Math.round(h * app.dpr);
    const th = app.th;
    P.postOpenData({ type: 'rank', key: rankKey(), dpr: app.dpr, colors: { text: th.text, sub: th.sub, primary: th.primary, gold: th.gold, soft: th.soft, card: th.card } });
  }

  // ---------- 数独练脑 ----------
  const BRAIN = [
    ['h', '数独练什么'],
    ['p', '数独不用算术，练的是推理：「这里不能是 3，因为这一行已经有 3 了。」一局下来，要同时记住几种可能、一条条排除、专心十几分钟。'],
    ['h', '研究怎么说'],
    ['p', '英国一项调查请 1.9 万名 50–93 岁的人做注意力、推理、记忆测验。越常玩数字谜题（包括数独）的人，成绩越好。'],
    ['s', 'Brooker 等，2019，《国际老年精神病学杂志》'],
    ['p', '但这是「相关」，不是「因果」：也可能是脑子本来好的人更爱玩数独。研究者自己也说，不能说玩谜题就能降低失智风险。'],
    ['p', '约 70 位心理学家和神经科学家联名，以及后来一篇大型综述都认为：练一种脑力游戏，主要是这一种游戏变强，其他能力未必跟着变强。'],
    ['s', '斯坦福长寿中心，2014；Simons 等，2016，《公众利益心理科学》'],
    ['h', '所以我们这样说'],
    ['p', '数独是一种好的专注练习，也是让脑子动起来的一件乐事。想让大脑保持好状态，证据最多的还是：运动、睡够、和人来往、不断学新东西。数独可以是其中一件。'],
  ];
  let scroll = 0, contentH = 0, drag = null;
  app.scenes.brain = {
    enter() { scroll = 0; },
    onDrag(type, x, y) {
      if (type === 'down') { drag = { y0: y, s0: scroll, moved: false }; return false; }
      if (!drag) return false;
      if (type === 'move') {
        if (Math.abs(y - drag.y0) > 6) drag.moved = true;
        const maxS = Math.max(0, contentH - (app.bottom - (app.headerY + app.headerH)) + 20);
        scroll = ui.clamp(drag.s0 - (y - drag.y0), 0, maxS);
        app.redraw();
        return false;
      }
      const moved = drag.moved;
      drag = null;
      return moved;
    },
    draw(ctx) {
      const th = app.th, W = app.W;
      const top = app.headerY + app.headerH;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, top, W, app.H - top); ctx.clip();
      let y = top + 12 - scroll;
      for (const [kind, s] of BRAIN) {
        if (kind === 'h') { y += 10; ui.text(ctx, s, 24, y + 12, 18, th.text, 'left', 700); y += 34; }
        else if (kind === 'p') { const n = ui.wrap(ctx, s, 24, y, W - 48, 15, 25, th.text); y += n * 25 + 10; }
        else { const n = ui.wrap(ctx, '—— ' + s, 24, y - 4, W - 48, 12, 18, th.sub); y += n * 18 + 12; }
      }
      y += 8;
      ui.pill(ctx, th, 'brain-play', 16, y, W - 32, 52, '来一局', () => app.difficultySheet(), 'primary');
      y += 72;
      contentH = y + scroll - top;
      ctx.restore();
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, W, top);
      app.header(ctx, '数独练脑', () => app.go('home'));
    },
  };
};
