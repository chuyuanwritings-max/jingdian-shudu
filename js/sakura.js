// 小樱（0.10，Cc：「帮我设计一个小角色叫小樱，放在右上角教我、鼓励我、给我加油，并且由她来认出我使用了哪些技法，要带一点拟人的感觉」）
// 人设见 ../小樱_角色设计_1.0.md。立绘还没生出来之前，用代码画一个「几笔墨线」的简笔小樱占位（和主页图同一路：墨线 + 琥珀 + 一点樱花粉）。
// 立绘到了以后放进 images/sakura_<表情>.png，SPRITES 里填上，这里自动换成图。
// 用法：S.say(文字, 表情, 毫秒)；每帧 S.draw(ctx, 框, t, 主题)。表情：idle 平常 / happy 开心 / wow 哇 / cheer 加油 / worry 担心 / think 想一想
const P = require('./platform.js');
const ui = require('./ui.js');

const INK = '#1C2320', PINK = '#F2A7B8', PINK2 = '#E07C96', AMBER = '#E0B040', SKIN = '#FBEFE2', HAIR = '#2B2F38';
const SPRITES = {}; // { happy: 'images/sakura_happy.png', ... } 立绘到了填这里
const imgs = {};

let line = null; // { text, mood, t0, dur }
let mood = 'idle', moodUntil = 0, bounceAt = 0;

function say(text, m, dur) {
  const t = P.now();
  line = { text, t0: t, dur: dur || 2200 };
  mood = m || 'happy';
  moodUntil = t + (dur || 2200);
  bounceAt = t;
}
function setMood(m, dur) { const t = P.now(); mood = m; moodUntil = t + (dur || 1200); bounceAt = t; }
function busy(t) { return !!line && t - line.t0 < line.dur + 300; }
function clear() { line = null; mood = 'idle'; }

