// 画图小工具：圆角矩形、文字、图标、缓动、按钮（按下立刻变色，松手才触发）。
// 按钮是「每帧重新登记」的：画的时候 ui.button(...) 登记一块可点区域，触摸时查最近一帧登记的区域。

const FONT = '-apple-system, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
const font = (size, weight) => (weight || 400) + ' ' + size + 'px ' + FONT;

const ease = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fillRR(ctx, x, y, w, h, r, color) { rr(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
// 卡片：一层很淡的投影
function card(ctx, x, y, w, h, r, th) {
  ctx.save();
  ctx.shadowColor = th.shadow;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  fillRR(ctx, x, y, w, h, r, th.card);
  ctx.restore();
}
function text(ctx, s, x, y, size, color, align, weight, baseline) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillText(s, x, y);
}
// 自动换行（中文按字、英文按词），返回用了几行
function wrap(ctx, s, x, y, maxW, size, lineH, color, weight, align) {
  ctx.font = font(size, weight);
  const lines = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    const tokens = para.match(/[A-Za-z0-9\-\.\/%’']+\s*|./g) || [''];
    for (const tk of tokens) {
      // 中文标点不放在行首
      if (ctx.measureText(line + tk).width > maxW && line && !/^[，。、；：！？」』）%,.!?;:)]/.test(tk)) { lines.push(line); line = tk.replace(/^\s+/, ''); }
      else line += tk;
    }
    lines.push(line);
  }
  if (color) lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, size, color, align || 'left', weight, 'top'));
  return lines.length;
}

// ---------- 按钮登记 ----------
let regions = [];
let pressed = null; // 正在按着的那一块 { id, ... }
function beginFrame() { regions = []; }
// opts: { id, x, y, w, h, onTap, onDown, pad }
function button(opts) {
  regions.push(opts);
  return pressed && pressed.id === opts.id;
}
function isPressed(id) { return !!(pressed && pressed.id === id); }
function hit(x, y) {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i], p = r.pad || 0;
    if (x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p) return r;
  }
  return null;
}
function down(x, y) {
  const r = hit(x, y);
  pressed = r;
  if (r && r.onDown) r.onDown(x, y);
  return r;
}
function up(x, y) {
  const r = pressed;
  pressed = null;
  if (!r || !r.onTap) return null;
  const p = (r.pad || 0) + 12; // 手指稍微滑出一点也算
  if (x >= r.x - p && x <= r.x + r.w + p && y >= r.y - p && y <= r.y + r.h + p) { r.onTap(x, y); return r; }
  return null;
}
function cancel() { pressed = null; }
function allRegions() { return regions.slice(); }

// 一个标准按钮：按下变暗、缩一点
function pill(ctx, th, id, x, y, w, h, label, onTap, style) {
  style = style || 'primary';
  const on = button({ id, x, y, w, h, onTap });
  const s = on ? 0.97 : 1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  const bg = style === 'primary' ? th.primary : style === 'soft' ? th.soft : th.card;
  const fg = style === 'primary' ? th.primaryText : th.primary;
  if (style === 'card') card(ctx, -w / 2, -h / 2, w, h, h / 2, th);
  else fillRR(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, 16), bg);
  if (on) fillRR(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, 16), 'rgba(0,0,0,0.08)');
  text(ctx, label, 0, 1, h >= 50 ? 18 : 16, fg, 'center', 600);
  ctx.restore();
  return on;
}

