// 纸张：背景颜色 × 质地，两样分开选（Cc 0.2：「白色背景稍微有一点晃眼……能不能像是手写纸的质感」）。
// 质地是一块 256×256 的透明小图，画一次缓存起来，每帧铺满屏幕（十几次贴图，很便宜）。
const P = require('./platform.js');

// 背景颜色：页面底色 bg、棋盘和卡片的纸色 board。都避开纯白，不晃眼（纯白留一个给喜欢的人）
const PAPERS = [
  { id: 'cream', name: '米白', bg: '#F1EEE6', board: '#FBF9F3' },
  { id: 'rice', name: '宣纸', bg: '#ECE3D0', board: '#F7F0E1' },
  { id: 'green', name: '护眼绿', bg: '#E2EBDC', board: '#F0F5EC' },
  { id: 'blue', name: '雾蓝', bg: '#E2E8F0', board: '#F0F3F7' },
  { id: 'gray', name: '浅灰', bg: '#E7E7E9', board: '#F4F4F5' },
  { id: 'pink', name: '樱粉', bg: '#F1E4E3', board: '#F9F1F0' },
  { id: 'white', name: '纯白', bg: '#F6F4EF', board: '#FFFFFF' },
];

// 质地
const TEXTURES = [
  { id: 'flat', name: '纯色' },
  { id: 'grain', name: '纸纹' },
  { id: 'hand', name: '手写纸' }, // 纸纹 + 纤维 + 棋盘线像铅笔手画
  { id: 'grid', name: '方格本' },
  { id: 'linen', name: '布纹' },
];

const TILE = 256;
const tiles = {};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// dark：深色底上用浅色颗粒
function tile(texture, dpr, dark) {
  const key = texture + '|' + dpr + '|' + (dark ? 1 : 0);
  if (key in tiles) return tiles[key];
  if (texture === 'flat') { tiles[key] = null; return null; }
  const c = P.makeCanvas(Math.round(TILE * dpr), Math.round(TILE * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(texture.length * 977 + 13);
  const ink = dark ? '255,255,255' : '60,45,30';
  // 颗粒：几千个很淡的小点
  const speck = (n, a) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = 'rgba(' + ink + ',' + (a * (0.4 + r() * 0.6)).toFixed(3) + ')';
      const s = r() < 0.85 ? 0.6 : 1.1;
      g.fillRect(r() * TILE, r() * TILE, s, s);
    }
  };
  // 斑：几团很大很淡的深浅，让纸面不那么匀
  const blotch = (n, a) => {
    for (let i = 0; i < n; i++) {
      const x = r() * TILE, y = r() * TILE, rad = 30 + r() * 60;
      for (const dx of [-TILE, 0, TILE]) for (const dy of [-TILE, 0, TILE]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, 'rgba(' + ink + ',' + a + ')');
        gr.addColorStop(1, 'rgba(' + ink + ',0)');
        g.fillStyle = gr;
        g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
  };
  // 纤维：短短的弯线
  const fibers = (n, a) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * TILE, y = r() * TILE, len = 4 + r() * 12, ang = r() * Math.PI;
      g.strokeStyle = 'rgba(' + ink + ',' + (a * (0.5 + r() * 0.5)).toFixed(3) + ')';
      g.lineWidth = 0.4 + r() * 0.5;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 4, y + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 4, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
  };
  const k = dark ? 0.7 : 1;
  if (texture === 'grain') { blotch(5, 0.018 * k); speck(2600, 0.07 * k); }
  else if (texture === 'hand') { blotch(7, 0.03 * k); speck(3200, 0.09 * k); fibers(160, 0.12 * k); }
  else if (texture === 'grid') {
    speck(1400, 0.05 * k);
    g.strokeStyle = 'rgba(' + (dark ? '255,255,255' : '70,110,170') + ',' + (0.09 * k) + ')';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i <= TILE; i += 16) { g.moveTo(i + 0.3, 0); g.lineTo(i + 0.3, TILE); g.moveTo(0, i + 0.3); g.lineTo(TILE, i + 0.3); }
    g.stroke();
  } else if (texture === 'linen') {
    g.lineWidth = 0.5;
    for (let i = 0; i < TILE; i += 2) {
      g.strokeStyle = 'rgba(' + ink + ',' + ((0.02 + r() * 0.035) * k).toFixed(3) + ')';
      g.beginPath(); g.moveTo(0, i + 0.25); g.lineTo(TILE, i + 0.25); g.stroke();
      g.strokeStyle = 'rgba(' + ink + ',' + ((0.02 + r() * 0.035) * k).toFixed(3) + ')';
      g.beginPath(); g.moveTo(i + 0.25, 0); g.lineTo(i + 0.25, TILE); g.stroke();
    }
    speck(800, 0.05 * k);
  }
  tiles[key] = c;
  return c;
}

// 在 (x,y,w,h) 这块里铺满质地（调用前自己 clip 好形状）
function fill(ctx, texture, dpr, dark, x, y, w, h) {
  const t = tile(texture, dpr, dark);
  if (!t) return;
  const px = t.width;
  // 从屏幕原点对齐，棋盘和页面的纹理接得上
  const x0 = Math.floor(x / TILE) * TILE, y0 = Math.floor(y / TILE) * TILE;
  for (let ty = y0; ty < y + h; ty += TILE) {
    for (let tx = x0; tx < x + w; tx += TILE) ctx.drawImage(t, 0, 0, px, px, tx, ty, TILE, TILE);
  }
}

const paperOf = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];

// '#RRGGBB' → 'rgba(r,g,b,a)'：棋盘高亮用半透明，任何纸色、质地都透得出来
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

module.exports = { PAPERS, TEXTURES, tile, fill, paperOf, rgba, TILE };
