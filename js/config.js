// 所有能调的数都在这里：配色、计分、广告、每日挑战。改数不用动别的文件。

const VERSION = '0.2';

// 配色主题（点子卡「清晨纸面」画风参数卡）。前两套免费，后三套在结算页看视频解锁。
const THEMES = [
  {
    id: 'morning', name: '清晨', free: true,
    bg: '#F6F4EF', card: '#FFFFFF', board: '#FFFFFF', text: '#1F2A3A', sub: '#7B8494', faint: '#B4BAC4',
    given: '#1F2A3A', user: '#2F6FDE', wrong: '#E5484D', note: '#6B7486',
    sel: '#C9DCFB', rel: '#EAF1FD', same: '#D6E4FB', lineBold: '#3A4350', lineThin: '#D5D9E0',
    primary: '#2F6FDE', primaryText: '#FFFFFF', soft: '#E8EFFC', glow: '#7FB0FF', gold: '#E9A93B', shadow: 'rgba(31,42,58,0.06)', ok: '#2FA36B',
  },
  {
    id: 'night', name: '夜间', free: true,
    bg: '#15181D', card: '#1E2228', board: '#1E2228', text: '#E6E9EE', sub: '#8B93A1', faint: '#4A515C',
    given: '#E6E9EE', user: '#6EA2FF', wrong: '#FF6B6E', note: '#A0A8B6',
    sel: '#2C4570', rel: '#252C38', same: '#2E3A50', lineBold: '#9AA3B2', lineThin: '#343A44',
    primary: '#4F86F0', primaryText: '#FFFFFF', soft: '#26324A', glow: '#6EA2FF', gold: '#F0B54A', shadow: 'rgba(0,0,0,0.25)', ok: '#3CC07E',
  },
  {
    id: 'mint', name: '薄荷', free: false,
    bg: '#EEF5F1', card: '#FFFFFF', board: '#FFFFFF', text: '#1D3029', sub: '#6E8279', faint: '#AFC0B8',
    given: '#1D3029', user: '#22856A', wrong: '#E0534F', note: '#5E7469',
    sel: '#BFE6D6', rel: '#E6F4EE', same: '#CDEBDD', lineBold: '#36504A', lineThin: '#D3E0DA',
    primary: '#2E9E7A', primaryText: '#FFFFFF', soft: '#DDF1E8', glow: '#6FD3AE', gold: '#E2A83C', shadow: 'rgba(29,48,41,0.06)', ok: '#2E9E7A',
  },
  {
    id: 'apricot', name: '暖杏', free: false,
    bg: '#FAF3EA', card: '#FFFFFF', board: '#FFFDFA', text: '#3A2B1E', sub: '#8C7A68', faint: '#C8B8A6',
    given: '#3A2B1E', user: '#C06A1A', wrong: '#D9443F', note: '#7D6B58',
    sel: '#F6D9B8', rel: '#FBEEDF', same: '#F4E0C8', lineBold: '#5A4634', lineThin: '#E6DACB',
    primary: '#D9822B', primaryText: '#FFFFFF', soft: '#F8E6D2', glow: '#F2B270', gold: '#D9822B', shadow: 'rgba(58,43,30,0.06)', ok: '#3E9B62',
  },
  {
    id: 'lilac', name: '雾紫', free: false,
    bg: '#F3F1F8', card: '#FFFFFF', board: '#FFFFFF', text: '#2A2540', sub: '#7D7894', faint: '#BAB5CC',
    given: '#2A2540', user: '#6A4CC6', wrong: '#E04F64', note: '#6F6987',
    sel: '#DCD2F7', rel: '#EFEBFB', same: '#E3DBF8', lineBold: '#433C5E', lineThin: '#DDD9E8',
    primary: '#7A5CD6', primaryText: '#FFFFFF', soft: '#E9E3FA', glow: '#A991F0', gold: '#E2A83C', shadow: 'rgba(42,37,64,0.06)', ok: '#3E9B70',
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
