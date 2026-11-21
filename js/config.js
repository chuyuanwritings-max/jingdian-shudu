// 所有能调的数都在这里：配色、计分、广告、每日挑战。改数不用动别的文件。

const VERSION = '0.6.1';

// 主题：颜色和质地配在一起，一个主题就是一整套（Cc 0.3：「颜色和质地其实就是选主题的，是混合在一起的……就是几个主题」）。
// 前三套免费，后四套在结算页看视频解锁。以后加风格主题（赛博朋克、蒸汽朋克……）也是往这里加一项。
// tileA / tileB 自己填的数字方块 [面, 厚边, 数字]：A 象牙块（浅色块 + 彩色字）、B 彩色块（主题色块 + 浅色字），先给 Cc 选
// texture 页面质地 · boardTexture 棋盘质地 · cardTexture 卡片质地 · pageDark / boardDark 底色深不深（决定颗粒用深色还是浅色）· hand 棋盘线像手画
const THEMES = [
  {
    id: 'paper', name: '晨光纸', free: true, texture: 'grain', boardTexture: 'grain', cardTexture: 'grain', hand: false,
    tileA: ['#FFFDF8', '#D6CDBC', '#2E64C8'], tileB: ['#3A6FD6', '#24499A', '#FFFFFF'],
    bg: '#EFEBE2', card: '#FAF7F0', board: '#FAF7F0', text: '#2A2F38', sub: '#868B94', faint: '#BDB8AE',
    given: '#2A2F38', user: '#2E64C8', wrong: '#D8473F', note: '#6E7380', lineBold: '#4A4F58', lineThin: '#DCD6CA',
    primary: '#2E64C8', primaryText: '#FFFFFF', soft: '#E3E7EF', sel: '#C9D7F2', glow: '#7FA6EE', gold: '#D9A13A', shadow: 'rgba(60,50,30,0.08)', ok: '#3A9A66',
  },
  {
    id: 'notebook', name: '手写本', free: true, texture: 'notebook', boardTexture: 'hand', cardTexture: 'hand', hand: true,
    tileA: ['#FFFEF6', '#D3C7AC', '#2647A8'], tileB: ['#3459BD', '#213C85', '#FFFFFF'],
    bg: '#F3EEDD', card: '#FBF7EA', board: '#FBF7EA', text: '#3A3530', sub: '#857C70', faint: '#C2B8A6',
    given: '#3A3530', user: '#2647A8', wrong: '#C8372D', note: '#7A7368', lineBold: '#5A5249', lineThin: '#D6CCB8',
    primary: '#2F55B8', primaryText: '#FFFFFF', soft: '#E6E5E6', sel: '#CDD3E6', glow: '#8AA4E8', gold: '#C9952E', shadow: 'rgba(70,55,30,0.08)', ok: '#3E8E5C',
  },
  {
    id: 'chalk', name: '黑板', free: true, texture: 'chalk', boardTexture: 'chalk', cardTexture: 'chalk', hand: true, pageDark: true, boardDark: true,
    tileA: ['#42564D', '#18221E', '#F3D46B'], tileB: ['#F1D46F', '#A88A2E', '#22302A'],
    bg: '#22302A', card: '#2B3A33', board: '#2B3A33', text: '#EEF0EA', sub: '#A3B0A8', faint: '#5A6B62',
    given: '#F2F2EC', user: '#F3D46B', wrong: '#FF8F85', note: '#C3CEC7', lineBold: '#D7DED9', lineThin: '#4B5C54',
    primary: '#F3D46B', primaryText: '#22302A', soft: '#384941', sel: '#4C5E55', glow: '#FFF0A8', gold: '#F3D46B', shadow: 'rgba(0,0,0,0.3)', ok: '#93DAA2',
  },
  {
    id: 'wood', name: '原木', free: false, texture: 'wood', boardTexture: 'woodLight', cardTexture: 'wood', hand: false, pageDark: true,
    tileA: ['#F7E8CB', '#B38A55', '#1C6466'], tileB: ['#8A5932', '#4F321B', '#FBEBD2'],
    bg: '#5B3D26', card: '#6A4830', board: '#ECD6B0', text: '#F7EBD8', sub: '#D2B896', faint: '#8F6E50',
    given: '#3A2512', user: '#1C6466', wrong: '#C8352A', note: '#6E5236', lineBold: '#5A3B20', lineThin: '#CFB38C',
    primary: '#E3A75A', primaryText: '#3A2512', soft: '#7B573A', sel: '#8E6847', glow: '#FFD08A', gold: '#F2B84B', shadow: 'rgba(0,0,0,0.28)', ok: '#79C47F',
  },
  {
    id: 'ink', name: '宣纸水墨', free: false, texture: 'rice', boardTexture: 'rice', cardTexture: 'rice', hand: true,
    tileA: ['#FCF7EC', '#C9BA98', '#2B4A6F'], tileB: ['#A3302A', '#661B17', '#FBF4E6'],
    bg: '#E8DFCB', card: '#F4EDDC', board: '#F4EDDC', text: '#2A2622', sub: '#7E7466', faint: '#BFB39C',
    given: '#1E1B18', user: '#2B4A6F', wrong: '#B8322A', note: '#6D6255', lineBold: '#2E2A26', lineThin: '#D2C6AD',
    primary: '#9E2B25', primaryText: '#FBF4E6', soft: '#E9DCC8', sel: '#E2C9B5', glow: '#D9876F', gold: '#B8862E', shadow: 'rgba(60,40,20,0.09)', ok: '#4E8A5E',
  },
  {
    id: 'kraft', name: '牛皮纸', free: false, texture: 'kraft', boardTexture: 'kraft', cardTexture: 'kraft', hand: false,
    tileA: ['#EEDDBF', '#A58254', '#1F3E73'], tileB: ['#4B341F', '#22170C', '#F3E6D0'],
    bg: '#C3A078', card: '#D6BA92', board: '#DCC39C', text: '#2E2116', sub: '#5C4733', faint: '#957657',
    given: '#2E2116', user: '#1F3E73', wrong: '#A3241B', note: '#5B4632', lineBold: '#3E2C1C', lineThin: '#B79570',
    primary: '#46301D', primaryText: '#F3E6D0', soft: '#CBAA80', sel: '#BB976B', glow: '#F5D9A8', gold: '#8A5A16', shadow: 'rgba(50,30,10,0.14)', ok: '#3F7A44',
  },
  {
    id: 'metal', name: '拉丝金属', free: false, texture: 'metal', boardTexture: 'metal', cardTexture: 'metal', hand: false,
    tileA: ['#F6F8FA', '#A3AAB4', '#1F5FBF'], tileB: ['#323C49', '#141920', '#F2F4F6'],
    bg: '#C5CAD0', card: '#DADEE2', board: '#E3E6E9', text: '#1E2329', sub: '#58606B', faint: '#9AA1AA',
    given: '#1E2329', user: '#1F5FBF', wrong: '#D23C3C', note: '#4F5761', lineBold: '#363D46', lineThin: '#B4BAC2',
    primary: '#2B3440', primaryText: '#F2F4F6', soft: '#CCD1D7', sel: '#B9C0C8', glow: '#8FB8FF', gold: '#B8862A', shadow: 'rgba(20,25,30,0.16)', ok: '#3A8F5E',
  },
];

