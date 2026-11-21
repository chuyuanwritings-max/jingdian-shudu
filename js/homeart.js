// 主页图：母题「八暗一亮」——黑暗里一块平放的 3×3 方块板，八块暗着，一块亮琥珀色（主页与过场设计_Fable_1.0.md）。
// Midjourney 的图到之前，用代码画一张「吸魂者」式的占位：粗抖墨线、线很少、大块纯黑、一束硬边光锥，三种颜色。
// 图到以后在 config.HOME_ART 填 src 和「亮的那一块」的位置，这里自动换成那张图。
const P = require('./platform.js');
const ui = require('./ui.js');
const C = require('./config.js');

const INK = '#050706', DARK = '#0B0F0E', TEAL = '#265053', TEAL2 = '#358179', AMBER = '#E0B040', AMBER2 = '#B0902E', PAPER = '#EEE6D0';

let cache = null; // { key, canvas, lit: { x, y, s } }  lit = 亮的那一块在屏幕上的中心和边长（逻辑像素）
let mjImg = null, mjTried = false;

// 抖一点的粗墨线
function inkLine(g, pts, w, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 10));
    let px = x1, py = y1;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = x1 + (x2 - x1) * t + (rnd() - 0.5) * 1.6, y = y1 + (y2 - y1) * t + (rnd() - 0.5) * 1.6;
      g.lineWidth = w * (0.75 + rnd() * 0.55);
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
      px = x; py = y;
    }
  }
}

// 代码画的占位图（W×H 逻辑像素）
function drawPlaceholder(W, H, dpr) {
  const c = P.makeCanvas(Math.round(W * dpr), Math.round(H * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = DARK; g.fillRect(0, 0, W, H);
  // 方块板：平放在桌上，从斜上方看（上窄下宽的透视）
  const cx = W / 2, cy = H * 0.46, bw = Math.min(W * 0.5, 220), depth = bw * 0.62;
  const topW = bw * 0.82, y0 = cy - depth / 2, y1 = cy + depth / 2;
  const P2 = (u, v) => { const w = topW + (bw - topW) * v; return [cx - w / 2 + w * u, y0 + depth * v]; }; // u,v ∈ [0,1]
  // 光锥：从画面外上方打下来，硬边，两层
  g.fillStyle = 'rgba(38,80,83,0.55)';
  g.beginPath(); g.moveTo(cx - W * 0.05, -10); g.lineTo(cx + W * 0.05, -10); g.lineTo(cx + bw * 0.78, y1 + depth * 0.25); g.lineTo(cx - bw * 0.78, y1 + depth * 0.25); g.closePath(); g.fill();
  g.fillStyle = 'rgba(53,129,121,0.28)';
  g.beginPath(); g.moveTo(cx - W * 0.025, -10); g.lineTo(cx + W * 0.025, -10); g.lineTo(cx + bw * 0.5, y1 + depth * 0.1); g.lineTo(cx - bw * 0.5, y1 + depth * 0.1); g.closePath(); g.fill();
  // 光落在桌上的一块椭圆
  g.fillStyle = 'rgba(53,129,121,0.35)';
  g.save(); g.translate(cx, cy + depth * 0.08); g.scale(1, depth / bw); g.beginPath(); g.arc(0, 0, bw * 0.78, 0, Math.PI * 2); g.restore(); g.fill(); // 微信旧版画布没有 ellipse，用压扁的圆
  // 板的厚度（前侧面）+ 一道长影子
  const thick = depth * 0.1;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); const [ax, ay] = P2(0, 1), [bx, by] = P2(1, 1);
  g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx + bw * 0.5, by + depth * 0.9); g.lineTo(ax + bw * 0.25, ay + depth * 0.9); g.closePath(); g.fill();
  g.fillStyle = '#0F1715';
  g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by + thick); g.lineTo(ax, ay + thick); g.closePath(); g.fill();
  // 九块：每块之间留缝，暗的是深墨绿，正中那块亮琥珀
  const gap = 0.035;
  let lit = null;
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      const u0 = col / 3 + gap, u1 = (col + 1) / 3 - gap, v0 = r / 3 + gap, v1 = (r + 1) / 3 - gap;
      const q = [P2(u0, v0), P2(u1, v0), P2(u1, v1), P2(u0, v1)];
      const isLit = r === 1 && col === 1;
      // 块的厚度
      g.fillStyle = isLit ? AMBER2 : '#0A100F';
      g.beginPath(); g.moveTo(q[3][0], q[3][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[2][0], q[2][1] + thick * 0.55); g.lineTo(q[3][0], q[3][1] + thick * 0.55); g.closePath(); g.fill();
      g.fillStyle = isLit ? AMBER : r === 0 ? '#1A2A28' : '#14201E';
      g.beginPath(); q.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
      if (isLit) {
        // 一层纸白高光（极少）
        g.fillStyle = 'rgba(238,230,208,0.55)';
        g.beginPath(); g.moveTo(q[0][0] + 4, q[0][1] + 3); g.lineTo(q[1][0] - 4, q[1][1] + 3); g.lineTo(q[1][0] - 6, q[1][1] + 6); g.lineTo(q[0][0] + 6, q[0][1] + 6); g.closePath(); g.fill();
        const mx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, my = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
        lit = { x: mx, y: my, s: (q[1][0] - q[0][0] + q[2][0] - q[3][0]) / 2 };
      }
      inkLine(g, [q[0], q[1], q[2], q[3], q[0]], isLit ? 2.6 : 2.2, 11 + r * 3 + col);
      // 琥珀逆光边：只给靠近光的上沿
      if (!isLit && r === 0) { g.strokeStyle = 'rgba(224,176,64,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(q[0][0] + 2, q[0][1]); g.lineTo(q[1][0] - 2, q[1][1]); g.stroke(); }
    }
  }
  // 整块板的外轮廓（最粗的一圈墨线）
  inkLine(g, [P2(0, 0), P2(1, 0), P2(1, 1), [P2(1, 1)[0], P2(1, 1)[1] + thick], [P2(0, 1)[0], P2(0, 1)[1] + thick], P2(0, 1), P2(0, 0)], 3.4, 97);
  // 几颗浮尘
  g.fillStyle = 'rgba(238,230,208,0.35)';
  let s = 7;
  for (let i = 0; i < 26; i++) { s = (s * 16807) % 2147483647; const x = cx + ((s / 2147483647) - 0.5) * bw * 1.2; s = (s * 16807) % 2147483647; const y = (s / 2147483647) * (y1 - 10); g.fillRect(x, y, 1.4, 1.4); }
  return { canvas: c, lit };
}

