// 局内：顶栏（返回 / 难度 / 暂停）、信息行（错误 / 分数 / 时间）、棋盘、四个工具、数字键。
// 点格子、点数字都在「手指按下」那一刻生效（不等松手），手感更跟手。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const Board = require('./board.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const focusBank = require('./focus_bank.js');
const DB = require('./drawboard.js');
const T = require('./tutorial.js');
const LY = require('./layout.js');

module.exports = function (app) {
  let b = null; // 当前这一局
  let noteMode = false, paused = false;
  let fx = null; // 效果：{ pops, rings, flash, shake, floats }
  let hint = null; // { h, t0 }
  let selDigit = 0; // 正在亮着的数字
  let guide = null; // 带练：{ h, t0 } 手指指着下一步
  let winAt = 0, saveTimer = 0, lastSec = -1;
  const geo = { x: 0, y: 0, size: 0 };
  let L = null; // 布局

  const resetFx = () => { fx = { pops: {}, rings: [], flash: [], shake: null, floats: [], hops: {}, keyDone: {}, events: [], gold: {}, sparks: [], digit: null, boardShake: null }; };
  let party = null; // 通关庆祝：{ t0, k }

  // 位置都从布局表来（界面编辑器里能拖）：信息行、棋盘、提示卡、工具、数字键
  function layout() {
    const rb = LY.rect('play.board'), ri = LY.rect('play.info'), rt = LY.rect('play.tools'), rp = LY.rect('play.pad'), rh = LY.rect('play.hint');
    geo.size = Math.floor(Math.min(rb.w, rb.h) / 9) * 9; // 9 的倍数，格线才清楚
    geo.x = Math.round(rb.x + (rb.w - geo.size) / 2);
    geo.y = Math.round(rb.y + (rb.h - geo.size) / 2);
    L = { infoX: ri.x, infoY: ri.y, infoW: ri.w, infoH: ri.h, padX: rp.x, padY: rp.y, padW: rp.w, padH: rp.h, keyW: rp.w / 9,
      toolsX: rt.x, toolsY: rt.y, toolsW: rt.w, toolsH: rt.h, hint: rh };
  }

  // ---------- 开局 / 继续 ----------
  app.startGame = (tier, opts) => {
    opts = opts || {};
    // 每升一档，先学一招：第一次玩「中等」「困难」前，问一句要不要先花 1 分钟学这一档的新招
    const need = T.TIER_LESSON[tier];
    if (need && !opts.skipGate && !opts.guided && (opts.mode || 'normal') === 'normal' && !store.data.lessons[need] && !(store.data.gateSeen || {})[tier]) {
      store.data.gateSeen = store.data.gateSeen || {};
      store.data.gateSeen[tier] = true;
      store.save();
      app.tierGate(tier, need);
      return;
    }
    let idx, mode = opts.mode || 'normal', puzzle;
    const fb = focusBank[tier];
    if (mode === 'daily') { idx = opts.idx; puzzle = bank[tier][idx]; }
    else if (fb && fb.length && !opts.guided) {
      // 本局一招：简单 / 中等 / 困难从「一招题库」按顺序出（每题这一档那一招都要用好几次）；题号从 1000 起，和主题库分开
      const nf = store.data.nextFocus || (store.data.nextFocus = {});
      const i = (nf[tier] || 0) % fb.length;
      nf[tier] = (i + 1) % fb.length;
      idx = 1000 + i; puzzle = fb[i];
    } else {
      const half = Math.floor(bank[tier].length / 2);
      idx = store.data.next[tier] % half;
      store.data.next[tier] = (idx + 1) % half;
      puzzle = bank[tier][idx];
    }
    store.startGame(tier, mode);
    if (mode === 'normal' && !opts.guided) store.data.lastTier = tier;
    const nb = Board.create({ mode, tier, idx, date: opts.date, puzzle, guided: opts.guided });
    store.data.current = nb;
    store.save();
    app.go('play', { board: nb });
  };
  app.restartGame = () => {
    const o = b;
    store.recordLoss(o);
    store.startGame(o.tier, o.mode);
    const nb = Board.create({ mode: o.mode, tier: o.tier, idx: o.idx, date: o.date, puzzle: o.puzzle });
    store.data.current = nb;
    store.save();
    app.go('play', { board: nb });
  };
  app.continueGame = () => { if (store.data.current) app.go('play', { board: store.data.current }); };

  function persist() { if (b && !b.done) { store.data.current = b; store.save(); } }

  // ---------- 输入 ----------
  function select(k) {
    if (paused || winAt) return;
    b.selected = k;
    // 点到一个有数的格子：高亮跟着换成这个数；点空格子保留原来亮着的数
    if (k >= 0 && b.vals[k]) selDigit = b.vals[k];
    app.sound('select', 0.4);
  }
  function press(v) {
    if (paused || winAt || b.lost) return;
    const k = b.selected;
    // 点数字键：盘上所有这个数、笔记里有这个数的格子都亮黄（学 Sudoku 2）。没选格子时只亮、不填
    selDigit = v;
    app.animate(150);
    if (k < 0 || Board.locked(b, k)) { app.sound('select', 0.4); return; }
    const r = Board.input(b, k, v, noteMode, store.data.settings);
    const t = P.now();
    if (r.kind === 'note') { app.sound('note'); }
    else if (r.kind === 'correct') onCorrect(k, v, r, t, false);
    else if (r.kind === 'wrong') {
      fx.shake = { k, t0: t };
      app.sound('wrong');
      app.buzz('heavy');
      app.animate(400);
      if (r.lost) setTimeout(() => showLost(), 450);
    } else if (Board.locked(b, k)) {
      fx.shake = { k, t0: t };
      app.animate(350);
    }
    persist();
  }
  function onCorrect(k, v, r, t, viaHint) {
    hint = null;
    // 本局一招：自己填对一个关键格 → 小条亮一下 + 格子上飘「区块排除 ✓」（入门每一步都是排除法，只计数不飘字）；全用上了响一声和弦
    if (!viaHint && Board.focusHit(b, k)) {
      fx.focusAt = t;
      if (b.tier > 0) fx.floats.push({ k, t0: t + 260, text: b.focus.name + ' ✓', focus: true });
      if (b.focus.got.length === b.focus.keys.length && !r.win) later(420, () => app.sound('chord', 0.5));
    }
    if (b.guided && b.guideLeft > 0) {
      b.guideLeft--;
      guide = null;
      if (b.guideLeft === 0) setTimeout(() => app.toast('接下来你自己来！\n卡住了就点「提示」，这一局不限次数', 2800), 500);
    }
    fx.pops[k] = t;
    fx.rings.push({ k, t0: t });
    if (r.gain) fx.floats.push({ k, t0: t + 120, text: '+' + r.gain });
    app.sound('tile');
    // 填满一行 / 列 / 宫：从这一格往两边一格格跳一下、亮一下（等方块落稳再开始）
    const land = t + 150; // 方块落地的那一刻
    r.units.forEach((u) => {
      S.UNITS[u].forEach((x) => {
        const d = Math.abs(S.ROW(x) - S.ROW(k)) + Math.abs(S.COL(x) - S.COL(k));
        fx.flash.push({ k: x, t0: t + 220 + d * 45, dur: 420 });
        if (x !== k) fx.hops[x] = t + 220 + d * 45;
      });
    });
    // 同一步撞在一起：只响一个声音、只震一次。优先级：通关 > 数字填完 > 行列宫
    if (r.units.length && !r.win && !r.digitDone) later(220, () => { app.sound('unit'); app.buzz('medium'); });
    if (r.digitDone && !r.win) digitBurst(v, land);
    app.animate(1200);
    if (r.win) onWin(t);
  }

  // ---------- 按时间排的小事件（代替到处 setTimeout：同一时刻的事在同一帧里做）----------
  function later(ms, fn) { fx.events.push({ at: P.now() + ms, fn }); }
  function runEvents(t) {
    if (!fx.events.length) return;
    const due = fx.events.filter((e) => e.at <= t);
    if (!due.length) return;
    fx.events = fx.events.filter((e) => e.at > t);
    due.forEach((e) => e.fn(t));
  }

  // ---------- 某个数 9 个都填完：原地「顿一下再爆」（0.43 秒，不盖屏、不锁输入）----------
  // 顿（9 块硬切成金面）→ 出手（9 块同时放大 1.18，不缓动）→ 命中（各一层白光、弹回、金线串起、键上打勾、火星、棋盘轻抖、铃音）
  function digitBurst(v, land) {
    const D = C.CUT.digit, F = 1000 / 60;
    b.digitCount = (b.digitCount || 0) + 1;
    const full = b.digitCount === 1 && !store.data.settings.reduceMotion;
    const hold = (full ? D.hold : D.holdShort) * F, hit = (full ? D.hit : D.hitShort) * F;
    const cells = [];
    for (let x = 0; x < 81; x++) if (b.vals[x] === v) cells.push(x);
    const tS = land + hold, tH = tS + D.strike * F, tEnd = tH + hit;
    cells.forEach((x) => { fx.gold[x] = [land, tEnd]; });
    fx.digit = { cells, tS, tH, tEnd, full };
    later(tH - P.now(), (t) => {
      cells.forEach((x) => fx.flash.push({ k: x, t0: t, dur: 12 * F, color: '#FFFFFF', alpha: 0.6 }));
      cells.forEach((x) => sparkAt(x, full ? 3 : 2));
      if (full) fx.boardShake = { t0: t, dur: 6 * F, amp: 2 };
      app.sound('bell' + Math.min(8, b.digitCount));
      app.buzz('medium');
    });
    fx.keyDone[v] = tS;
    app.animate(tEnd - P.now() + 100);
  }
  // 单格缩放：数字填完的「出手」放大 → 弹回；通关长停时整盘呼吸
  function cellScale(k, t) {
    const d = fx.digit;
    if (d && t >= d.tS && t < d.tEnd && d.cells.indexOf(k) >= 0) {
      if (t < d.tH) return C.CUT.digit.scale;
      const p = Math.min(1, (t - d.tH) / (10 * 1000 / 60));
      return C.CUT.digit.scale - (C.CUT.digit.scale - 1) * ui.ease.back(p);
    }
    if (party && party.breathFrom && t >= party.breathFrom) return 1 + 0.02 * Math.sin(Math.min(1, (t - party.breathFrom) / 750) * Math.PI);
    return 1;
  }
  function sparkAt(k, n) {
    const r = DB.cellRect(geo, k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
      fx.sparks.push({ x: r.x + r.s / 2, y: r.y + r.s / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0, max: 300 + Math.random() * 300 });
    }
  }
  function stepSparks(dt) {
    const s = dt / 1000;
    fx.sparks.forEach((p) => { p.vy += 500 * s; p.x += p.vx * s; p.y += p.vy * s; p.life += dt; });
    fx.sparks = fx.sparks.filter((p) => p.life < p.max);
  }
  function drawSparks(ctx) {
    for (const p of fx.sparks) {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.strokeStyle = '#FFC24A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 金线：8 帧一笔把 9 块串起来，再 10 帧淡掉（只有每局第一次）
  function drawGoldLine(ctx, t) {
    const d = fx.digit, F = 1000 / 60;
    if (!d || !d.full || t < d.tH || t > d.tH + 18 * F) return;
    const p = (t - d.tH) / (8 * F), fade = Math.max(0, 1 - (t - d.tH - 8 * F) / (10 * F));
    const pts = d.cells.map((k) => { const r = DB.cellRect(geo, k); return [r.x + r.s / 2, r.y + r.s / 2]; });
    const n = Math.min(pts.length, Math.max(1, Math.ceil(p * pts.length)));
    ctx.save();
    ctx.globalAlpha = Math.min(1, fade);
    ctx.strokeStyle = '#F5C531'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.slice(0, n).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
  }

  // ---------- 通关：第一段在棋盘上，第二段交给过场播放器 ----------
  // 顿（棋盘以外硬切成近黑、计时停、重震）→ 金色从最后一格一圈圈漫满（每圈一声嗒，越来越高）→ 81 格全金长停呼吸
  // → 截下棋盘 → 播放器：整盘压扁收成一块金方块「咚」→ 光阵底「完成！」→ 硬切到安静的结算页
  function onWin(t) {
    winAt = t;
    const last = b.selected >= 0 ? b.selected : 40;
    b.selected = -1;
    hint = null;
    // 奖励先入账，再播
    const firstEver = !store.data.seen.firstClear;
    const firstTier = !(store.data.seen.clearTier || {})[b.tier];
    store.recordWin(b);
    if (b.focus) { const tu = store.data.techUses || (store.data.techUses = {}); tu[b.focus.lesson] = (tu[b.focus.lesson] || 0) + b.focus.got.length; }
    store.data.seen.firstClear = true;
    store.data.seen.clearTier = Object.assign({}, store.data.seen.clearTier, { [b.tier]: true });
    store.save();
    const won = b.mode === 'challenge' && app.challengeResult(b).win;
    const full = !store.data.settings.reduceMotion && (firstEver || firstTier || b.mode === 'daily' || b.newBest || won);
    const tn = S.TIERS[b.tier].name;
    const head = b.mode === 'daily' ? '今日完成' : won ? '你赢了' : b.newBest && !firstTier ? '新纪录 ' + app.fmt(b.elapsed) : firstTier ? '首次通关 · ' + tn : '完成！';
    const WIN = C.CUT.win, F = 1000 / 60;
    party = { t0: t, last, full, head, sub: app.fmt(b.elapsed) + ' · ' + b.score + ' 分' };
    app.buzz('heavy');
    const land = t + 150;
    if (full) {
      // 波浪：按「隔几格」算（切比雪夫距离），每圈 6 帧
      let maxD = 0;
      for (let x = 0; x < 81; x++) {
        const d = Math.max(Math.abs(S.ROW(x) - S.ROW(last)), Math.abs(S.COL(x) - S.COL(last)));
        maxD = Math.max(maxD, d);
        const at = land + WIN.freeze * F + d * WIN.ring * F;
        fx.gold[x] = [at, Infinity];
        fx.hops[x] = at;
      }
      for (let d = 0; d <= maxD; d++) later(land + WIN.freeze * F + d * WIN.ring * F - P.now(), () => app.sound('tick' + Math.min(9, d + 1)));
      const holdFrom = land + WIN.freeze * F + (maxD + 1) * WIN.ring * F + 300;
      party.breathFrom = holdFrom;
      later(holdFrom + WIN.hold * F - P.now(), () => toPlayer());
    } else {
      later(land + WIN.freezeShort * F - P.now(), () => toPlayer());
    }
    app.animate(6000);
  }
  function toPlayer() {
    if (!party || party.playing) return;
    party.playing = true;
    // 截下棋盘（和真棋盘同样大小、同样位置，接得上）
    const d = app.dpr, pad = 6;
    const shot = P.makeCanvas(Math.round((geo.size + pad * 2) * d), Math.round((geo.size + pad * 2) * d));
    const g = shot.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    DB.draw(g, app.th, { x: pad, y: pad, size: geo.size }, {
      vals: b.vals, given: b.given, notes: b.notes, wrong: () => false, selected: -1, gold: fx.gold, now: P.now() + 99999, tileStyle: store.data.settings.tileStyle,
    }, d);
    const sgeo = { x: geo.x - pad, y: geo.y - pad, size: geo.size + pad * 2 };
    app.cutWin(shot, sgeo, b.tier, party.head, party.sub, { short: !party.full, onEnd: endParty });
  }
  function endParty() {
    if (!party) return;
    party = null;
    app.go('result', { board: b, fromCut: true });
  }
  function showLost() {
    app.sound('lose');
    app.lostModal(b, {
      revive: () => app.showAd('revive', '再给一次机会', () => { Board.revive(b); persist(); app.toast('接着来！还能再错 1 次'); }, () => showLost()),
      restart: () => app.restartGame(),
      fresh: () => { store.recordLoss(b); store.data.current = null; app.startGame(b.tier, b.mode === 'daily' ? { mode: 'normal' } : {}); },
    });
  }
  function tool(name) {
    if (paused || winAt) return;
    if (name === 'undo') {
      const k = Board.undo(b);
      if (k >= 0) { b.selected = k; fx.pops[k] = P.now(); app.sound('undo'); app.animate(250); }
    } else if (name === 'erase') {
      if (Board.erase(b, b.selected)) app.sound('erase');
    } else if (name === 'note') {
      noteMode = !noteMode;
      app.sound('tap');
    } else if (name === 'hint') askHint();
    persist();
  }
  function askHint() {
    if (hint) return;
    if (b.hintsLeft > 0) { b.hintsLeft--; showHint(); }
    else app.showAd('hint', '一次提示', () => showHint());
  }
  function showHint() {
    const h = Board.findHint(b);
    if (!h) return;
    b.hintsUsed++;
    const tech = h.step && h.step.tech;
    const cells = h.step ? (tech === 'nakedSingle' ? [h.place.k] : h.step.focus || h.step.cells) : [h.place.k];
    hint = { h, t0: P.now(), cells, lesson: T.TECH_LESSON[tech] };
    b.selected = -1;
    app.sound('hint');
    app.animate(300);
    persist();
  }
  function fillHint() {
    const { k, v } = hint.h.place;
    hint = null;
    b.selected = k;
    const r = Board.fillHint(b, k, v);
    onCorrect(k, v, r, P.now(), true);
    persist();
  }

  // ---------- 画 ----------
  function drawInfo(ctx, th) {
    const y = L.infoY + L.infoH / 2, x0 = L.infoX, x1 = L.infoX + L.infoW;
    const lim = store.data.settings.mistakeLimit !== false;
    ui.text(ctx, '错误', x0 + 20, y, 13, th.sub);
    ui.text(ctx, lim ? b.mistakes + '/' + C.RULES.maxMistakes : String(b.mistakes), x0 + 52, y, 14, b.mistakes ? th.wrong : th.text, 'left', 600);
    ui.text(ctx, String(b.score), (x0 + x1) / 2, y, 17, th.text, 'center', 700);
    if (b.challenge) {
      // 好友挑战：朋友的用时先藏着，做完才揭晓
      ui.text(ctx, app.fmt(b.elapsed), x1 - 20, y - 7, 14, th.text, 'right', 600);
      ui.text(ctx, '朋友 做完揭晓', x1 - 20, y + 10, 11, th.sub, 'right');
    } else if (store.data.settings.showTimer !== false) ui.text(ctx, app.fmt(b.elapsed), x1 - 20, y, 14, th.text, 'right', 500);
  }
  // 本局一招：信息行下面一个小条「本局一招 · 区块排除 1/3」；全用上了变金；点一下讲这一招、能去学
  function drawFocus(ctx, th, t) {
    const f = b.focus;
    if (!f || b.guided) return;
    const r = LY.rect('play.focus'), kk = LY.k('play.focus', r);
    const all = f.got.length >= f.keys.length, many = f.keys.length > 9;
    const pulse = fx.focusAt ? Math.max(0, 1 - (t - fx.focusAt) / 500) : 0;
    const on = ui.button({ id: 'focus-chip', x: r.x, y: r.y, w: r.w, h: r.h, onTap: () => focusSheet() });
    ctx.save();
    const s = 1 + 0.08 * Math.sin(pulse * Math.PI) - (on ? 0.03 : 0);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(s, s); ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2);
    ui.fillRR(ctx, r.x, r.y, r.w, r.h, r.h / 2, all ? th.gold : th.soft);
    if (pulse > 0 && !all) { ctx.globalAlpha = pulse * 0.6; ui.fillRR(ctx, r.x, r.y, r.w, r.h, r.h / 2, th.gold); ctx.globalAlpha = 1; }
    const label = '本局一招 · ' + f.name + '  ' + (many && !all ? f.got.length + ' 次' : f.got.length + '/' + f.keys.length) + (all ? ' ✓' : '');
    ui.text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, Math.round(13 * kk), all ? '#FFFFFF' : th.text, 'center', 600);
    ctx.restore();
    if (pulse > 0) app.animate(60);
  }
  function focusSheet() {
    const f = b.focus, F = T.LESSONS.find((x) => x.id === f.lesson);
    app.push({
      onBackdrop: () => app.pop(),
      draw(ctx, t, p) {
        const th = app.th;
        const m = app.modal(ctx, p, 236);
        ui.text(ctx, '本局一招：' + f.name, app.W / 2, m.y + 38, 20, th.text, 'center', 700);
        ui.text(ctx, F ? F.sub : '', app.W / 2, m.y + 70, 14, th.sub, 'center');
        ui.text(ctx, f.keys.length > 9 ? '这一盘全靠它，已经用上 ' + f.got.length + ' 次' : '这一盘有 ' + f.keys.length + ' 处非用它不可，你已经用上 ' + f.got.length + ' 处', app.W / 2, m.y + 98, 13, th.text, 'center');
        const bx = m.x + 20, bw = m.w - 40;
        ui.pill(ctx, th, 'focus-learn', bx, m.y + 122, bw, 48, '看一下怎么用（1 分钟）', () => { app.pop(); persist(); app.go('lesson', { id: f.lesson, returnTo: 'play' }); }, 'primary');
        ui.pill(ctx, th, 'focus-ok', bx, m.y + 178, bw, 42, '知道了', () => app.pop(), 'card');
        m.done();
      },
    });
  }
  // 带练：卡片上一行字说为什么，手指先指格子、选中以后指数字键
  function drawGuide(ctx, th, t) {
    if (!guide) {
      const h = Board.findHint(b);
      if (!h) return;
      const tech = h.step && h.step.tech;
      guide = { h, t0: t, cells: h.step ? (tech === 'nakedSingle' ? [h.place.k] : h.step.focus || h.step.cells) : [h.place.k] };
    }
    const g = guide, k = g.h.place.k, v = g.h.place.v;
    const p = Math.min(1, (t - g.t0) / 220);
    const x = L.hint.x, w = L.hint.w, hh = L.hint.h;
    const y = L.hint.y + (1 - ui.ease.out(p)) * 10;
    ctx.save();
    ctx.globalAlpha = p;
    ui.card(ctx, x, y, w, hh, 14, th);
    ui.text(ctx, '第 ' + (4 - b.guideLeft) + ' / 3 步', x + 16, y + 18, 12, th.primary, 'left', 700);
    ui.wrap(ctx, g.h.text.replace(/^[^：]*：/, ''), x + 16, y + 30, w - 32, 13, 17, th.text);
    ctx.restore();
    const target = b.selected === k ? { x: L.padX + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 } : (() => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; })();
    ui.icons.hand(ctx, target.x + 4, target.y + 6 + Math.sin(t / 220) * 5, 44, th.text);
  }
  function drawHintCard(ctx, th, t) {
    const p = Math.min(1, (t - hint.t0) / 220);
    const x = L.hint.x, w = L.hint.w, h = L.hint.h;
    const y = L.hint.y + (1 - ui.ease.out(p)) * 10;
    ui.button({ id: 'hint-card', x, y, w, h }); // 挡住下面的按钮
    ctx.save();
    ctx.globalAlpha = p;
    ui.card(ctx, x, y, w, h, 14, th);
    ui.icons.bulb(ctx, x + 22, y + h / 2, 22, th.gold);
    const btnW = 64;
    const textW = w - 44 - btnW - (hint.lesson ? 50 : 0) - 8;
    const n = ui.wrap(ctx, hint.h.text, 0, 0, textW, 13, 18, null);
    ui.wrap(ctx, hint.h.text, x + 40, y + h / 2 - (n * 18) / 2, textW, 13, 18, th.text);
    // 「学这招」：去对应的那一课
    if (hint.lesson) {
      const lx = x + w - btnW - 56;
      ui.button({ id: 'hint-learn', x: lx, y: y + 12, w: 48, h: 40, onTap: () => { persist(); app.go('lesson', { id: hint.lesson, returnTo: 'play' }); } });
      ui.text(ctx, '学这招', lx + 24, y + h / 2, 12, th.primary, 'center', 600);
    }
    const on = ui.button({ id: 'hint-fill', x: x + w - btnW - 8, y: y + 14, w: btnW, h: 36, onTap: fillHint });
    ui.fillRR(ctx, x + w - btnW - 8, y + 14, btnW, 36, 12, on ? th.sel : th.soft);
    ui.text(ctx, '填上', x + w - btnW / 2 - 8, y + h / 2, 14, th.primary, 'center', 600);
    ctx.restore();
  }

  // 数字键（教学也用）：opts = { y, h, onPress, counts, noteMode, disabled, highlight }
  const PAD_TILT = [-3, 2, -2, 3, -1, 2, -3, 1, 3]; // 每个键歪几度
  app.drawPad = (ctx, opts) => {
    const th = app.th, px = opts.x != null ? opts.x : 8, keyW = (opts.w != null ? opts.w : app.W - 16) / 9;
    for (let v = 1; v <= 9; v++) {
      const x = px + (v - 1) * keyW;
      const left = opts.counts ? 9 - opts.counts[v] : null;
      const done = left === 0;
      const on = ui.button({ id: 'key-' + v, x, y: opts.y, w: keyW, h: opts.h, silent: done, onDown: done || opts.disabled ? null : () => opts.onPress(v) });
      if (opts.highlight === v) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(app.now / 220);
        ui.fillRR(ctx, x + 2, opts.y + 2, keyW - 4, opts.h - 4, 12, th.soft);
        ctx.globalAlpha = 1;
      }
      const da = opts.doneAt && opts.doneAt[v] ? app.now - opts.doneAt[v] : -1;
      if (da >= 0 && da < 900) {
        const p = da / 900, cx = x + keyW / 2, cy = opts.y + opts.h / 2 - 6;
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = th.gold; ctx.lineWidth = 3 * (1 - p) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, 12 + ui.ease.out(p) * 22, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        const s = 0.6 + 0.4 * ui.ease.back(Math.min(1, p * 2.5));
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fillStyle = th.gold; ctx.fill();
        ui.icons.check(ctx, 0, 0, 18, '#FFFFFF', 2.6);
        ctx.restore();
        continue;
      }
      // 键也是方块（学 Sudoku 2 的一排小方块，微微歪一点）：按下压低、摆正；正在亮的数字黄；笔记模式淡一点；填完的只留淡字
      const cs = Math.min(keyW + 4, opts.h - 16), tx = x + (keyW - cs) / 2, ty = opts.y + 1;
      if (done || opts.disabled) {
        ui.text(ctx, String(v), x + keyW / 2, ty + cs / 2, 24, th.faint, 'center', 500);
      } else {
        ctx.save();
        const tilt = on ? 0 : PAD_TILT[v - 1] * Math.PI / 180;
        ctx.translate(tx + cs / 2, ty + cs / 2 + (on ? 2 : 0));
        ctx.rotate(tilt);
        if (on) ctx.scale(0.94, 0.94);
        ctx.translate(-(tx + cs / 2), -(ty + cs / 2));
        if (opts.noteMode) ctx.globalAlpha = 0.6;
        DB.sampleTile(ctx, th, store.data.settings.tileStyle, tx, ty, cs, v, 0, app.now, opts.active === v);
        ctx.restore();
      }
      if (left !== null && !done) ui.text(ctx, String(left), x + keyW / 2, opts.y + opts.h - 9, 10, th.faint, 'center');
    }
  };
  // 工具行（教学也用）：items = [{ id, label, icon, badge, active, onTap, highlight }]
  app.drawTools = (ctx, y, h, items, x0, w0) => {
    const th = app.th, tx = x0 != null ? x0 : 8, w = (w0 != null ? w0 : app.W - 16) / items.length;
    items.forEach((it, i) => {
      const x = tx + i * w, cx = x + w / 2;
      const on = ui.button({ id: 'tool-' + it.id, x, y, w, h, onDown: it.onTap });
      if (on) ui.fillRR(ctx, cx - 30, y + 2, 60, h - 4, 14, th.soft);
      if (it.highlight) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(app.now / 220);
        ui.fillRR(ctx, cx - 30, y + 2, 60, h - 4, 14, th.soft);
        ctx.globalAlpha = 1;
      }
      const c = it.active ? th.primary : th.sub;
      ui.icons[it.icon](ctx, cx, y + 22, 26, c);
      ui.text(ctx, it.label, cx, y + 48, 12, c, 'center', it.active ? 600 : 400);
      if (it.badge) {
        ctx.font = ui.font(10, 700);
        const bw = Math.max(18, ctx.measureText(it.badge.text).width + 10);
        ui.fillRR(ctx, cx + 8, y + 4, bw, 16, 8, it.badge.color);
        ui.text(ctx, it.badge.text, cx + 8 + bw / 2, y + 12.5, 10, '#FFFFFF', 'center', 700);
      }
    });
  };

  app.scenes.play = {
    enter(args) {
      b = args.board;
      noteMode = false; paused = false; hint = null; winAt = 0; party = null; guide = null; selDigit = 0;
      resetFx();
      layout();
      // 新的一局：先说一句这盘练哪一招
      if (b.focus && !b.focusShown && !b.guided) {
        b.focusShown = true;
        const f = b.focus;
        setTimeout(() => app.toast('本局一招：' + f.name + (f.keys.length > 9 ? '\n这一盘全靠它' : '\n这一盘有 ' + f.keys.length + ' 处要用它'), 2600), 350);
      }
    },
    leave() { persist(); },
    onHide() { if (b && !b.done && !winAt) { paused = true; persist(); app.redraw(); } },
    update(dt, t) {
      if (fx) { runEvents(t); if (fx.sparks.length) stepSparks(dt); }
      if (!b || paused || winAt || b.lost || app.overlays.length) return;
      b.elapsed += dt;
      const sec = Math.floor(b.elapsed / 1000);
      if (sec !== lastSec) { lastSec = sec; app.redraw(); }
      saveTimer += dt;
      if (saveTimer > 3000) { saveTimer = 0; persist(); }
    },
    live: (t) => !!party || (!!hint && t - hint.t0 < 400) || (!!b && b.guided && b.guideLeft > 0) || (!!fx && (fx.sparks.length > 0 || fx.events.length > 0)),
    draw(ctx, t) {
      const th = app.th;
      layout(); // 每帧按布局表算一次（便宜；编辑器拖动时立刻跟上）
      const tierName = S.TIERS[b.tier].name;
      const title = b.mode === 'daily' ? '每日挑战 · ' + tierName : b.mode === 'challenge' ? '好友挑战 · ' + tierName : b.mode === 'duo' ? '一起做 · ' + tierName : tierName;
      app.header(ctx, title, () => { persist(); app.go(b.mode === 'daily' ? 'daily' : 'home'); }, (ctx2, y, h) => {
        const x = app.headerRight - 48;
        const on = ui.button({ id: 'pause', x, y, w: 44, h, onTap: () => { paused = !paused; persist(); } });
        if (on) ui.fillRR(ctx, x + 4, y + 4, 36, 36, 18, th.soft);
        (paused ? ui.icons.play : ui.icons.pause)(ctx, x + 22, y + h / 2, 22, th.text);
      });
      drawInfo(ctx, th);
      drawFocus(ctx, th, t);

      // 棋盘（按下就选中）
      ui.button({ id: 'board', x: geo.x, y: geo.y, w: geo.size, h: geo.size, silent: true, onDown: (x, y) => select(DB.cellAt(geo, x, y)) });
      // 数字填完时棋盘轻抖（只抖棋盘）
      let bgeo = geo;
      if (fx.boardShake && t - fx.boardShake.t0 < fx.boardShake.dur) {
        const k2 = 1 - (t - fx.boardShake.t0) / fx.boardShake.dur;
        bgeo = { x: geo.x + (Math.random() - 0.5) * 2 * fx.boardShake.amp * k2, y: geo.y + (Math.random() - 0.5) * 2 * fx.boardShake.amp * k2, size: geo.size };
      }
      DB.draw(ctx, th, bgeo, {
        gold: fx.gold, cellScale,
        vals: b.vals, given: b.given, notes: b.notes, wrong: (k) => Board.isWrong(b, k),
        selected: b.selected, selDigit, sameHighlight: store.data.settings.sameHighlight,
        hintCells: hint ? hint.cells : guide && b.guideLeft > 0 ? guide.cells : null,
        pops: fx.pops, rings: fx.rings, flash: fx.flash, shake: fx.shake, hops: fx.hops, now: t, tileStyle: store.data.settings.tileStyle,
      }, app.dpr);
      drawGoldLine(ctx, t);
      drawSparks(ctx);
      if (paused) {
        ui.fillRR(ctx, geo.x, geo.y, geo.size, geo.size, 10, th.board);
        ui.text(ctx, '已暂停', app.W / 2, geo.y + geo.size / 2 - 30, 20, th.text, 'center', 600);
        ui.pill(ctx, th, 'resume', app.W / 2 - 70, geo.y + geo.size / 2 + 4, 140, 48, '继续', () => { paused = false; }, 'primary');
        ui.pill(ctx, th, 'pause-settings', app.W / 2 - 70, geo.y + geo.size / 2 + 62, 140, 44, '设置', () => app.settingsSheet({ name: 'play', args: { board: b } }), 'soft');
      }
      // 加分飘字
      fx.floats = fx.floats.filter((f) => t - f.t0 < 800);
      for (const f of fx.floats) {
        if (t < f.t0) continue;
        const p = (t - f.t0) / 800, r = DB.cellRect(geo, f.k);
        ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
        ui.text(ctx, f.text, r.x + r.s / 2, r.y - 6 - ui.ease.out(p) * 26 - (f.focus ? 16 : 0), f.focus ? 13 : 14, f.focus ? th.gold : th.primary, 'center', 700);
        ctx.globalAlpha = 1;
      }

      // 工具 + 数字键
      const hintBadge = b.hintsLeft > 0 ? { text: String(b.hintsLeft), color: th.primary } : { text: '▶', color: th.gold };
      app.drawTools(ctx, L.toolsY, L.toolsH, [
        { id: 'undo', label: '撤销', icon: 'undo', onTap: () => tool('undo') },
        { id: 'erase', label: '橡皮', icon: 'eraser', onTap: () => tool('erase') },
        { id: 'note', label: '笔记', icon: 'pencil', active: noteMode, badge: { text: noteMode ? '开' : '关', color: noteMode ? th.primary : th.faint }, onTap: () => tool('note') },
        { id: 'hint', label: '提示', icon: 'bulb', badge: hintBadge, onTap: () => tool('hint') },
      ], L.toolsX, L.toolsW);
      app.drawPad(ctx, { x: L.padX, w: L.padW, y: L.padY, h: L.padH, onPress: press, counts: Board.counts(b), noteMode, doneAt: fx.keyDone, active: selDigit });
      if (hint) drawHintCard(ctx, th, t);
      else if (b.guided && b.guideLeft > 0 && !winAt && !paused) drawGuide(ctx, th, t);
      // 通关第一段：棋盘以外硬切成近黑（点一下直接进第二段）
      if (party && !party.playing) {
        ctx.fillStyle = '#0E0E0E';
        ctx.fillRect(0, 0, app.W, geo.y - 6); ctx.fillRect(0, geo.y + geo.size + 6, app.W, app.H - geo.y - geo.size - 6);
        ctx.fillRect(0, geo.y - 6, geo.x - 6, geo.size + 12); ctx.fillRect(geo.x + geo.size + 6, geo.y - 6, app.W - geo.x - geo.size - 6, geo.size + 12);
        ui.button({ id: 'cs-skip', x: 0, y: 0, w: app.W, h: app.H, silent: true, onDown: () => { fx.events = []; toPlayer(); } });
      }
    },
  };

  // 机器人测试用：格子、数字键、工具的中心坐标
  app.testHooks = {
    board: () => b,
    cellCenter: (k) => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; },
    padCenter: (v) => ({ x: L.padX + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 }),
    toolCenter: (i) => ({ x: L.toolsX + (i + 0.5) * (L.toolsW / 4), y: L.toolsY + L.toolsH / 2 }),
    hint: () => hint,
    guide: () => guide,
    selDigit: () => selDigit,
    noteMode: () => noteMode,
  };
};
