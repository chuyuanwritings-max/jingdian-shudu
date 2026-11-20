// 画棋盘：局内和教学共用。
// m = { vals[81], given[81], notes[81], wrong(k)→bool, selected, selDigit, sameHighlight,
//       focus: 亮着的格（其余变淡）| null, rays, strike, mark, hintCells, pops:{k:t0}, shake:{k,t0}, flash:{k:t0}, now }
const S = require('./sudoku.js');
const ui = require('./ui.js');
const P = require('./platform.js');

let cache = null; // 宫线、格线画在离屏画布上，每帧贴一次
function linesLayer(geo, th, dpr) {
  const key = geo.size + '|' + th.id + '|' + dpr;
  if (cache && cache.key === key) return cache.canvas;
  const px = Math.ceil(geo.size * dpr) + 4;
  const c = P.makeCanvas(px, px);
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = geo.size / 9, o = 1;
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

  // 高亮：同行同列同宫（浅）→ 相同数字（中）→ 选中格（深）
  const sel = m.selected;
  const selVal = sel >= 0 ? m.vals[sel] : 0;
  const digit = m.selDigit || selVal;
  for (let k = 0; k < 81; k++) {
    let bg = null;
    if (sel >= 0 && k !== sel && (S.ROW(k) === S.ROW(sel) || S.COL(k) === S.COL(sel) || S.BOX(k) === S.BOX(sel))) bg = th.rel;
    if (m.sameHighlight !== false && digit && m.vals[k] === digit && k !== sel) bg = th.same;
    if (m.hintCells && m.hintCells.indexOf(k) >= 0) bg = th.soft;
    if (k === sel) bg = th.sel;
    if (m.wrong && m.wrong(k) && k === sel) bg = th.sel;
    if (bg) {
      const r = cellRect(geo, k);
      ctx.fillStyle = bg;
      ctx.fillRect(r.x, r.y, cs + 0.5, cs + 0.5);
    }
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

  ctx.drawImage(linesLayer(geo, th, dpr), 0, 0, Math.ceil(geo.size * dpr) + 4, Math.ceil(geo.size * dpr) + 4, geo.x - 1, geo.y - 1, (Math.ceil(geo.size * dpr) + 4) / dpr, (Math.ceil(geo.size * dpr) + 4) / dpr);

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
    if (v) {
      let sc = 1;
      const p0 = m.pops && m.pops[k];
      if (p0) {
        const p = (t - p0) / 220;
        if (p >= 0 && p < 1) sc = 1 + 0.28 * Math.sin(p * Math.PI) * (1 - p * 0.3);
      }
      const color = m.given[k] ? th.given : m.wrong && m.wrong(k) ? th.wrong : th.user;
      ctx.save();
      ctx.translate(r.x + cs / 2 + ox, r.y + cs / 2 + 1);
      if (sc !== 1) ctx.scale(sc, sc);
      ui.text(ctx, String(v), 0, 0, fs, color, 'center', m.given[k] ? 500 : 400);
      ctx.restore();
    } else if (m.notes && m.notes[k]) {
      for (let d = 1; d <= 9; d++) {
        if (!(m.notes[k] & S.bit(d))) continue;
        const nx = r.x + ((d - 1) % 3 + 0.5) * cs / 3, ny = r.y + (Math.floor((d - 1) / 3) + 0.5) * cs / 3;
        if (digit === d && m.sameHighlight !== false) ui.fillRR(ctx, nx - cs / 7, ny - cs / 7, cs / 3.5, cs / 3.5, 3, th.same);
        ui.text(ctx, String(d), nx + ox, ny + 0.5, ns, digit === d ? th.text : th.note, 'center', digit === d ? 600 : 400);
      }
    }
    ctx.globalAlpha = 1;
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

module.exports = { draw, cellRect, cellAt };