// 简笔小樱：圆脸、齐刘海短发、头顶一朵樱花发夹、琥珀色小领子。只换眼睛和嘴（不拆手脚）
function face(ctx, cx, cy, r, m, t) {
  // 身子：一个小半圆领口
  ctx.fillStyle = AMBER;
  ctx.beginPath(); ctx.arc(cx, cy + r * 1.55, r * 0.95, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.stroke();
  // 后面的头发
  ctx.fillStyle = HAIR;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.06, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(cx + r * 1.02, cy + r * 0.75); ctx.lineTo(cx - r * 1.02, cy + r * 0.75); ctx.closePath(); ctx.fill();
  // 脸
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.08, r * 0.88, 0, Math.PI * 2); ctx.fill();
  ctx.stroke();
  // 齐刘海
  ctx.fillStyle = HAIR;
  ctx.beginPath(); ctx.moveTo(cx - r * 0.9, cy - r * 0.05); ctx.quadraticCurveTo(cx - r * 0.85, cy - r * 0.95, cx, cy - r * 0.98);
  ctx.quadraticCurveTo(cx + r * 0.85, cy - r * 0.95, cx + r * 0.9, cy - r * 0.05);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.32); ctx.lineTo(cx + r * 0.2, cy - r * 0.18); ctx.lineTo(cx - r * 0.15, cy - r * 0.34); ctx.lineTo(cx - r * 0.5, cy - r * 0.2); ctx.closePath(); ctx.fill();
  // 樱花发夹（五瓣）
  const fx = cx + r * 0.62, fy = cy - r * 0.78, pr = r * 0.22;
  ctx.fillStyle = PINK;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + t / 4000; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * pr, fy + Math.sin(a) * pr, pr * 0.62, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = PINK2; ctx.beginPath(); ctx.arc(fx, fy, pr * 0.42, 0, Math.PI * 2); ctx.fill();
  // 腮红
  ctx.fillStyle = 'rgba(240,140,160,0.45)';
  ctx.beginPath(); ctx.arc(cx - r * 0.48, cy + r * 0.38, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.48, cy + r * 0.38, r * 0.15, 0, Math.PI * 2); ctx.fill();
  // 眼睛
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, r * 0.11);
  const ey = cy + r * 0.12, ex = r * 0.34, blink = m === 'idle' && (t % 4200) < 140;
  const eye = (x, dir) => {
    if (blink) { ctx.beginPath(); ctx.moveTo(x - r * 0.1, ey); ctx.lineTo(x + r * 0.1, ey); ctx.stroke(); return; }
    if (m === 'happy' || m === 'cheer') { ctx.beginPath(); ctx.arc(x, ey + r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); return; }
    if (m === 'worry') { ctx.beginPath(); ctx.arc(x, ey, r * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - r * 0.13 * dir, ey - r * 0.25); ctx.lineTo(x + r * 0.1 * dir, ey - r * 0.2); ctx.stroke(); return; }
    if (m === 'wow') { ctx.beginPath(); ctx.arc(x, ey, r * 0.12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x + r * 0.04, ey - r * 0.04, r * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = INK; return; }
    if (m === 'think') { ctx.beginPath(); ctx.arc(x + r * 0.05, ey - r * 0.03, r * 0.07, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.arc(x, ey, r * 0.08, 0, Math.PI * 2); ctx.fill();
  };
  eye(cx - ex, 1); eye(cx + ex, -1);
  // 嘴
  const my = cy + r * 0.5;
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.beginPath();
  if (m === 'happy') ctx.arc(cx, my - r * 0.06, r * 0.14, Math.PI * 0.15, Math.PI * 0.85);
  else if (m === 'cheer' || m === 'wow') { ctx.fillStyle = PINK2; ctx.ellipse ? ctx.ellipse(cx, my, r * 0.1, r * 0.13, 0, 0, Math.PI * 2) : ctx.arc(cx, my, r * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); return; }
  else if (m === 'worry') { ctx.moveTo(cx - r * 0.1, my + r * 0.03); ctx.quadraticCurveTo(cx, my - r * 0.05, cx + r * 0.1, my + r * 0.03); }
  else if (m === 'think') { ctx.moveTo(cx - r * 0.06, my); ctx.lineTo(cx + r * 0.1, my - r * 0.02); }
  else ctx.arc(cx, my - r * 0.04, r * 0.08, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
}

// 画小樱 + 气泡（气泡往左边伸，不挡棋盘）。rect = 布局表 play.sakura
function draw(ctx, rect, t, th) {
  if (mood !== 'idle' && t > moodUntil) mood = 'idle';
  const r = Math.min(rect.w, rect.h) * 0.36, cx = rect.x + rect.w / 2;
  // 平常轻轻呼吸；说话、换表情时跳一下
  const b = Math.max(0, 1 - (t - bounceAt) / 380);
  const bob = Math.sin(t / 900) * 1.2 - Math.sin(b * Math.PI) * r * 0.35 * (mood === 'cheer' ? 1.4 : 1);
  const cy = rect.y + rect.h * 0.42 + bob;
  const src = SPRITES[mood] || SPRITES.idle;
  if (src) {
    if (!imgs[src]) { imgs[src] = 'loading'; P.loadImage(src, (im) => { imgs[src] = im || 'fail'; }); }
    const im = imgs[src];
    if (im && im !== 'loading' && im !== 'fail') ctx.drawImage(im, rect.x, rect.y + bob, rect.w, rect.h);
    else face(ctx, cx, cy, r, mood, t);
  } else face(ctx, cx, cy, r, mood, t);
  // 气泡
  if (line && t - line.t0 < line.dur + 300) {
    const p = Math.min(1, (t - line.t0) / 160), fade = t - line.t0 > line.dur ? 1 - (t - line.t0 - line.dur) / 300 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(p, fade));
    ctx.font = ui.font(13, 600);
    const lines = String(line.text).split('\n');
    const tw = Math.max.apply(null, lines.map((s) => ctx.measureText(s).width));
    // 气泡从左边一直铺到小樱旁边：说话时整个盖住「本局一招」小条，不露半截字
    const bw = Math.max(Math.min(rect.x - 20, tw + 22), rect.x - 20), bh = 14 + lines.length * 18;
    const bx = rect.x - bw - 4, by = rect.y + rect.h * 0.42 - bh / 2;
    ui.fillRR(ctx, bx, by, bw, bh, 12, th.card);
    ui.rr(ctx, bx, by, bw, bh, 12); ctx.strokeStyle = PINK2; ctx.lineWidth = 1.5; ctx.stroke();
    // 小尾巴指向小樱
    ctx.fillStyle = th.card; ctx.beginPath(); ctx.moveTo(bx + bw - 1, by + bh / 2 - 5); ctx.lineTo(bx + bw + 7, by + bh / 2); ctx.lineTo(bx + bw - 1, by + bh / 2 + 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = PINK2; ctx.beginPath(); ctx.moveTo(bx + bw, by + bh / 2 - 5); ctx.lineTo(bx + bw + 7, by + bh / 2); ctx.lineTo(bx + bw, by + bh / 2 + 5); ctx.stroke();
    lines.forEach((s, i) => ui.text(ctx, s, bx + bw / 2, by + 16 + i * 18, 13, th.text, 'center', 600));
    ctx.restore();
  }
}

module.exports = { say, setMood, draw, busy, clear, SPRITES, face };
