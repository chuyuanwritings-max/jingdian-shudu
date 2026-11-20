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
  let winAt = 0, saveTimer = 0, lastSec = -1;
  const geo = { x: 0, y: 0, size: 0 };
  let L = null; // 布局
  let hintBelow = true;

  const resetFx = () => { fx = { pops: {}, rings: [], flash: [], shake: null, floats: [] }; };

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
    let idx, mode = opts.mode || 'normal';
    if (mode === 'daily') idx = opts.idx;
    else {
      const half = Math.floor(bank[tier].length / 2);
      idx = store.data.next[tier] % half;
      store.data.next[tier] = (idx + 1) % half;
    }
    store.startGame(tier, mode);
    const nb = Board.create({ mode, tier, idx, date: opts.date, puzzle: bank[tier][idx] });
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
    app.sound('select', 0.4);
  }
  function press(v) {
    if (paused || winAt || b.lost) return;
    const k = b.selected;
    if (k < 0) { app.toast('先点一个格子'); return; }
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
    fx.pops[k] = t;
    fx.rings.push({ k, t0: t });
    if (r.gain) fx.floats.push({ k, t0: t, text: '+' + r.gain });
    app.sound('place');
    // 填满一行 / 列 / 宫：从这一格往两边扫一道光
    r.units.forEach((u) => {
      S.UNITS[u].forEach((x) => {
        const d = Math.abs(S.ROW(x) - S.ROW(k)) + Math.abs(S.COL(x) - S.COL(k));
        fx.flash.push({ k: x, t0: t + 60 + d * 45, dur: 420 });
      });
    });
    if (r.units.length) { setTimeout(() => app.sound('unit'), 60); app.buzz('medium'); }
    if (r.digitDone) {
      for (let x = 0; x < 81; x++) if (b.vals[x] === v) fx.flash.push({ k: x, t0: t + 120, dur: 600, color: app.th.gold, alpha: 0.4 });
      setTimeout(() => app.sound('digit'), 140);
    }
    app.animate(1200);
    if (r.win) onWin(t);
  }
  function onWin(t) {
    winAt = t;
    b.selected = -1;
    for (let x = 0; x < 81; x++) fx.flash.push({ k: x, t0: t + 300 + (S.ROW(x) + S.COL(x)) * 40, dur: 500, alpha: 0.6 });
    setTimeout(() => app.sound('win'), 300);
    app.animate(2000);
    store.recordWin(b);
    setTimeout(() => app.go('result', { board: b }), 1500);
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
    if (store.data.settings.showTimer !== false) ui.text(ctx, app.fmt(b.elapsed), W - 20, y, 14, th.text, 'right', 500);
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
      if (opts.highlight === v) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(app.now / 220);
        ui.fillRR(ctx, x + 2, opts.y + 2, keyW - 4, opts.h - 4, 12, th.soft);
        ctx.globalAlpha = 1;
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
      noteMode = false; paused = false; hint = null; winAt = 0;
      resetFx();
      layout();
    },
    leave() { persist(); },
    onHide() { if (b && !b.done && !winAt) { paused = true; persist(); app.redraw(); } },
    update(dt, t) {
      if (!b || paused || winAt || b.lost || app.overlays.length) return;
      b.elapsed += dt;
      const sec = Math.floor(b.elapsed / 1000);
      if (sec !== lastSec) { lastSec = sec; app.redraw(); }
      saveTimer += dt;
      if (saveTimer > 3000) { saveTimer = 0; persist(); }
    },
    live: (t) => !!hint && t - hint.t0 < 400,
    draw(ctx, t) {
      const th = app.th;
      const tierName = S.TIERS[b.tier].name;
      const title = b.mode === 'daily' ? '每日挑战 · ' + tierName : tierName;
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
        selected: b.selected, sameHighlight: store.data.settings.sameHighlight,
        hintCells: hint ? hint.cells : null,
        pops: fx.pops, rings: fx.rings, flash: fx.flash, shake: fx.shake, now: t,
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
      app.drawPad(ctx, { y: L.padY, h: L.padH, onPress: press, counts: Board.counts(b), noteMode });
      if (hint) drawHintCard(ctx, th, t);
    },
  };

  // 机器人测试用：格子、数字键、工具的中心坐标
  app.testHooks = {
    board: () => b,
    cellCenter: (k) => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; },
    padCenter: (v) => ({ x: 8 + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 }),
    toolCenter: (i) => ({ x: 8 + (i + 0.5) * ((app.W - 16) / 4), y: L.toolsY + L.toolsH / 2 }),
    hint: () => hint,
    noteMode: () => noteMode,
  };
};
