// 界面布局表（2026-11-22，给「界面编辑模式」用，见 ../../00_界面编辑器/README.md）。
// 每个能摆的界面元素一个 id；位置按设计稿算：宽 375，内容区从 top=48（刘海下）到 bottom=778（底部安全区上）。
// 锚点：ax 横向 l 贴左 / r 贴右 / c 居中 / s 左右拉满（两边留边）；ay 纵向 t 贴顶 / b 贴底 / m 居中。
// 换手机时：位置按宽、高各自的比例挪，大小按两个比例里小的那个缩（矮屏 iPhone SE 整体缩小，不会叠在一起）。
// Cc 在编辑器里摆好的结果存在 原型/layout.json，打包时生成 js/layout_data.js，这里盖在默认值上。
// 这个文件只管算位置，编辑器本身不进微信包。
const REF = { W: 375, top: 48, bottom: 778 };

const DEFS = {
  // 主页
  'home.title': { name: '游戏名', screen: 'home', x: 87, y: 69, w: 200, h: 44, ax: 'c', ay: 't' },
  'home.main': { name: '大按钮', screen: 'home', x: 52, y: 568, w: 270, h: 62, ax: 'c', ay: 'b' },
  'home.link': { name: '小字（换难度）', screen: 'home', x: 117, y: 634, w: 140, h: 44, ax: 'c', ay: 'b' },
  'home.daily': { name: '今日', screen: 'home', x: 18, y: 700, w: 64, h: 70, ax: 'l', ay: 'b' },
  'home.more': { name: '更多', screen: 'home', x: 293, y: 700, w: 64, h: 70, ax: 'r', ay: 'b' },
  // 棋盘（局内）
  'play.info': { name: '错误 / 分数 / 时间', screen: 'play', x: 0, y: 92, w: 375, h: 30, ax: 's', ay: 't' },
  'play.focus': { name: '本局一招', screen: 'play', x: 92, y: 130, w: 190, h: 30, ax: 'c', ay: 't' },
  'play.board': { name: '棋盘', screen: 'play', x: 12, y: 176, w: 351, h: 351, ax: 'c', ay: 'm' },
  'play.hint': { name: '提示卡（出提示时才有）', screen: 'play', x: 12, y: 537, w: 351, h: 64, ax: 's', ay: 'm' },
  'play.tools': { name: '工具（撤销 / 橡皮 / 笔记 / 提示）', screen: 'play', x: 8, y: 622, w: 359, h: 62, ax: 's', ay: 'b' },
  'play.pad': { name: '数字键', screen: 'play', x: 8, y: 692, w: 359, h: 72, ax: 's', ay: 'b' },
  // 结算
  'result.icon': { name: '顶上的勾 / 金方块', screen: 'result', x: 153, y: 80, w: 68, h: 68, ax: 'c', ay: 't' },
  'result.head': { name: '完成！+ 难度', screen: 'result', x: 40, y: 154, w: 295, h: 70, ax: 'c', ay: 't' },
  'result.score': { name: '分数', screen: 'result', x: 87, y: 240, w: 200, h: 72, ax: 'c', ay: 't' },
  'result.stats': { name: '数据卡（用时 / 最好 / 错误 / 连胜）', screen: 'result', x: 16, y: 324, w: 343, h: 170, ax: 's', ay: 't' },
  'result.share': { name: '发给朋友挑战', screen: 'result', x: 16, y: 512, w: 343, h: 54, ax: 's', ay: 't' },
  'result.again': { name: '再来一局', screen: 'result', x: 16, y: 576, w: 166, h: 50, ax: 'c', ay: 't' },
  'result.home': { name: '回首页', screen: 'result', x: 193, y: 576, w: 166, h: 50, ax: 'c', ay: 't' },
  'result.theme': { name: '看视频解锁主题', screen: 'result', x: 16, y: 640, w: 343, h: 50, ax: 's', ay: 't' },
};

let data = {};
try { data = (require('./layout_data.js') || {}).elements || {}; } catch (e) { data = {}; }

let M = { W: REF.W, top: REF.top, bottom: REF.bottom };
const used = {}; // 这一帧画了哪些元素（编辑器用来画框）

function setMetrics(W, top, bottom) { M = { W, top, bottom }; }
function transform() {
  const sx = M.W / REF.W, sy = (M.bottom - M.top) / (REF.bottom - REF.top);
  return { sx, sy, s: Math.min(sx, sy), W: M.W, top: M.top, bottom: M.bottom, mid: (M.top + M.bottom) / 2, ref: REF };
}
function def(id) {
  const d = DEFS[id];
  if (!d) throw new Error('布局表里没有 ' + id);
  return Object.assign({}, d, data[id] || {});
}
// 设计稿坐标 → 这台手机上的坐标（逻辑像素）
function rect(id) {
  const d = def(id), T = transform();
  let x, w;
  if (d.ax === 's') { x = d.x * T.sx; w = T.W - (REF.W - d.w) * T.sx; }
  else {
    w = d.w * T.s;
    if (d.ax === 'l') x = d.x * T.sx;
    else if (d.ax === 'r') x = T.W - (REF.W - d.x - d.w) * T.sx - w;
    else x = T.W / 2 + (d.x + d.w / 2 - REF.W / 2) * T.sx - w / 2;
  }
  const h = d.h * T.s;
  let y;
  if (d.ay === 't') y = T.top + (d.y - REF.top) * T.sy;
  else if (d.ay === 'b') y = T.bottom - (REF.bottom - d.y - d.h) * T.sy - h;
  else y = T.mid + (d.y + d.h / 2 - (REF.top + REF.bottom) / 2) * T.sy - h / 2;
  const r = { x, y, w, h };
  used[id] = r;
  return r;
}
// 元素里的字跟着框缩放：框现在的高 ÷ 默认的高（换小手机变小；Cc 把框拉大，字也变大）
function k(id, r) { return Math.max(0.6, Math.min(1.6, r.h / DEFS[id].h)); }
function beginFrame() { for (const k in used) delete used[k]; }
// 编辑器在浏览器里改布局时用（游戏本身不调）
function setData(elements) { data = elements || {}; }
function getData() { return data; }

module.exports = { REF, DEFS, rect, def, k, transform, setMetrics, beginFrame, used, setData, getData };