// ---------- 图标（线条画，size 是外框边长） ----------
function stroke(ctx, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
const icons = {
  back(ctx, cx, cy, s, c) { stroke(ctx, c, 2.4); ctx.beginPath(); ctx.moveTo(cx + s * 0.15, cy - s * 0.32); ctx.lineTo(cx - s * 0.17, cy); ctx.lineTo(cx + s * 0.15, cy + s * 0.32); ctx.stroke(); },
  chevron(ctx, cx, cy, s, c) { stroke(ctx, c, 2); ctx.beginPath(); ctx.moveTo(cx - s * 0.12, cy - s * 0.25); ctx.lineTo(cx + s * 0.13, cy); ctx.lineTo(cx - s * 0.12, cy + s * 0.25); ctx.stroke(); },
  undo(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.arc(cx + s * 0.04, cy + s * 0.06, s * 0.28, Math.PI * 1.05, Math.PI * 2.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.36, cy - s * 0.2); ctx.lineTo(cx - s * 0.25, cy + s * 0.04); ctx.lineTo(cx - s * 0.02, cy - s * 0.06); ctx.stroke();
  },
  eraser(ctx, cx, cy, s, c) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
    stroke(ctx, c, 2.2); rr(ctx, -s * 0.36, -s * 0.17, s * 0.72, s * 0.34, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.17); ctx.lineTo(-s * 0.06, s * 0.17); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.05, cy + s * 0.36); ctx.lineTo(cx + s * 0.38, cy + s * 0.36); ctx.stroke();
  },
  pencil(ctx, cx, cy, s, c) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.38); ctx.lineTo(s * 0.1, -s * 0.38); ctx.lineTo(s * 0.1, s * 0.2); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.1, s * 0.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.24); ctx.lineTo(s * 0.1, -s * 0.24); ctx.stroke();
    ctx.restore();
  },
  bulb(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.08, s * 0.26, Math.PI * 0.8, Math.PI * 2.2); ctx.lineTo(cx + s * 0.1, cy + s * 0.24); ctx.lineTo(cx - s * 0.1, cy + s * 0.24); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.09, cy + s * 0.36); ctx.lineTo(cx + s * 0.09, cy + s * 0.36); ctx.stroke();
  },
  pause(ctx, cx, cy, s, c) { ctx.fillStyle = c; fillRR(ctx, cx - s * 0.22, cy - s * 0.26, s * 0.14, s * 0.52, 2, c); fillRR(ctx, cx + s * 0.08, cy - s * 0.26, s * 0.14, s * 0.52, 2, c); },
  play(ctx, cx, cy, s, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.28); ctx.lineTo(cx + s * 0.28, cy); ctx.lineTo(cx - s * 0.2, cy + s * 0.28); ctx.closePath(); ctx.fill(); },
  gear(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? s * 0.27 : s * 0.37;
      const a2 = ((i + 1) / 16) * Math.PI * 2;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
    }
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.11, 0, Math.PI * 2); ctx.stroke();
  },
  check(ctx, cx, cy, s, c, w) { stroke(ctx, c, w || 2.6); ctx.beginPath(); ctx.moveTo(cx - s * 0.28, cy); ctx.lineTo(cx - s * 0.07, cy + s * 0.22); ctx.lineTo(cx + s * 0.3, cy - s * 0.22); ctx.stroke(); },
  lock(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2); ctx.beginPath(); ctx.arc(cx, cy - s * 0.08, s * 0.17, Math.PI, 0); ctx.stroke();
    fillRR(ctx, cx - s * 0.26, cy - s * 0.08, s * 0.52, s * 0.4, 3, c);
  },
  video(ctx, cx, cy, s, c) {
    fillRR(ctx, cx - s * 0.36, cy - s * 0.24, s * 0.72, s * 0.48, 4, c);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - s * 0.08, cy - s * 0.13); ctx.lineTo(cx + s * 0.14, cy); ctx.lineTo(cx - s * 0.08, cy + s * 0.13); ctx.closePath(); ctx.fill();
  },
  trophy(ctx, cx, cy, s, c, fillP) {
    // 奖杯：fillP = 0..1 填了多少（本月完成几天）
    const top = cy - s * 0.38, bot = cy + s * 0.08, w = s * 0.32;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx - w, top); ctx.lineTo(cx + w, top); ctx.quadraticCurveTo(cx + w, bot, cx, bot); ctx.quadraticCurveTo(cx - w, bot, cx - w, top); ctx.closePath();
    if (fillP > 0) {
      ctx.save(); ctx.clip();
      const h = (bot - top) * clamp(fillP, 0, 1);
      ctx.fillStyle = c; ctx.fillRect(cx - w, bot - h, w * 2, h);
      ctx.restore();
    }
    stroke(ctx, c, 2.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - w, top + s * 0.12, s * 0.1, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + w, top + s * 0.12, s * 0.1, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, bot); ctx.lineTo(cx, cy + s * 0.26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy + s * 0.32); ctx.lineTo(cx + s * 0.2, cy + s * 0.32); ctx.stroke();
    ctx.restore();
  },
  book(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.24); ctx.quadraticCurveTo(cx - s * 0.18, cy - s * 0.34, cx - s * 0.38, cy - s * 0.28); ctx.lineTo(cx - s * 0.38, cy + s * 0.28); ctx.quadraticCurveTo(cx - s * 0.18, cy + s * 0.22, cx, cy + s * 0.32); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.24); ctx.quadraticCurveTo(cx + s * 0.18, cy - s * 0.34, cx + s * 0.38, cy - s * 0.28); ctx.lineTo(cx + s * 0.38, cy + s * 0.28); ctx.quadraticCurveTo(cx + s * 0.18, cy + s * 0.22, cx, cy + s * 0.32); ctx.stroke();
  },
  brain(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.arc(cx - s * 0.12, cy - s * 0.1, s * 0.2, Math.PI * 0.9, Math.PI * 1.8); ctx.arc(cx + s * 0.12, cy - s * 0.1, s * 0.2, Math.PI * 1.2, Math.PI * 2.1);
    ctx.arc(cx + s * 0.14, cy + s * 0.12, s * 0.18, -Math.PI * 0.3, Math.PI * 0.6); ctx.arc(cx - s * 0.14, cy + s * 0.12, s * 0.18, Math.PI * 0.4, Math.PI * 1.3); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.24); ctx.lineTo(cx, cy + s * 0.3); ctx.stroke();
  },
  chart(ctx, cx, cy, s, c) {
    ctx.fillStyle = c;
    fillRR(ctx, cx - s * 0.3, cy, s * 0.14, s * 0.3, 2, c);
    fillRR(ctx, cx - s * 0.07, cy - s * 0.18, s * 0.14, s * 0.48, 2, c);
    fillRR(ctx, cx + s * 0.16, cy - s * 0.32, s * 0.14, s * 0.62, 2, c);
  },
  medal(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2);
    ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.38); ctx.lineTo(cx - s * 0.06, cy - s * 0.06); ctx.moveTo(cx + s * 0.2, cy - s * 0.38); ctx.lineTo(cx + s * 0.06, cy - s * 0.06); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.12, s * 0.2, 0, Math.PI * 2); ctx.stroke();
  },
  calendar(ctx, cx, cy, s, c) {
    stroke(ctx, c, 2.2); rr(ctx, cx - s * 0.34, cy - s * 0.26, s * 0.68, s * 0.6, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s * 0.34, cy - s * 0.08); ctx.lineTo(cx + s * 0.34, cy - s * 0.08); ctx.moveTo(cx - s * 0.16, cy - s * 0.38); ctx.lineTo(cx - s * 0.16, cy - s * 0.2); ctx.moveTo(cx + s * 0.16, cy - s * 0.38); ctx.lineTo(cx + s * 0.16, cy - s * 0.2); ctx.stroke();
  },
  close(ctx, cx, cy, s, c) { stroke(ctx, c, 2.2); ctx.beginPath(); ctx.moveTo(cx - s * 0.2, cy - s * 0.2); ctx.lineTo(cx + s * 0.2, cy + s * 0.2); ctx.moveTo(cx + s * 0.2, cy - s * 0.2); ctx.lineTo(cx - s * 0.2, cy + s * 0.2); ctx.stroke(); },
  hand(ctx, cx, cy, s, c) {
    // 教学用的手指：指尖在 (cx, cy)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.35);
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.08, 0); ctx.arc(0, s * 0.02, s * 0.08, Math.PI, 0); ctx.lineTo(s * 0.08, s * 0.32);
    ctx.quadraticCurveTo(s * 0.3, s * 0.3, s * 0.3, s * 0.48); ctx.lineTo(s * 0.26, s * 0.78); ctx.lineTo(-s * 0.16, s * 0.78);
    ctx.lineTo(-s * 0.26, s * 0.5); ctx.quadraticCurveTo(-s * 0.3, s * 0.4, -s * 0.08, s * 0.44); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
};

module.exports = { FONT, font, ease, clamp, lerp, rr, fillRR, card, text, wrap, beginFrame, button, isPressed, hit, down, up, cancel, pill, icons, allRegions, stroke };
