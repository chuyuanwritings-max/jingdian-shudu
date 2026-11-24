// 浏览器机器人：用真鼠标点（不直接改数据），从第一次打开一路点到解完四档难度，截图留证。
// 用法：node tools/build-preview.js && node test/robot.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/chuyuannc/Downloads/Cursor/Kira/06_游戏设计/node_modules/playwright');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const url = 'file://' + path.join(__dirname, '..', 'preview.html');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✓ ' + m); } else { fail++; console.log('✗ ' + m); } };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForTimeout(700);
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
  const click = async (p, wait) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(wait === undefined ? 60 : wait); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const scene = () => ev(() => window.__app.sceneName);
  // 按按钮 id 找它在屏幕上的位置（按钮是每帧登记的）
  const regionOf = (id) => ev((id) => {
    const rs = window.__regions();
    const r = rs.find((x) => x.id === id);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  }, id);
  const skipCuts = async () => {
    for (let i = 0; i < 20; i++) {
      const pt = await regionOf('cs-skip');
      if (!pt) return;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(120);
    }
  };
  const more = async (i) => { await tap('home-more', 350); await tap('more-' + i, 400); };
  const tap = async (id, wait) => {
    await page.waitForTimeout(30);
    if (id !== 'cs-skip') await skipCuts();
    const p = await regionOf(id);
    if (!p) throw new Error('找不到按钮 ' + id + '（场景 ' + (await scene()) + '）');
    await click(p, wait === undefined ? 250 : wait);
  };

  // ---------- 1. 第一次打开 = 第 1 课 ----------
  // 一课从头点到尾（演示步等动画、练习步照答案点），shots：{ 'si,ai': 名字 } 在那一刻截图
  async function runLesson(shots) {
    for (let guard = 0; guard < 50; guard++) {
      const st = await ev(() => { const L = window.__app.lessonHooks.state(); const s = L.steps[L.si]; return { si: L.si, ai: L.ai, ok: L.ok, actions: s.actions || null, demo: !!s.demo }; });
      const key = st.si + ',' + (st.actions && !st.ok ? st.ai : 'end');
      if (shots && shots[key]) { await page.waitForTimeout(st.demo ? 1700 : 150); await shot(shots[key]); delete shots[key]; }
      if (st.actions && !st.ok) {
        const a = st.actions[st.ai];
        if (a.cell !== undefined) await click(await ev((k) => window.__app.lessonHooks.cellCenter(k), a.cell), 120);
        else if (a.num !== undefined) await click(await ev((v) => window.__app.lessonHooks.padCenter(v), a.num), 120);
        else await click(await ev(() => window.__app.lessonHooks.noteCenter()), 120);
        continue;
      }
      if (st.demo) await page.waitForTimeout(1700);
      await tap('lnext', 300);
      if ((await ev(() => window.__app.overlays.length)) > 0) return true;
    }
    return false;
  }

  // ---------- 1. 第一次打开：先问你是什么级别 ----------
  ok((await scene()) === 'welcome', '第一次打开先问「你玩过数独吗？」');
  await page.waitForTimeout(1200);
  await shot('01_开场过场');
  ok(await ev(() => window.__app.overlays.some((o) => o.cut)), '第一次打开先播开场过场');
  await skipCuts();
  await shot('01b_第一次打开_选级别');
  await tap('wel-new', 400);
  ok((await scene()) === 'lesson', '选「没玩过」→ 第 1 课规则');
  await runLesson({ '0,end': '02_没玩过_第1课规则' });
  await shot('03_规则学完_开始带练');
  await tap('lf-guided', 600);
  let gb = await ev(() => { const b = window.__app.testHooks.board(); return { guided: b.guided, left: b.guideLeft, tier: b.tier }; });
  ok(gb.guided && gb.left === 3 && gb.tier === 0, '学完规则 → 入门带练局（前 3 步带着走）');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(250);
    const g = await ev(() => { const x = window.__app.testHooks.guide(); return x ? { k: x.h.place.k, v: x.h.place.v } : null; });
    if (!g) break;
    if (i === 0) await shot('04_带练_手指指格子');
    await click(await ev((k) => window.__app.testHooks.cellCenter(k), g.k), 150);
    if (i === 0) await shot('05_带练_手指指数字');
    await click(await ev((v) => window.__app.testHooks.padCenter(v), g.v), 200);
  }
  gb = await ev(() => { const b = window.__app.testHooks.board(); return { left: b.guideLeft, hints: b.hintsLeft }; });
  ok(gb.left === 0 && gb.hints >= 90, '带练 3 步走完，之后提示不限次数');
  await page.waitForTimeout(600);
  await shot('06_带练走完_自己来');
  await tap('hdr-back', 400);

  // ---------- 2. 其余六课（含新加的区块排除、数对）----------
  await more('lessons');
  await shot('07_教学目录');
  const LESSON_SHOTS = { 2: { '1,end': '08_排除法_红线讲因果' }, 3: { '1,end': '09_唯一候选' }, 4: { '1,end': '10_笔记_自动擦掉' }, 5: { '1,end': '11_区块排除', '2,0': '12_区块排除_练习' }, 6: { '1,end': '13_数对', '2,0': '14_数对_练习' } };
  for (let li = 1; li < 7; li++) {
    await tap('lesson-' + li, 400);
    await runLesson(LESSON_SHOTS[li]);
    const id = ['rules', 'last', 'hatch', 'naked', 'notes', 'pointing', 'pair'][li];
    ok(await ev((x) => !!window.__store.data.lessons[x], id), '第 ' + (li + 1) + ' 课学完（' + id + '）');
    await tap('lf-list', 400);
  }
  ok((await scene()) === 'lessons', '学完回到教学目录');
  await shot('15_教学目录_七课打勾');

  // ---------- 3. 首页、练脑、设置 ----------
  await tap('hdr-back', 400);
  ok((await scene()) === 'home', '回首页');
  await shot('09_首页');
  await more('brain');
  await shot('10_数独练脑');
  ok((await scene()) === 'brain', '练脑页能打开');
  await tap('hdr-back', 400);
  await more('settings');
  await shot('11_设置');
  await tap('set-look', 500);
  ok((await scene()) === 'look', '设置 → 主题页');
  await shot('11b_主题页');
  await tap('look-theme-notebook', 300);
  ok((await ev(() => window.__store.data.settings.theme)) === 'notebook', '主题：换成「手写本」');
  await tap('look-theme-wood', 300);
  ok((await ev(() => window.__store.data.settings.theme)) === 'notebook', '没解锁的主题点了不换（提示去结算页解锁）');
  ok((await ev(() => Object.keys(window.__store.data.settings).join(','))).indexOf('texture') < 0, '没有单独的颜色、质地选项');
  await tap('hdr-back', 400);
  ok((await scene()) === 'home', '主题页返回首页');
  await ev(() => { window.__store.data.settings.theme = 'paper'; });

  // ---------- 4. 解四档难度（真点击）----------
  const G = {
    board: () => ev(() => { const b = window.__app.testHooks.board(); return { vals: b.vals, sol: b.sol, done: b.done, lost: b.lost, mistakes: b.mistakes, score: b.score, notes: b.notes, hintsLeft: b.hintsLeft, elapsed: b.elapsed }; }),
    cell: (k) => ev((k) => window.__app.testHooks.cellCenter(k), k),
    pad: (v) => ev((v) => window.__app.testHooks.padCenter(v), v),
    tool: (i) => ev((i) => window.__app.testHooks.toolCenter(i), i),
  };
  async function solve(tierName, shotPrefix, extra) {
    await page.waitForTimeout(600);
    for (let i = 0; i < 8 && (await ev(() => !!(window.__app.testHooks.teach && window.__app.testHooks.teach()))); i++) await tap('teach-next', 150);
    let b = await G.board();
    const empties = [];
    for (let k = 0; k < 81; k++) if (!b.vals[k]) empties.push(k);
    let n = 0;
    for (const k of empties) {
      await click(await G.cell(k), 20);
      await click(await G.pad(+b.sol[k]), 25);
      n++;
      if (extra && n === 6) await extra();
      if (n === 10 && shotPrefix) { await page.waitForTimeout(150); await shot(shotPrefix + '_玩到一半'); }
      if ((await ev(() => window.__app.overlays.length)) > 0) break;
    }
    // 通关：第一段在棋盘上（顿、金色波浪、长停），第二段过场（收成金方块、完成！）。中途截两张，然后等到结算
    await page.waitForTimeout(1300);
    if (shotPrefix) await shot(shotPrefix + '_通关_金色波浪');
    for (let i = 0; i < 40 && (await scene()) !== 'result'; i++) {
      await page.waitForTimeout(250);
      if (shotPrefix && i === 9) await shot(shotPrefix + '_通关_完成');
      if (i > 24) await skipCuts();
    }
    await page.waitForTimeout(450);
    return scene();
  }

  // 入门：开新游戏走首页按钮 → 选难度
  await tap('home-link', 400);
  await shot('12_选难度');
  await tap('tier-0', 600);
  ok((await scene()) === 'play', '选「入门」开局');
  // 第一次入门：讲解卡一步一步讲「排除法」，点到「轮到我填」
  for (let i = 0; i < 8 && (await ev(() => !!window.__app.testHooks.teach())); i++) await tap('teach-next', 200);
  await ev(() => { window.__app.testHooks.sakura().clear(); });
  await shot('13_入门开局');
  // 选中格子：同行同列同宫和相同数字高亮
  let b = await G.board();
  const given = b.vals.findIndex((v) => v);
  await click(await G.cell(given), 200);
  await shot('14_点一格_相同数字亮黄');
  // 笔记：开笔记，在一格记两个数
  await click(await G.tool(0), 80);
  const e0 = b.vals.findIndex((v) => !v);
  await click(await G.cell(e0), 40);
  const w0 = (+b.sol[e0] % 9) + 1, w1 = (w0 % 9) + 1 === +b.sol[e0] ? (w0 % 9) + 2 : (w0 % 9) + 1;
  await click(await G.pad(w0), 60);
  // 记完放开这一格：再点别的数字只是看看，不会记进去
  const sel0 = await ev(() => window.__app.testHooks.board().selected);
  await click(await G.pad(w1), 60);
  b = await G.board();
  ok(sel0 === -1 && b.notes[e0] === (1 << w0), '记完一个笔记就放开这一格：再点 ' + w1 + ' 只是看看，没有记进去');
  await click(await G.cell(e0), 40);
  await click(await G.pad(w1), 60);
  b = await G.board();
  const notes0 = b.notes[e0];
  ok(notes0 === ((1 << w0) | (1 << w1)), '再点一下格子，就能接着记第二个数');
  await click(await G.cell(e0), 40);
  await shot('16_笔记');
  await click(await G.tool(0), 80);
  // 在记了笔记的格子填错：红字留两秒，自己拿掉，笔记还在
  await click(await G.pad(w0), 120);
  await shot('15_填错_红字');
  b = await G.board();
  ok(b.mistakes === 1 && b.vals[e0] === w0, '填错记 1 次错误，错的数先留在格子里');
  await page.waitForTimeout(2300);
  b = await G.board();
  ok(b.vals[e0] === 0 && b.notes[e0] === notes0, '两秒后错的数自己拿掉，底下的笔记原样还在（不用橡皮）');
  await shot('15b_错数拿掉_笔记还在');
  ok(!(await regionOf('tool-undo')) && !(await regionOf('tool-erase')) && !!(await regionOf('tool-note')) && !!(await regionOf('tool-hint')), '工具只剩「笔记」「提示」（撤销、橡皮去掉了）');
  const e1 = e0, v1 = +b.sol[e1];
  // 学 Sudoku 2：点数字键 → 所有这个数 + 笔记里有它的格子亮黄
  await ev(() => { window.__app.testHooks.board().selected = -1; window.__app.redraw(); });
  await click(await G.pad(v1), 200);
  ok((await ev(() => window.__app.testHooks.selDigit())) === v1, '没选格子时点数字：只让这个数亮起来，不填');
  await shot('16b_点数字_同数和笔记格亮黄');
  await click(await G.cell(e1), 40);
  await click(await G.pad(v1), 300);
  await shot('17_填对_高光');
  b = await G.board();
  ok(b.vals[e1] === v1 && b.score > 0 && b.notes[e1] === 0, '填对得分 ' + b.score + '，这一格的笔记清掉');
  // 提示：第一次免费
  await click(await G.tool(1), 400);
  await shot('18_提示_先说用哪招');
  const h = await ev(() => { const x = window.__app.testHooks.hint(); return x ? { text: x.h.text, k: x.h.place.k, v: x.h.place.v } : null; });
  ok(!!h, '提示：' + (h && h.text));
  await tap('hint-fill', 300);
  b = await G.board();
  ok(h && b.vals[h.k] === h.v, '提示第二步：直接填上');
  // 第二次提示要看广告
  await click(await G.tool(1), 300);
  await shot('19_提示_看广告');
  ok((await ev(() => window.__app.overlays.length)) === 1, '提示用完 → 弹广告');
  await page.waitForTimeout(3600);
  ok(!!(await ev(() => window.__app.testHooks.hint())), '看完广告给提示');
  await tap('hint-fill', 300);
  // 中途退出 → 首页有「继续」→ 刷新页面也还在
  await tap('hdr-back', 400);
  await shot('20_首页_继续游戏');
  await page.reload();
  await page.waitForTimeout(700);
  ok((await ev(() => !!window.__store.data.current)), '刷新以后存档还在');
  await tap('home-main', 500);
  ok((await scene()) === 'play', '「继续游戏」接着玩');
  const r0 = await solve('入门', '21_入门');
  ok(r0 === 'result', '入门 解完 → 结算');
  await shot('22_入门_结算');
  // 结算页广告：解锁配色
  await tap('res-theme', 300);
  await page.waitForTimeout(3700);
  ok((await ev(() => window.__store.data.themes.wood)) === true, '结算页看视频解锁「原木」主题');
  await shot('23_换上原木主题');
  await ev(() => { window.__store.data.settings.theme = 'paper'; window.__store.save(); });

  // 简单、中等、困难：结算页「再来一局」→ 从首页选
  await ev(() => { window.__store.data.lessons.pointing = false; window.__store.data.gateSeen = {}; });
  for (const [ti, name] of [[1, '简单'], [2, '中等'], [3, '困难']]) {
    await tap('res-home', 400);
    await tap('home-link', 400);
    if (ti === 2) await shot('16_选难度_推荐和新招');
    await tap('tier-' + ti, 600);
    if (ti === 2) {
      ok((await ev(() => window.__app.overlays.length)) === 1, '第一次玩「中等」：先问要不要学「区块排除」');
      await shot('17_中等_先学一招');
      await tap('gate-skip', 600);
    }
    const r = await solve(name, ti === 3 ? '24_困难' : null);
    ok(r === 'result', name + ' 用真点击解完 → 结算');
  }
  await shot('25_困难_结算');
  // 发给朋友挑战这一题（浏览器里弹分享窗，给出链接）
  await tap('res-share', 400);
  await shot('26_发给朋友_卡片预览');
  const shareUrl = await ev(() => window.__app.lastShare && window.__app.lastShare.url);
  ok(!!shareUrl && shareUrl.indexOf('c=3.') > 0 && shareUrl.indexOf('p=') > 0, '结算页「发给朋友挑战」生成挑战链接');
  const shareTitle = await ev(() => window.__app.lastShare && window.__app.lastShare.title);
  ok(!!shareTitle && !/\d+:\d\d/.test(shareTitle) && shareTitle.indexOf('做完才看得到') >= 0, '挑战卡不写自己的用时（做完才揭晓）：' + shareTitle);
  await page.mouse.click(195, 60); // 点上面空白处关掉
  await page.waitForTimeout(300);
  const stats = await ev(() => window.__store.data.stats);
  ok(stats[0].won === 1 && stats[1].won === 1 && stats[2].won === 1 && stats[3].won === 1, '战绩：四档各赢 1 局');

  // ---------- 5. 错 3 次 → 看广告再给一次机会 ----------
  await tap('res-home', 400);
  await tap('home-link', 400);
  await tap('tier-4', 600);
  b = await G.board();
  let wrongs = 0;
  for (let k = 0; k < 81 && wrongs < 3; k++) {
    if (b.vals[k]) continue;
    await click(await G.cell(k), 30);
    await click(await G.pad((+b.sol[k] % 9) + 1), 60);
    wrongs++;
  }
  await page.waitForTimeout(700);
  await shot('26_错3次');
  b = await G.board();
  ok(b.lost && (await ev(() => window.__app.overlays.length)) === 1, '错 3 次 → 弹窗');
  await tap('lost-revive', 300);
  await page.waitForTimeout(3700);
  b = await G.board();
  ok(!b.lost && b.mistakes === 2, '看完广告：错误数退回 2，接着做');
  ok(stats.length === 6, '六档难度都有题库');

  // ---------- 6. 每日挑战 ----------
  await tap('hdr-back', 400);
  await tap('home-daily', 400);
  await shot('27_每日挑战_日历');
  await tap('daily-go', 600);
  ok((await ev(() => window.__app.testHooks.board().mode)) === 'daily', '每日挑战开局');
  const rd = await solve('每日', null);
  ok(rd === 'result', '每日挑战解完');
  await tap('res-cal', 400);
  await shot('28_每日挑战_打勾');
  const today = await ev(() => window.__store.dateKey(new Date()));
  ok(!!(await ev((d) => window.__store.data.daily[d], today)), '日历上今天打勾');

  // ---------- 7. 战绩、好友榜 ----------
  await tap('hdr-back', 400);
  await more('stats');
  await shot('29_战绩');
  await tap('hdr-back', 400);
  await tap('home-rank', 400);
  await shot('30_好友榜_浏览器里');
  ok((await scene()) === 'rank', '好友榜页能打开');

  // ---------- 8. 「会一点」：两道小测 → 推荐难度 ----------
  await ev(() => { window.__store.data.seen.tutorial = false; window.__app.go('welcome'); });
  await page.waitForTimeout(300);
  await tap('wel-some', 400);
  ok(await ev(() => window.__app.lessonHooks.state().quiz), '选「会一点」→ 两道小测');
  const q1 = await ev(() => { const L = window.__app.lessonHooks.state(), s = L.steps[0]; return { hl: s.hl, target: s.actions[0].cell, text: s.text }; });
  ok(!!q1.hl && q1.hl.cells.length === 9 && q1.hl.digit > 0, '第 1 题：要找的那一宫亮金边、要放的数（' + (q1.hl && q1.hl.digit) + '）盘上和键上都亮黄：「' + q1.text + '」');
  // Cc 的情况：先点了这一宫里别的格子看看，再做对 → 还是推荐「简单」（以前点错格子就算错、一错就推荐入门）
  const wrongCell = q1.hl.cells.find((k) => k !== q1.target);
  await click(await ev((k) => window.__app.lessonHooks.cellCenter(k), wrongCell), 150);
  await runLesson({ '0,0': '18_会一点_小测' });
  await shot('19_小测_推荐难度');
  await tap('quiz-go', 600);
  ok((await ev(() => window.__app.testHooks.board().tier)) === 1, '两题都做出来（中间点错过一个格子）→ 推荐「简单」开局');

  // ---------- 9. 朋友点开挑战链接（另一个全新的浏览器 = 第一次玩的朋友）----------
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push('朋友端：' + String(e.stack || e)));
  await p2.goto(shareUrl);
  await p2.waitForTimeout(700);
  const ev2 = (fn, arg) => p2.evaluate(fn, arg);
  const click2 = async (pt, w) => { await p2.mouse.click(pt.x, pt.y); await p2.waitForTimeout(w === undefined ? 80 : w); };
  const tap2 = async (id, w) => { await p2.waitForTimeout(30); for (let i = 0; i < 20; i++) { const sk = await ev2(() => { const r = window.__regions().find((x) => x.id === 'cs-skip'); return r ? { x: r.x + 5, y: r.y + 5 } : null; }); if (!sk || id === 'cs-skip') break; await p2.mouse.click(sk.x, sk.y); await p2.waitForTimeout(120); } const pt = await ev2((id) => { const r = window.__regions().find((x) => x.id === id); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; }, id); if (!pt) throw new Error('朋友端找不到按钮 ' + id); await click2(pt, w === undefined ? 300 : w); };
  const shot2 = (n) => p2.screenshot({ path: path.join(SHOTS, n + '.png') });
  ok((await ev2(() => window.__app.sceneName)) === 'challenge', '朋友点开链接：直接到这一题的挑战页（不先进首页）');
  await shot2('30_朋友点开_挑战页');
  await tap2('ch-learn', 400);
  ok((await ev2(() => window.__app.lessonHooks.state().then)) === 'challenge', '第一次玩的朋友：先学 30 秒规则');
  for (let guard = 0; guard < 30; guard++) {
    const st = await ev2(() => { const L = window.__app.lessonHooks.state(); const s = L.steps[L.si]; return { ai: L.ai, ok: L.ok, actions: s.actions || null, demo: !!s.demo }; });
    if (st.actions && !st.ok) {
      const a = st.actions[st.ai];
      if (a.cell !== undefined) await click2(await ev2((k) => window.__app.lessonHooks.cellCenter(k), a.cell), 120);
      else await click2(await ev2((v) => window.__app.lessonHooks.padCenter(v), a.num), 120);
      continue;
    }
    if (st.demo) await p2.waitForTimeout(1700);
    await tap2('lnext', 300);
    if ((await ev2(() => window.__app.overlays.length)) > 0) break;
  }
  await tap2('lf-challenge', 600);
  let cb = await ev2(() => { const b = window.__app.testHooks.board(); return { mode: b.mode, guided: b.guided, ch: b.challenge, tier: b.tier }; });
  ok(cb.mode === 'challenge' && cb.guided && cb.ch && cb.tier === 3, '学完规则 → 做朋友那一题（困难），前 3 步带着走（朋友用时做完才揭晓）');
  await p2.waitForTimeout(300);
  await shot2('31_朋友端_带练挑战');
  // 朋友用真点击做完
  const b2 = await ev2(() => { const b = window.__app.testHooks.board(); return { vals: b.vals, sol: b.sol }; });
  for (let k = 0; k < 81; k++) {
    if (b2.vals[k]) continue;
    await click2(await ev2((k) => window.__app.testHooks.cellCenter(k), k), 20);
    await click2(await ev2((v) => window.__app.testHooks.padCenter(v), +b2.sol[k]), 25);
  }
  for (let i = 0; i < 40 && (await ev2(() => window.__app.sceneName)) !== 'result'; i++) {
    await p2.waitForTimeout(250);
    if (i > 8) { const sk = await ev2(() => !!window.__regions().find((x) => x.id === 'cs-skip')); if (sk) await p2.mouse.click(30, 30); }
  }
  await p2.waitForTimeout(450);
  ok((await ev2(() => window.__app.sceneName)) === 'result', '朋友做完 → 结算');
  await shot2('32_朋友端_两人对比');
  await tap2('res-reply', 400);
  const back = await ev2(() => window.__app.lastShare && window.__app.lastShare.url);
  ok(!!back && back.indexOf('c=3.') > 0, '朋友能「发回去挑战他」');
  await ctx2.close();

  // ---------- 9a. 本局一招：中等从一招题库出，填对关键格算一次 ----------
  {
    const FB = require(path.join(__dirname, '..', 'js', 'focus_bank.js'));
    await ev(() => { window.__store.data.current = null; window.__store.data.lessons.pointing = true; window.__app.overlays.length = 0; window.__app.startGame(2, { skipGate: true }); });
    await page.waitForTimeout(700);
    const fb = await ev(() => { const b = window.__app.testHooks.board(); return { idx: b.idx, focus: b.focus, sol: b.sol }; });
    const fromBank = !FB[2].length || fb.idx >= 1000;
    ok(fromBank && fb.focus && fb.focus.name === '区块排除' && fb.focus.keys.length >= (FB[2].length ? 3 : 1), '中等开局：本局一招「区块排除」，这一盘有 ' + (fb.focus ? fb.focus.keys.length : 0) + ' 处要用它' + (FB[2].length ? '（一招题库第 ' + (fb.idx - 999) + ' 题）' : ''));
    ok(!!(await regionOf('focus-chip')), '棋盘上方有「本局一招」小条');
    // 照解题顺序用真点击填到第一个关键格前，再填关键格：这时候它正是「非用区块排除不可」
    const SS = require(path.join(__dirname, '..', 'js', 'sudoku.js'));
    const pz = await ev(() => window.__app.testHooks.board().puzzle);
    const stp = SS.makeState(SS.decode(pz)), path9 = [];
    for (let g = 0; g < 400; g++) { const s2 = SS.nextStep(stp, 5); if (!s2) break; if (s2.place) { path9.push(s2.place); if (s2.place.k === fb.focus.keys[0]) break; } SS.applyStep(stp, s2); }
    for (const pl of path9) {
      await click(await ev((k) => window.__app.testHooks.cellCenter(k), pl.k), 15);
      await click(await ev((v) => window.__app.testHooks.padCenter(v), pl.v), 20);
    }
    await page.waitForTimeout(500);
    ok((await ev(() => window.__app.testHooks.board().focus.got.length)) >= 1, '照顺序填到关键格：小樱认出「区块排除」，记一次（前面填了 ' + (path9.length - 1) + ' 格）');
    await shot('33_本局一招_用上一次');
    await tap('focus-chip', 400);
    ok(!!(await regionOf('focus-learn')), '点小条：讲这一招，能去学');
    await tap('focus-ok', 300);
  }

  // ---------- 9c. 约好友一起做 + 进度表 ----------
  {
    await ev(() => { window.__app.overlays.length = 0; window.__app.go('home'); });
    await page.waitForTimeout(300);
    await tap('home-duo', 400);
    ok(!!(await regionOf('duo-send')), '主页「对战」→ 约好友对战：选难度、选几分钟后开始');
    await tap('duo-tier-1', 100); await tap('duo-delay-3', 100);
    await tap('duo-send', 600);
    const inv = await ev(() => window.__app.lastShare);
    const dq = inv && inv.q && String(inv.q.d).split('.');
    ok(!!dq && dq[0] === '1' && Math.abs(+dq[2] - Date.now() / 1000 - 180) < 10 && /^[0-9]{81}$/.test(inv.q.p), '邀请卡：「简单」、3 分钟后开始、同一道题（' + (inv && inv.title) + '）');
    ok((await scene()) === 'duo', '发完邀请进等候室');
    await shot('34_约好友一起做_等候室');
    // 朋友（新浏览器）点开一张 4 秒后开始的邀请：倒计时 → 到点自动开同一题
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => errors.push('朋友3：' + String(e)));
    const at = Math.ceil(Date.now() / 1000) + 4;
    await p3.goto(url + '?d=1.' + dq[1] + '.' + at + '&p=' + inv.q.p);
    await p3.waitForTimeout(1200);
    ok((await p3.evaluate(() => window.__app.sceneName)) === 'duo', '朋友点开邀请：到等候室，题目盖着、倒计时');
    await p3.waitForTimeout(4200);
    const gb = await p3.evaluate(() => { const b = window.__app.testHooks.board(); return { scene: window.__app.sceneName, mode: b && b.mode, puzzle: b && b.puzzle }; });
    ok(gb.scene === 'play' && gb.mode === 'duo' && gb.puzzle === inv.q.p, '到点自动开局：同一道题，「一起做」模式');
    await p3.waitForTimeout(1200);
    const vs = await p3.evaluate(() => { const b = window.__app.testHooks.board(); return { focus: !!b.focus, teach: !!window.__app.testHooks.teach(), chip: !!window.__regions().find((r) => r.id === 'focus-chip') }; });
    ok(!vs.focus && !vs.teach && !vs.chip, '对战：没有「本局一招」、开局不演示（Cc：对战只告诉我用了哪招，不用教）');
    await ctx3.close();
    // 我做完过的题收到朋友的成绩：直接并排比
    await ev((p) => { const s = window.__store.data; s.finished = s.finished || {}; s.finished[p] = { time: 200000, mistakes: 0, score: 2000, tier: 1, at: Date.now() }; s.duo = null; window.__app.overlays.length = 0; window.__app.openChallenge({ c: '1.0.250.2', p }); }, inv.q.p);
    await page.waitForTimeout(700);
    ok((await scene()) === 'result' && (await ev(() => window.__app.challengeResult({ elapsed: 200000, mistakes: 0, challenge: { time: 250000, mistakes: 2 } }).win)), '做完过的题收到朋友成绩：直接两人并排比，不用再做一遍');
    // 进度表
    await ev(() => { window.__app.overlays.length = 0; window.__app.go('home'); });
    await page.waitForTimeout(300);
    await more('progress');
    ok((await scene()) === 'progress', '更多 → 进度表');
    const rc = await ev(() => window.__store.recent(7));
    ok(rc.games > 0 && rc.tier >= 0, '进度表：最近 7 天 ' + rc.games + ' 局、赢 ' + rc.won + ' 局、最常玩「' + ['入门', '简单', '中等', '困难', '专家', '大师'][rc.tier] + '」');
    await shot('35_进度表');
  }

  // ---------- 9d. 思维链闪光 + 小樱认招 + 开局演示 + 主页入口 ----------
  {
    await ev(() => { const s = window.__store.data; s.current = null; s.seen.demo = {}; window.__app.overlays.length = 0; window.__app.startGame(0, { skipGate: true }); });
    // 第一次演示：讲解卡一步一步讲，点「下一步」才往下走；讲的时候不计时
    let tc = null;
    for (let i = 0; i < 30 && !tc; i++) { await page.waitForTimeout(250); tc = await ev(() => { const T = window.__app.testHooks.teach(); return T && { n: T.stages.length, texts: T.stages.map((s) => s.text) }; }); }
    ok(!!tc && tc.n >= 2, '入门开局：讲解卡一步一步讲「排除法」（' + (tc ? tc.n + ' 步：' + tc.texts.join(' / ').replace(/\n/g, '') : '没出来') + '）');
    await page.waitForTimeout(1600);
    await shot('36a_一步一步讲_第1步');
    const el0 = await ev(() => window.__app.testHooks.board().elapsed);
    await page.waitForTimeout(800);
    ok((await ev(() => window.__app.testHooks.board().elapsed)) === el0, '讲的时候计时停着');
    let dm = null;
    for (let i = 0; i < 8 && !dm; i++) { await tap('teach-next', 400); dm = await ev(() => window.__app.testHooks.demo()); }
    ok(!!dm, '讲完点「轮到我填」：手指指着那一格（' + (dm ? '第 ' + (dm.k + 1) + ' 格填 ' + dm.v : '没出来') + '）');
    if (dm) {
      await click(await ev((k) => window.__app.testHooks.cellCenter(k), dm.k), 80);
      await click(await ev((v) => window.__app.testHooks.padCenter(v), dm.v), 120);
      const after = await ev(() => ({ demo: window.__app.testHooks.demo(), chain: !!window.__app.testHooks.chain(), techs: window.__app.testHooks.board().techs }));
      ok(!after.demo && after.chain && after.techs && after.techs['排除法'] === 1, '照着填对：一道光顺着思维链划过去，小樱认出「排除法」记 1 次');
      await page.waitForTimeout(250);
      await shot('37_思维链闪光');
    }
    // 越档认招：中等一招题里，那一招在入门玩家的盘面上也认得出是「区块排除」（中等的招）
    const S = require(path.join(__dirname, '..', 'js', 'sudoku.js')), FB = require(path.join(__dirname, '..', 'js', 'focus_bank.js'));
    const pz = S.decode(FB[2][0]), keys = S.focusCells(pz, ['pointing', 'claiming']), st = S.makeState(pz);
    let ex = null;
    for (let g = 0; g < 400 && !ex; g++) { const s2 = S.nextStep(st, 5); if (!s2) break; if (s2.place && s2.place.k === keys[0]) ex = S.explain(st.g, s2.place.k, s2.place.v); S.applyStep(st, s2); }
    ok(!!ex && ex.show === '区块排除' && ex.level === 2 && ex.chain.length >= 1, '认招：这一格要先用区块排除才定得下（比入门难两档，小樱会说「哇」）');
    // 区块排除第一次：先讲宫里被挡住、再讲 7 只能在同一行、再打叉、最后只剩一格
    await ev(() => { const s = window.__store.data; s.current = null; s.seen.demo = {}; window.__app.overlays.length = 0; window.__app.startGame(2, { skipGate: true }); });
    let tp = null;
    for (let i = 0; i < 30 && !tp; i++) { await page.waitForTimeout(250); tp = await ev(() => { const T = window.__app.testHooks.teach(); return T && T.stages.map((s) => s.text); }); }
    ok(!!tp && tp.length >= 4, '中等开局：「区块排除」分 ' + (tp ? tp.length : 0) + ' 步讲：' + (tp ? tp.join(' / ').replace(/\n/g, '') : ''));
    for (let i = 0; tp && i < tp.length; i++) { await page.waitForTimeout(i ? 2200 : 2600); await shot('36b_区块排除_第' + (i + 1) + '步'); if (i < tp.length - 1) await tap('teach-next', 100); }
    // 笔记开：数字键变成空心虚线框、小数字在它进格子以后的位置
    await ev(() => { const s = window.__store.data; s.current = null; window.__app.overlays.length = 0; window.__app.startGame(1, { skipGate: true }); });
    await page.waitForTimeout(600);
    for (let i = 0; i < 8 && (await ev(() => window.__app.testHooks.teach())); i++) await tap('teach-next', 200);
    await page.waitForTimeout(300);
    await shot('38a_笔记关');
    await tap('tool-note', 300);
    ok(await ev(() => window.__app.testHooks.noteMode()), '点笔记：笔记开');
    await shot('38b_笔记开_数字键变空心');
    await tap('tool-note', 200);
    await ev(() => { window.__app.overlays.length = 0; window.__app.go('home'); });
    await page.waitForTimeout(400);
    ok(!!(await regionOf('home-duo')) && !!(await regionOf('home-rank')), '主页有「对战」「好友榜」');
    ok(!!(await ev(() => window.__layout.used['home.ver'])), '主页写着版本号');
  }

  // ---------- 9b. 界面编辑模式：编辑器代码不进微信包；layout.json 改了游戏照着走 ----------
  {
    const root = path.join(__dirname, '..');
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
    const ignored = cfg.packOptions.ignore.map((x) => x.value);
    const pkg = [];
    const walk = (dir, rel) => fs.readdirSync(dir).forEach((f) => {
      const r = rel ? rel + '/' + f : f, full = path.join(dir, f);
      if (ignored.indexOf(r) >= 0 || f.startsWith('.')) return;
      if (fs.statSync(full).isDirectory()) walk(full, r); else if (/\.(js|json)$/.test(f)) pkg.push(full);
    });
    walk(root, '');
    const bad = pkg.filter((f) => /__editor|editor\.js|uied-/.test(fs.readFileSync(f, 'utf8')));
    ok(pkg.length > 10 && bad.length === 0, '编辑器代码不进微信包（查了 ' + pkg.length + ' 个包内文件' + (bad.length ? '，混进了：' + bad.map((f) => path.relative(root, f)).join('、') : '') + '）');
    ok(ignored.indexOf('preview.html') >= 0 && ignored.indexOf('index.html') >= 0 && ignored.indexOf('comments.json') >= 0, '网页预览、评论文件都不进微信包');
    // 用一份把大按钮往上挪 100 的布局另打一个包，看主页大按钮是不是真挪了
    const tmpJson = path.join(require('os').tmpdir(), 'jd_layout_test.json'), tmpHtml = path.join(require('os').tmpdir(), 'jd_layout_test.html');
    const base = JSON.parse(fs.readFileSync(path.join(root, 'layout.json'), 'utf8'));
    const LYD = require(path.join(root, 'js', 'layout.js')).DEFS['home.main'];
    const cur = Object.assign({ x: LYD.x, y: LYD.y, w: LYD.w, h: LYD.h }, base.elements['home.main'] || {});
    const moved = { version: 1, elements: Object.assign({}, base.elements, { 'home.main': Object.assign({}, cur, { y: cur.y - 100 }) }) };
    fs.writeFileSync(tmpJson, JSON.stringify(moved));
    require('child_process').execFileSync(process.execPath, [path.join(root, 'tools', 'build-preview.js')], { env: Object.assign({}, process.env, { LAYOUT_JSON: tmpJson, OUT: tmpHtml }) });
    const yOf = async (file) => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await pg.goto('file://' + file);
      await pg.evaluate(() => { const s = window.__store.data; s.seen.tutorial = true; s.seen.open = true; s.level = 'pro'; window.__app.go('home'); });
      await pg.waitForTimeout(400);
      const y = await pg.evaluate(() => { const r = window.__regions().find((x) => x.id === 'home-main'); return r ? r.y : null; });
      await pg.close();
      return y;
    };
    const y0 = await yOf(path.join(root, 'preview.html')), y1 = await yOf(tmpHtml);
    ok(y0 != null && y1 != null && y0 - y1 > 80, 'layout.json 把大按钮上移 100，主页大按钮真的上移了（' + Math.round(y0) + ' → ' + Math.round(y1) + '）');
    const realMain = (require(path.join(root, 'js', 'layout_data.js')).elements || {})['home.main'];
    ok(!realMain || realMain.y !== cur.y - 100, '测试用的布局没写进真文件');
  }

  // ---------- 10. 没有报错 ----------
  ok(errors.length === 0, '没有报错' + (errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''));
  console.log('\n' + pass + ' 项通过，' + fail + ' 项没过');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
