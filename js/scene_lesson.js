// 教学：目录 + 一课一课地点着学（演示步看手指，练习步自己点）。
const P = require('./platform.js');
const ui = require('./ui.js');
const S = require('./sudoku.js');
const T = require('./tutorial.js');
const DB = require('./drawboard.js');
const store = require('./store.js');

module.exports = function (app) {
  // ---------- 目录 ----------
  app.scenes.lessons = {
    draw(ctx) {
      const th = app.th, W = app.W;
      app.header(ctx, '教学', () => app.go('home'));
      let y = app.headerY + app.headerH + 12;
      // 基础招：大卡片、编号；进阶招：最下面一小栏，写明不用学
      const row = (L, n, h, small) => {
        const done = !!store.data.lessons[L.id], i = T.LESSONS.indexOf(L);
        const on = ui.button({ id: 'lesson-' + L.id, x: 16, y, w: W - 32, h, onTap: () => app.go('lesson', { index: i }) });
        ui.card(ctx, 16, y, W - 32, h, 16, th);
        if (on) ui.fillRR(ctx, 16, y, W - 32, h, 16, (th.pageDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'));
        const r = small ? 14 : 18;
        ctx.beginPath(); ctx.arc(52, y + h / 2, r, 0, Math.PI * 2); ctx.fillStyle = done ? th.ok : th.soft; ctx.fill();
        if (done) ui.icons.check(ctx, 52, y + h / 2, small ? 16 : 20, '#FFFFFF');
        else ui.text(ctx, small ? '+' : String(n), 52, y + h / 2, small ? 15 : 16, th.primary, 'center', 700);
        ui.text(ctx, L.name, 84, y + h / 2 - (small ? 9 : 11), small ? 15 : 16, small ? th.sub : th.text, 'left', 600);
        ui.text(ctx, L.sub, 84, y + h / 2 + (small ? 10 : 11), 12, th.sub);
        ui.icons.chevron(ctx, W - 38, y + h / 2, 18, th.faint);
        y += h + 8;
      };
      ui.text(ctx, '基础招 · 学会这 3 课就能玩', 24, y + 10, 15, th.text, 'left', 700);
      y += 30;
      T.BASIC.forEach((L, n) => row(L, n + 1, 64));
      const all = T.BASIC.every((L) => store.data.lessons[L.id]);
      y += 4;
      ui.pill(ctx, th, 'lessons-play', 16, y, W - 32, 52, all ? '学完了，去玩一局「简单」' : '直接玩一局「入门」', () => app.startGame(all ? 1 : 0), all ? 'primary' : 'soft');
      y += 52 + 26;
      ui.text(ctx, '进阶招 · 不用学，想看再点', 24, y + 10, 13, th.sub, 'left', 600);
      y += 26;
      T.ADV.forEach((L) => row(L, 0, 52, true));
    },
  };

  // ---------- 一课 ----------
  let lesson = null; // { index, steps, si, ai, ... }
  const geo = { x: 0, y: 0, size: 0 };
  let L = null;
  function layout() {
    const W = app.W;
    const textY = app.headerY + app.headerH + 18;
    const padH = 64, toolsH = 62;
    const padY = app.bottom - 14 - padH;
    const toolsY = padY - 8 - toolsH;
    const top = textY + 70;
    geo.size = Math.floor(Math.min(W - 16, toolsY - 10 - top) / 9) * 9;
    geo.x = Math.round((W - geo.size) / 2);
    geo.y = Math.round(top + Math.max(0, (toolsY - 10 - top - geo.size) * 0.3));
    L = { textY, padY, padH, toolsY, toolsH };
  }
  function loadStep() {
    const st = lesson.steps[lesson.si];
    lesson.vals = new Array(81).fill(0);
    lesson.given = new Array(81).fill(false);
    for (const k of st.show) { lesson.vals[k] = T.SOL[k]; lesson.given[k] = true; }
    // 每一步自己带笔记（notesPre），不再接上一步
    lesson.notes = new Array(81).fill(0);
    if (st.notesPre) for (const k in st.notesPre) lesson.notes[k] = st.notesPre[k];
    lesson.ai = 0; lesson.misses = 0; lesson.ok = false; lesson.t0 = P.now(); lesson.lastAct = P.now();
    lesson.sel = -1; lesson.demoDone = !st.demo; lesson.fx = { pops: {}, rings: [], shake: null };
    if (st.actions === undefined && !st.demo) lesson.demoDone = true;
  }
  function stepNow() { return lesson.steps[lesson.si]; }
  function expected() { const st = stepNow(); return st.actions ? st.actions[lesson.ai] : null; }
  function act(kind, val) {
    const st = stepNow(), exp = expected();
    if (!exp || lesson.ok) return;
    lesson.lastAct = P.now();
    const t = P.now();
    if (kind === 'cell') {
      lesson.sel = val;
      if (exp.cell === val) { lesson.ai++; app.sound('select', 0.4); }
      else if (exp.cell !== undefined) miss(val);
      else app.sound('select', 0.4); // 这一步不在等格子，点了也只是选中
    } else if (kind === 'num') {
      if (exp.num === val && lesson.sel >= 0) {
        const k = lesson.sel;
        if (lesson.noteMode) { lesson.notes[k] ^= S.bit(val); app.sound('note'); }
        else {
          lesson.vals[k] = val;
          lesson.notes[k] = 0;
          // 自动擦笔记
          for (const p of S.PEERS[k]) lesson.notes[p] &= ~S.bit(val);
          lesson.fx.pops[k] = t; lesson.fx.rings.push({ k, t0: t });
          app.sound('place');
        }
        lesson.ai++;
      } else if (exp.num !== undefined) { miss(lesson.sel); lesson.numMisses = (lesson.numMisses || 0) + 1; app.sound('wrong'); app.buzz('heavy'); }
    } else if (kind === 'note') {
      lesson.noteMode = !lesson.noteMode;
      app.sound('tap');
      if (exp.note === lesson.noteMode) lesson.ai++;
    }
    if (lesson.ai >= st.actions.length) {
      lesson.ok = true;
      setTimeout(() => app.sound('correct'), 120);
      app.buzz('medium');
    }
    app.animate(600);
  }
  function miss(k) {
    lesson.misses++;
    if (k >= 0) lesson.fx.shake = { k, t0: P.now() };
    app.animate(400);
  }
  function next() {
    lesson.totalMisses += lesson.misses;
    if (lesson.si + 1 < lesson.steps.length) { lesson.si++; loadStep(); app.animate(300); return; }
    // 小测：只数「填错的数」（点别的格子看看不算错）
    if (lesson.quiz) { app.quizDone(lesson.numMisses || 0); return; }
    // 学完：先入账，再播过场（主页与过场设计 2.4、2.5），播完弹「下一课」
    const L0 = T.LESSONS[lesson.index];
    const relearn = !!store.data.lessons[L0.id];
    store.data.lessons[L0.id] = true;
    T.LESSONS.forEach((x) => { if (x.in === L0.id) store.data.lessons[x.id] = true; });
    const seen = store.data.seen;
    const allNow = T.BASIC.every((x) => store.data.lessons[x.id]);
    store.save();
    if (lesson.then && lesson.then.tier !== undefined) {
      // 升档学新招：第一次升档、升到大师播完整版，其余短版
      const tier = lesson.then.tier;
      const full = !seen.cutTierAny || tier === 5;
      seen.cutTierAny = true; store.save();
      app.cutTier(tier, L0.name, { short: !full, onEnd: finished });
    } else if (allNow && !seen.allSeven && L0.group === 'basic') {
      // 基础 3 课全会：一辈子一次
      seen.allSeven = true; store.save();
      app.cutLesson(T.BASIC.indexOf(L0), L0.name, { all: true, onEnd: finished });
    } else if (relearn || L0.group !== 'basic') {
      app.sound('correct'); // 重学、进阶招：不播过场
      finished(); // 重学一门学过的：不播
    } else {
      const full = lesson.index === 0 && !seen.cutLesson0;
      if (lesson.index === 0) { seen.cutLesson0 = true; store.save(); }
      app.cutLesson(T.BASIC.indexOf(L0), L0.name, { short: !full, onEnd: finished });
    }
  }
  function finished() {
    const i = lesson.index, ret = lesson.returnTo;
    // 下一课：只在基础招里往下走；进阶招学完不接下一课
    const bi = T.BASIC.indexOf(T.LESSONS[i]), nextL = bi >= 0 ? T.BASIC[bi + 1] : null;
    app.push({
      draw(ctx, t, p) {
        const th = app.th;
        const m = app.modal(ctx, p, 250);
        ctx.beginPath(); ctx.arc(app.W / 2, m.y + 52, 26, 0, Math.PI * 2); ctx.fillStyle = th.ok; ctx.fill();
        ui.icons.check(ctx, app.W / 2, m.y + 52, 30, '#FFFFFF', 3.4);
        ui.text(ctx, '学会了「' + T.LESSONS[i].name + '」', app.W / 2, m.y + 104, 20, th.text, 'center', 700);
        const bx = m.x + 20, bw = m.w - 40;
        if (lesson.then === 'duo') {
          ui.pill(ctx, th, 'lf-duo', bx, m.y + 140, bw, 50, '回到约好的那一局', () => { app.pop(); app.go('duo'); }, 'primary');
        } else if (lesson.then === 'challenge') {
          ui.pill(ctx, th, 'lf-challenge', bx, m.y + 140, bw, 50, '开始挑战（前 3 步带着你）', () => { app.pop(); app.startChallenge(true); }, 'primary');
        } else if (lesson.then === 'guided') {
          ui.pill(ctx, th, 'lf-guided', bx, m.y + 140, bw, 50, '开始第一局（带着你下）', () => { app.pop(); app.startGame(0, { guided: true }); }, 'primary');
        } else if (lesson.then && lesson.then.tier !== undefined) {
          const tn = S.TIERS[lesson.then.tier].name;
          ui.pill(ctx, th, 'lf-tier', bx, m.y + 140, bw, 50, '开始「' + tn + '」', () => { app.pop(); app.startGame(lesson.then.tier, { skipGate: true }); }, 'primary');
        } else if (ret === 'play') {
          ui.pill(ctx, th, 'lf-back', bx, m.y + 140, bw, 50, '回到这一局', () => { app.pop(); app.continueGame(); }, 'primary');
        } else if (nextL) {
          ui.pill(ctx, th, 'lf-next', bx, m.y + 140, bw, 50, '下一课：' + nextL.name, () => { app.pop(); app.go('lesson', { index: T.LESSONS.indexOf(nextL), firstRun: lesson.firstRun }); }, 'primary');
        } else {
          ui.pill(ctx, th, 'lf-play', bx, m.y + 140, bw, 50, '全学完了！玩一局「简单」', () => { app.pop(); app.startGame(1); }, 'primary');
        }
        ui.pill(ctx, th, 'lf-list', bx, m.y + 196, bw, 44, ret === 'play' ? '回教学目录' : '回教学目录', () => { app.pop(); app.go('lessons'); }, 'card');
        m.done();
      },
    });
  }

  // 任务直接画在盘上（Cc：「你应该把左上这一宫高亮让我选才对……把左上这一宫和底下的数字 7 高亮」）：
  // 要你看的那一宫 / 那一格外面一圈金边，一呼一吸地亮；问到的数，盘上的和数字键上的都亮黄（selDigit / active）
  function drawTask(ctx, st, t) {
    if (!st.hl || !st.hl.cells || lesson.ok) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.hl.cells.forEach((k) => { const r = DB.cellRect(geo, k); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.s); y1 = Math.max(y1, r.y + r.s); });
    const a = 0.55 + 0.45 * Math.sin((t - lesson.t0) / 260);
    ctx.save();
    ctx.globalAlpha = 0.35 * a; ctx.strokeStyle = '#FFC24A'; ctx.lineWidth = 9;
    ui.rr(ctx, x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, 8); ctx.stroke();
    ctx.globalAlpha = 0.7 + 0.3 * a; ctx.strokeStyle = '#E0A815'; ctx.lineWidth = 3;
    ui.rr(ctx, x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, 7); ctx.stroke();
    ctx.restore();
    app.animate(60);
  }

  app.scenes.lesson = {
    enter(args) {
      let index = args.index;
      if (args.id) index = T.LESSONS.findIndex((x) => x.id === args.id);
      // 并进别的课的（最后一格、笔记）：直接去那一课
      if (index >= 0 && T.LESSONS[index] && T.LESSONS[index].in) index = T.LESSONS.findIndex((x) => x.id === T.LESSONS[index].in);
      // args.quiz：「会一点」的两道小测；args.then：学完去哪（'guided' 带练局 / { tier } 开这一档）
      const steps = args.quiz ? T.quizSteps() : T.LESSONS[index].build();
      lesson = { index, steps, si: 0, returnTo: args.returnTo, firstRun: args.firstRun, noteMode: false, quiz: !!args.quiz, then: args.then, totalMisses: 0 };
      if (args.firstRun) { store.data.seen.tutorial = true; store.save(); }
      layout();
      loadStep();
    },
    live: () => true, // 有手指动画、呼吸框，一直画（教学页不久留）
    draw(ctx, t) {
      const th = app.th, W = app.W;
      const st = stepNow();
      const L0 = T.LESSONS[lesson.index || 0];
      app.header(ctx, lesson.quiz ? '小测 · 帮你选难度' : (T.BASIC.indexOf(L0) >= 0 ? '第 ' + (T.BASIC.indexOf(L0) + 1) + ' 课 · ' : '进阶 · ') + L0.name, () => app.go(lesson.returnTo === 'play' ? 'play' : 'lessons', lesson.returnTo === 'play' ? { board: store.data.current } : {}), (c, y, h) => {
        if (!lesson.firstRun) return;
        const x = app.headerRight - 64;
        // 跳过：从朋友的挑战来的直接开始挑战，从对战邀请来的回等候室，其他回首页
        ui.button({ id: 'skip', x, y, w: 60, h, onTap: () => { store.data.seen.tutorial = true; store.save(); if (lesson.then === 'challenge') app.startChallenge(true); else if (lesson.then === 'duo') app.go('duo'); else app.go('home'); } });
        ui.text(ctx, '跳过', x + 30, y + h / 2, 15, th.sub, 'center');
      });
      // 进度点
      const n = lesson.steps.length;
      for (let i = 0; i < n; i++) {
        const cx = W / 2 + (i - (n - 1) / 2) * 14;
        ctx.beginPath(); ctx.arc(cx, app.headerY + app.headerH + 4, i === lesson.si ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i <= lesson.si ? th.primary : th.lineThin; ctx.fill();
      }
      // 说明文字（最多两行）+ 这一步在等什么
      const exp = expected();
      let say = st.text;
      ui.wrap(ctx, say, W / 2, L.textY, W - 48, 16, 23, th.text, 500, 'center');
      let sub = '';
      if (lesson.ok) sub = '对了！';
      else if (exp && st.says) sub = st.says[lesson.ai] || '';
      // 唯一候选：1–9 一排，出现过的划掉（占用提示那一行）
      const strikeK = st.strike !== undefined ? st.strike : lesson.misses && st.strikeAfterMiss !== undefined ? st.strikeAfterMiss : -1;
      if (strikeK >= 0 && !lesson.ok) drawStrike(ctx, th, strikeK, L.textY + 56);
      else if (sub) ui.text(ctx, sub, W / 2, L.textY + 56, 14, lesson.ok ? th.ok : lesson.misses ? th.wrong : th.primary, 'center', 600);

      // 棋盘
      ui.button({ id: 'lboard', x: geo.x, y: geo.y, w: geo.size, h: geo.size, silent: true, onDown: (x, y) => act('cell', DB.cellAt(geo, x, y)) });
      const demoP = st.demo ? (t - lesson.t0) / 1600 : 0;
      const vals = lesson.vals.slice();
      if (st.demo && demoP > 0.7) {
        vals[st.demo.k] = st.demo.v;
        if (!lesson.demoDone) {
          lesson.demoDone = true; lesson.fx.pops[st.demo.k] = t; lesson.fx.rings.push({ k: st.demo.k, t0: t }); app.sound('place');
          for (const p of S.PEERS[st.demo.k]) lesson.notes[p] &= ~S.bit(st.demo.v);
        }
      }
      const showRays = st.rays && (!st.raysAfterMiss || lesson.misses > 0);
      DB.draw(ctx, th, geo, {
        vals, given: lesson.given, notes: lesson.notes, wrong: () => false,
        selected: lesson.sel, sameHighlight: true, focus: st.focus, selDigit: st.hl && st.hl.digit,
        rays: showRays ? st.rays : null, zone: st.zone || (st.hl && st.hl.cells), strikeNotes: st.strikeNotes, mark: st.mark, pops: lesson.fx.pops, rings: lesson.fx.rings, shake: lesson.fx.shake, now: t, tileStyle: store.data.settings.tileStyle,
      }, app.dpr);

      drawTask(ctx, st, t);
      // 底部：练习步 = 工具 + 数字键；演示步 = 「下一步」
      const practice = !!st.actions && !lesson.ok;
      if (st.noteTool) {
        app.drawTools(ctx, L.toolsY, L.toolsH, [
          { id: 'lnote', label: '笔记', icon: 'pencil', active: lesson.noteMode, badge: { text: lesson.noteMode ? '开' : '关', color: lesson.noteMode ? th.primary : th.faint }, onTap: () => act('note'), highlight: exp && exp.note !== undefined },
        ]);
      }
      if (practice) {
        app.drawPad(ctx, { y: L.padY, h: L.padH, onPress: (v) => act('num', v), noteMode: lesson.noteMode, highlight: exp && exp.num !== undefined && showHand(st, t) ? exp.num : 0, active: st.hl && st.hl.digit });
      } else {
        const ready = lesson.ok || lesson.demoDone || !st.demo;
        if (ready) ui.pill(ctx, th, 'lnext', 16, L.padY + 4, W - 32, 54, lesson.si + 1 < lesson.steps.length ? '下一步' : '完成这一课', next, 'primary');
      }
      // 手指：演示步自己动；练习步等几秒（或点错一次）再出来
      drawHand(ctx, th, st, t, exp);
    },
  };

  function showHand(st, t) {
    if (!st.actions || lesson.ok) return false;
    if (lesson.misses > 0) return true;
    return t - lesson.lastAct > (st.handDelay || 900);
  }
  function drawHand(ctx, th, st, t, exp) {
    let target = null;
    if (st.demo && !lesson.demoDone) {
      const r = DB.cellRect(geo, st.demo.k);
      const p = Math.min(1, (t - lesson.t0) / 900);
      const sx = app.W * 0.7, sy = geo.y + geo.size + 40;
      const e = ui.ease.inOut(p);
      const x = ui.lerp(sx, r.x + r.s / 2, e), y = ui.lerp(sy, r.y + r.s / 2, e);
      const press = p >= 1 ? 1 - Math.min(1, (t - lesson.t0 - 900) / 200) * 0.15 : 1;
      ctx.save(); ctx.translate(x, y); ctx.scale(press, press); ui.icons.hand(ctx, 0, 0, 44, th.text); ctx.restore();
      return;
    }
    if (!exp || !showHand(st, t)) return;
    if (exp.cell !== undefined) { const r = DB.cellRect(geo, exp.cell); target = { x: r.x + r.s / 2, y: r.y + r.s / 2 }; }
    else if (exp.num !== undefined) target = { x: 8 + (exp.num - 0.5) * ((app.W - 16) / 9), y: L.padY + L.padH / 2 };
    else if (exp.note !== undefined) target = { x: app.W / 2, y: L.toolsY + 24 };
    if (!target) return;
    const bob = Math.sin(t / 220) * 5;
    ui.icons.hand(ctx, target.x + 4, target.y + 6 + bob, 44, th.text);
  }
  function drawStrike(ctx, th, k, y) {
    const seen = new Set();
    for (const p of S.PEERS[k]) if (lesson.vals[p]) seen.add(lesson.vals[p]);
    const w = 26, x0 = app.W / 2 - (9 * w) / 2;
    for (let v = 1; v <= 9; v++) {
      const cx = x0 + (v - 0.5) * w;
      const gone = seen.has(v);
      if (!gone) ui.fillRR(ctx, cx - 11, y - 11, 22, 22, 6, th.sel);
      ui.text(ctx, String(v), cx, y, 15, gone ? th.faint : th.primary, 'center', gone ? 400 : 700);
      if (gone) { ui.stroke(ctx, th.faint, 1.5); ctx.beginPath(); ctx.moveTo(cx - 7, y + 6); ctx.lineTo(cx + 7, y - 6); ctx.stroke(); }
    }
  }

  app.lessonHooks = {
    state: () => lesson,
    cellCenter: (k) => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; },
    padCenter: (v) => ({ x: 8 + (v - 0.5) * ((app.W - 16) / 9), y: L.padY + L.padH / 2 }),
    noteCenter: () => ({ x: app.W / 2, y: L.toolsY + L.toolsH / 2 }),
    nextCenter: () => ({ x: app.W / 2, y: L.padY + 31 }),
  };
};
