// 画棋盘：局内和教学共用。
// m = { vals[81], given[81], notes[81], wrong(k)→bool, selected, selDigit, sameHighlight,
//       focus: 亮着的格（其余变淡）| null, rays, strike, mark, hintCells, pops:{k:t0}, shake:{k,t0}, flash:{k:t0}, now,
//       （质地、深浅、手画线从主题 th 里拿） }
const S = require('./sudoku.js');
const ui = require('./ui.js');
const P = require('./platform.js');
const Paper = require('./paper.js');

const YELLOW = '#F5C531', YELLOW_EDGE = '#E0A815';

let cache = null; // 宫线、格线画在离屏画布上，每帧贴一次
// 手写纸：一条线拆成很多小段，每段轻轻抖一下，粗细也不匀
function handLine(g, x1, y1, x2, y2, w, seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(len / 14));
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  let px = x1, py = y1, off = 0;
  for (let i = 1; i <= n; i++) {
    off = off * 0.6 + (rnd() - 0.5) * 0.9;
    const t = i / n;
    const x = x1 + (x2 - x1) * t + nx * off, y = y1 + (y2 - y1) * t + ny * off;
    g.lineWidth = w * (0.75 + rnd() * 0.5);
    g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    px = x; py = y;
  }
}
function linesLayer(geo, th, dpr, hand) {
  const key = geo.size + '|' + th.lineBold + th.lineThin + '|' + dpr + '|' + (hand ? 1 : 0);
  if (cache && cache.key === key) return cache.canvas;
  const px = Math.ceil(geo.size * dpr) + 4;
  const c = P.makeCanvas(px, px);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = geo.size / 9, o = 1;
  if (hand) {
    g.lineCap = 'round';
    g.strokeStyle = th.lineThin;
    for (let i = 1; i < 9; i++) {
      if (i % 3 === 0) continue;
      const p = o + i * cs;
      handLine(g, p, o + 2, p, o + geo.size - 2, 1, 101 + i);
      handLine(g, o + 2, p, o + geo.size - 2, p, 1, 201 + i);
    }
    g.strokeStyle = th.lineBold;
    g.globalAlpha = 0.85;
    for (let i = 3; i < 9; i += 3) {
      const p = o + i * cs;
      handLine(g, p, o + 1, p, o + geo.size - 1, 2, 301 + i);
      handLine(g, o + 1, p, o + geo.size - 1, p, 2, 401 + i);
    }
    handLine(g, o, o, o + geo.size, o, 2.2, 501);
    handLine(g, o + geo.size, o, o + geo.size, o + geo.size, 2.2, 502);
    handLine(g, o + geo.size, o + geo.size, o, o + geo.size, 2.2, 503);
    handLine(g, o, o + geo.size, o, o, 2.2, 504);
    cache = { key, canvas: c };
    return c;
  }
  g.strokeStyle = th.lineThin;
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < 9; i++) {
    if (i % 3 === 0) continue;
    const p = Math.round(o + i * cs) + 0.5;
    g.moveTo(p, o); g.lineTo(p, o + geo.size);
    g.moveTo(o, p); g.lineTo(o + geo.size, p);
  }
  g.stroke();
  g.strokeStyle = th.lineBold;
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 3; i < 9; i += 3) {
    const p = Math.round(o + i * cs);
    g.moveTo(p, o); g.lineTo(p, o + geo.size);
    g.moveTo(o, p); g.lineTo(o + geo.size, p);
  }
  g.stroke();
  ui.rr(g, o, o, geo.size, geo.size, 10);
  g.lineWidth = 2;
  g.stroke();
  cache = { key, canvas: c };
  return c;
}

