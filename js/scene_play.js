// 局内：顶栏（返回 / 难度 / 暂停）、信息行（错误 / 分数 / 时间）、棋盘、四个工具、数字键。
// 点格子、点数字都在「手指按下」那一刻生效（不等松手），手感更跟手。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const Board = require('./board.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const DB = require('./drawboard.js');
const T = require('./tutorial.js');

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
  let hintBelow = true;

  const resetFx = () => { fx = { pops: {}, rings: [], flash: [], shake: null, floats: [], hops: {}, keyDone: {}, confetti: [] }; };
  let party = null; // 通关庆祝：{ t0, k }

  function layout() {
    const W = app.W;
    const infoY = app.headerY + app.headerH;
    const infoBottom = infoY + 30;
    const padH = 72, toolsH = 62;
    const padY = app.bottom - 14 - padH;
    const toolsY = padY - 8 - toolsH;
    const avail = toolsY - 10 - infoBottom;
    geo.size = Math.floor(Math.min(W - 16, avail - 8) / 9) * 9;
    geo.x = Math.round((W - geo.size) / 2);
    geo.y = Math.round(infoBottom + 8 + Math.max(0, (avail - 8 - geo.size) * 0.35));
    // 提示卡放在棋盘下面的空当里（靠近大拇指）；空当不够就盖在工具行上
    hintBelow = toolsY - (geo.y + geo.size) >= 76;
    L = { infoY, padY, padH, toolsY, toolsH, padX: 8, keyW: (W - 16) / 9 };
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
    let idx, mode = opts.mode || 'normal';
    if (mode === 'daily') idx = opts.idx;
    else {
      const half = Math.floor(bank[tier].length / 2);
      idx = store.data.next[tier] % half;
      store.data.next[tier] = (idx + 1) % half;
    }
    store.startGame(tier, mode);
    const nb = Board.create({ mode, tier, idx, date: opts.date, puzzle: bank[tier][idx], guided: opts.guided });
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
    else if (r.kind === 'correct') onCorrect(k, v, r, t);
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
  function onCorrect(k, v, r, t) {
    hint = null;
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
    r.units.forEach((u) => {
      S.UNITS[u].forEach((x) => {
        const d = Math.abs(S.ROW(x) - S.ROW(k)) + Math.abs(S.COL(x) - S.COL(k));
        fx.flash.push({ k: x, t0: t + 220 + d * 45, dur: 420 });
        if (x !== k) fx.hops[x] = t + 220 + d * 45;
      });
    });
    if (r.units.length && !r.win) { setTimeout(() => app.sound('unit'), 220); setTimeout(() => app.buzz('medium'), 220); }
    if (r.digitDone && !r.win) {
      for (let x = 0; x < 81; x++) if (b.vals[x] === v) { fx.flash.push({ k: x, t0: t + 300, dur: 600, color: app.th.gold, alpha: 0.4 }); fx.hops[x] = t + 300; }
      fx.keyDone[v] = t + 300;
      setTimeout(() => app.sound('digit'), 300);
    }
    app.animate(1200);
    if (r.win) onWin(t);
  }
  // 通关：从最后一格往外一圈圈波浪点亮、每格跳一下 → 两门彩纸炮 + 顶上撒彩纸 → 「完成！」→ 结算。约 2.8 秒，点一下跳过
  const PARTY_MS = 2800;
  function onWin(t) {
    winAt = t;
    const last = b.selected;
    b.selected = -1;
    store.recordWin(b);
    party = { t0: t, k: last };
    for (let x = 0; x < 81; x++) {
      const d = Math.hypot(S.ROW(x) - S.ROW(last), S.COL(x) - S.COL(last));
      fx.flash.push({ k: x, t0: t + 250 + d * 70, dur: 520, alpha: 0.65 });
      fx.hops[x] = t + 250 + d * 70;
    }
    setTimeout(() => { app.sound('fanfare'); app.buzz('heavy'); }, 250);
    setTimeout(() => { if (party) { burst(); app.sound('confetti'); app.buzz('medium'); } }, 750);
    setTimeout(() => endParty(), PARTY_MS);
  }
  function endParty() {
    if (!party) return;
    party = null;
    app.go('result', { board: b });
  }
  // 彩纸：左下、右下两门炮往上斜着打，再从顶上飘一阵
  function burst() {
    const th = app.th, W = app.W;
    const colors = [th.primary, th.gold, th.ok, th.wrong, th.glow, (th.tileB || [th.user])[0]];
    const rnd = Math.random;
    const add = (x, y, vx, vy) => fx.confetti.push({ x, y, vx, vy, rot: rnd() * 6, vr: (rnd() - 0.5) * 14, w: 5 + rnd() * 5, h: 8 + rnd() * 6, c: colors[(rnd() * colors.length) | 0], ph: rnd() * 6, round: rnd() < 0.25 });
    for (let i = 0; i < 70; i++) {
      const sp = 650 + rnd() * 550, a = (-62 - rnd() * 22) * Math.PI / 180;
      add(-10, app.H * 0.78, Math.cos(a) * sp, Math.sin(a) * sp);
      add(W + 10, app.H * 0.78, -Math.cos(a) * sp, Math.sin(a) * sp);
    }
    for (let i = 0; i < 50; i++) add(rnd() * W, -20 - rnd() * 200, (rnd() - 0.5) * 80, 60 + rnd() * 120);
  }
  function stepConfetti(dt) {
    const s = dt / 1000;
    for (const p of fx.confetti) {
      p.vy += 900 * s;
      p.vx *= Math.pow(0.35, s);
      p.vy *= Math.pow(0.55, s);
      p.x += (p.vx + Math.sin(p.ph + p.y / 40) * 30) * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
    }
    fx.confetti = fx.confetti.filter((p) => p.y < app.H + 40);
  }
  function drawParty(ctx, th, t) {
    for (const p of fx.confetti) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.8 + 0.2); // 翻转时变窄，像纸片在转
      ctx.fillStyle = p.c;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    // 「完成！」大字：0.9 秒时弹出来
    const e = t - party.t0 - 900;
    if (e > 0) {
      const p = Math.min(1, e / 380);
      const s = ui.ease.back(p);
      const cy = geo.y + geo.size / 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p * 1.5);
      ctx.translate(app.W / 2, cy);
      ctx.scale(s, s);
      ui.fillRR(ctx, -110, -46, 220, 92, 28, th.card);
      ui.rr(ctx, -110, -46, 220, 92, 28); ctx.strokeStyle = th.gold; ctx.lineWidth = 3; ctx.stroke();
      ui.text(ctx, '完成！', 0, -6, 38, th.text, 'center', 800);
      ui.text(ctx, app.fmt(b.elapsed) + ' · ' + b.score + ' 分', 0, 28, 14, th.sub, 'center', 600);
      ctx.restore();
    }
    ui.text(ctx, '点一下继续', app.W / 2, app.bottom - 22, 12, th.sub, 'center');
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
    onCorrect(k, v, r, P.now());
    persist();
  }

  // ---------- 画 ----------
  function drawInfo(ctx, th) {
    const y = L.infoY + 14, W = app.W;
    const lim = store.data.settings.mistakeLimit !== false;
    ui.text(ctx, '错误', 20, y, 13, th.sub);
    ui.text(ctx, lim ? b.mistakes + '/' + C.RULES.maxMistakes : String(b.mistakes), 52, y, 14, b.mistakes ? th.wrong : th.text, 'left', 600);
    ui.text(ctx, String(b.score), W / 2, y, 17, th.text, 'center', 700);
    if (b.challenge) {
      // 好友挑战：时间旁边写着朋友的用时，超过了变红
      const over = b.elapsed > b.challenge.time;
      ui.text(ctx, app.fmt(b.elapsed), W - 20, y - 7, 14, over ? th.wrong : th.text, 'right', 600);
      ui.text(ctx, '朋友 ' + app.fmt(b.challenge.time), W - 20, y + 10, 11, th.sub, 'right');
    } else if (store.data.settings.showTimer !== false) ui.text(ctx, app.fmt(b.elapsed), W - 20, y, 14, th.text, 'right', 500);
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
    const x = 12, w = app.W - 24, hh = 64;
    const y = (hintBelow ? geo.y + geo.size + 10 : L.toolsY + L.toolsH - hh) + (1 - ui.ease.out(p)) * 10;
    ctx.save();
    ctx.globalAlpha = p;
    ui.card(ctx, x, y, w, hh, 14, th);
    ui.text(ctx, '第 ' + (4 - b.guideLeft) + ' / 3 步', x + 16, y + 18, 12, th.primary, 'left', 700);
    ui.wrap(ctx, g.h.text.replace(/^[^：]*：/, ''), x + 16, y + 30, w - 32, 13, 17, th.text);
    ctx.restore();
    const target = b.selected === k ? { x: 8 + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 } : (() => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; })();
    ui.icons.hand(ctx, target.x + 4, target.y + 6 + Math.sin(t / 220) * 5, 44, th.text);
  }
  function drawHintCard(ctx, th, t) {
    const p = Math.min(1, (t - hint.t0) / 220);
    const x = 12, w = app.W - 24, h = 64;
    const y = (hintBelow ? geo.y + geo.size + 10 : L.toolsY + L.toolsH - h) + (1 - ui.ease.out(p)) * 10;
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
  app.drawPad = (ctx, opts) => {
    const th = app.th, keyW = (app.W - 16) / 9;
    for (let v = 1; v <= 9; v++) {
      const x = 8 + (v - 1) * keyW;
      const left = opts.counts ? 9 - opts.counts[v] : null;
      const done = left === 0;
      const on = ui.button({ id: 'key-' + v, x, y: opts.y, w: keyW, h: opts.h, silent: done, onDown: done || opts.disabled ? null : () => opts.onPress(v) });
      if (on && !done && !opts.disabled) ui.fillRR(ctx, x + 2, opts.y + 2, keyW - 4, opts.h - 4, 12, th.sel);
      if (opts.active === v) ui.fillRR(ctx, x + keyW / 2 - 13, opts.y + opts.h - 7, 26, 4, 2, '#F5C531'); // 正在亮着的数字：键下一条黄线
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
      const color = done || opts.disabled ? th.faint : opts.noteMode ? th.note : th.primary;
      ui.text(ctx, String(v), x + keyW / 2, opts.y + opts.h / 2 - (left !== null ? 6 : 0), opts.noteMode ? 26 : 32, color, 'center', opts.noteMode ? 400 : 400);
      if (left !== null && !done) ui.text(ctx, String(left), x + keyW / 2, opts.y + opts.h - 11, 10, th.faint, 'center');
    }
  };
  // 工具行（教学也用）：items = [{ id, label, icon, badge, active, onTap, highlight }]
  app.drawTools = (ctx, y, h, items) => {
    const th = app.th, w = (app.W - 16) / items.length;
    items.forEach((it, i) => {
      const x = 8 + i * w, cx = x + w / 2;
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
    },
    leave() { persist(); },
    onHide() { if (b && !b.done && !winAt) { paused = true; persist(); app.redraw(); } },
    update(dt, t) {
      if (fx && fx.confetti.length) stepConfetti(dt);
      if (!b || paused || winAt || b.lost || app.overlays.length) return;
      b.elapsed += dt;
      const sec = Math.floor(b.elapsed / 1000);
      if (sec !== lastSec) { lastSec = sec; app.redraw(); }
      saveTimer += dt;
      if (saveTimer > 3000) { saveTimer = 0; persist(); }
    },
    live: (t) => !!party || (!!hint && t - hint.t0 < 400) || (!!b && b.guided && b.guideLeft > 0),
    draw(ctx, t) {
      const th = app.th;
      const tierName = S.TIERS[b.tier].name;
      const title = b.mode === 'daily' ? '每日挑战 · ' + tierName : b.mode === 'challenge' ? '好友挑战 · ' + tierName : tierName;
      app.header(ctx, title, () => { persist(); app.go(b.mode === 'daily' ? 'daily' : 'home'); }, (ctx2, y, h) => {
        const x = app.headerRight - 48;
        const on = ui.button({ id: 'pause', x, y, w: 44, h, onTap: () => { paused = !paused; persist(); } });
        if (on) ui.fillRR(ctx, x + 4, y + 4, 36, 36, 18, th.soft);
        (paused ? ui.icons.play : ui.icons.pause)(ctx, x + 22, y + h / 2, 22, th.text);
      });
      drawInfo(ctx, th);

      // 棋盘（按下就选中）
      ui.button({ id: 'board', x: geo.x, y: geo.y, w: geo.size, h: geo.size, silent: true, onDown: (x, y) => select(DB.cellAt(geo, x, y)) });
      DB.draw(ctx, th, geo, {
        vals: b.vals, given: b.given, notes: b.notes, wrong: (k) => Board.isWrong(b, k),
        selected: b.selected, selDigit, sameHighlight: store.data.settings.sameHighlight,
        hintCells: hint ? hint.cells : guide && b.guideLeft > 0 ? guide.cells : null,
        pops: fx.pops, rings: fx.rings, flash: fx.flash, shake: fx.shake, hops: fx.hops, now: t, tileStyle: store.data.settings.tileStyle,
      }, app.dpr);
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
        ui.text(ctx, f.text, r.x + r.s / 2, r.y - 6 - ui.ease.out(p) * 26, 14, th.primary, 'center', 700);
        ctx.globalAlpha = 1;
      }

      // 工具 + 数字键
      const hintBadge = b.hintsLeft > 0 ? { text: String(b.hintsLeft), color: th.primary } : { text: '▶', color: th.gold };
      app.drawTools(ctx, L.toolsY, L.toolsH, [
        { id: 'undo', label: '撤销', icon: 'undo', onTap: () => tool('undo') },
        { id: 'erase', label: '橡皮', icon: 'eraser', onTap: () => tool('erase') },
        { id: 'note', label: '笔记', icon: 'pencil', active: noteMode, badge: { text: noteMode ? '开' : '关', color: noteMode ? th.primary : th.faint }, onTap: () => tool('note') },
        { id: 'hint', label: '提示', icon: 'bulb', badge: hintBadge, onTap: () => tool('hint') },
      ]);
      app.drawPad(ctx, { y: L.padY, h: L.padH, onPress: press, counts: Board.counts(b), noteMode, doneAt: fx.keyDone, active: selDigit });
      if (hint) drawHintCard(ctx, th, t);
      else if (b.guided && b.guideLeft > 0 && !winAt && !paused) drawGuide(ctx, th, t);
      if (party) {
        drawParty(ctx, th, t);
        ui.button({ id: 'party-skip', x: 0, y: 0, w: app.W, h: app.H, onTap: endParty }); // 点一下跳过
      }
    },
  };

  // 机器人测试用：格子、数字键、工具的中心坐标
  app.testHooks = {
    board: () => b,
    cellCenter: (k) => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; },
    padCenter: (v) => ({ x: 8 + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 }),
    toolCenter: (i) => ({ x: 8 + (i + 0.5) * ((app.W - 16) / 4), y: L.toolsY + L.toolsH / 2 }),
    hint: () => hint,
    guide: () => guide,
    selDigit: () => selDigit,
    noteMode: () => noteMode,
  };
};
