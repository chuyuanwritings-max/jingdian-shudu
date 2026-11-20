// 平台层：只有这个文件知道自己跑在微信里还是浏览器里。
// 微信小游戏：wx.createCanvas / wx.onTouchStart / wx.createRewardedVideoAd / 开放数据域（好友榜）
// 浏览器预览：一张 <canvas id="game">，只用 pointer 事件（免得一次点击被算两次）
const isWx = typeof wx !== 'undefined' && wx && typeof wx.createCanvas === 'function';

function setup(onTouch) {
  let canvas, width, height, dpr, safeTop = 0, safeBottom = 0, capsule = null;
  if (isWx) {
    canvas = wx.createCanvas();
    const info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync();
    width = info.windowWidth;
    height = info.windowHeight;
    dpr = info.pixelRatio || 2;
    if (info.safeArea) {
      safeTop = info.safeArea.top || 0;
      safeBottom = Math.max(0, height - info.safeArea.bottom);
    } else safeTop = info.statusBarHeight || 20;
    // 右上角是微信的胶囊按钮：顶栏和它对齐，右边让出它的位置
    try {
      const m = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (m && m.bottom) capsule = { left: m.left, top: m.top, bottom: m.bottom };
    } catch (e) {}
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const send = (type) => (e) => {
      const list = e.changedTouches || [];
      for (let i = 0; i < list.length; i++) onTouch(type, list[i].identifier, list[i].clientX, list[i].clientY);
    };
    wx.onTouchStart((e) => { unlockAudio(); send('down')(e); });
    wx.onTouchMove(send('move'));
    wx.onTouchEnd(send('up'));
    wx.onTouchCancel(send('cancel'));
  } else {
    canvas = document.getElementById('game');
    // 电脑上预览时装成一部手机大小；手机浏览器里就占满屏
    const phone = window.innerWidth > 520;
    width = phone ? 390 : window.innerWidth;
    height = phone ? Math.min(844, window.innerHeight - 20) : window.innerHeight;
    dpr = Math.min(3, window.devicePixelRatio || 2);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!phone) safeBottom = 8;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      unlockAudio();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      const p = pos(e);
      onTouch('down', e.pointerId, p[0], p[1]);
    });
    canvas.addEventListener('pointermove', (e) => { const p = pos(e); onTouch('move', e.pointerId, p[0], p[1]); });
    canvas.addEventListener('pointerup', (e) => { const p = pos(e); onTouch('up', e.pointerId, p[0], p[1]); });
    canvas.addEventListener('pointercancel', (e) => { const p = pos(e); onTouch('cancel', e.pointerId, p[0], p[1]); });
  }
  return { canvas, ctx: canvas.getContext('2d'), width, height, dpr, safeTop, safeBottom, capsule };
}

function makeCanvas(w, h) {
  const c = isWx ? wx.createCanvas() : document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const now = () => Date.now();
const nextFrame = (fn) => requestAnimationFrame(fn);

// 切到后台 / 回到前台（自动暂停计时）
function onHide(fn) {
  if (isWx) { if (wx.onHide) wx.onHide(fn); }
  else if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
}

// 震动：light 每次有效点击，heavy 填错
function vibrate(kind) {
  if (!vibrateOn) return;
  if (isWx && wx.vibrateShort) wx.vibrateShort({ type: kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light', fail() {} });
  else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 25 : kind === 'medium' ? 12 : 6);
}
let vibrateOn = true;
function setVibrate(v) { vibrateOn = !!v; }

// 激励视频。填了广告位 id 且在微信里才放真广告，返回 true；否则返回 false，由游戏自己放假倒计时。
const ads = {};
function showRewardedAd(adUnitId, onReward, onSkip) {
  if (!isWx || !adUnitId || !wx.createRewardedVideoAd) return false;
  if (!ads[adUnitId]) ads[adUnitId] = wx.createRewardedVideoAd({ adUnitId });
  const ad = ads[adUnitId];
  ad.offClose();
  ad.onClose((res) => { if (!res || res.isEnded) onReward(); else onSkip(); });
  ad.show().catch(() => { ad.load().then(() => ad.show()).catch(() => onReward()); });
  return true;
}

// ---------- 好友排行榜（微信开放数据域） ----------
// 微信规定：好友的分数只能在「开放数据域」那张专门的画布里画，主游戏拿不到。
// 这里只负责：① 上传自己的最好成绩 ② 叫开放数据域画某一张榜 ③ 把那张画布拿来贴到屏幕上
const hasOpenData = isWx && typeof wx.getOpenDataContext === 'function';
function uploadScore(key, score, extra) {
  if (!isWx || !wx.setUserCloudStorage) return;
  const value = JSON.stringify({ wxgame: { score, update_time: Math.floor(Date.now() / 1000) }, extra: extra || {} });
  wx.setUserCloudStorage({ KVDataList: [{ key, value }], fail() {} });
}
function openDataCanvas() {
  return hasOpenData ? wx.getOpenDataContext().canvas : null;
}
function postOpenData(msg) {
  if (hasOpenData) wx.getOpenDataContext().postMessage(msg);
}
function enableShare(title) {
  if (!isWx) return;
  if (wx.showShareMenu) wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'], fail() {} });
  if (wx.onShareAppMessage) wx.onShareAppMessage(() => ({ title }));
}

// ---------- 声音 ----------
const sfx = require('./sfx.js');
let audio = null;
const buffers = {};
let muted = false;
function audioCtx() {
  if (audio !== null) return audio;
  try {
    if (isWx && wx.createWebAudioContext) audio = wx.createWebAudioContext();
    else if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) audio = new (window.AudioContext || window.webkitAudioContext)();
    else audio = false;
  } catch (e) { audio = false; }
  return audio;
}
function unlockAudio() {
  const a = audioCtx();
  if (a && a.state === 'suspended' && a.resume) a.resume();
}
function sound(name, volume) {
  if (muted) return;
  const a = audioCtx();
  if (!a) return;
  try {
    if (!buffers[name]) {
      const sr = 22050;
      const data = sfx.make(name, sr);
      if (!data) return;
      const buf = a.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      buffers[name] = buf;
    }
    const src = a.createBufferSource();
    src.buffer = buffers[name];
    const g = a.createGain();
    g.gain.value = volume === undefined ? 0.5 : volume;
    src.connect(g);
    g.connect(a.destination);
    src.start(0);
  } catch (e) {}
}
function setMuted(v) { muted = !!v; }

// ---------- 存档 ----------
function load(key) {
  try {
    const raw = isWx ? wx.getStorageSync(key) : window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function save(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (isWx) wx.setStorageSync(key, raw);
    else window.localStorage.setItem(key, raw);
  } catch (e) {}
}
function exposeForTest(name, value) {
  if (!isWx && typeof window !== 'undefined') window[name] = value;
}

module.exports = {
  isWx, setup, makeCanvas, now, nextFrame, onHide, vibrate, setVibrate, showRewardedAd,
  hasOpenData, uploadScore, openDataCanvas, postOpenData, enableShare,
  load, save, exposeForTest, sound, unlockAudio, setMuted,
};