// 数字方块：影子（两层半透明，不用模糊，省电）→ 厚边 → 面 → 顶上一条高光 → 数字。
// 刚放下的那 0.32 秒：从上面大一点落下（影子由远变近），落地压扁一下再弹回。
function tile(ctx, th, m, cx, cy, cs, v, wrong, p0, t, same, gold, extra) {
  const style = 'B'; // Cc 2026-11-22 定：深色块 + 浅色字（像 Sudoku 2 的原木）。tileA 留在配置里不再用
  const pal = th[style === 'B' ? 'tileB' : 'tileA'] || ['#FFFFFF', '#CCCCCC', th.user];
  let body = pal[0], edge = pal[1], ink = pal[2];
  if (gold) { body = '#E9C25A'; edge = '#A9832A'; ink = '#3A2A08'; } // 金面：某个数填完、通关波浪
  else if (same) { body = YELLOW; edge = '#B8890F'; ink = '#3A2A08'; } // 和点中的数字一样：整块亮黄（深色块上看得最清楚）
  if (wrong) {
    if (style === 'B') { body = th.wrong; edge = Paper.rgba('#000000', 0.35); ink = '#FFFFFF'; }
    else { body = th.boardDark ? '#5A3434' : '#FCE6E3'; edge = th.boardDark ? '#2A1616' : '#E2B2AC'; ink = th.wrong; }
  }
  const inset = Math.max(2.5, cs * 0.07), thick = Math.max(2, cs * 0.06);
  let lift = 0, sx = 1, sy = 1;
  if (p0) {
    const e = t - p0;
    if (e >= 0 && e < 150) { const q = e / 150; lift = 12 * (1 - q * q); sx = sy = 1.22 - 0.22 * q * q; }
    else if (e >= 150 && e < 330) { const q = (e - 150) / 180; const b = Math.sin(q * Math.PI) * (1 - q); sx = 1 + 0.09 * b; sy = 1 - 0.11 * b; }
  }
  if (extra && extra !== 1) { sx *= extra; sy *= extra; }
  const w = cs - inset * 2, h = cs - inset * 2 - thick;
  const x0 = cx + cs / 2, yb = cy + inset + h + thick; // 方块底边中点：压扁、放大都以它为准
  // 影子：离地越高越淡、越偏
  const sh = Math.min(1, lift / 12);
  ui.fillRR(ctx, cx + inset + 1 + sh * 3, cy + inset + thick + 1.5 + sh * 5, w, h, 6, 'rgba(0,0,0,' + (0.16 - sh * 0.08).toFixed(3) + ')');
  ui.fillRR(ctx, cx + inset + 0.5, cy + inset + thick + 0.5 + sh * 2, w, h, 6, 'rgba(0,0,0,' + (0.1 - sh * 0.06).toFixed(3) + ')');
  ctx.save();
  ctx.translate(x0, yb - lift);
  ctx.scale(sx, sy);
  ctx.translate(-x0, -yb);
  ui.fillRR(ctx, cx + inset, cy + inset + thick, w, h, 6, edge);
  ui.fillRR(ctx, cx + inset, cy + inset, w, h, 6, body);
  ui.fillRR(ctx, cx + inset + 3, cy + inset + 1.5, w - 6, Math.max(1.5, cs * 0.045), 1, style === 'B' || th.boardDark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.85)');
  ui.text(ctx, String(v), x0, cy + inset + h / 2 + 1, Math.round(cs * 0.54), ink, 'center', style === 'B' ? 600 : 500);
  ctx.restore();
}

function cellRect(geo, k) {
  const cs = geo.size / 9;
  return { x: geo.x + S.COL(k) * cs, y: geo.y + S.ROW(k) * cs, s: cs };
}

