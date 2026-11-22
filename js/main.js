// 总调度：画布、帧循环（没东西动就不重画，省电不发热）、触摸分发、场景切换、弹层、提示条。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');
const store = require('./store.js');
const Paper = require('./paper.js');

const app = {
  scenes: {}, scene: null, sceneName: '', overlays: [], toasts: [],
  dirty: true, animUntil: 0, now: P.now(),
};
const env = P.setup(onTouch);
Object.assign(app, { W: env.width, H: env.height, dpr: env.dpr, ctx: env.ctx, canvas: env.canvas });

// 顶栏位置：和微信胶囊按钮对齐，右边让开胶囊
const HEADER_H = 44;
if (env.capsule) {
  app.headerY = Math.round((env.capsule.top + env.capsule.bottom) / 2 - HEADER_H / 2);
  app.headerRight = env.capsule.left - 6;
} else {
  app.headerY = env.safeTop + 4;
  app.headerRight = app.W;
}
app.headerH = HEADER_H;
app.bottom = app.H - Math.max(env.safeBottom, 0);
// 界面布局表：按这台手机的宽和内容区上下边算位置
const LY = require('./layout.js');
LY.setMetrics(app.W, app.headerY, app.bottom);

// 当前主题（颜色 + 质地一整套）
Object.defineProperty(app, 'th', {
  get() { return C.THEMES.find((t) => t.id === store.data.settings.theme) || C.THEMES[0]; },
});
// 卡片也铺上这个主题的质地
ui.setTexture((ctx, x, y, w, h) => Paper.fill(ctx, app.th.cardTexture, app.dpr, !!app.th.pageDark, x, y, w, h));

// ---------- 动静 ----------
app.redraw = () => { app.dirty = true; };
app.animate = (ms) => { app.animUntil = Math.max(app.animUntil, P.now() + ms); };
app.sound = (name, vol) => { if (store.data.settings.sound) P.sound(name, vol); };
app.buzz = (kind) => P.vibrate(kind);
app.toast = (msg, ms) => {
  app.toasts = [{ msg, t0: P.now(), dur: ms || 1800 }];
  app.animate((ms || 1800) + 50);
};
P.setMuted(!store.data.settings.sound);
P.setVibrate(store.data.settings.vibrate);

// ---------- 场景、弹层 ----------
app.go = (name, args) => {
  if (app.scene && app.scene.leave) app.scene.leave();
  app.overlays = [];
  app.sceneName = name;
  app.scene = app.scenes[name];
  if (app.scene.enter) app.scene.enter(args || {});
  app.sceneT0 = P.now();
  app.animate(260);
  app.redraw();
};
app.push = (overlay) => {
  overlay.t0 = P.now();
  app.overlays.push(overlay);
  if (overlay.enter) overlay.enter();
  app.animate(300);
  app.redraw();
};
app.pop = () => {
  const o = app.overlays.pop();
  if (o && o.leave) o.leave();
  app.animate(200);
  app.redraw();
};
app.top = () => app.overlays[app.overlays.length - 1] || null;

// 标准顶栏：返回键 + 标题 (+ 右边一个按钮)
app.header = (ctx, title, onBack, right) => {
  const th = app.th, y = app.headerY, h = app.headerH;
  if (onBack) {
    const on = ui.button({ id: 'hdr-back', x: 4, y, w: 48, h, onTap: onBack });
    if (on) ui.fillRR(ctx, 8, y + 4, 36, 36, 18, th.soft);
    ui.icons.back(ctx, 26, y + h / 2, 22, th.text);
  }
  if (title) ui.text(ctx, title, app.W / 2, y + h / 2, 17, th.text, 'center', 600);
  if (right) right(ctx, y, h);
};

