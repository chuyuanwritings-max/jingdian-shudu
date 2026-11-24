// 假装成微信小游戏环境跑 game.js：没有 document、没有 window，只有 wx。
// 能跑完 = 代码里没偷偷用网页才有的东西。然后满屏乱点 3000 下，看会不会报错。用法：node test/wx-smoke.js
const path = require('path');
const calls = new Set();
const ctx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
    return (...a) => { calls.add(k); };
  },
  set(t, k, v) { t[k] = v; return true; },
});
const handlers = {};
const store = {};
let frames = [];
let uploads = 0;
global.wx = {
  createCanvas: () => ({ width: 0, height: 0, getContext: () => ctx }),
  getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 47, bottom: 810 } }),
  getMenuButtonBoundingClientRect: () => ({ left: 296, top: 51, bottom: 83, right: 383 }),
  onTouchStart: (f) => (handlers.down = f),
  onTouchMove: (f) => (handlers.move = f),
  onTouchEnd: (f) => (handlers.up = f),
  onTouchCancel: () => {},
  onHide: (f) => (handlers.hide = f),
  vibrateShort: () => {},
  getStorageSync: (k) => store[k] || '',
  setStorageSync: (k, v) => { store[k] = v; },
  setUserCloudStorage: () => { uploads++; },
  showShareMenu: () => {},
  onShareAppMessage: () => {},
};
global.requestAnimationFrame = (f) => frames.push(f);
if (typeof global.document !== 'undefined' || typeof global.window !== 'undefined') throw new Error('环境不干净');

require(path.join(__dirname, '..', 'game.js'));
const run = (n) => { for (let i = 0; i < n; i++) { const f = frames.shift(); if (f) f(); } };
run(5);
const touch = (type, x, y) => handlers[type]({ changedTouches: [{ identifier: 1, clientX: x, clientY: y }] });
let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let i = 0; i < 3000; i++) {
  const x = rnd() * 390, y = rnd() * 844;
  touch('down', x, y); run(1); touch('up', x, y); run(2);
  if (i % 500 === 0) handlers.hide && handlers.hide();
}
run(100);
console.log('微信环境跑通：乱点 3000 下没报错，画图调用 ' + calls.size + ' 种，存档 ' + Object.keys(store).length + ' 个键');
if (!handlers.down || !calls.has('fillText')) throw new Error('没画出东西或没注册触摸');

// 包体：按 project.config.json 的忽略表算进微信包的文件，超过主包上限就报错（检验报告 A3：上限要写进冒烟测试）
{
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const ign = (JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).packOptions || {}).ignore || [];
  const skip = (rel, dir) => rel.startsWith('.') || rel === 'node_modules' || ign.some((i) => (i.type === 'folder') === dir && i.value === rel);
  let bytes = 0, files = 0;
  const walk = (d, pre) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const rel = pre + e.name;
    if (skip(rel, e.isDirectory())) return;
    if (e.isDirectory()) walk(path.join(d, e.name), rel + '/');
    else { bytes += fs.statSync(path.join(d, e.name)).size; files++; }
  });
  walk(root, '');
  const LIMIT = 3.5 * 1024 * 1024;
  console.log('微信包：' + files + ' 个文件，' + (bytes / 1024 / 1024).toFixed(2) + ' MB（上限 3.5 MB）');
  if (bytes > LIMIT) throw new Error('主包超过 3.5 MB');
}
