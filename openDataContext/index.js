// 开放数据域：微信规定好友的分数只能在这里读、在这张「共享画布」上画。主游戏发消息说画哪一张榜。
// 只在微信里跑（浏览器预览不加载这个文件）。
const canvas = wx.getSharedCanvas();
const ctx = canvas.getContext('2d');

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function draw(list, msg) {
  const d = msg.dpr || 2, c = msg.colors;
  const W = canvas.width / d, H = canvas.height / d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = c.card; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  if (!list.length) {
    ctx.fillStyle = c.sub; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('还没有好友玩过这一档，分享给好友一起玩吧', W / 2, 60);
    return;
  }
  list.slice(0, 50).forEach((u, i) => {
    const y = 12 + i * 60;
    if (y > H) return;
    rr(12, y, W - 24, 52, 12); ctx.fillStyle = c.soft; ctx.fill();
    ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = i < 3 ? c.gold : c.sub;
    ctx.fillText(String(i + 1), 34, y + 26);
    ctx.textAlign = 'left'; ctx.font = '15px sans-serif'; ctx.fillStyle = c.text;
    const name = (u.nickname || '好友').slice(0, 10);
    ctx.fillText(name, 100, y + 26);
    ctx.textAlign = 'right'; ctx.font = 'bold 15px sans-serif';
    ctx.fillText(u.score + ' 分', W - 28, y + 26);
    if (u.avatarUrl) {
      const img = wx.createImage();
      img.onload = () => { ctx.save(); ctx.beginPath(); ctx.arc(74, y + 26, 16, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 58, y + 10, 32, 32); ctx.restore(); };
      img.src = u.avatarUrl;
    }
  });
}
// 进度表：好友最近在玩哪一档、这周几局、胜率（主游戏存的 KV：progress = { tier, week, won, t }）
function drawProgress(list, msg) {
  const d = msg.dpr || 2, c = msg.colors, tiers = msg.tiers || [];
  const W = canvas.width / d, H = canvas.height / d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = c.card; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';
  if (!list.length) {
    ctx.fillStyle = c.sub; ctx.font = '15px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('好友还没玩过，约他一起做一题吧', W / 2, 50);
    return;
  }
  list.slice(0, 30).forEach((u, i) => {
    const y = 12 + i * 60, x = 12, w = W - 24;
    if (y > H) return;
    rr(x, y, w, 52, 12); ctx.fillStyle = c.soft; ctx.fill();
    ctx.textAlign = 'left'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = c.text;
    ctx.fillText((u.nickname || '好友').slice(0, 8), x + 54, y + 17);
    ctx.font = '12px sans-serif'; ctx.fillStyle = c.sub;
    ctx.fillText(u.week ? '最近在玩「' + (tiers[u.tier] || '') + '」' : '这周没玩', x + 54, y + 37);
    ctx.textAlign = 'right'; ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = c.text;
    ctx.fillText('本周 ' + u.week + ' 局', x + w - 14, y + 17);
    ctx.font = '12px sans-serif'; ctx.fillStyle = c.sub;
    ctx.fillText('胜率 ' + (u.week ? Math.round((u.won / u.week) * 100) + '%' : '—'), x + w - 14, y + 37);
    if (u.avatarUrl) {
      const img = wx.createImage();
      img.onload = () => { ctx.save(); ctx.beginPath(); ctx.arc(x + 28, y + 26, 16, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, x + 12, y + 10, 32, 32); ctx.restore(); };
      img.src = u.avatarUrl;
    }
  });
}
wx.onMessage((msg) => {
  if (msg && msg.type === 'progress') {
    wx.getFriendCloudStorage({
      keyList: ['progress'],
      success(res) {
        const now = Date.now() / 1000;
        const list = (res.data || []).map((u) => {
          let v = null;
          try { v = JSON.parse((u.KVDataList || []).find((x) => x.key === 'progress').value); } catch (e) {}
          if (!v) return null;
          // 一周以前的数据算「这周没玩」
          const fresh = now - (v.t || 0) < 7 * 86400;
          return { nickname: u.nickname, avatarUrl: u.avatarUrl, tier: v.tier, week: fresh ? v.week || 0 : 0, won: fresh ? v.won || 0 : 0, t: v.t || 0 };
        }).filter(Boolean).sort((a, b) => b.week - a.week || b.t - a.t);
        drawProgress(list, msg);
      },
      fail() { drawProgress([], msg); },
    });
    return;
  }
  if (!msg || msg.type !== 'rank') return;
  wx.getFriendCloudStorage({
    keyList: [msg.key],
    success(res) {
      const list = (res.data || []).map((u) => {
        let score = 0;
        try { const kv = (u.KVDataList || []).find((x) => x.key === msg.key); score = JSON.parse(kv.value).wxgame.score || 0; } catch (e) {}
        return { nickname: u.nickname, avatarUrl: u.avatarUrl, score };
      }).filter((u) => u.score > 0).sort((a, b) => b.score - a.score);
      draw(list, msg);
    },
    fail() { draw([], msg); },
  });
});