// 取主页图（屏幕大小一张，缓存）。lit 是亮的那一块在屏幕上的位置
function get(W, H, dpr) {
  const key = W + 'x' + H + '|' + dpr + '|' + (mjImg ? 'mj' : 'code');
  if (cache && cache.key === key) return cache;
  if (C.HOME_ART.src && !mjTried) {
    mjTried = true;
    P.loadImage(C.HOME_ART.src, (img) => { if (img) { mjImg = img; cache = null; } });
  }
  if (mjImg && C.HOME_ART.lit) {
    // 铺满（cover）裁两边；亮的那一块按裁完以后的坐标换算
    const c = P.makeCanvas(Math.round(W * dpr), Math.round(H * dpr));
    const g = c.getContext('2d');
    const sc = Math.max(W / mjImg.width, H / mjImg.height);
    const dw = mjImg.width * sc, dh = mjImg.height * sc, ox = (W - dw) / 2, oy = (H - dh) / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(mjImg, ox, oy, dw, dh);
    const L = C.HOME_ART.lit;
    cache = { key, canvas: c, lit: { x: ox + L.cx * dw, y: oy + L.cy * dh, s: L.s * dw } };
  } else {
    const r = drawPlaceholder(W, H, dpr);
    cache = { key, canvas: r.canvas, lit: r.lit };
  }
  return cache;
}

// 画主页背景 + 上下两道遮罩（字看得清）
function draw(ctx, W, H, dpr) {
  const art = get(W, H, dpr);
  ctx.drawImage(art.canvas, 0, 0, art.canvas.width, art.canvas.height, 0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.3);
  top.addColorStop(0, 'rgba(0,0,0,0.35)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.3);
  const bot = ctx.createLinearGradient(0, H * 0.6, 0, H);
  bot.addColorStop(0, 'rgba(0,0,0,0)'); bot.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = bot; ctx.fillRect(0, H * 0.6, W, H * 0.4);
  return art;
}

module.exports = { get, draw, AMBER, PAPER, INK };
