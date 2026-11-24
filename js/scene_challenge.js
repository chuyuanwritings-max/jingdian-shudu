// 挑战卡（0.6，Cc：「优化分享和挑战页面……让一时不会的人能尽快入坑」）
//   解完一题 →「发给朋友挑战这一题」→ 微信卡片（盘面缩略图 +「我 4:12 解开了，你来试试？」）
//   朋友点开 → 直接到这一题的挑战页；第一次玩的人可以先学 30 秒规则，这一局还会带着他走前 3 步
//   做完 → 两人对比的结算页 →「发回去挑战他」
const P = require('./platform.js');
const ui = require('./ui.js');
const S = require('./sudoku.js');
const Board = require('./board.js');
const store = require('./store.js');
const bank = require('./puzzles.js');
const DB = require('./drawboard.js');

// 挑战链接：c = 档.题号.用时秒.错几次，p = 题目本身（81 位，题库以后变了也认得出）
function encode(b) {
  // 秒数往下取整，和屏幕上的计时（app.fmt）一致
  return { c: [b.tier, b.idx, Math.floor(b.elapsed / 1000), b.mistakes].join('.'), p: b.puzzle };
}
function decode(q) {
  if (!q || !q.c) return null;
  const [tier, idx, sec, mis] = String(q.c).split('.').map(Number);
  if (!(tier >= 0 && tier < 6)) return null;
  const puzzle = q.p && /^[0-9]{81}$/.test(q.p) ? q.p : bank[tier] && bank[tier][idx];
  if (!puzzle || S.countSolutions(S.decode(puzzle), 2) !== 1) return null;
  return { tier, idx, time: (sec || 0) * 1000, mistakes: mis || 0, puzzle };
}

