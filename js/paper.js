// 质地：每种材质用代码画成一块 256×256 的透明小图（四边接得上），画一次缓存，每帧铺满（十几次贴图，很便宜）。
// 用哪种质地由主题决定（config.js 的 THEMES），玩家不单独选（Cc 0.3：「颜色加质地不要有额外可配置的选项」）。
const P = require('./platform.js');

const TILE = 256;
const tiles = {};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const col = (rgb, a) => 'rgba(' + rgb + ',' + Math.max(0, a).toFixed(3) + ')';

// dark：深色底上，颗粒、纤维用浅色
function tile(texture, dpr, dark) {
  const key = texture + '|' + dpr + '|' + (dark ? 1 : 0);
  if (key in tiles) return tiles[key];
  if (!texture || texture === 'flat') { tiles[key] = null; return null; }
  const c = P.makeCanvas(Math.round(TILE * dpr), Math.round(TILE * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r = rng(texture.length * 977 + texture.charCodeAt(0) * 31);
  const INK = dark ? '255,255,255' : '60,45,30';
  // 在 (x,y) 画，越过边界的部分在对边再画一次，四边才接得上
  const wrap = (x, y, pad, fn) => {
    for (const dx of [0, x < pad ? TILE : x > TILE - pad ? -TILE : 0]) for (const dy of [0, y < pad ? TILE : y > TILE - pad ? -TILE : 0]) fn(x + dx, y + dy);
  };
  const speck = (n, a, rgb, size) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = col(rgb || INK, a * (0.35 + r() * 0.65));
      const s = (size || 1) * (r() < 0.85 ? 0.6 : 1.2);
      g.fillRect(r() * TILE, r() * TILE, s, s);
    }
  };
  const blotch = (n, a, rgb, rMin, rMax) => {
    for (let i = 0; i < n; i++) {
      const rad = (rMin || 30) + r() * ((rMax || 90) - (rMin || 30));
      wrap(r() * TILE, r() * TILE, rad, (x, y) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col(rgb || INK, a));
        gr.addColorStop(0.5, col(rgb || INK, a * 0.55));
        gr.addColorStop(1, col(rgb || INK, 0));
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      });
    }
  };
  const fibers = (n, a, lenMin, lenMax, rgb) => {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const len = lenMin + r() * (lenMax - lenMin), ang = r() * Math.PI, bend = (r() - 0.5) * len * 0.5;
      const alpha = a * (0.4 + r() * 0.6), w = 0.35 + r() * 0.55;
      wrap(r() * TILE, r() * TILE, len, (x, y) => {
        g.strokeStyle = col(rgb || INK, alpha);
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend, y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        g.stroke();
      });
    }
  };
  // 横向的波浪线（木纹、拉丝）：周期是 TILE 的整数分之一，左右接得上
  const wave = (y0, amp, k, ph, w, color) => {
    for (const dy of [0, -TILE, TILE]) {
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      for (let x = 0; x <= TILE; x += 4) {
        const y = y0 + dy + amp * Math.sin((Math.PI * 2 * k * x) / TILE + ph) + amp * 0.35 * Math.sin((Math.PI * 2 * (k + 1) * x) / TILE + ph * 1.7);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  };

  switch (texture) {
    case 'grain': // 纸纹
      blotch(4, 0.01, null, 70, 120);
      speck(2600, 0.07);
      break;
    case 'hand': // 手写纸：纸纹 + 纤维
      blotch(4, 0.012, null, 70, 120);
      speck(3000, 0.085);
      fibers(150, 0.11, 4, 14);
      break;
    case 'notebook': { // 横线本：纸纹 + 每 32 像素一条浅蓝横线
      blotch(3, 0.01, null, 70, 120);
      speck(2200, 0.07);
      fibers(70, 0.08, 4, 12);
      g.strokeStyle = 'rgba(70,115,190,0.22)';
      g.lineWidth = 0.8;
      for (let y = 16; y < TILE; y += 32) { g.beginPath(); g.moveTo(0, y + 0.4); g.lineTo(TILE, y + 0.4); g.stroke(); }
      break;
    }
    case 'chalk': // 黑板：擦过的粉笔灰一团团 + 细小粉笔点 + 几道擦痕
      blotch(6, 0.018, '255,255,255', 50, 110);
      speck(2600, 0.085, '255,255,255');
      // 擦痕：拉长的柔边椭圆（圆形渐变压扁再转个角度），边缘看不出来
      for (let i = 0; i < 22; i++) {
        const len = 30 + r() * 60, w = 8 + r() * 12, ang = r() * Math.PI, a = 0.02 + r() * 0.025;
        wrap(r() * TILE, r() * TILE, len, (x, y) => {
          g.save();
          g.translate(x, y); g.rotate(ang); g.scale(len / w, 1);
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, w);
          gr.addColorStop(0, col('255,255,255', a));
          gr.addColorStop(0.6, col('255,255,255', a * 0.45));
          gr.addColorStop(1, col('255,255,255', 0));
          g.fillStyle = gr;
          g.fillRect(-w, -w, w * 2, w * 2);
          g.restore();
        });
      }
      break;
    case 'wood': // 深色胡桃木：深浅交替的长木纹
    case 'woodLight': { // 浅色枫木
      const light = texture === 'woodLight';
      for (let i = 0; i < 70; i++) {
        const darker = r() < 0.6;
        const a = light ? (darker ? 0.05 + r() * 0.08 : 0.04 + r() * 0.05) : (darker ? 0.08 + r() * 0.12 : 0.03 + r() * 0.05);
        wave(r() * TILE, 1 + r() * 5, 1 + Math.floor(r() * 3), r() * 6, 0.4 + r() * 2.2, col(darker ? (light ? '120,75,30' : '20,10,4') : '255,235,200', a));
      }
      speck(900, light ? 0.06 : 0.08, light ? '110,70,30' : '20,10,4');
      break;
    }
    case 'rice': // 宣纸：长纤维 + 淡淡的墨晕
      blotch(4, 0.014, '50,40,30', 70, 120);
      speck(1800, 0.06);
      fibers(90, 0.065, 10, 26, '120,100,70');
      fibers(70, 0.06, 4, 10);
      break;
    case 'kraft': // 牛皮纸：密的深色颗粒 + 纤维
      blotch(5, 0.02, '70,45,20', 60, 120);
      speck(4200, 0.1, '60,38,18');
      speck(900, 0.08, '255,240,210');
      fibers(220, 0.13, 5, 18, '70,45,20');
      break;
    case 'metal': // 拉丝金属：密密的横向细纹，亮暗交替
      for (let i = 0; i < 520; i++) {
        const y = r() * TILE, x = r() * TILE, len = 30 + r() * 160, bright = r() < 0.5;
        const a = 0.04 + r() * 0.08;
        g.strokeStyle = col(bright ? '255,255,255' : '40,50,60', a);
        g.lineWidth = 0.5 + r() * 0.6;
        for (const dx of [0, -TILE]) { g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x + dx + len, y); g.stroke(); }
      }
      break;
    default:
      break;
  }
  tiles[key] = c;
  return c;
}

// 在 (x,y,w,h) 这块里铺满质地（调用前自己 clip 好形状）。从屏幕原点对齐，棋盘和页面的纹理接得上
function fill(ctx, texture, dpr, dark, x, y, w, h) {
  const t = tile(texture, dpr, dark);
  if (!t) return;
  const px = t.width;
  const x0 = Math.floor(x / TILE) * TILE, y0 = Math.floor(y / TILE) * TILE;
  for (let ty = y0; ty < y + h; ty += TILE) {
    for (let tx = x0; tx < x + w; tx += TILE) ctx.drawImage(t, 0, 0, px, px, tx, ty, TILE, TILE);
  }
}

// '#RRGGBB' → 'rgba(r,g,b,a)'
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

module.exports = { tile, fill, rgba, TILE };