// ---------- 帧循环 ----------
let last = P.now();
function frame() {
  const t = P.now();
  const dt = Math.min(100, t - last);
  last = t;
  app.now = t;
  if (app.scene && app.scene.update) app.scene.update(dt, t);
  const live = app.dirty || t < app.animUntil || (app.scene && app.scene.live && app.scene.live(t)) || app.overlays.some((o) => o.live && o.live(t));
  if (live) render(t);
  P.nextFrame(frame);
}
function render(t) {
  const ctx = app.ctx, th = app.th;
  ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, app.W, app.H);
  Paper.fill(ctx, th.texture, app.dpr, !!th.pageDark, 0, 0, app.W, app.H);
  ui.beginFrame();
  LY.beginFrame();
  // 换场景：淡入 + 轻轻上移 8 像素
  const p = Math.min(1, (t - (app.sceneT0 || 0)) / 220);
  ctx.save();
  if (p < 1) { ctx.globalAlpha = ui.ease.out(p); ctx.translate(0, (1 - ui.ease.out(p)) * 8); }
  if (app.scene) app.scene.draw(ctx, t);
  ctx.restore();
  for (const o of app.overlays) {
    // 盖一层：挡住下面的按钮
    ui.button({ id: 'blocker-' + app.overlays.indexOf(o), x: 0, y: 0, w: app.W, h: app.H, onTap: o.onBackdrop || null });
    o.draw(ctx, t, Math.min(1, (t - o.t0) / 240));
  }
  drawToasts(ctx, t);
  app.dirty = false;
}
function drawToasts(ctx, t) {
  app.toasts = app.toasts.filter((x) => t - x.t0 < x.dur);
  for (const x of app.toasts) {
    const p = (t - x.t0) / x.dur;
    const a = p < 0.1 ? p / 0.1 : p > 0.85 ? (1 - p) / 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = ui.font(15, 500);
    const maxW = app.W - 64;
    const lines = [];
    String(x.msg).split('\n').forEach((para) => {
      let line = '';
      for (const ch of para) { if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; }
      lines.push(line);
    });
    const w = Math.min(app.W - 40, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36);
    const h = 20 + lines.length * 22;
    const y = app.H * 0.42;
    ui.fillRR(ctx, app.W / 2 - w / 2, y, w, h, Math.min(21, h / 2), 'rgba(30,34,42,0.88)');
    lines.forEach((l, i) => ui.text(ctx, l, app.W / 2, y + 21 + i * 22, 15, '#FFFFFF', 'center', 500));
    ctx.restore();
  }
}

// ---------- 触摸 ----------
let activeId = null;
function onTouch(type, id, x, y) {
  if (type === 'down') {
    if (activeId !== null) return; // 只认第一根手指
    activeId = id;
    const r = ui.down(x, y);
    if (r && (r.onTap || r.onDown) && !r.silent) app.buzz('light');
    if (!r && app.scene && app.scene.onDown && !app.overlays.length) app.scene.onDown(x, y);
    if (app.scene && app.scene.onDrag && !app.overlays.length) app.scene.onDrag('down', x, y);
    app.redraw();
  } else if (id === activeId) {
    if (type === 'move') {
      if (app.scene && app.scene.onDrag && !app.overlays.length) app.scene.onDrag('move', x, y);
      return;
    }
    activeId = null;
    const dragged = app.scene && app.scene.onDrag && !app.overlays.length ? app.scene.onDrag('up', x, y) : false;
    if (type === 'cancel' || dragged) ui.cancel();
    else ui.up(x, y);
    app.redraw();
  }
}

// ---------- 切到后台：暂停、存档 ----------
P.onHide(() => {
  if (app.scene && app.scene.onHide) app.scene.onHide();
  store.save();
});
P.enableShare('来一局数独：每天一题，脑子动一动');

// ---------- 场景注册 ----------
require('./scene_home.js')(app);
require('./scene_play.js')(app);
require('./scene_lesson.js')(app);
require('./scene_pages.js')(app);
require('./overlays.js')(app);
require('./scene_look.js')(app);
require('./scene_welcome.js')(app);
require('./scene_challenge.js')(app);
require('./cuts.js')(app);

// 朋友点挑战卡进来：直接到那一题的挑战页
if (!app.openChallenge(P.launchQuery())) {
  if (!store.data.seen.tutorial) {
    app.go('welcome');
    // 第一次打开：开场过场（黑 → 那一块亮起来 → 主页图和游戏名亮相），播完露出「你玩过数独吗？」
    if (!store.data.seen.open) app.cutOpen();
  } else app.go('home');
}
P.onShow((q) => { if (q && q.c) app.openChallenge(q); });
frame();

// 给机器人测试用（只在浏览器里挂）
P.exposeForTest('__app', app);
P.exposeForTest('__store', store);
P.exposeForTest('__regions', ui.allRegions);
P.exposeForTest('__layout', LY);
