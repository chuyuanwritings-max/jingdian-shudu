// 过场（0.7）：照「过场动画制作 1.0」的节拍语法 + 主页与过场设计_Fable_1.0.md 第二部分。
// 主角是一块放大的数字方块，站在一束光里（不加手、不加角色）。一张新图都不用出：方块、光阵底、棋盘截图全部代码画，
// 画在离屏画布上当「图」交给过场播放器（cutscene.js）。
// 有四段：开场（第一次打开）、学完一课、升档学新招、通关第二段。局内「某个数填完」和通关第一段在 scene_play 里原地做。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const S = require('./sudoku.js');
const store = require('./store.js');
const { createCutscene } = require('./cutscene.js');

const AMBER = { body: '#E0B040', edge: '#B0902E', ink: '#3A2A08' };
const GOLD = { body: '#E9C25A', edge: '#A9832A', ink: '#3A2A08' };
const DARKT = { body: '#1A2422', edge: '#0B100F', ink: '#5B6B66' };
const GREY = { body: '#3A3F45', edge: '#22262A', ink: '#A7AEB6' };
const PAPER = '#F3EAD2';
const DARK = { cy: 0.45, inner: 0.22, outer: 0.62, strength: 0.8 };

module.exports = function (app) {
  // ---------- 代码画的「图」 ----------
  // 一块大方块：面 + 厚边 + 顶上一条高光；上面写字 / 打勾 / 刻档位杠
  function tileImg(size, pal, opts) {
    opts = opts || {};
    const d = app.dpr, thick = Math.round(size * 0.07), pad = Math.round(size * 0.06);
    const w = size + pad * 2, h = size + thick + pad * 2;
    const c = P.makeCanvas(Math.round(w * d), Math.round(h * d));
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const r = size * 0.14;
    ui.fillRR(g, pad + 2, pad + thick + 4, size, size, r, 'rgba(0,0,0,0.35)');
    ui.fillRR(g, pad, pad + thick, size, size, r, pal.edge);
    ui.fillRR(g, pad, pad, size, size, r, pal.body);
    ui.fillRR(g, pad + size * 0.1, pad + size * 0.05, size * 0.8, Math.max(2, size * 0.035), 2, 'rgba(255,255,255,0.4)');
    const cx = pad + size / 2, cy = pad + size / 2;
    if (opts.text) ui.text(g, opts.text, cx, cy + size * 0.02 - (opts.bars ? size * 0.06 : 0), size * (opts.text.length > 2 ? 0.24 : opts.text.length === 2 ? 0.34 : 0.56), pal.ink, 'center', 700);
    if (opts.check) ui.icons.check(g, cx, cy - (opts.bars ? size * 0.08 : 0), size * 0.5, pal.ink, Math.max(3, size * 0.06));
    if (opts.bars) {
      // 档位杠：入门 1 道 … 大师 6 道，刻在方块下沿
      // 扁扁的短横杠，一道一道排开（像军衔），不要像感叹号
      const n = opts.bars, bw = size * (n > 3 ? 0.09 : 0.13), gap = size * 0.035, tot = n * bw + (n - 1) * gap;
      for (let i = 0; i < n; i++) ui.fillRR(g, cx - tot / 2 + i * (bw + gap), pad + size * 0.83, bw, size * 0.035, 1.5, pal.ink);
    }
    return c;
  }
  // 光阵底：16 瓣放射纹（两种深浅，取当前主题彩色块的颜色），上面压一层很淡的九宫格线。代替戴夫的「比喻换底」
  const raysCache = {};
  function raysImg(th) {
    const key = th.id + '|' + app.dpr;
    if (raysCache[key]) return raysCache[key];
    const s = 512, d = app.dpr, c = P.makeCanvas(s * d, s * d), g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    const a = (th.tileB || [th.primary, th.text])[0], b = (th.tileB || [th.primary, th.text])[1];
    g.fillStyle = b; g.fillRect(0, 0, s, s);
    g.fillStyle = a;
    for (let i = 0; i < 16; i += 2) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a0) * s, s / 2 + Math.sin(a0) * s); g.lineTo(s / 2 + Math.cos(a1) * s, s / 2 + Math.sin(a1) * s); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
    for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo((s * i) / 3, 0); g.lineTo((s * i) / 3, s); g.moveTo(0, (s * i) / 3); g.lineTo(s, (s * i) / 3); g.stroke(); }
    raysCache[key] = c;
    return c;
  }
  // 一行七个小点，第 lit 个（0 起）亮琥珀，前面学过的亮白
  function dotsImg(done, lit) {
    const d = app.dpr, w = 7 * 22, h = 16, c = P.makeCanvas(w * d, h * d), g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    for (let i = 0; i < 7; i++) {
      g.beginPath(); g.arc(11 + i * 22, 8, i === lit ? 6.5 : 5, 0, Math.PI * 2);
      g.fillStyle = i === lit ? AMBER.body : done[i] ? 'rgba(243,234,210,0.85)' : 'rgba(243,234,210,0.22)';
      g.fill();
    }
    return c;
  }

  // ---------- 播放 ----------
  // 简洁动效 / 黑板主题：去掉震屏、全屏闪压低（主页与过场设计 2.2 第 5、8 条）
  function tame(tl) {
    const reduce = store.data.settings.reduceMotion;
    const cap = app.th.id === 'chalk' ? C.CUT.flashChalk : C.CUT.flashMax;
    const beats = tl.beats.map((b) => Object.assign({}, b, {
      fx: (b.fx || []).filter((f) => !(reduce && (f.fx === 'shake' || f.fx === 'strobe' || (f.fx === 'camera' && f.steps)))).map((f) => {
        if (f.fx === 'flash' && !f.paper) return Object.assign({}, f, { alpha: reduce ? Math.min(f.alpha || 0.7, 0.25) : Math.min(f.alpha || 0.7, cap) });
        return f;
      }),
    }));
    return Object.assign({}, tl, { beats });
  }
  // 播一段：盖在当前画面上（播放器每帧整屏涂底），点一下跳过；播完 onEnd
  app.playCut = (timeline, images, opts) => {
    opts = opts || {};
    const short = !!opts.short || store.data.settings.reduceMotion;
    let ended = false, last = P.now();
    const cs = createCutscene({
      ctx: app.ctx, width: app.W, height: app.H, images, timeline: tame(timeline), short,
      onSfx: (name) => {
        // 咚 / 灯：heavy。但离刚才那串「成了」不到 0.6 秒（短版通关第二段紧跟在三下后面）就不另震，免得连成四下（规矩 1.1：一串最多三下）
        if ((name === 'dong' || name === 'lamp') && P.now() - app.buzzSeqAt > 600) app.buzz('heavy');
        app.sound(name, name === 'hum' ? 0.35 : undefined);
      },
      onEnd: () => setTimeout(finish, 0),
    });
    const ov = {
      cut: true,
      live: () => !ended,
      draw(ctx, t) {
        cs.update(Math.max(0, t - last));
        last = t;
        cs.draw();
        ui.button({ id: 'cs-skip', x: 0, y: 0, w: app.W, h: app.H, silent: true, onDown: () => cs.skip() });
      },
    };
    function finish() {
      if (ended) return;
      ended = true;
      const i = app.overlays.indexOf(ov);
      if (i >= 0) { app.overlays.splice(i, 1); app.redraw(); }
      if (opts.onEnd) opts.onEnd();
    }
    app.push(ov);
    ov.t0 = P.now() - 1000; // 不要淡入：过场自己管画面
    return cs;
  };

  // ---------- 每日挑战开场：F 运镜大图（2026-11-24 Cc：「模仿《潜水员戴夫》……让镜头框在图片上的一个小范围运动，
  // 来模拟 2D 式的镜头运动……每个游戏里都给我做一点」；总指挥：守住经典数独的安静）----------
  // 镜头推近主页图，从左上慢慢摇到右下 → 停 → 小幅硬切推到小樱身上（不闪白、不震屏）→ 弹出日期和难度 → 淡黑进局。
  // 第一次 3.6 秒，第二次起从硬切开始（约 1.3 秒）；点一下跳过
  app.cutDaily = (label, onEnd) => {
    const HA = require('./homeart.js'), SK = require('./sakura.js');
    let waiting = true, done = false;
    const go = (im) => { if (done) return; done = true; waiting = false; playDaily(HA, im, label, onEnd); };
    const black = { cut: true, live: () => waiting, draw(ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, app.W, app.H); } };
    app.push(black);
    black.t0 = P.now() - 1000;
    HA.whenReady(app.W, app.H, app.dpr, () => {
      P.loadImage(SK.SPRITES.happy, (im) => {
        const i = app.overlays.indexOf(black);
        if (i >= 0) app.overlays.splice(i, 1);
        go(im && im.width ? im : null);
      });
      setTimeout(() => { const i = app.overlays.indexOf(black); if (i >= 0) app.overlays.splice(i, 1); go(null); }, 1500);
    }, 2500);
  };
  function playDaily(HA, sakuraImg, label, onEnd) {
    const art = HA.get(app.W, app.H, app.dpr), L = art.lit, W = app.W, H = app.H;
    const images = { home: art.canvas };
    // 小樱站在主页图里亮的那一块右下边（她跟着大图一起被镜头带着走）
    const sx = Math.min(0.8, L.x / W + 0.12), sy = Math.min(0.75, L.y / H + 0.09), sh = 0.13;
    const layers = [{ id: 'home', img: 'home', fit: 'cover', z: 0 }];
    if (sakuraImg) { images.sakura = sakuraImg; layers.push({ id: 'sakura', img: 'sakura', z: 1, pos: [sx, sy], anchor: [0.5, 0.5], h: sh }); }
    // 镜头能摇的范围：推近 z 倍时，镜头中心最多偏离 (1 - 1/z) / 2
    const lim = (z, v) => Math.max(-(1 - 1 / z) / 2, Math.min((1 - 1 / z) / 2, v));
    const Z1 = 1.45, Z2 = 1.9;
    const tl = {
      id: 'daily', fps: 60, bg: '#000000', short: { from: 'punch' },
      layers,
      beats: [
        { id: 'black', type: 'darkIn', dur: 24,
          fx: [{ at: 0, fx: 'camera', to: Z1, dur: 0, pan: [lim(Z1, -0.2), lim(Z1, -0.2)], panDur: 0 },
               { at: 0, fx: 'fade', from: 1, to: 0, dur: 24 }] },
        { id: 'sweep', type: 'hold', dur: 110,
          fx: [{ at: 0, fx: 'camera', pan: [lim(Z1, 0.2), lim(Z1, 0.16)], panDur: 110, panEase: 'inOut' },
               { at: 18, fx: 'text', str: '今日挑战', in: 'fade', inDur: 16, pos: [0.5, 0.16], size: 26, color: '#1C2320', stroke: 'rgba(245,238,220,0.9)', strokeWidth: 4, dur: 88 },
               { at: 0, fx: 'particles', preset: 'dust', n: 6, z: 4, dur: 110 }] },
        { id: 'still', type: 'hold', dur: 16 },
        // 硬切推到小樱：幅度小、不闪不震（经典数独要安静）
        { id: 'punch', type: 'strike', dur: 4,
          fx: [{ at: 0, fx: 'camera', pan: [lim(Z2, sx - 0.5), lim(Z2, sy - 0.5)], panDur: 0, steps: [1.75, Z2], stepDur: 2 },
               { at: 0, sfx: 'soft' }] },
        { id: 'pose', type: 'pose', dur: 62,
          tracks: sakuraImg ? [{ layer: 'sakura', prop: 'scale', from: 1, to: 1.04, ease: 'breathe' }] : [],
          fx: [{ at: 0, fx: 'camera', to: Z2 + 0.12, dur: 62, ease: 'linear' },
               { at: 6, fx: 'text', str: label, in: 'pop', inDur: 10, pos: [0.5, 0.84], size: 24, strokeWidth: 5, dur: 56 },
               { at: 6, sfx: 'bell1' }] },
        { id: 'out', type: 'out', dur: 14, fx: [{ at: 0, fx: 'fade', from: 0, to: 1, dur: 14 }] },
      ],
    };
    const seen = !!store.data.seen.cutDaily;
    store.data.seen.cutDaily = true; store.save();
    return app.playCut(tl, images, { onEnd, short: seen });
  }

  // ---------- 开场：游戏名亮相（第一次打开，2.6 秒）----------
  // 黑 → 暗方块淡入（对准主页图里亮的那一块）→ 呼吸 → 「啪」亮成琥珀 + 白闪里硬切成主页图 → 镜头拉回 → 游戏名弹出
  app.cutOpen = (onEnd) => {
    // 主页图（Midjourney）是异步加载的：先黑屏等它（最多 2.5 秒），开场才对得准亮的那一块，播完也接得上同一张图
    const HA = require('./homeart.js');
    let waiting = true;
    const black = { cut: true, live: () => waiting, draw(ctx) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, app.W, app.H); } };
    app.push(black);
    black.t0 = P.now() - 1000;
    HA.whenReady(app.W, app.H, app.dpr, () => {
      waiting = false;
      const i = app.overlays.indexOf(black);
      if (i >= 0) app.overlays.splice(i, 1);
      playOpen(HA, onEnd);
    }, 2500); // 微信里图在包内，几乎瞬间到；网页版走网络，多等一会儿
  };
  function playOpen(HA, onEnd) {
    const art = HA.get(app.W, app.H, app.dpr);
    const L = art.lit, W = app.W, H = app.H;
    const tsz = Math.round(L.s * 1.05);
    const images = { home: art.canvas, dark: tileImg(tsz, DARKT), lit: tileImg(tsz, AMBER) };
    const pos = [L.x / W, L.y / H], hh = (images.dark.height / app.dpr) / H;
    const tl = {
      id: 'open', fps: 60, bg: '#000000',
      layers: [
        { id: 'home', img: 'home', fit: 'cover', z: 0, visible: false },
        { id: 'tile', img: 'dark', z: 1, pos, anchor: [0.5, 0.5], h: hh, alpha: 0 },
      ],
      beats: [
        { id: 'black', type: 'hold', dur: 12 },
        { id: 'dark-in', type: 'darkIn', dur: 24, tracks: [{ layer: 'tile', prop: 'alpha', from: 0, to: 1, dur: 24, ease: 'out' }], fx: [{ at: 0, sfx: 'hum' }] },
        { id: 'hold', type: 'hold', dur: 40, tracks: [{ layer: 'tile', prop: 'scale', from: 1, to: 1.02, ease: 'breathe' }],
          fx: [{ at: 0, fx: 'glow', origin: pos, r0: 14, r1: 18, dur: 40, color: AMBER.body, z: 0.5 }] },
        { id: 'strike', type: 'strike', dur: 3, frames: [{ f: 0, layer: 'tile', smear: { sx: 1.12, sy: 0.82, lines: 6 } }, { f: 2, layer: 'tile', img: 'lit' }] },
        { id: 'impact', type: 'impact', dur: 15,
          frames: [{ f: 0, layer: 'home', visible: true }, { f: 0, layer: 'tile', visible: false }],
          fx: [{ at: 0, fx: 'flash', alpha: 0.7, decay: 15 }, { at: 0, fx: 'shake', amp: 4, dur: 8 },
               { at: 0, fx: 'camera', steps: [1.08, 1.18, 1.3], stepDur: 3, focus: pos },
               { at: 0, fx: 'particles', preset: 'spark', n: 16, origin: pos, z: 3 }, { at: 0, sfx: 'lamp' }] },
        { id: 'pose', type: 'pose', dur: 60,
          fx: [{ at: 0, fx: 'camera', to: 1, dur: 40, ease: 'out', focus: pos },
               { at: 10, fx: 'text', str: app.TITLE, in: 'pop', pos: [0.5, app.titleY / H], size: 44, color: HA.colors().title, stroke: 'rgba(0,0,0,0)', dur: 50 },
               { at: 10, sfx: 'bell9' }, { at: 0, fx: 'particles', preset: 'dust', n: 8, z: 4, dur: 60 }] },
      ],
    };
    store.data.seen.open = true;
    store.save();
    return app.playCut(tl, images, { onEnd });
  }

  // ---------- 学完一课（1.5 秒，短版 0.8 秒）----------
  // 压暗 → 停 → 写着课号的方块从上面砸到正中 → 咚 → 七个小点第 n 个点亮 +「学会了 · 排除法」→ 纸色一闪
  app.cutLesson = (index, name, opts) => {
    const th = app.th, H = app.H, W = app.W;
    const pal = th.tileB ? { body: th.tileB[0], edge: th.tileB[1], ink: th.tileB[2] } : AMBER;
    const done = require('./tutorial.js').BASIC.map((L) => !!store.data.lessons[L.id]); // 基础 3 课 3 个点
    const before = done.slice(); before[index] = false;
    const sz = Math.round(Math.min(W * 0.42, 170));
    const images = { tile: tileImg(sz, opts && opts.all ? GOLD : pal, { text: opts && opts.all ? '全会' : String(index + 1) }), dotsA: dotsImg(before, -1), dotsB: dotsImg(done, index) };
    const hh = (images.tile.height / app.dpr) / H;
    const tl = {
      id: 'lesson', fps: 60, bg: '#0E0E0E', vignette: DARK, short: { from: 'strike', dur: { pose: 24 } },
      layers: [
        { id: 'tile', img: 'tile', z: 2, pos: [0.5, 0.44], anchor: [0.5, 0.5], h: hh, visible: false },
        { id: 'dots', img: 'dotsA', z: 2, pos: [0.5, 0.62], anchor: [0.5, 0.5], h: 16 / H, visible: false },
      ],
      beats: [
        { id: 'darken', type: 'drop', dur: 2 },
        { id: 'hold', type: 'hold', dur: 20, fx: [{ at: 0, fx: 'glow', origin: [0.5, 0.44], r0: 6, r1: 10, dur: 20, color: AMBER.body, z: 1 }] },
        { id: 'strike', type: 'strike', dur: 3,
          frames: [{ f: 0, layer: 'tile', visible: true, pos: [0.5, 0.26], smear: { sx: 0.9, sy: 1.3, lines: 4 } }, { f: 2, layer: 'tile', pos: [0.5, 0.44] }] },
        { id: 'impact', type: 'impact', dur: 15,
          frames: [{ f: 0, layer: 'dots', visible: true }],
          tracks: [{ layer: 'tile', prop: 'sy', from: 0.84, to: 1, dur: 10, ease: 'pop' }, { layer: 'tile', prop: 'sx', from: 1.1, to: 1, dur: 10, ease: 'pop' }],
          fx: [{ at: 0, fx: 'flash', alpha: 0.5, decay: 12 }, { at: 0, fx: 'shake', amp: 4, dur: 6 },
               { at: 0, fx: 'particles', preset: 'spark', n: 14, origin: [0.5, 0.5], z: 3 }, { at: 0, sfx: 'dong' }] },
        { id: 'pose', type: 'pose', dur: 45,
          frames: [{ f: 6, layer: 'dots', img: 'dotsB' }],
          fx: [{ at: 6, fx: 'text', str: opts && opts.all ? '基础全会' : '学会了 · ' + name, in: 'pop', pos: [0.5, 0.72], size: 24, color: PAPER, stroke: 'rgba(0,0,0,0)', dur: 39 },
               { at: 6, sfx: 'bell9' }] },
        { id: 'out', type: 'out', dur: 6, fx: [{ at: 0, fx: 'flash', color: th.bg, alpha: 1, hold: 2, decay: 4, paper: true }] },
      ],
    };
    return app.playCut(tl, images, opts);
  };

  // ---------- 升档学新招（3.5 秒，短版 1.1 秒）----------
  // 旧档方块站在光里 → 呼吸 → 上方聚能 → 新档方块砸下 → 咚 + 推镜 → 光环扫一圈外扩 → 光柱慢转「中等 · 新招：区块排除」
  app.cutTier = (tier, lessonName, opts) => {
    const th = app.th, H = app.H, W = app.W;
    const top = tier === 5;
    const pal = top ? GOLD : th.tileB ? { body: th.tileB[0], edge: th.tileB[1], ink: th.tileB[2] } : AMBER;
    const sz = Math.round(Math.min(W * 0.42, 170));
    const images = { old: tileImg(sz, GREY, { bars: tier }), neu: tileImg(sz, pal, { bars: tier + 1 }) };
    const hh = (images.old.height / app.dpr) / H;
    const tl = {
      id: 'tier', fps: 60, bg: '#0A0A0A', vignette: DARK, short: { from: 'strike', drop: ['ring'], dur: { pose: 36 } },
      layers: [
        { id: 'old', img: 'old', z: 2, pos: [0.5, 0.5], anchor: [0.5, 0.5], h: hh, alpha: 0 },
        { id: 'neu', img: 'neu', z: 3, pos: [0.5, 0.5], anchor: [0.5, 0.5], h: hh, visible: false },
      ],
      beats: [
        { id: 'dark-in', type: 'darkIn', dur: 24, tracks: [{ layer: 'old', prop: 'alpha', from: 0, to: 1, dur: 24, ease: 'out' }] },
        { id: 'hold', type: 'hold', dur: 36, tracks: [{ layer: 'old', prop: 'scale', from: 1, to: 1.02, ease: 'breathe' }],
          fx: [{ at: 0, fx: 'glow', origin: [0.5, 0.6], r0: 14, r1: 18, dur: 36, color: AMBER.body, z: 1 }] },
        { id: 'charge', type: 'charge', dur: 40,
          fx: [{ at: 0, fx: 'glow', origin: [0.5, 0.22], r0: 8, r1: 60, grow: 40, dur: 40, color: AMBER.body, z: 4 },
               { at: 0, fx: 'strobe', pattern: [2, 6, 1, 8], min: 0, max: 0.6, local: [0.5, 0.22, 0.25], dur: 40 }, { at: 0, sfx: 'hum' }] },
        { id: 'strike', type: 'strike', dur: 3,
          frames: [{ f: 0, layer: 'neu', visible: true, pos: [0.5, 0.24], smear: { sx: 0.9, sy: 1.3, lines: 6 } }, { f: 2, layer: 'neu', pos: [0.5, 0.5] }] },
        { id: 'impact', type: 'impact', dur: 18,
          fx: [{ at: 0, fx: 'flash', alpha: 0.7, decay: 15 }, { at: 0, fx: 'shake', amp: 6, dur: 8 },
               { at: 0, fx: 'particles', preset: 'spark', n: 28, origin: [0.5, 0.5], z: 5 }, { at: 0, fx: 'star', origin: [0.5, 0.5], size: 0.12, z: 5 },
               { at: 0, fx: 'camera', steps: [1.08, 1.18, 1.3], stepDur: 3, focus: [0.5, 0.5] }, { at: 0, sfx: 'dong' }] },
        { id: 'swap', type: 'swap', dur: 2, frames: [{ f: 0, layer: 'old', visible: false }, { f: 0, layer: 'neu', scale: 1.15 }],
          fx: [{ at: 0, fx: 'camera', to: 1, dur: 0, focus: [0.5, 0.5] }] },
        { id: 'ring', type: 'ring', dur: 30, fx: [{ at: 0, fx: 'ring', origin: [0.5, 0.52], rx: 0.36, ry: 0.07, dur: 30, expand: true, z: 4 }, { at: 0, sfx: 'whoosh' }] },
        { id: 'pose', type: 'pose', dur: 50,
          fx: [{ at: 0, fx: 'rays', origin: [0.5, 0.5], z: 1, fadeIn: 10, alpha: 0.26, color: top ? GOLD.body : AMBER.body, dur: 50 },
               { at: 8, fx: 'text', str: top ? '大师' : S.TIERS[tier].name, in: 'pop', pos: [0.5, 0.74], size: 34, color: PAPER, stroke: 'rgba(0,0,0,0)', dur: 42 },
               { at: 14, fx: 'text', str: lessonName ? '新招：' + lessonName : '新的一档', in: 'fade', pos: [0.5, 0.8], size: 16, color: 'rgba(243,234,210,0.75)', stroke: 'rgba(0,0,0,0)', dur: 36 },
               { at: 8, sfx: 'chord' }] },
        { id: 'out', type: 'out', dur: 8, fx: [{ at: 0, fx: 'flash', color: th.bg, alpha: 1, hold: 3, decay: 5, paper: true }] },
      ],
    };
    return app.playCut(tl, images, opts);
  };

  // ---------- 通关第二段（第一段在棋盘上：顿、金色波浪、长停）----------
  // 整盘 3 帧压扁收成一块大金方块 → 咚 + 推镜 → 光阵底「完成！」→ 结束后直接硬切到安静的结算页（反差回落）
  app.cutWin = (boardShot, geo, tier, head, sub, opts) => {
    const th = app.th, H = app.H, W = app.W;
    const sz = Math.round(Math.min(W * 0.46, 180));
    const images = { board: boardShot, gold: tileImg(sz, GOLD, { check: true, bars: tier + 1 }), rays: raysImg(th) };
    const bpos = [(geo.x + geo.size / 2) / W, (geo.y + geo.size / 2) / H];
    const tl = {
      id: 'win', fps: 60, bg: '#0E0E0E', short: { from: 'strike', dur: { pose: C.CUT.win.poseShort } },
      layers: [
        { id: 'rays', img: 'rays', fit: 'cover', z: 0, visible: false },
        { id: 'board', img: 'board', z: 2, pos: bpos, anchor: [0.5, 0.5], h: geo.size / H },
        { id: 'gold', img: 'gold', z: 3, pos: [0.5, 0.45], anchor: [0.5, 0.5], h: (images.gold.height / app.dpr) / H, visible: false },
      ],
      beats: [
        { id: 'strike', type: 'strike', dur: 3,
          frames: [{ f: 0, layer: 'board', smear: { sx: 1.1, sy: 0.6, lines: 8 } }, { f: 2, layer: 'board', visible: false }, { f: 2, layer: 'gold', visible: true }] },
        { id: 'impact', type: 'impact', dur: 18,
          fx: [{ at: 0, fx: 'flash', alpha: 0.7, decay: 15 }, { at: 0, fx: 'shake', amp: 6, dur: 8 },
               { at: 0, fx: 'particles', preset: 'spark', n: 28, origin: [0.5, 0.45], z: 5 }, { at: 0, fx: 'star', origin: [0.5, 0.45], size: 0.12, z: 5 },
               { at: 0, fx: 'camera', steps: [1.08, 1.18, 1.3], stepDur: 3, focus: [0.5, 0.45] }, { at: 0, sfx: 'dong' }] },
        { id: 'pose', type: 'pose', dur: 60,
          frames: [{ f: 0, layer: 'rays', visible: true }],
          tracks: [{ layer: 'rays', prop: 'scale', from: 1, to: 1.08, dur: 60, ease: 'linear' }],
          fx: [{ at: 0, fx: 'camera', to: 1, dur: 10, ease: 'out', focus: [0.5, 0.45] },
               { at: 8, fx: 'text', str: head, in: 'pop', pos: [0.5, 0.71], size: 40, color: PAPER, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 6, dur: 52 },
               { at: 12, fx: 'text', str: sub, in: 'fade', pos: [0.5, 0.78], size: 16, color: PAPER, stroke: 'rgba(0,0,0,0.35)', strokeWidth: 4, dur: 48 },
               { at: 0, fx: 'particles', preset: 'dust', n: 20, z: 4, dur: 60 }, { at: 8, sfx: 'chord' }] },
      ],
    };
    return app.playCut(tl, images, opts);
  };

  app.cutTileImg = tileImg;
};
