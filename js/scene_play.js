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
const SK = require('./sakura.js');

module.exports = function (app) {
  let b = null; // 当前这一局
  let noteMode = false, paused = false;
  let fx = null; // 效果：{ pops, rings, flash, shake, floats }
  let hint = null; // { h, t0 }
  let idleNag = false; // 「卡住了？」说过了：填对一格以前不再说
  let selDigit = 0; // 正在亮着的数字
  let guide = null; // 带练：{ h, t0 } 手指指着下一步
  let winAt = 0, saveTimer = 0, lastSec = -1, idleAt = 0;
  const geo = { x: 0, y: 0, size: 0 };
  let L = null; // 布局

  const resetFx = () => { fx = { pops: {}, rings: [], flash: [], shake: null, floats: [], hops: {}, keyDone: {}, events: [], gold: {}, sparks: [], digit: null, boardShake: null }; };
  let party = null; // 通关庆祝：{ t0, k }

  // 位置都从布局表来（界面编辑器里能拖）：信息行、棋盘、提示卡、工具、数字键
  function layout() {
    const rb = LY.rect('play.board'), ri = LY.rect('play.info'), rt = LY.rect('play.tools'), rp = LY.rect('play.pad');
    geo.size = Math.floor(Math.min(rb.w, rb.h) / 9) * 9; // 9 的倍数，格线才清楚
    geo.x = Math.round(rb.x + (rb.w - geo.size) / 2);
    geo.y = Math.round(rb.y + (rb.h - geo.size) / 2);
    L = { infoX: ri.x, infoY: ri.y, infoW: ri.w, infoH: ri.h, padX: rp.x, padY: rp.y, padW: rp.w, padH: rp.h, keyW: rp.w / 9,
      toolsX: rt.x, toolsY: rt.y, toolsW: rt.w, toolsH: rt.h };
  }

  // ---------- 开局 / 继续 ----------
  app.startGame = (tier, opts) => {
    opts = opts || {};
    // 有一局没做完时开新局：先问一句（Fable 试玩：点「新游戏 ›」不问，原来那局直接丢、连胜清零）
    const cur0 = store.data.current;
    if (!opts.confirmed && !opts.guided && (opts.mode || 'normal') === 'normal' && cur0 && !cur0.done && !cur0.lost && cur0.elapsed > 5000 && app.sceneName !== 'play' && app.sceneName !== 'result') {
      app.confirm('放弃没做完的那一局？', '「' + S.TIERS[cur0.tier].name + '」做到 ' + app.fmt(cur0.elapsed) + '，开新的一局它就算没做完', '开新的一局', () => app.startGame(tier, Object.assign({}, opts, { confirmed: true })));
      return;
    }
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
  // 重新开始这一题：挑战、对战、带练的身份都带过去（Fable 试玩：挑战里重开做完会卡死）；不算多玩一局
  app.restartGame = () => {
    const o = b;
    store.recordLoss(o);
    const nb = Board.create({ mode: o.mode, tier: o.tier, idx: o.idx, date: o.date, puzzle: o.puzzle, guided: o.guided });
    if (o.challenge) nb.challenge = o.challenge;
    if (o.duo) nb.duo = o.duo;
    store.data.current = nb;
    store.save();
    app.go('play', { board: nb });
  };
  app.continueGame = () => {
    if ((!store.data.current || store.data.current.done) && store.data.shelf) { store.data.current = store.data.shelf; store.data.shelf = null; store.save(); }
    if (store.data.current) app.go('play', { board: store.data.current });
  };
  // 接挑战 / 对战时手上有一局普通局没做完：先搁着，不顶掉（Fable 试玩：原来那局悄悄没了）
  app.shelveCurrent = () => {
    const cur = store.data.current;
    if (cur && !cur.done && !cur.lost && (cur.mode === 'normal' || cur.mode === 'daily')) { store.data.shelf = cur; store.data.current = null; store.save(); }
  };

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
    idleAt = P.now();
    const k = b.selected;
    // 点数字键：盘上所有这个数、笔记里有这个数的格子都亮黄（学 Sudoku 2）。没选格子时只亮、不填
    selDigit = v;
    app.animate(150);
    if (k < 0 || Board.locked(b, k)) { app.sound('select', 0.4); return; }
    const r = Board.input(b, k, v, noteMode, store.data.settings);
    const t = P.now();
    // 记完一个笔记就放开这一格：再点别的数字只是看看它在哪、还剩几个，不会又记进去
    // （Sylvie：「标记完之后我想看一下其他的数字……点其他数字的时候，那个框框里就自动标记上了」）。同一格再记：先点一下格子
    if (r.kind === 'note') { app.sound('note'); b.selected = -1; }
    else if (r.kind === 'correct') onCorrect(k, v, r, t, false);
    else if (r.kind === 'wrong') {
      fx.shake = { k, t0: t };
      // 两秒后自己拿掉（输了的那一下不拿：弹窗看广告复活后再拿）
      if (!r.lost) later(2000, () => { if (Board.dropWrong(b, k, v)) { fx.pops[k] = P.now(); app.sound('erase', 0.5); app.animate(300); persist(); } });
      if (!r.lost) SK.say(['没关系～\n再看看同一行、同一列', '差一点点！\n这一格再想想', '别急，慢慢来～'][b.mistakes % 3], 'worry', 2000);
      app.sound('wrong');
      app.buzz('heavy');
      app.animate(400);
      if (r.lost) later(450, () => showLost()); // 走 later：人离开棋盘就不弹，回来进局时再弹
    } else if (Board.locked(b, k)) {
      fx.shake = { k, t0: t };
      app.animate(350);
    }
    persist();
  }
  function onCorrect(k, v, r, t, viaHint) {
    if (hint && hint.h.place.k === k) hint = null; // 提示只在那一格填上时收起（先填别的格子不会把提示冲掉）
    idleNag = false;
    if (demo && demo.k === k) demo = null; // 开局演示：照着填对了
    if (!viaHint) recognize(k, v, r, t);
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
    // 震动（Cc：「随着那个特效延伸出去的，像波浪一般的震动」）：方块落地「咚」一下；填满行列宫时，
    // 光每往外跳一格震一下轻的，跟着波浪走到头。微信里 iPhone 才震得到（网页版 iPhone 浏览器不给震动）
    later(150, () => app.buzz('medium'));
    if (r.units.length && !r.win && !r.digitDone) {
      later(220, () => app.sound('unit'));
      let far = 0;
      r.units.forEach((u) => S.UNITS[u].forEach((x) => { far = Math.max(far, Math.abs(S.ROW(x) - S.ROW(k)) + Math.abs(S.COL(x) - S.COL(k))); }));
      for (let d = 1; d <= far; d++) later(220 + d * 45, () => app.buzz(d === far ? 'medium' : 'light'));
    }
    if (r.digitDone && !r.win) digitBurst(v, land);
    app.animate(1200);
    if (r.win) onWin(t);
  }

  const versus = () => b.mode === 'duo' || b.mode === 'challenge';
  // 同一个招名最早在哪一档出现（排除法有宫内、行列两种，后者在解题器里算「简单」，但名字一样）
  const minLevel = (show) => Math.min.apply(null, Object.keys(S.TECH_SHOW).filter((x) => S.TECH_SHOW[x] === show).map((x) => S.TECH[x].level));
  const above = (ex) => minLevel(ex.show) > b.tier && !(b.focus && b.focus.name === ex.show);
  // ---------- 认招：这一格是怎么想出来的（小樱认出来、光走一遍、记下用了哪招）----------
  const SAY_FOCUS = ['看到了！这是「{t}」～', '漂亮的「{t}」！', '「{t}」用得好～', '这一步是「{t}」！'];
  function recognize(k, v, r, t) {
    const grid = Board.rightGrid(b);
    grid[k] = 0;
    const ex = S.explain(grid, k, v);
    if (!ex) return; // 猜对的（或者用了更难的招）：不硬说
    const techs = b.techs || (b.techs = {});
    techs[ex.show] = (techs[ex.show] || 0) + 1;
    const said = b.saidTech || (b.saidTech = {});
    // 一个开关管三样（Cc：「显示技能，以及显示填对之后画叉的排除效果，合并在一个开关里」）：
    // 格子上飘招名、一道光画叉、小樱认招。关了照样记数（本局一招小条、结算页「这局用的招」还在）
    const show = store.data.settings.chainLight !== false;
    // 对战 / 好友挑战：不教、不闪光，只告诉你这一步用的是哪招（格子上飘招名，小樱每招说一次）
    if (versus()) {
      if (!show) return;
      fx.floats.push({ k, t0: t + 200, text: ex.show, focus: true });
      if (above(ex) && !said[ex.show]) {
        said[ex.show] = true;
        later(380, () => SK.say('哇！你用了「' + ex.show + '」\n这是「' + S.TIERS[Math.min(5, minLevel(ex.show))].name + '」的招！', 'wow', 2400));
      } else if (!said[ex.show]) {
        said[ex.show] = true;
        later(380, () => SK.say('这步是「' + ex.show + '」～', 'happy', 1600));
      }
      return;
    }
    const f = b.focus;
    if (!show) { Board.focusUse(b, k, ex.show) && (fx.focusAt = t); return; }
    playChain(k, v, ex, grid, t, 1);
    // 用了比这一档更难的招：小樱「哇」一声（每局每招说一次）
    if (above(ex) && !said[ex.show]) {
      said[ex.show] = true;
      later(380, () => SK.say('哇！你用了「' + ex.show + '」\n这是「' + S.TIERS[Math.min(5, minLevel(ex.show))].name + '」的招！', 'wow', 2800));
      const tu = store.data.techSeen || (store.data.techSeen = {});
      tu[ex.show] = (tu[ex.show] || 0) + 1;
    } else if (Board.focusUse(b, k, ex.show)) {
      // 本局一招：小条亮一下，格子上飘字（入门每一步都是排除法：只计数，小樱隔几次夸一下）
      fx.focusAt = t;
      const n = f.got.length;
      if (b.tier > 0) fx.floats.push({ k, t0: t + 260, text: f.name + ' ✓', focus: true });
      if (n === f.keys.length && !r.win) { later(420, () => app.sound('chord', 0.5)); later(380, () => SK.say('「' + f.name + '」用满 ' + n + ' 次啦！', 'cheer', 2400)); }
      else if (b.tier > 0 || n === 1 || n % 6 === 0) later(380, () => SK.say(SAY_FOCUS[n % SAY_FOCUS.length].replace('{t}', f.name), 'happy', 2000));
    }
  }

  // ---------- 一道光顺着思维链划过去 ----------
  // 排除法：别处的同一个数各自放一道光，顺着它那一行 / 列扫过这一宫，扫到的格子压灰，剩下那一格亮金
  // 唯一候选：这一格周围的 8 个不同的数各连一道光过来
  // 区块排除、数对：先亮出那几格，再把被它们删掉的格子压灰，最后同上
  function playChain(k, v, ex, grid, t, slow) {
    const items = [];
    const sp = slow || 1;
    let at = t + 120 * sp;
    const crossed = new Set();
    // 先演删候选的步骤
    ex.chain.forEach((st) => {
      const cells = st.focus || st.cells || [];
      items.push({ kind: 'zone', cells, t0: at, dur: 520 * sp });
      st.elim.forEach((e, i) => { items.push({ kind: 'x', k: e.k, t0: at + (200 + i * 50) * sp }); crossed.add(e.k); });
      at += (320 + st.elim.length * 50) * sp;
    });
    const fin = ex.final;
    if (fin.tech === 'hiddenBox' || fin.tech === 'hiddenLine') {
      const U = S.UNITS[fin.unit], rays = {};
      U.forEach((c) => {
        if (c === k || grid[c] || crossed.has(c)) return;
        // 是谁挡住了 c：同一行 / 列 / 宫里已经有 v 的那一格（不在这个单元里）
        const p = S.PEERS[c].find((x) => grid[x] === v && U.indexOf(x) < 0);
        if (p === undefined) return;
        let dir = S.ROW(p) === S.ROW(c) ? 'row' : S.COL(p) === S.COL(c) ? 'col' : 'box';
        const key = p + dir;
        (rays[key] = rays[key] || { p, dir, cs: [] }).cs.push(c);
      });
      Object.keys(rays).forEach((key, i) => {
        const R = rays[key], t0 = at + i * 130 * sp;
        items.push({ kind: 'ring', k: R.p, t0 });
        if (R.dir === 'box') {
          items.push({ kind: 'zone', cells: R.cs, t0: t0 + 80 * sp, dur: 420 * sp });
          R.cs.forEach((c) => items.push({ kind: 'x', k: c, t0: t0 + 160 * sp }));
        } else {
          // 光从挡路的那个数出发，一直扫到这一单元里最远的那一格
          const far = R.cs.reduce((m, c) => (Math.abs(S.ROW(c) - S.ROW(R.p)) + Math.abs(S.COL(c) - S.COL(R.p)) > Math.abs(S.ROW(m) - S.ROW(R.p)) + Math.abs(S.COL(m) - S.COL(R.p)) ? c : m), R.cs[0]);
          const len = Math.abs(S.ROW(far) - S.ROW(R.p)) + Math.abs(S.COL(far) - S.COL(R.p));
          const dur = (120 + len * 28) * sp;
          items.push({ kind: 'ray', a: R.p, b: far, t0, dur });
          R.cs.forEach((c) => { const d = Math.abs(S.ROW(c) - S.ROW(R.p)) + Math.abs(S.COL(c) - S.COL(R.p)); items.push({ kind: 'x', k: c, t0: t0 + dur * (d / Math.max(1, len)) }); });
        }
      });
      at += (Object.keys(rays).length * 130 + 260) * sp;
    } else if (fin.tech === 'nakedSingle') {
      let i = 0;
      for (let d = 1; d <= 9; d++) {
        if (d === v) continue;
        const p = S.PEERS[k].filter((x) => grid[x] === d).sort((a, c) => (Math.abs(S.ROW(a) - S.ROW(k)) + Math.abs(S.COL(a) - S.COL(k))) - (Math.abs(S.ROW(c) - S.ROW(k)) + Math.abs(S.COL(c) - S.COL(k))))[0];
        if (p === undefined) continue;
        items.push({ kind: 'ray', a: p, b: k, t0: at + i * 60 * sp, dur: 170 * sp });
        i++;
      }
      at += (i * 60 + 220) * sp;
    } else if (fin.tech === 'fullHouse') {
      items.push({ kind: 'zone', cells: S.UNITS[fin.unit], t0: at, dur: 420 * sp });
      at += 260 * sp;
    }
    items.push({ kind: 'target', k, t0: at, v });
    fx.chain = { items, end: at + 520 * sp };
    app.animate(fx.chain.end - P.now() + 100);
    return at;
  }
  // 「这里放不了」：格子压灰 + 一道灰斜线。不用红叉——Cc：「人一看到那个叉叉，就感觉填错了」
  function blocked(ctx, k, a) {
    if (a <= 0) return;
    const r = DB.cellRect(geo, k), th = app.th;
    ctx.globalAlpha = 0.16 * a; ctx.fillStyle = th.text; ctx.fillRect(r.x, r.y, r.s + 0.5, r.s + 0.5);
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = th.sub; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r.x + r.s * 0.3, r.y + r.s * 0.7); ctx.lineTo(r.x + r.s * 0.7, r.y + r.s * 0.3); ctx.stroke();
  }
  function drawChain(ctx, t) {
    const c = fx.chain;
    if (!c || t > c.end + 400) { fx.chain = null; return; }
    const th = app.th, GOLD = '#FFC24A', fade = t > c.end ? Math.max(0, 1 - (t - c.end) / 400) : 1;
    const ctr = (k) => { const r = DB.cellRect(geo, k); return [r.x + r.s / 2, r.y + r.s / 2, r.s]; };
    ctx.save();
    for (const it of c.items) {
      if (t < it.t0) continue;
      const e = t - it.t0;
      if (it.kind === 'zone') {
        const a = Math.min(1, e / 120) * (e > it.dur ? Math.max(0, 1 - (e - it.dur) / 260) : 1) * fade;
        if (a <= 0) continue;
        ctx.globalAlpha = a * 0.4; ctx.fillStyle = GOLD;
        it.cells.forEach((k) => { const r = DB.cellRect(geo, k); ctx.fillRect(r.x, r.y, r.s + 0.5, r.s + 0.5); });
      } else if (it.kind === 'ring') {
        const [x, y, s] = ctr(it.k), p = Math.min(1, e / 260);
        ctx.globalAlpha = (1 - p * 0.6) * fade; ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, s * (0.32 + p * 0.18), 0, Math.PI * 2); ctx.stroke();
      } else if (it.kind === 'ray') {
        const [x1, y1] = ctr(it.a), [x2, y2] = ctr(it.b), p = Math.min(1, e / it.dur);
        const hx = x1 + (x2 - x1) * p, hy = y1 + (y2 - y1) * p;
        const tail = e > it.dur ? Math.max(0, 1 - (e - it.dur) / 300) : 1;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.28 * tail * fade; ctx.strokeStyle = GOLD; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.globalAlpha = 0.95 * tail * fade; ctx.strokeStyle = '#FFE3A0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
        if (p < 1) { ctx.globalAlpha = fade; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); }
      } else if (it.kind === 'x') {
        blocked(ctx, it.k, Math.min(1, e / 120) * fade);
      } else if (it.kind === 'target') {
        const r = DB.cellRect(geo, it.k), p = Math.min(1, e / 200);
        ctx.globalAlpha = (0.55 - 0.35 * p) * fade + 0.1; ctx.fillStyle = GOLD;
        ctx.fillRect(r.x, r.y, r.s + 0.5, r.s + 0.5);
        ctx.globalAlpha = (1 - p) * fade; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3;
        ctx.strokeRect(r.x + 2 - p * 4, r.y + 2 - p * 4, r.s - 4 + p * 8, r.s - 4 + p * 8);
      }
    }
    ctx.restore();
  }

  // ---------- 开局演示：先在这盘上一步一步讲本局那一招，讲完让你自己填 ----------
  // Cc：「这个特效第一次教的时候，还是得慢慢解释怎么排除出来的吧」→ 不再一口气闪完：
  // 棋盘下面一张讲解卡，一次一句话 + 棋盘上画这一步的东西；点「下一步」才往下走；讲的时候计时停着
  let demo = null; // { k, v, t0 } 手指指着、等你填的那一格
  let teach = null; // { stages: [{ ch, text, items }], i, ts, k, v }
  function startDemo(narrate) {
    const f = b.focus;
    if (!f) return false;
    const grid = Board.rightGrid(b);
    // 挑一格讲得清的：中间不夹别的招（all = 用到的推理全在 chain 里），每个叉都指得出是哪个数挡的（lone = 0）
    // 先看本局那几处关键格，再看盘上别的空格；都不够干净就挑最干净的
    let best = null;
    const cells = []; for (let k = 0; k < 81; k++) cells.push(k);
    const order = f.keys.concat(cells.filter((k) => f.keys.indexOf(k) < 0));
    for (const k of order) {
      if (grid[k]) continue;
      const v = +b.sol[k], ex = S.explain(grid.slice(), k, v);
      if (!ex || ex.show !== f.name) continue;
      const stages = teachStages(k, v, ex, grid);
      const bad = stages.lone + (ex.all - ex.chain.length) * 10;
      if (!best || bad < best.bad) best = { k, v, stages, bad };
      if (!bad) break;
    }
    if (!best) return false;
    demo = null; fx.chain = null; b.selected = -1;
    teach = { stages: best.stages, i: 0, ts: P.now(), k: best.k, v: best.v, bad: best.bad };
    SK.say(narrate || '我一步一步讲「' + f.name + '」～', 'happy', 2200);
    app.animate(1500);
    return true;
  }
  const UN = (u) => (u < 9 ? '这一行' : u < 18 ? '这一列' : '这一宫');
  const dist = (a, c) => Math.abs(S.ROW(a) - S.ROW(c)) + Math.abs(S.COL(a) - S.COL(c));
  // 挡住这些格子的 v（不在 unit 里的那个），找不到的（被前面的招删掉的）直接压灰
  function rayItems(grid, cells, v, unit, t0, tally) {
    const items = [], byP = {}, lone = [];
    cells.forEach((c) => {
      const p = S.PEERS[c].find((x) => grid[x] === v && S.UNITS[unit].indexOf(x) < 0);
      if (p === undefined) lone.push(c); else (byP[p] = byP[p] || []).push(c);
    });
    Object.keys(byP).forEach((ps, i) => {
      const p = +ps, at = t0 + i * 450;
      items.push({ kind: 'ring', k: p, t0: at });
      byP[p].forEach((c) => { const dur = 220 + dist(p, c) * 70; items.push({ kind: 'ray', a: p, b: c, t0: at + 150, dur }); items.push({ kind: 'x', k: c, t0: at + 150 + dur }); });
    });
    lone.forEach((c) => items.push({ kind: 'x', k: c, t0: t0 }));
    if (tally) tally.lone += lone.length;
    return items;
  }
  function teachStages(k, v, ex, grid) {
    const stages = [], crossed = new Set(), tally = { lone: 0 };
    const empty = (u, but) => S.UNITS[u].filter((c) => !grid[c] && (!but || but.indexOf(c) < 0));
    ex.chain.forEach((st, ci) => {
      const ch = 'c' + ci, d = st.digit, n = st.focus.length;
      const elimX = st.elim.map((e) => ({ kind: 'x', k: e.k, t0: 200, keep: true }));
      st.elim.forEach((e) => crossed.add(e.k));
      if (st.tech === 'pointing' || st.tech === 'claiming') {
        const A = st.unit, B = st.unit2; // 先看 A（宫 / 行），v 只在 A 和 B 重叠的那几格；所以 B 里别的格子不能放 v
        stages.push({ ch, text: '先看' + UN(A) + '：别处的 ' + d + ' 把压灰的空格都挡住了', items: [{ kind: 'zone', cells: S.UNITS[A], t0: 0 }].concat(rayItems(grid, empty(A, st.focus), d, A, 300, tally)) });
        stages.push({ ch, text: UN(A) + '的 ' + d + ' 只能在标出来的这 ' + n + ' 格\n它们正好都在' + UN(B) + '里', items: [{ kind: 'zone', cells: S.UNITS[B], t0: 0, dim: true }].concat(st.focus.map((c, i) => ({ kind: 'ghost', k: c, v: d, t0: 150 + i * 150 }))) });
        stages.push({ ch, text: '所以 ' + d + ' 一定在这 ' + n + ' 格里\n' + UN(B) + '别的格子都不能放 ' + d + ' 了', items: st.focus.map((c) => ({ kind: 'ghost', k: c, v: d, t0: 0 })).concat(elimX) });
      } else if (st.digits && st.focus.length === 2) {
        const [a, c2] = st.digits, U = st.unit, naked = /naked/.test(st.tech);
        stages.push({ ch, text: naked ? '看这两格：都只能填 ' + a + ' 或 ' + c2 : '看' + UN(U) + '：' + a + ' 和 ' + c2 + ' 都只能放在这两格', items: [{ kind: 'zone', cells: st.focus, t0: 0 }].concat(st.focus.map((c, i) => ({ kind: 'ghost', k: c, v: a + ' ' + c2, t0: 200 + i * 150 }))) });
        stages.push({ ch, text: naked ? a + ' 和 ' + c2 + ' 被这两格占定了\n' + UN(U) + '别的格子不能再填它们' : '这两格被 ' + a + '、' + c2 + ' 占定了\n不能再填别的数', items: [{ kind: 'zone', cells: S.UNITS[U], t0: 0, dim: true }].concat(elimX) });
      } else {
        stages.push({ ch, text: '先看亮着的格子：它们挡住了压灰的地方', items: [{ kind: 'zone', cells: st.focus || st.cells, t0: 0 }].concat(elimX) });
      }
    });
    const fin = ex.final, ch = 'f';
    if (fin.tech === 'hiddenBox' || fin.tech === 'hiddenLine') {
      const U = fin.unit, rest = empty(U, [k]);
      const fresh = rest.filter((c) => !crossed.has(c)); // 前面已经压灰的不再重复
      stages.push({ ch, text: (ex.chain.length ? '再看' : '看') + UN(U) + '：' + v + ' 能放哪？\n别处的 ' + v + ' 顺着行、列把压灰的格子挡住了', items: [{ kind: 'zone', cells: S.UNITS[U], t0: 0 }].concat(rayItems(grid, fresh, v, U, 300, tally)) });
    } else if (fin.tech === 'nakedSingle') {
      const items = [{ kind: 'zone', cells: [k], t0: 0 }];
      let i = 0;
      for (let d = 1; d <= 9; d++) {
        if (d === v) continue;
        const p = S.PEERS[k].filter((x) => grid[x] === d).sort((a, c) => dist(a, k) - dist(c, k))[0];
        if (p === undefined) continue;
        items.push({ kind: 'ring', k: p, t0: 200 + i * 260 }, { kind: 'ray', a: p, b: k, t0: 260 + i * 260, dur: 240 });
        i++;
      }
      // 前面的招从这一格删掉的数（比如区块排除刚排除的那个）
      const gone = [];
      ex.chain.forEach((st) => st.elim.forEach((e) => { if (e.k === k) S.digits(e.m).forEach((d) => gone.indexOf(d) < 0 && gone.push(d)); }));
      tally.lone += Math.max(0, 8 - i - gone.length); // 剩下没交代的：讲不清
      stages.push({ ch, text: '看这一格：它的行、列、宫里已经有了 ' + i + ' 个不同的数（圈出来的）' + (gone.length ? '\n刚才又排除了 ' + gone.join('、') : ''), items });
    } else if (fin.tech === 'fullHouse') {
      stages.push({ ch, text: UN(fin.unit) + '只剩这一格是空的', items: [{ kind: 'zone', cells: S.UNITS[fin.unit], t0: 0 }] });
    }
    stages.lone = tally.lone;
    stages.push({ ch, text: fin.tech === 'nakedSingle' ? '1 到 9 只剩 ' + v + ' 没出现\n这一格只能填 ' + v + '！' : '只剩这一格能放 ' + v + '！', items: [{ kind: 'target', k, t0: 0 }] });
    return stages;
  }
  function teachNext() {
    if (!teach) return;
    if (teach.i < teach.stages.length - 1) { teach.i++; teach.ts = P.now(); app.sound('tap'); app.animate(2500); return; }
    const { k, v } = teach;
    teach = null;
    if (b.focus) { const seen = store.data.seen.demo || (store.data.seen.demo = {}); seen[b.focus.lesson] = true; b.focusShown = true; store.save(); }
    demo = { k, v, t0: P.now() };
    SK.say('轮到你：把 ' + v + ' 填进去', 'cheer', 3600);
    app.animate(400);
  }
  function drawTeach(ctx, t) {
    if (!teach) return;
    const th = app.th, GOLD = '#FFC24A', cur = teach.stages[teach.i], e0 = t - teach.ts;
    const ctr = (k) => { const r = DB.cellRect(geo, k); return [r.x + r.s / 2, r.y + r.s / 2, r.s]; };
    const item = (it, e, past) => {
      if (e < 0) return;
      if (it.kind === 'zone') {
        ctx.globalAlpha = (past ? 0.12 : Math.min(1, e / 220) * 0.34) * (it.dim ? 0.6 : 1); ctx.fillStyle = GOLD;
        it.cells.forEach((k) => { const r = DB.cellRect(geo, k); ctx.fillRect(r.x, r.y, r.s + 0.5, r.s + 0.5); });
      } else if (it.kind === 'ring') {
        const [x, y, s] = ctr(it.k), p = Math.min(1, e / 260);
        ctx.globalAlpha = past ? 0.5 : 0.95; ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, s * (0.3 + p * 0.14), 0, Math.PI * 2); ctx.stroke();
      } else if (it.kind === 'ray') {
        if (past) return;
        const [x1, y1] = ctr(it.a), [x2, y2] = ctr(it.b), p = Math.min(1, e / it.dur);
        const hx = x1 + (x2 - x1) * p, hy = y1 + (y2 - y1) * p;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.3; ctx.strokeStyle = GOLD; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.globalAlpha = p < 1 ? 0.95 : 0.6; ctx.strokeStyle = '#FFE3A0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
        if (p < 1) { ctx.globalAlpha = 1; ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fill(); }
      } else if (it.kind === 'x') {
        blocked(ctx, it.k, Math.min(1, e / 140));
      } else if (it.kind === 'ghost') {
        const [x, y, s] = ctr(it.k), p = Math.min(1, e / 200);
        ctx.globalAlpha = p;
        ui.text(ctx, String(it.v), x, y, Math.round(s * (String(it.v).length > 1 ? 0.3 : 0.46)), th.gold, 'center', 700);
      } else if (it.kind === 'target') {
        const r = DB.cellRect(geo, it.k), a = 0.5 + 0.5 * Math.sin(e / 240);
        ctx.globalAlpha = 0.35 + 0.3 * a; ctx.fillStyle = GOLD; ctx.fillRect(r.x, r.y, r.s + 0.5, r.s + 0.5);
        ctx.globalAlpha = 1; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 2, r.y + 2, r.s - 4, r.s - 4);
        ui.text(ctx, String(teach.v), r.x + r.s / 2, r.y + r.s / 2, Math.round(r.s * 0.5), th.gold, 'center', 700);
      }
    };
    ctx.save();
    teach.stages.forEach((sg, si) => {
      if (si > teach.i) return;
      const past = si < teach.i;
      // 前面几步：同一段的东西留着（淡一点）；更早一段只留压灰的结果
      sg.items.forEach((it) => { if (!past || sg.ch === cur.ch || it.keep) item(it, past ? 1e6 : e0 - it.t0, past); });
    });
    ctx.restore();
    app.animate(60);
  }
  function drawDemo(ctx, t) {
    if (!demo) return;
    const r = DB.cellRect(geo, demo.k), a = 0.5 + 0.5 * Math.sin((t - demo.t0) / 240);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.4 * a; ctx.strokeStyle = '#FFC24A'; ctx.lineWidth = 3;
    ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.s - 3, r.s - 3);
    ctx.restore();
    // 手指：没选中先指格子，选中了指数字键
    const target = b.selected === demo.k ? { x: L.padX + (demo.v - 0.5) * L.keyW, y: L.padY + L.padH / 2 } : { x: r.x + r.s / 2, y: r.y + r.s / 2 };
    ui.icons.hand(ctx, target.x + 4, target.y + 6 + Math.sin(t / 220) * 5, 44, app.th.text);
    app.animate(60);
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
    if ((b.digitCount || 0) < 2) later(land - P.now() + 200, () => SK.say(v + ' 都齐啦！9 个一个不少', 'cheer', 1800));
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
      app.buzz('heavy'); // 9 个齐了：重重一下，再两下轻的余震
      later(70, () => app.buzz('light')); later(140, () => app.buzz('light'));
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
    if (b.techs) { const tt = store.data.techTotal || (store.data.techTotal = {}); for (const n in b.techs) tt[n] = (tt[n] || 0) + b.techs[n]; }
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
      revive: () => app.showAd('revive', '再给一次机会', () => { Board.revive(b); Board.dropAllWrong(b); persist(); app.toast('接着来！再错 1 次就结束'); }, () => showLost()),
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
    SK.clear(); SK.setMood('think', 2400);
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
    // 连击看得见（Fable 竞品对照，照 Sudoku 2「随时间下降的倍数」）：算分里本来就有「5 秒内 ×2、30 秒降到 ×1」，
    // 现在分数旁边亮一个 ×2 徽标 + 一条会烧短的金条。条烧完不罚、不变红；算分公式不动
    if (b.lastCorrectAt > 0 && !winAt) {
      const m = C.speedMultiplier((b.elapsed - b.lastCorrectAt) / 1000);
      if (m > 1.02) {
        const cx = (x0 + x1) / 2;
        ctx.font = ui.font(17, 700);
        const sw = ctx.measureText(String(b.score)).width;
        ui.fillRR(ctx, cx + sw / 2 + 6, y - 9, 34, 18, 9, th.gold);
        ui.text(ctx, '×' + (m >= 1.95 ? '2' : m.toFixed(1)), cx + sw / 2 + 23, y, 11, '#FFFFFF', 'center', 800);
        const bw0 = 56;
        ui.fillRR(ctx, cx - bw0 / 2, y + 12, bw0, 3, 1.5, th.soft);
        ui.fillRR(ctx, cx - bw0 / 2, y + 12, Math.max(3, bw0 * (m - 1)), 3, 1.5, th.gold);
        if (!paused) app.animate(250);
      }
    }
    if (b.challenge) {
      // 好友挑战：朋友的用时先藏着，做完才揭晓
      ui.text(ctx, app.fmt(b.elapsed), x1 - 20, y - 7, 14, th.text, 'right', 600);
      ui.text(ctx, '朋友 做完揭晓', x1 - 20, y + 10, 11, th.sub, 'right');
    } else if (store.data.settings.showTimer !== false) ui.text(ctx, app.fmt(b.elapsed), x1 - 20, y, 14, th.text, 'right', 500);
  }
  // 本局一招：信息行下面一个小条「本局一招 · 区块排除 1/3」；全用上了变金；点一下讲这一招、能去学
  function drawFocus(ctx, th, t) {
    const f = b.focus;
    if (!f || b.guided || versus()) return;
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
        ui.pill(ctx, th, 'focus-demo', bx, m.y + 122, bw, 48, '在这盘上演示一次', () => { app.pop(); if (!startDemo('我在这盘上走一遍「' + f.name + '」～')) SK.say('这盘现在用不上「' + f.name + '」啦', 'think', 2000); }, 'primary');
        ui.pill(ctx, th, 'focus-learn', bx, m.y + 178, (bw - 8) / 2, 42, '去学这一课', () => { app.pop(); persist(); app.go('lesson', { id: f.lesson, returnTo: 'play' }); }, 'card');
        ui.pill(ctx, th, 'focus-ok', bx + (bw + 8) / 2, m.y + 178, (bw - 8) / 2, 42, '知道了', () => app.pop(), 'card');
        m.done();
      },
    });
  }
  // 带练：卡片上一行字说为什么，手指先指格子、选中以后指数字键
  function ensureGuide(t) {
    if (guide) return guide;
    const h = Board.findHint(b);
    if (!h) return null;
    const tech = h.step && h.step.tech;
    guide = { h, t0: t, cells: h.step ? (tech === 'nakedSingle' ? [h.place.k] : h.step.focus || h.step.cells) : [h.place.k] };
    return guide;
  }
  // 带练：小樱在旁边说为什么（气泡见 drawSpeech），手指先指格子、选中以后指数字键
  function drawGuideHand(ctx, th, t) {
    const g = ensureGuide(t);
    if (!g) return;
    const k = g.h.place.k, v = g.h.place.v;
    const target = b.selected === k ? { x: L.padX + (v - 0.5) * L.keyW, y: L.padY + L.padH / 2 } : (() => { const r = DB.cellRect(geo, k); return { x: r.x + r.s / 2, y: r.y + r.s / 2 }; })();
    ui.icons.hand(ctx, target.x + 4, target.y + 6 + Math.sin(t / 220) * 5, 44, th.text);
  }
  // ---------- 提示：小樱走过去说（Cc：「点击提示时，不要出现底部的提示卡。直接让小樱站到它想提示的那个宫或者单元格旁边，
  // 然后把提示卡里对话气泡的内容，直接让小樱说出口」）----------
  // 底部提示卡整个不要了（Cc：「小樱跳到屏幕中间去说提示，底下的提示卡格子就没用了」）：
  // 提示、第一次演示的讲解、第一局带练，全由小樱走到那一块旁边、用同一个气泡说
  let skPos = null; // { from, to, t0, key, cur }
  function talk(t) {
    if (paused || winAt) return null;
    if (teach) {
      const sg = teach.stages[teach.i], cells = [teach.k];
      sg.items.forEach((it) => { if (it.cells) cells.push.apply(cells, it.cells); if (it.k !== undefined) cells.push(it.k); });
      const last = teach.i === teach.stages.length - 1, keys = [teach.k];
      sg.items.forEach((it) => { if (it.k !== undefined && it.kind !== 'zone') keys.push(it.k); if (it.kind === 'ray') keys.push(it.a, it.b); });
      return { key: 'teach' + teach.i, t0: teach.ts, cells, keys, text: sg.text, btn: { id: 'teach-next', label: last ? '轮到我填' : '下一步', sub: (teach.i + 1) + ' / ' + teach.stages.length, onTap: teachNext } };
    }
    if (hint) return { key: 'hint' + hint.t0, t0: hint.t0, cells: hint.cells, keys: hint.cells.concat([hint.h.place.k]), text: hint.h.text, btn: { id: 'hint-fill', label: '填上', onTap: fillHint },
      close: () => { hint = null; app.animate(400); },
      link: hint.lesson ? { id: 'hint-learn', label: '学这招 ›', onTap: () => { persist(); app.go('lesson', { id: hint.lesson, returnTo: 'play' }); } } : null };
    if (b.guided && b.guideLeft > 0) {
      const g = ensureGuide(t);
      if (g) return { key: 'guide' + g.h.place.k, t0: g.t0, cells: g.cells.concat([g.h.place.k]), keys: g.cells.concat([g.h.place.k]), avoidPad: true, text: '第 ' + (4 - b.guideLeft) + ' / 3 步：' + g.h.text.replace(/^[^：]*：/, '') };
    }
    return null;
  }
  function cellsBox(cells) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    cells.forEach((k) => { const r = DB.cellRect(geo, k); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.s); y1 = Math.max(y1, r.y + r.s); });
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // 站在要看的那一块旁边：右边有地方站右边，不然站左边；一整行那么宽就站上面或下面
  function talkSpot(cells, sw) {
    const B = cellsBox(cells), gx0 = geo.x, gx1 = geo.x + geo.size, gy0 = geo.y, gy1 = geo.y + geo.size;
    const cy = (y) => Math.max(gy0 - sw * 0.3, Math.min(gy1 - sw * 0.7, y));
    if (gx1 - B.x1 >= sw * 0.8) return { x: B.x1 + 2, y: cy(B.cy - sw / 2), w: sw, h: sw };
    if (B.x0 - gx0 >= sw * 0.8) return { x: B.x0 - sw - 2, y: cy(B.cy - sw / 2), w: sw, h: sw };
    const x = Math.max(gx0, Math.min(gx1 - sw, B.cx - sw / 2));
    return { x, y: B.y0 - sw - 2 >= gy0 - sw * 0.5 ? B.y0 - sw - 2 : B.y1 + 2, w: sw, h: sw };
  }
  // 小樱这一帧在哪：平常在右上角，出提示走过去，填上了走回来（0.38 秒滑过去）
  function sakuraRect(t) {
    const home = LY.rect('play.sakura'), tk = talk(t);
    const to = tk ? talkSpot(tk.cells, home.w) : home, key = tk ? tk.key : 'home';
    if (!skPos || skPos.key !== key) skPos = { from: skPos && skPos.cur ? skPos.cur : home, t0: t, key };
    const p = ui.ease.out(Math.min(1, (t - skPos.t0) / 380)), f = skPos.from;
    const cur = { x: f.x + (to.x - f.x) * p, y: f.y + (to.y - f.y) * p, w: f.w + (to.w - f.w) * p, h: f.h + (to.h - f.h) * p };
    skPos.cur = cur;
    if (p < 1) app.animate(60);
    return cur;
  }
  // 小樱的气泡：放在那一块和小樱的上面（上面没地方就放下面），不挡要看的格子；里面一个「填上」
  function drawSpeech(ctx, th, t, sk, tk) {
    const p = Math.min(1, (t - Math.max(tk.t0, skPos.t0) - 300) / 200);
    if (p <= 0) { app.animate(60); return; }
    const B = cellsBox(tk.cells), bw = Math.min(app.W - 24, 300), pad = 12, lh = 19, fs = 14, btnW = tk.btn && tk.btn.sub ? 92 : 72, btnH = tk.btn && tk.btn.sub ? 40 : 32;
    const tw = bw - pad * 2 - (tk.close ? 20 : 0);
    const n = ui.wrap(ctx, tk.text, 0, 0, tw, fs, lh, null, 600);
    const bh = pad + n * lh + (tk.btn ? 8 + btnH + 8 : pad - 4);
    // 放哪：先试棋盘上面、棋盘下面（不压棋盘），再试紧挨着那一块的上面、下面；
    // 挑一个压「要看的格子」最少的（Fable 试玩：SE 上讲解气泡盖住了正在讲的那一格和被圈的数）
    const top = Math.min(B.y0, sk.y), bot = Math.max(B.y1, sk.y + sk.h);
    const yMin = app.headerY + app.headerH + 2, yMax = app.bottom - 4 - bh;
    const keyRects = (tk.keys || tk.cells).map((k) => DB.cellRect(geo, k));
    const area = (y, r) => Math.max(0, Math.min(y + bh, r.y + (r.h || r.s)) - Math.max(y, r.y)) * Math.max(0, Math.min(app.W - 12, r.x + (r.w || r.s)) - Math.max(12, r.x));
    const cost = (y) => keyRects.reduce((a, r) => a + area(y, r), 0) * 10 + area(y, sk) + (tk.avoidPad ? area(y, { x: L.padX, y: L.padY, w: L.padW, h: L.padH }) * 10 : 0);
    let by = null, best = 1e18;
    [geo.y - 6 - bh, geo.y + geo.size + 6, top - 10 - bh, bot + 10].forEach((y0) => {
      const y = Math.max(yMin, Math.min(yMax, y0)), c = cost(y);
      if (c < best - 1) { best = c; by = y; }
    });
    const up = by + bh / 2 < sk.y + sk.h / 2;
    const scx = sk.x + sk.w / 2, bx = Math.max(12, Math.min(app.W - 12 - bw, scx - bw / 2));
    if (tk.btn) ui.button({ id: 'speech-card', x: bx, y: by, w: bw, h: bh }); // 挡住底下的格子和按钮（带练的气泡不挡：要点得到格子）
    ctx.save();
    // 不透明地弹出来（淡入会把底下的小条、飘字透出来）：从小樱那边放大到 1
    const sc = 0.85 + 0.15 * ui.ease.back(p), ox = Math.max(bx, Math.min(bx + bw, scx)), oy = up ? by + bh : by;
    ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-ox, -oy);
    ui.fillRR(ctx, bx, by, bw, bh, 14, th.card);
    ui.rr(ctx, bx, by, bw, bh, 14); ctx.strokeStyle = '#E07C96'; ctx.lineWidth = 1.5; ctx.stroke();
    // 小尾巴指向小樱
    const tx = Math.max(bx + 18, Math.min(bx + bw - 18, scx)), ey = up ? by + bh : by, d = up ? 1 : -1;
    ctx.fillStyle = th.card; ctx.beginPath(); ctx.moveTo(tx - 7, ey - d); ctx.lineTo(tx, ey + 9 * d); ctx.lineTo(tx + 7, ey - d); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(tx - 7, ey); ctx.lineTo(tx, ey + 9 * d); ctx.lineTo(tx + 7, ey); ctx.stroke();
    ui.wrap(ctx, tk.text, bx + pad, by + pad, tw, fs, lh, th.text, 600);
    // 关掉（提示：不想看了就收起来）、去学这一招
    if (tk.close) {
      ui.button({ id: 'speech-close', x: bx + bw - 34, y: by, w: 34, h: 34, onTap: tk.close });
      ui.text(ctx, '×', bx + bw - 17, by + 16, 18, th.sub, 'center', 600);
    }
    if (tk.link && tk.btn) {
      const ly = by + bh - 8 - (tk.btn.sub ? 40 : 32);
      ui.button({ id: tk.link.id, x: bx + 4, y: ly - 4, w: 96, h: 40, onTap: tk.link.onTap });
      ui.text(ctx, tk.link.label, bx + pad, ly + 16, 13, th.primary, 'left', 600);
    }
    if (tk.btn) {
      const fx0 = bx + bw - pad - btnW, fy0 = by + bh - 8 - btnH;
      const on = ui.button({ id: tk.btn.id, x: fx0, y: fy0, w: btnW, h: btnH, onTap: tk.btn.onTap });
      ui.fillRR(ctx, fx0, fy0, btnW, btnH, 10, on ? th.sel : th.primary);
      if (tk.btn.sub) {
        ui.text(ctx, tk.btn.label, fx0 + btnW / 2, fy0 + btnH / 2 - 6, 14, '#FFFFFF', 'center', 700);
        ui.text(ctx, tk.btn.sub, fx0 + btnW / 2, fy0 + btnH / 2 + 11, 10, 'rgba(255,255,255,0.8)', 'center', 600);
      } else ui.text(ctx, tk.btn.label, fx0 + btnW / 2, fy0 + btnH / 2, 14, '#FFFFFF', 'center', 700);
    }
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
        const tilt = on || opts.noteMode ? 0 : PAD_TILT[v - 1] * Math.PI / 180;
        ctx.translate(tx + cs / 2, ty + cs / 2 + (on ? 2 : 0));
        ctx.rotate(tilt);
        if (on) ctx.scale(0.94, 0.94);
        ctx.translate(-(tx + cs / 2), -(ty + cs / 2));
        if (opts.noteMode) {
          // 笔记开：键变成空心虚线框，小数字放在它进格子以后的位置（1 左上 … 9 右下）——一眼看出现在是记笔记
          // （Cc：「笔记开和关的时候，底下的数字应该显示的效果不一样……现在长得一样，分不出来」）
          const ns = Math.min(keyW - 6, cs), nx = x + (keyW - ns) / 2, ny = ty + (cs - ns) / 2;
          ui.fillRR(ctx, nx, ny, ns, ns, 8, opts.active === v ? th.soft : th.card);
          ctx.strokeStyle = th.primary; ctx.lineWidth = 1.5;
          if (ctx.setLineDash) ctx.setLineDash([3, 3]);
          ui.rr(ctx, nx, ny, ns, ns, 8); ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
          const gx = nx + ns * (0.26 + ((v - 1) % 3) * 0.24), gy = ny + ns * (0.26 + Math.floor((v - 1) / 3) * 0.24);
          ui.text(ctx, String(v), gx, gy, Math.round(ns * 0.3), th.primary, 'center', 700);
        } else DB.sampleTile(ctx, th, store.data.settings.tileStyle, tx, ty, cs, v, 0, app.now, opts.active === v);
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
      // 图标、字跟着框的高缩放（Cc 把工具行拉小了：「把它们也变小一点……现在有点大」）
      const is = Math.min(26, h * 0.42), hw = Math.min(30, w / 2 - 2), fs = h >= 56 ? 12 : 11;
      if (on) ui.fillRR(ctx, cx - hw, y + 2, hw * 2, h - 4, 12, th.soft);
      if (it.highlight) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(app.now / 220);
        ui.fillRR(ctx, cx - hw, y + 2, hw * 2, h - 4, 12, th.soft);
        ctx.globalAlpha = 1;
      }
      const c = it.active ? th.primary : th.sub;
      ui.icons[it.icon](ctx, cx, y + h * 0.36, is, c);
      ui.text(ctx, it.label, cx, y + h * 0.79, fs, c, 'center', it.active ? 600 : 400);
      if (it.badge) {
        ctx.font = ui.font(10, 700);
        const bw = Math.max(16, ctx.measureText(it.badge.text).width + 8);
        ui.fillRR(ctx, cx + is * 0.3, y + 2, bw, 15, 7.5, it.badge.color);
        ui.text(ctx, it.badge.text, cx + is * 0.3 + bw / 2, y + 10, 10, '#FFFFFF', 'center', 700);
      }
    });
  };

  app.scenes.play = {
    enter(args) {
      b = args.board;
      noteMode = false; paused = false; hint = null; winAt = 0; party = null; guide = null; selDigit = 0;
      resetFx();
      layout();
      demo = null; teach = null; idleAt = P.now(); idleNag = false; SK.clear();
      if (!b.lost) Board.dropAllWrong(b);
      else later(500, () => showLost()); // 输了以后退出 / 被杀掉再「继续」：重新弹那张弹窗，不是一盘死棋
      // 新的一局：小樱说这盘练哪一招；这一招还没在盘上演示过，就先演示一遍再让你填（Cc：「我进来之后，系统也没教我」）
      if (versus()) { if (b.elapsed < 1000) setTimeout(() => SK.say('开始！你用的每一招\n我都给你记着～', 'happy', 2200), 450); }
      else if (b.focus && !b.focusShown && !b.guided) {
        b.focusShown = true;
        const f = b.focus, seen = store.data.seen.demo || (store.data.seen.demo = {});
        const basic = (T.LESSONS.find((x) => x.id === f.lesson) || {}).group === 'basic';
        if (!seen[f.lesson] && basic) {
          b.focusShown = false; // 讲完（点到「轮到我填」）才算讲过：中途退出回来还会讲
          setTimeout(() => { if (app.scene === app.scenes.play && !startDemo()) SK.say('这盘练「' + f.name + '」\n我陪你！', 'happy', 2600); }, 450);
        } else if (!basic && !seen[f.lesson]) {
          // 进阶招不用学（Cc）：不自动演示，只说一句，想看点小条
          seen[f.lesson] = true; store.save();
          setTimeout(() => SK.say('这盘会用到「' + f.name + '」\n想看演示就点上面的小条～', 'happy', 3000), 450);
        } else setTimeout(() => SK.say('这盘练「' + f.name + '」' + (f.keys.length > 9 ? '\n全靠它啦' : '\n有 ' + f.keys.length + ' 处要用它'), 'happy', 2600), 450);
      } else if (!b.guided && b.elapsed < 1000) setTimeout(() => SK.say('加油！我在这儿看着～', 'happy', 2000), 450);
    },
    leave() { persist(); },
    onHide() { if (b && !b.done && !winAt) { paused = true; persist(); app.redraw(); } },
    update(dt, t) {
      if (fx) { runEvents(t); if (fx.sparks.length) stepSparks(dt); }
      if (!b || paused || winAt || b.lost || teach || app.overlays.length) return; // 讲解的时候不计时
      b.elapsed += dt;
      if (!idleNag && t - idleAt > 45000 && !SK.busy(t)) { idleNag = true; idleAt = t; SK.say('卡住了？\n点「提示」我教你～', 'think', 3000); app.animate(100); }
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
      if (!paused) { drawChain(ctx, t); drawDemo(ctx, t); drawTeach(ctx, t); }
      // 加分飘字
      fx.floats = fx.floats.filter((f) => t - f.t0 < 800);
      for (const f of fx.floats) {
        if (t < f.t0) continue;
        const p = (t - f.t0) / 800, r = DB.cellRect(geo, f.k);
        ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
        const fxp = Math.max(36, Math.min(app.W - 36, r.x + r.s / 2)), fyp = Math.max(geo.y + 8, r.y - 6 - ui.ease.out(p) * 26 - (f.focus ? 16 : 0));
        ui.text(ctx, f.text, fxp, fyp, f.focus ? 13 : 14, f.focus ? th.gold : th.primary, 'center', 700);
        ctx.globalAlpha = 1;
      }
      // 小樱画在棋盘上面（出提示时她会走到棋盘上）
      const skr = sakuraRect(t);
      SK.draw(ctx, skr, t, th, { noBubble: !!talk(t) });
      if (SK.busy(t)) app.animate(60);

      // 工具 + 数字键
      const hintBadge = b.hintsLeft > 0 ? { text: String(b.hintsLeft), color: th.primary } : { text: '▶', color: th.gold };
      app.drawTools(ctx, L.toolsY, L.toolsH, [
        // 撤销、橡皮去掉了（Cc：「橡皮擦功能没用，撤销功能也没用」——填错的数两秒自己拿掉，笔记再点一次那个数就消）
        // 笔记放右手边（Cc：「把笔记跟提示的位置换一下……Sudoku 笔记放的位置就是右手边」）
        { id: 'hint', label: '提示', icon: 'bulb', badge: hintBadge, onTap: () => tool('hint') },
        { id: 'note', label: '笔记', icon: 'pencil', active: noteMode, badge: { text: noteMode ? '开' : '关', color: noteMode ? th.primary : th.faint }, onTap: () => tool('note') },
      ], L.toolsX, L.toolsW);
      app.drawPad(ctx, { x: L.padX, w: L.padW, y: L.padY, h: L.padH, onPress: press, counts: Board.counts(b), noteMode, doneAt: fx.keyDone, active: selDigit });
      // 讲解时挡住棋盘和按键，只能点气泡里的「下一步」
      if (teach && !paused) ui.button({ id: 'teach-block', x: 0, y: L.infoY, w: app.W, h: app.H - L.infoY, silent: true });
      const tk = talk(t);
      if (tk) drawSpeech(ctx, th, t, skr, tk);
      if (b.guided && b.guideLeft > 0 && !winAt && !paused) drawGuideHand(ctx, th, t);
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
    toolCenter: (i) => ({ x: L.toolsX + (i + 0.5) * (L.toolsW / 2), y: L.toolsY + L.toolsH / 2 }),
    hint: () => hint,
    chain: () => fx && fx.chain,
    demo: () => demo,
    teach: () => teach,
    teachNext: () => teachNext(),
    sakura: () => SK,
    guide: () => guide,
    selDigit: () => selDigit,
    noteMode: () => noteMode,
  };
};