function draw(ctx, th, geo, m, dpr) {
  const cs = geo.size / 9, t = m.now;
  // 底
  ui.fillRR(ctx, geo.x, geo.y, geo.size, geo.size, 10, th.board);
  ctx.save();
  ui.rr(ctx, geo.x, geo.y, geo.size, geo.size, 10);
  ctx.clip();
  Paper.fill(ctx, th.boardTexture, dpr, !!th.boardDark, geo.x, geo.y, geo.size, geo.size);
  // 高亮只用一种颜色：黄（学 Sudoku 2：不染同行同列同宫，只亮相同的数字和选中的格子）
  const dk = !!th.boardDark;
  const HL = { same: Paper.rgba(YELLOW, dk ? 0.42 : 0.5), noteSame: Paper.rgba(YELLOW, dk ? 0.22 : 0.26), sel: Paper.rgba(YELLOW, dk ? 0.18 : 0.2), hint: Paper.rgba(YELLOW, dk ? 0.3 : 0.34) };
  const sel = m.selected;
  const selVal = sel >= 0 ? m.vals[sel] : 0;
  const digit = m.selDigit || selVal;
  const cs0 = cs, inset0 = Math.max(2.5, cs0 * 0.07);
  for (let k = 0; k < 81; k++) {
    const r = cellRect(geo, k);
    // 空格：一个浅浅凹下去的槽（方块就放在槽里）
    if (!m.vals[k]) {
      ui.fillRR(ctx, r.x + inset0, r.y + inset0, cs - inset0 * 2, cs - inset0 * 2, 6, dk ? 'rgba(0,0,0,0.16)' : 'rgba(60,45,20,0.045)');
      ui.fillRR(ctx, r.x + inset0, r.y + inset0, cs - inset0 * 2, Math.max(1.5, cs * 0.04), 2, dk ? 'rgba(0,0,0,0.22)' : 'rgba(60,45,20,0.07)');
    }
    let bg = null;
    if (m.sameHighlight !== false && digit && !m.vals[k] && m.notes && m.notes[k] & S.bit(digit)) bg = HL.noteSame;
    if (m.hintCells && m.hintCells.indexOf(k) >= 0) bg = HL.hint;
    if (k === sel && !m.vals[k]) bg = HL.sel;
    if (bg) ui.fillRR(ctx, r.x + inset0, r.y + inset0, cs - inset0 * 2, cs - inset0 * 2, 6, bg);
  }
  // 教学：金色区域（「v 只能在这几格」「这两格是一对」）
  if (m.zone) {
    ctx.fillStyle = Paper.rgba(th.gold, dk ? 0.3 : 0.28);
    for (const k of m.zone) { const r = cellRect(geo, k); ctx.fillRect(r.x, r.y, cs + 0.5, cs + 0.5); }
  }
  // 教学：被「划掉」的行列（淡红带）
  if (m.rays) {
    ctx.fillStyle = th.wrong;
    ctx.globalAlpha = 0.12;
    for (const ray of m.rays) {
      if (ray.dir === 'row') ctx.fillRect(geo.x, geo.y + S.ROW(ray.k) * cs, geo.size, cs);
      else ctx.fillRect(geo.x + S.COL(ray.k) * cs, geo.y, cs, geo.size);
    }
    ctx.globalAlpha = 1;
  }
  // 闪光：填满一行 / 列 / 宫、某个数满 9 个、赢了
  if (m.flash) {
    for (const f of m.flash) {
      const p = (t - f.t0) / f.dur;
      if (p < 0 || p > 1) continue;
      const r = cellRect(geo, f.k);
      ctx.globalAlpha = Math.sin(p * Math.PI) * (f.alpha || 0.55);
      ctx.fillStyle = f.color || th.glow;
      ctx.fillRect(r.x, r.y, cs + 0.5, cs + 0.5);
      ctx.globalAlpha = 1;
    }
  }

  ctx.drawImage(linesLayer(geo, th, dpr, !!th.hand), 0, 0, Math.ceil(geo.size * dpr) + 4, Math.ceil(geo.size * dpr) + 4, geo.x - 1, geo.y - 1, (Math.ceil(geo.size * dpr) + 4) / dpr, (Math.ceil(geo.size * dpr) + 4) / dpr);

  // 数字和笔记
  const fs = Math.round(cs * 0.6), ns = Math.max(9, Math.round(cs * 0.27));
  for (let k = 0; k < 81; k++) {
    const r = cellRect(geo, k);
    const dim = m.focus && m.focus.indexOf(k) < 0;
    ctx.globalAlpha = dim ? 0.28 : 1;
    const v = m.vals[k];
    let ox = 0;
    if (m.shake && m.shake.k === k) {
      const p = (t - m.shake.t0) / 320;
      if (p >= 0 && p < 1) ox = Math.sin(p * Math.PI * 6) * 4 * (1 - p);
    }
    // 跳一下（填满一行 / 列 / 宫、通关的波浪）
    let oy = 0;
    const h0 = m.hops && m.hops[k];
    if (h0) {
      const p = (t - h0) / 340;
      if (p >= 0 && p < 1) oy = -6 * Math.sin(p * Math.PI) * (1 - p * 0.4);
    }
    // 金面（某个数填完、通关波浪）和单格缩放（「出手」放大、呼吸）
    const g0 = m.gold && m.gold[k];
    const gold = !!g0 && t >= g0[0] && t < g0[1];
    const csc = m.cellScale ? m.cellScale(k, t) : 1;
    if (v) {
      // 每个数字都是一块有厚度的方块：题目原有的和自己填的一样（学 Sudoku 2）
      tile(ctx, th, m, r.x + ox, r.y + oy, cs, v, !m.given[k] && m.wrong && m.wrong(k), m.pops && m.pops[k], t, digit === v && m.sameHighlight !== false && !gold, gold, csc);
    } else if (m.notes && m.notes[k]) {
      for (let d = 1; d <= 9; d++) {
        if (!(m.notes[k] & S.bit(d))) continue;
        const nx = r.x + ((d - 1) % 3 + 0.5) * cs / 3, ny = r.y + (Math.floor((d - 1) / 3) + 0.5) * cs / 3;
        if (digit === d && m.sameHighlight !== false) ui.fillRR(ctx, nx - cs / 7, ny - cs / 7, cs / 3.5, cs / 3.5, 3, HL.same);
        const struck = m.strikeNotes && m.strikeNotes[k] && m.strikeNotes[k] & S.bit(d);
        ui.text(ctx, String(d), nx + ox, ny + 0.5, ns, struck ? th.faint : digit === d ? th.text : th.note, 'center', digit === d ? 600 : 400);
        if (struck) { ctx.strokeStyle = th.wrong; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(nx - ns * 0.45, ny + ns * 0.4); ctx.lineTo(nx + ns * 0.45, ny - ns * 0.4); ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  // 选中的格子：一圈黄框
  if (sel >= 0) {
    const r = cellRect(geo, sel);
    ui.rr(ctx, r.x + inset0 - 2, r.y + inset0 - 2, cs - inset0 * 2 + 4, cs - inset0 * 2 + 4, 8);
    ctx.strokeStyle = YELLOW_EDGE; ctx.lineWidth = 3; ctx.stroke();
  }
  // 教学：从挡住它的那个数拉一条红线穿过整排 / 整列，起点一个圆点
  if (m.rays) {
    ctx.save();
    ctx.strokeStyle = Paper.rgba(th.wrong, 0.7);
    ctx.fillStyle = Paper.rgba(th.wrong, 0.85);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (const ray of m.rays) {
      const r = cellRect(geo, ray.k), cx = r.x + cs / 2, cy = r.y + cs / 2;
      ctx.beginPath();
      if (ray.dir === 'row') { ctx.moveTo(geo.x + 4, cy); ctx.lineTo(geo.x + geo.size - 4, cy); }
      else { ctx.moveTo(cx, geo.y + 4); ctx.lineTo(cx, geo.y + geo.size - 4); }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, cs * 0.42, 0, Math.PI * 2); ctx.setLineDash([]); ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
    }
    ctx.restore();
  }
  // 教学：标一格（呼吸的框）
  if (m.mark >= 0 && m.mark !== undefined) {
    const r = cellRect(geo, m.mark);
    const a = 0.55 + 0.45 * Math.sin(t / 260);
    ctx.strokeStyle = th.primary;
    ctx.globalAlpha = a;
    ctx.lineWidth = 2.5;
    ui.rr(ctx, r.x + 2, r.y + 2, cs - 4, cs - 4, 5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 填对：一圈光晕从这格往外扩（画在棋盘外层，可以溢出一点）
  if (m.rings) {
    for (const ring of m.rings) {
      const p = (t - ring.t0) / 420;
      if (p < 0 || p > 1) continue;
      const r = cellRect(geo, ring.k);
      const e = ui.ease.out(p);
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.7;
      ctx.strokeStyle = th.glow;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ui.rr(ctx, r.x + cs / 2 - (cs / 2) * (1 + e * 0.9), r.y + cs / 2 - (cs / 2) * (1 + e * 0.9), cs * (1 + e * 0.9), cs * (1 + e * 0.9), 8);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// 手指点在棋盘哪一格（-1 = 不在棋盘上）
function cellAt(geo, x, y) {
  if (x < geo.x || y < geo.y || x >= geo.x + geo.size || y >= geo.y + geo.size) return -1;
  const cs = geo.size / 9;
  return Math.floor((y - geo.y) / cs) * 9 + Math.floor((x - geo.x) / cs);
}

// 主题页的样式示范：单独画一块方块
// 也给数字键用（键也是方块，学 Sudoku 2）：same = 正在亮的那个数（黄）
function sampleTile(ctx, th, style, x, y, cs, v, p0, t, same) {
  tile(ctx, th, { tileStyle: style }, x, y, cs, v, false, p0, t, !!same);
}

module.exports = { draw, cellRect, cellAt, sampleTile };