// 计分（学 Sudoku 2）：每填对一格 = 这一档的基础分 × 速度倍数
const SCORE = {
  base: [20, 30, 45, 60, 80, 100], // 入门 → 大师
  unitBonus: 3, // 填满一行 / 列 / 宫：额外 基础分 × 3
  digitBonus: 2, // 某个数填满 9 个：额外 基础分 × 2
  afterMistake: 0.5, // 这一格填错过，之后填对只给一半
};

// 速度倍数：离上一次填对过了 dt 秒，这一格的分数乘几
// 现在：5 秒内 ×2，之后一直线降到 30 秒时 ×1，再慢也是 ×1
// TODO(human)：这是计分的「性格」——想鼓励快手，还是让慢慢想的人也不吃亏？改下面三行的数就行
function speedMultiplier(dt) {
  if (dt <= 5) return 2;
  if (dt >= 30) return 1;
  return 2 - (dt - 5) / 25;
}

const RULES = {
  maxMistakes: 3,
  freeHints: 1, // 每局送的提示，之后每次看视频
  undoLimit: 200,
};

// 广告：广告位 id 填了、又在微信里，才放真广告；否则放 3 秒假倒计时
const ADS = {
  hint: '', // 激励视频：换一次提示
  revive: '', // 激励视频：错 3 次后再给一次机会
  theme: '', // 激励视频：结算页解锁配色
  fakeSeconds: 3,
};

// 每日挑战：星期几出哪一档（0 = 星期日）
const DAILY_TIER = [3, 1, 1, 2, 2, 3, 2];

module.exports = { VERSION, THEMES, SCORE, speedMultiplier, RULES, ADS, DAILY_TIER };