module.exports = function (app) {
  // 挑战卡上的图：5:4（微信分享卡片的比例），盘面只画题目原有的数
  app.makeShareImage = (b, line1, line2, btn) => {
    const th = app.th, w = 500, h = 400, d = 2;
    const c = P.makeCanvas(w * d, h * d);
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = th.bg; g.fillRect(0, 0, w, h);
    const size = 288, geo = { x: 24, y: (h - size) / 2, size };
    const vals = S.decode(b.puzzle);
    DB.draw(g, th, geo, { vals, given: vals.map(Boolean), notes: null, wrong: () => false, selected: -1, now: 0 }, d);
    const tx = 24 + size + 20, tw = w - tx - 20;
    // line1 = [大字, 小字]：「我 04:12」/「解开了」，分两行不让它乱折
    ui.text(g, line1[0], tx, 118, 30, th.text, 'left', 800);
    ui.text(g, line1[1], tx, 160, 24, th.text, 'left', 700);
    ui.wrap(g, line2, tx, 200, tw, 15, 21, th.sub, 500);
    ui.fillRR(g, tx, 290, tw, 46, 23, th.primary);
    ui.text(g, btn || '来挑战', tx + tw / 2, 313, 18, th.primaryText, 'center', 700);
    return c;
  };

  // 发一张微信卡片：微信里直接调分享；浏览器预览弹一个分享窗，给 Cc 看朋友会收到什么，能复制链接或用手机自带的分享
  app.shareCard = (title, q, img, sheetTitle) => {
    if (P.shareToWx(title, q, P.canvasImage(img))) return null;
    const url = P.shareLink(q);
    const dataUrl = P.canvasImage(img);
    app.lastShare = { url, title, q };
    app.push({
      onBackdrop: () => app.pop(),
      draw(ctx, t, p) {
        const th = app.th;
        const hh = 470 + (app.H - app.bottom);
        const y = app.sheet(ctx, p, hh, sheetTitle || '发给朋友挑战');
        ui.text(ctx, '朋友会收到这样一张卡片：', 24, y + 66, 13, th.sub);
        // 卡片预览（直接画同一张图）
        const cw = app.W - 48, ch = cw * 0.8;
        ctx.save(); ui.rr(ctx, 24, y + 80, cw, ch, 12); ctx.clip();
        ctx.drawImage(img, 0, 0, img.width, img.height, 24, y + 80, cw, ch);
        ctx.restore();
        let by = y + 80 + ch + 14;
        if (typeof navigator !== 'undefined' && navigator.share) {
          ui.pill(ctx, th, 'share-system', 16, by, app.W - 32, 50, '用手机自带的分享发到微信', () => { P.systemShare(title, url); app.pop(); }, 'primary');
          by += 58;
        }
        ui.pill(ctx, th, 'share-copy', 16, by, app.W - 32, 46, '复制链接', () => { P.copyText(title + ' ' + url); app.pop(); app.toast('链接已复制，发给朋友吧'); }, navigator.share ? 'card' : 'primary');
      },
    });
    return dataUrl;
  };

  // 发挑战 / 发成绩：b = 我这一局。kind = 'duo'：约好一起做的那题，做完互发成绩
  app.shareChallenge = (b, isReply, kind) => {
    const tn = S.TIERS[b.tier].name;
    // 用时先不说（Cc：「她做完成功之后，才看得到我的时间」）：做完这一题才揭晓
    const title = kind === 'duo' ? '约好一起做的那题，我做完了！你做完就能看到我的用时'
      : isReply ? '我也解开了这题，该你了（做完才看得到我的用时）' : '我解开了这题「' + tn + '」数独，你来试试？做完才看得到我的用时';
    const img = app.makeShareImage(b, kind === 'duo' ? ['我做完了', '约好的那一题'] : ['我解开了', '这一题'], '「' + tn + '」数独\n做完才揭晓我的用时');
    return app.shareCard(title, encode(b), img, kind === 'duo' ? '把成绩发给他' : '发给朋友挑战');
  };

  // ---------- 朋友点开 ----------
  let ch = null;
  app.openChallenge = (q) => {
    const c = decode(q);
    if (!c) return false;
    ch = c;
    const mine = (store.data.finished || {})[c.puzzle], cur = store.data.current;
    if (mine) {
      // 这一题我已经做完了（比如约好一起做、或者朋友把成绩发回来）：直接两人并排比，不用再做一遍
      app.go('result', { board: { mode: 'challenge', tier: c.tier, idx: c.idx, puzzle: c.puzzle, elapsed: mine.time, mistakes: mine.mistakes, score: mine.score || 0, revives: 0, challenge: { time: c.time, mistakes: c.mistakes }, compareOnly: true } });
    } else if (cur && !cur.done && cur.puzzle === c.puzzle) {
      // 这一题我正在做：把朋友的成绩挂上，做完就揭晓
      cur.challenge = { time: c.time, mistakes: c.mistakes };
      store.save();
      app.continueGame();
      setTimeout(() => app.toast('朋友做完了！\n你做完这一题就能看到他的用时', 2600), 300);
    } else app.go('challenge');
    return true;
  };
  app.startChallenge = (guided) => {
    store.data.seen.tutorial = true;
    if (!store.data.level) store.data.level = guided ? 'new' : 'some';
    app.shelveCurrent();
    const nb = Board.create({ mode: 'challenge', tier: ch.tier, idx: ch.idx, puzzle: ch.puzzle, guided });
    nb.challenge = { time: ch.time, mistakes: ch.mistakes };
    store.data.current = nb;
    store.save();
    app.go('play', { board: nb });
  };

  app.scenes.challenge = {
    draw(ctx, t) {
      const th = app.th, W = app.W;
      const fresh = !store.data.seen.tutorial;
      app.header(ctx, '好友挑战', () => app.go(fresh ? 'welcome' : 'home'));
      let y = app.headerY + app.headerH + 16;
      // 朋友的用时先藏着，做完才揭晓
      ui.text(ctx, '你的朋友解开了', W / 2, y + 10, 15, th.sub, 'center');
      ui.text(ctx, '这道「' + S.TIERS[ch.tier].name + '」数独', W / 2, y + 50, 30, th.primary, 'center', 700);
      ui.text(ctx, '他用了多久？做完这一题才揭晓', W / 2, y + 92, 15, th.text, 'center', 600);
      y += 118;
      const avail = app.bottom - 16 - y - (fresh ? 170 : 110);
      const size = Math.max(180, Math.min(W - 64, Math.floor(avail / 9) * 9));
      const vals = S.decode(ch.puzzle);
      DB.draw(ctx, th, { x: Math.round((W - size) / 2), y, size }, { vals, given: vals.map(Boolean), notes: null, wrong: () => false, selected: -1, now: t }, app.dpr);
      y += size + 18;
      if (fresh) {
        // 第一次玩：先学 30 秒规则，再带着做这一题
        ui.pill(ctx, th, 'ch-learn', 16, y, W - 32, 56, '没玩过？先花 30 秒学规则', () => app.go('lesson', { index: 0, then: 'challenge', firstRun: true }), 'primary');
        ui.text(ctx, '学完就做这一题，前 3 步带着你走', W / 2, y + 72, 12, th.sub, 'center');
        ui.pill(ctx, th, 'ch-go', 16, y + 92, W - 32, 50, '我会玩，直接挑战', () => app.startChallenge(false), 'card');
      } else {
        ui.pill(ctx, th, 'ch-go', 16, y, W - 32, 56, '接受挑战', () => app.startChallenge(false), 'primary');
      }
    },
  };

  // 两人比：用时短的赢；一样快看谁错得少
  app.challengeResult = (b) => {
    // 按屏幕上看到的秒数比（往下取整），一样快就比谁错得少，再一样算你赢
    const c = b.challenge, mine = Math.floor(b.elapsed / 1000), theirs = Math.floor(c.time / 1000);
    const tie = mine === theirs;
    const win = mine < theirs || (tie && b.mistakes <= c.mistakes);
    return { win, tie, diff: Math.abs(mine - theirs) * 1000 };
  };

  app.challengeHooks = { current: () => ch, decode, encode };
};
