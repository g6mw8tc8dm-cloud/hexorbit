(function () {
var modules = {};
modules["core/board.js"] = function(module, exports, require) {
'use strict';

// 棋盘：一维槽位表。
//
// 旧结构是 blocks[边][层] 的嵌套数组，删除靠 splice 搬移，
// 每次访问要两层解引用，且层数信息只存在于数组长度里。
//
// 新结构：
//   slots[side * cap + level]  —— 定长槽位，piece 或 null
//   fill[side]                 —— 该边已占层数
// 好处：
//   - 层号 O(1) 直接可得，不需要 indexOf 反查
//   - 删除后一次压缩，不留空洞
//   - 序列化只需要 (fill, 每层颜色/半径)

var DEFAULT_CAP = 12;

function create(sides, cap) {
  sides = sides || 6;
  cap = cap || DEFAULT_CAP;

  var slots = [];
  var fill = [];
  var i;

  for (i = 0; i < sides * cap; i++) {
    slots.push(null);
  }

  for (i = 0; i < sides; i++) {
    fill.push(0);
  }

  return {
    sides: sides,
    cap: cap,
    slots: slots,
    fill: fill
  };
}

function count(board, side) {
  return board.fill[side] || 0;
}

function at(board, side, level) {
  if (level < 0 || level >= board.fill[side]) {
    return null;
  }
  return board.slots[side * board.cap + level];
}

function top(board, side) {
  var n = board.fill[side];
  if (!n) {
    return null;
  }
  return board.slots[side * board.cap + n - 1];
}

function grow(board) {
  var sides = board.sides;
  var nextCap = board.cap * 2;
  var slots = [];
  var i;
  var side;
  var level;

  for (i = 0; i < sides * nextCap; i++) {
    slots.push(null);
  }

  for (side = 0; side < sides; side++) {
    for (level = 0; level < board.fill[side]; level++) {
      slots[side * nextCap + level] = board.slots[side * board.cap + level];
    }
  }

  board.cap = nextCap;
  board.slots = slots;
}

// 追加到该边顶部，层号写回 piece.level
function push(board, side, piece) {
  if (board.fill[side] >= board.cap) {
    grow(board);
  }

  var level = board.fill[side];
  board.slots[side * board.cap + level] = piece;
  board.fill[side] = level + 1;
  piece.level = level;
  piece.attachedLane = side;

  return level;
}

// 删除指定层，并把上面的方块整体下移一层
function removeAt(board, side, level) {
  var base = side * board.cap;
  var n = board.fill[side];
  var i;
  var piece;

  if (level < 0 || level >= n) {
    return null;
  }

  var removed = board.slots[base + level];

  for (i = level; i < n - 1; i++) {
    piece = board.slots[base + i + 1];
    board.slots[base + i] = piece;
    if (piece) {
      piece.level = i;
    }
  }

  board.slots[base + n - 1] = null;
  board.fill[side] = n - 1;

  return removed;
}

// 按 边→层 顺序遍历，等价于旧的 blocks.forEach
function forEach(board, callback) {
  var side;
  var level;
  var piece;

  for (side = 0; side < board.sides; side++) {
    for (level = 0; level < board.fill[side]; level++) {
      piece = board.slots[side * board.cap + level];
      if (piece) {
        callback(piece, side, level);
      }
    }
  }
}

// 某条边是否溢出（替代 isInfringing 的逐边统计）
function overflow(board, rows) {
  for (var side = 0; side < board.sides; side++) {
    var subTotal = 0;
    var level;

    for (level = 0; level < board.fill[side]; level++) {
      subTotal += board.slots[side * board.cap + level].deleted ? 1 : 0;
    }

    if (board.fill[side] - subTotal > rows) {
      return true;
    }
  }

  return false;
}

module.exports = {
  DEFAULT_CAP: DEFAULT_CAP,
  create: create,
  count: count,
  at: at,
  top: top,
  push: push,
  removeAt: removeAt,
  forEach: forEach,
  overflow: overflow
};

};
modules["core/colors.js"] = function(module, exports, require) {
'use strict';

// 颜色数量随难度解锁。
//
// 规则：开局 N 色，难度达到阈值后加入下一色，之后不再回退。
// 只影响“新生成的方块可能是什么颜色”，不影响已有方块与消除判定。

// 解锁阶梯：难度达到 at 时，可用颜色数变为 count
var STEPS = [
  { at: 20, count: 5 }
];

var START_COUNT = 4;

function activeCount(difficulty, override) {
  if (override > 0) {
    return override;
  }

  var count = START_COUNT;

  for (var i = 0; i < STEPS.length; i++) {
    if (difficulty >= STEPS[i].at) {
      count = STEPS[i].count;
    }
  }

  return count;
}

// 当前可用颜色的切片（顺序固定，前 N 个）
function pool(colors, difficulty, override) {
  return colors.slice(0, activeCount(difficulty, override));
}

module.exports = {
  STEPS: STEPS,
  START_COUNT: START_COUNT,
  activeCount: activeCount,
  pool: pool
};

};
modules["core/difficulty.js"] = function(module, exports, require) {
'use strict';

// 难度曲线与出块间隔。
//
// 数值与原实现完全一致，只是从 WaveGen 中抽成纯函数：
// 输入当前状态，返回新值，不直接修改对象，便于单独测试与调参。

function increment(difficulty, dt, last, speedModifier) {
  if (difficulty < 8) {
    return (dt - last) / 5166667 * speedModifier;
  }

  if (difficulty < 15) {
    return (dt - last) / 72333333 * speedModifier;
  }

  return (dt - last) / 90000000 * speedModifier;
}

// 随时间推进的难度增量（消除加速另算）
function advance(difficulty, dt, last, settings) {
  if (difficulty >= settings.difficultyMax) {
    return difficulty;
  }

  var next = difficulty + increment(difficulty, dt, last, settings.speedModifier) * 0.5 * settings.difficultyGrowth;

  if (next > settings.difficultyMax) {
    return settings.difficultyMax;
  }

  return next;
}

// 每出一次块，间隔逐步收紧（下限 600）
function intervalAfterSpawn(nextGen, speedModifier) {
  if (nextGen > 600) {
    return nextGen - 11 * (nextGen / 1300) * speedModifier;
  }

  return nextGen;
}

// 每消除一个方块：间隔收紧 + 难度上升
function onBlockDestroyed(nextGen, difficulty, settings) {
  var interval;

  if (nextGen > 1350) {
    interval = nextGen - 30 * settings.creationSpeedModifier;
  } else if (nextGen > 600) {
    interval = nextGen - 8 * settings.creationSpeedModifier;
  } else {
    interval = 600;
  }

  var level;

  if (difficulty < settings.difficultyMax) {
    level = difficulty + 0.085 * settings.speedModifier * settings.difficultyGrowth;
  } else {
    level = settings.difficultyMax;
  }

  return {
    nextGen: interval,
    difficulty: level
  };
}

module.exports = {
  increment: increment,
  advance: advance,
  intervalAfterSpawn: intervalAfterSpawn,
  onBlockDestroyed: onBlockDestroyed
};

};
modules["core/geometry.js"] = function(module, exports, require) {
'use strict';

var rotatePoint = require('./math').rotatePoint;

// 方块几何：只做坐标计算，不持有状态、不接触 canvas。
//
// 一个方块是“内窄外宽的梯形”，其形状完全由三个量决定：
//   dist  到六边形中心的距离
//   height 方块厚度
//   angle  当前朝向（度）
//
// 这些公式与旧实现等价，但集中在这里之后，Block 只负责状态与生命周期。

var SQRT3 = Math.sqrt(3);

function widthAt(dist) {
  return 2 * dist / SQRT3;
}

// 返回四个角（相对方块自身锚点的偏移）以及内外宽度
function quad(dist, height, angle, ratio) {
  var inner = widthAt(dist);
  var outer = widthAt(dist + height);
  var halfH = height / 2;
  var r = ratio === undefined ? 1 : ratio;

  return {
    inner: inner,
    outer: outer,
    points: [
      rotatePoint((-inner / 2) * r, halfH, angle),
      rotatePoint((inner / 2) * r, halfH, angle),
      rotatePoint((outer / 2) * r, -halfH, angle),
      rotatePoint((-outer / 2) * r, -halfH, angle)
    ]
  };
}

// 方块中心在屏幕上的位置
function anchor(centerX, centerY, angle, dist, height) {
  var rad = angle * (Math.PI / 180);
  var offset = dist + height / 2;

  return {
    x: centerX + Math.sin(rad) * offset,
    y: centerY - Math.cos(rad) * offset
  };
}

// 一组方块的几何中心（用于连击飘字）
function centroid(blocks, centerX, centerY) {
  if (!blocks.length) {
    return { x: 0, y: 0 };
  }

  var sx = 0;
  var sy = 0;

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var p = anchor(centerX, centerY, b.angle, b.distFromHex, b.height);
    sx += p.x;
    sy += p.y;
  }

  return { x: sx / blocks.length, y: sy / blocks.length };
}

module.exports = {
  widthAt: widthAt,
  quad: quad,
  anchor: anchor,
  centroid: centroid
};

};
modules["core/match.js"] = function(module, exports, require) {
'use strict';

var boardApi = require('./board');

// 同色连通块判定。
//
// 与旧实现的区别：
// - 旧：递归 flood fill，用数组线性查重（最坏 O(n²)）
// - 新：显式栈迭代 + 访问位表（O(n)），不依赖调用栈深度
//
// 语义保持一致：四邻接（相邻边同层、同边相邻层），
// 同色、未标记删除、不重复访问。返回的首项固定为起点本身。

// 四邻接：(边 ±1, 同层) 与 (同边, 层 ±1)
var DELTA = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0]
];

function key(side, index) {
  return side + ':' + index;
}

function collectGroup(board, side, index) {
  var group = [];
  var origin = boardApi.at(board, side, index);

  if (!origin) {
    return group;
  }

  var sides = board.sides;
  var color = origin.color;
  var visited = Object.create(null);
  var stack = [[side, index]];

  visited[key(side, index)] = 1;
  group.push([side, index]);

  while (stack.length) {
    var cur = stack.pop();
    var curSide = cur[0];
    var curIndex = cur[1];

    for (var d = 0; d < DELTA.length; d++) {
      var nextSide = ((curSide + DELTA[d][0]) % sides + sides) % sides;
      var nextIndex = curIndex + DELTA[d][1];

      if (nextIndex < 0) {
        continue;
      }

      var next = boardApi.at(board, nextSide, nextIndex);

      if (!next || next.deleted || next.color !== color) {
        continue;
      }

      var k = key(nextSide, nextIndex);

      if (visited[k]) {
        continue;
      }

      visited[k] = 1;
      group.push([nextSide, nextIndex]);
      stack.push([nextSide, nextIndex]);
    }
  }

  return group;
}

module.exports = {
  DELTA: DELTA,
  collectGroup: collectGroup
};

};
modules["core/math.js"] = function(module, exports, require) {
'use strict';

// 基础数学。纯函数，无副作用。

function rotatePoint(x, y, theta) {
  var rad = theta * (Math.PI / 180);
  var cos = Math.cos(rad);
  var sin = Math.sin(rad);

  return {
    x: cos * x - sin * y,
    y: sin * x + cos * y
  };
}

function randInt(min, max) {
  return Math.floor((Math.random() * max) + min);
}

module.exports = {
  rotatePoint: rotatePoint,
  randInt: randInt
};

};
modules["core/physics.js"] = function(module, exports, require) {
'use strict';

// 方块运动与落定判定。
//
// 与旧实现的区别：旧版把“解析目标边 / 比较栈顶 / 贴回下一层”三件事
// 混在 Hex.prototype.doesBlockCollide 里，并依赖调用方传入数组和下标。
// 这里拆成三个纯函数，只接收当次计算需要的量，便于单独测试。

var SQRT3 = Math.sqrt(3);

// 中心六边形的外接半径
function coreRadius(sideLength) {
  return (sideLength / 2) * SQRT3;
}

// 本帧的推进距离
function stepOf(piece, dt, scale) {
  return piece.iter * dt * scale;
}

// 下落方块在当前旋转位置下对应的边
function landingLane(sides, fallingLane, position) {
  var lane = sides - fallingLane + position;
  return ((lane % sides) + sides) % sides;
}

// 下落阶段：判断是否碰到栈顶或核心
// 返回值：{ land: boolean, radius: number }
function landingRadius(piece, top, core, step) {
  if (top) {
    if (piece.distFromHex + step - top.distFromHex - top.height <= 0) {
      return { land: true, radius: top.distFromHex + top.height };
    }
    return { land: false, radius: piece.distFromHex };
  }

  if (piece.distFromHex + step - core <= 0) {
    return { land: true, radius: core };
  }

  return { land: false, radius: piece.distFromHex };
}

// 重排阶段：消除后上方方块逐层贴回
// 返回值：{ settled: boolean, radius: number }
function settleRadius(piece, below, core, step) {
  if (!below) {
    if (piece.distFromHex - step - core <= 0) {
      return { settled: true, radius: core };
    }
    return { settled: false, radius: piece.distFromHex };
  }

  if (below.settled && piece.distFromHex - step - below.distFromHex - below.height <= 0) {
    return { settled: true, radius: below.distFromHex + below.height };
  }

  return { settled: false, radius: piece.distFromHex };
}

module.exports = {
  coreRadius: coreRadius,
  stepOf: stepOf,
  landingLane: landingLane,
  landingRadius: landingRadius,
  settleRadius: settleRadius
};

};
modules["game.js"] = function(module, exports, require) {
'use strict';

require('./js/main').start();

};
modules["js/ads.js"] = function(module, exports, require) {
'use strict';

/**
 * 广告占位接入层。
 *
 * 上线策略：
 * - 默认 enabled = false，所有广告接口都不会被调用，游戏完全不依赖广告。
 * - UV 达标、流量主开通后，把 enabled 改成 true，并填入两个广告位 ID 即可。
 * - 只接入两种形式：结算页激励视频复活（用户主动点击）、结算页底部 Banner。
 * - 对局中（PLAYING / PAUSED / 其它弹窗）绝不展示 Banner。
 *
 * 合规约定：
 * - 复活是可选项，不点击也能正常“再来一局 / 返回首页”。
 * - 文案不出现充值、购买、金币、付费等字样，也不做强制或诱导。
 * - 广告加载失败、无库存、用户中途关闭都按“不可用”处理，不阻断游戏。
 */

var GS = require('./state').GS;

var config = {
  // 总开关：上线先关，达标后改 true
  enabled: false,
  // 激励视频广告位 ID（adunit- 开头）
  rewardedUnitId: '',
  // Banner 广告位 ID（adunit- 开头）
  bannerUnitId: '',
  // 单局最多复活次数
  revivePerRun: 1,
  // Banner 预留高度上限（ui 单位）
  bannerMaxReserve: 110,
  // Banner 预留高度占屏高比例
  bannerReserveRatio: 0.16,
  // Banner 最大宽度
  bannerMaxWidth: 360,
  // 激励视频超时兜底（毫秒）
  rewardedTimeout: 12000
};

var api = null;
var rewarded = null;
var rewardedBroken = false;
var pendingCallback = null;
var pendingTimer = null;
var banner = null;
var bannerVisible = false;
var bannerBroken = false;
var bannerHeight = 0;
var screen = { width: 0, height: 0, safeBottom: 0, ui: 1 };

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function setup(platform) {
  api = (platform && platform.api) || getApi();
  rewarded = null;
  rewardedBroken = false;
  banner = null;
  bannerVisible = false;
  bannerBroken = false;
  bannerHeight = 0;
}

function isEnabled() {
  return config.enabled === true;
}

function hasRewarded() {
  return isEnabled() && !!config.rewardedUnitId && !!(api && api.createRewardedVideoAd);
}

function hasBanner() {
  return isEnabled() && !!config.bannerUnitId && !!(api && api.createBannerAd);
}

// ---------- 激励视频 ----------

function finish(result) {
  if (!pendingCallback) {
    return;
  }

  var cb = pendingCallback;
  pendingCallback = null;

  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  try {
    cb(result);
  } catch (e) {
    // 回调异常不能影响游戏主流程
  }
}

function ensureRewarded() {
  if (rewarded || rewardedBroken) {
    return rewarded;
  }

  if (!hasRewarded()) {
    return null;
  }

  try {
    rewarded = api.createRewardedVideoAd({ adUnitId: config.rewardedUnitId });

    rewarded.onError(function () {
      // 加载失败 / 无库存：如果正在等待结果，按不可用结束
      if (pendingCallback) {
        finish({ ok: false, reason: 'unavailable' });
      }
    });

    rewarded.onClose(function (res) {
      var ended = !res || res.isEnded === undefined || res.isEnded === true;
      finish(ended ? { ok: true, reason: 'ended' } : { ok: false, reason: 'cancel' });
    });

    if (rewarded.load) {
      var loading = rewarded.load();
      if (loading && loading.catch) {
        loading.catch(function () {});
      }
    }
  } catch (e) {
    rewarded = null;
    rewardedBroken = true;
  }

  return rewarded;
}

function canRevive(state) {
  return !!state &&
    state.gameState === GS.GAMEOVER &&
    !state.reviveUsed &&
    !state.scoreBlocked &&
    hasRewarded() &&
    !rewardedBroken;
}

function showRewarded(callback) {
  if (typeof callback !== 'function') {
    return;
  }

  // 上一次请求如果还挂着，先按取消收尾，避免回调丢失
  if (pendingCallback) {
    finish({ ok: false, reason: 'busy' });
  }

  var ad = ensureRewarded();
  if (!ad) {
    callback({ ok: false, reason: 'unavailable' });
    return;
  }

  pendingCallback = callback;
  pendingTimer = setTimeout(function () {
    finish({ ok: false, reason: 'timeout' });
  }, config.rewardedTimeout);

  var shown;
  try {
    shown = ad.show();
  } catch (e) {
    finish({ ok: false, reason: 'unavailable' });
    return;
  }

  if (shown && typeof shown.catch === 'function') {
    shown.catch(function () {
      // 首次展示失败时重新拉取一次；仍失败就按不可用处理
      try {
        ad.load().then(function () {
          return ad.show();
        }).catch(function () {
          finish({ ok: false, reason: 'unavailable' });
        });
      } catch (e) {
        finish({ ok: false, reason: 'unavailable' });
      }
    });
  }
}

// ---------- Banner ----------

function bannerSpace(state) {
  if (!state || !hasBanner() || bannerBroken) {
    return 0;
  }

  var ui = state.uiScale || 1;

  // 优先使用 onResize 返回的真实高度；首次展示前先用保守估算值
  var fallback = Math.min(config.bannerMaxReserve * ui, state.height * config.bannerReserveRatio);
  var space = bannerHeight > 0 ? bannerHeight : fallback;

  // 异常广告位高度兜底，最多占屏高 42%
  space = Math.min(space, state.height * 0.42);

  if (space < 1) {
    return 0;
  }

  // 结算面板至少需要 380ui；放不下就放弃本次 Banner，避免遮挡按钮
  var available = state.height - (state.safeTop || 0) - (state.safeBottom || 0) - space - 24 * ui;

  if (available < 380 * ui) {
    return 0;
  }

  return space;
}

function ensureBanner(state) {
  if (banner || bannerBroken) {
    return banner;
  }

  if (!hasBanner()) {
    return null;
  }

  screen.width = state.width;
  screen.height = state.height;
  screen.safeBottom = state.safeBottom || 0;
  screen.ui = state.uiScale || 1;

  var width = Math.min(screen.width - 24 * screen.ui, config.bannerMaxWidth);

  try {
    banner = api.createBannerAd({
      adUnitId: config.bannerUnitId,
      adIntervals: 30,
      style: {
        left: (screen.width - width) / 2,
        top: screen.height - screen.safeBottom,
        width: width
      }
    });

    banner.onResize(function (size) {
      if (!banner) {
        return;
      }

      var w = (size && size.width) || width;
      var h = (size && size.height) || 0;

      // 记录真实高度，下一帧布局会据此重新预留空间
      if (h > 0) {
        bannerHeight = h;
      }

      try {
        banner.style.left = (screen.width - w) / 2;
        banner.style.top = screen.height - screen.safeBottom - (h || bannerHeight || 0);
      } catch (e) {
        // ignore
      }
    });

    banner.onError(function () {
      bannerBroken = true;
      bannerVisible = false;
    });
  } catch (e) {
    banner = null;
    bannerBroken = true;
  }

  return banner;
}

function showBanner(state) {
  if (bannerVisible) {
    return;
  }

  var space = bannerSpace(state);
  if (!space) {
    return;
  }

  var ad = ensureBanner(state);
  if (!ad) {
    return;
  }

  var ui = state.uiScale || 1;
  var width = Math.min(state.width - 24 * ui, config.bannerMaxWidth);

  // 窗口信息可能变化，展示前同步一次
  screen.width = state.width;
  screen.height = state.height;
  screen.safeBottom = state.safeBottom || 0;
  screen.ui = ui;

  try {
    ad.style.left = (state.width - width) / 2;
    ad.style.top = state.height - (state.safeBottom || 0) - space;
    ad.style.width = width;
  } catch (e) {
    // ignore
  }

  bannerVisible = true;

  try {
    var shown = ad.show();
    if (shown && typeof shown.catch === 'function') {
      shown.catch(function () {
        bannerVisible = false;
        bannerBroken = true;
      });
    }
  } catch (e) {
    bannerVisible = false;
    bannerBroken = true;
  }
}

function hideBanner() {
  if (!banner || !bannerVisible) {
    return;
  }

  bannerVisible = false;

  try {
    banner.hide();
  } catch (e) {
    // ignore
  }
}

/**
 * 每帧同步 Banner 可见性：只有结算页允许展示，其余状态一律隐藏。
 */
function syncBanner(state) {
  if (!state) {
    return;
  }

  if (state.gameState === GS.GAMEOVER && bannerSpace(state) > 0) {
    showBanner(state);
  } else {
    hideBanner();
  }
}

function isBannerVisible() {
  return bannerVisible;
}

module.exports = {
  config: config,
  setup: setup,
  isEnabled: isEnabled,
  canRevive: canRevive,
  showRewarded: showRewarded,
  bannerSpace: bannerSpace,
  syncBanner: syncBanner,
  hideBanner: hideBanner,
  isBannerVisible: isBannerVisible
};

};
modules["js/audio.js"] = function(module, exports, require) {
'use strict';

var SETTINGS_KEY = require('./state').SETTINGS_KEY;

function AudioManager(state) {
  this.state = state;
  this.api = typeof wx !== 'undefined' ? wx : null;
  this.enabled = !!(this.api && this.api.createInnerAudioContext);
  this.bgm = null;
  this.sfx = {};
  this.bgmPlaying = false;

  if (!this.enabled) {
    return;
  }

  try {
    if (this.api.setInnerAudioOption) {
      this.api.setInnerAudioOption({
        mixWithOther: true,
        obeyMuteSwitch: true
      });
    }
  } catch (e) {
    // 部分基础库不支持，忽略
  }

  this.bgm = this.create('audio/bgm.wav', true, 0.26);
  this.sfx.rotate = this.create('audio/rotate.wav', false, 0.16);
  this.sfx.drop = this.create('audio/drop.wav', false, 0.24);
  this.sfx.clear = this.create('audio/clear.wav', false, 0.24);
  this.sfx.gameover = this.create('audio/gameover.wav', false, 0.24);
  this.sfx.click = this.create('audio/click.wav', false, 0.10);
}

AudioManager.prototype.create = function (src, loop, volume) {
  var ctx;
  try {
    ctx = this.api.createInnerAudioContext();
  } catch (e) {
    return null;
  }

  if (!ctx) {
    return null;
  }

  ctx.src = src;
  ctx.loop = !!loop;
  ctx.volume = volume;
  ctx.obeyMuteSwitch = true;

  // 音频失败时不打断游戏
  if (ctx.onError) {
    ctx.onError(function () {});
  }

  return ctx;
};

AudioManager.prototype.playBgm = function () {
  if (!this.enabled || !this.bgm || !this.state.sound.music) {
    return;
  }

  if (this.bgmPlaying && this.bgm.paused !== true) {
    return;
  }

  try {
    this.bgm.play();
    this.bgmPlaying = true;
  } catch (e) {
    this.bgmPlaying = false;
  }
};

AudioManager.prototype.pauseBgm = function () {
  if (!this.bgm) {
    return;
  }

  try {
    this.bgm.pause();
  } catch (e) {
    // ignore
  }
  this.bgmPlaying = false;
};

AudioManager.prototype.stopBgm = function () {
  if (!this.bgm) {
    return;
  }

  try {
    this.bgm.stop();
  } catch (e) {
    // ignore
  }
  this.bgmPlaying = false;
};

AudioManager.prototype.playSfx = function (name) {
  if (!this.enabled || !this.state.sound.sfx) {
    return;
  }

  var audio = this.sfx[name];
  if (!audio) {
    return;
  }

  try {
    audio.stop();
  } catch (e) {
    // ignore
  }

  try {
    audio.play();
  } catch (e2) {
    // ignore
  }
};

AudioManager.prototype.setMusic = function (on) {
  this.state.sound.music = !!on;

  if (on) {
    this.playBgm();
  } else {
    this.pauseBgm();
  }

  this.persist();
};

AudioManager.prototype.setSfx = function (on) {
  this.state.sound.sfx = !!on;
  this.persist();

  if (on) {
    this.playSfx('click');
  }
};

AudioManager.prototype.setVibrate = function (on) {
  this.state.sound.vibrate = !!on;
  this.persist();

  if (on) {
    this.state.platform.vibrate();
  }
};

AudioManager.prototype.persist = function () {
  try {
    this.state.platform.storage.set(SETTINGS_KEY, this.state.sound);
  } catch (e) {
    // ignore
  }
};

AudioManager.prototype.unlock = function () {
  this.playBgm();
};

module.exports = {
  AudioManager: AudioManager
};

};
modules["js/Block.js"] = function(module, exports, require) {
'use strict';

var geometry = require('../core/geometry');

// 方块：状态 + 生命周期。
// 几何计算在 core/geometry.js，绘制只负责把算好的四个角连成路径。

function Block(state, fallingLane, color, iter, distFromHex, settled) {
  this.state = state;

  // 是否已经落在中心六边形或其它方块上
  this.settled = settled ? 1 : 0;
  this.height = state.settings.blockHeight;

  // 方块从哪一条边落下
  this.fallingLane = fallingLane;
  this.checked = 0;

  // 方块当前角度
  this.angle = 90 - (30 + 60 * fallingLane);
  this.angularVelocity = 0;
  this.targetAngle = this.angle;

  this.color = color;

  // 已标记删除 / 已从下落列表移除
  this.deleted = 0;
  this.removed = 0;

  // 吸附白闪、删除淡出
  this.tint = 0;
  this.opacity = 1;
  this.initializing = 1;
  this.ict = state.MainHex ? state.MainHex.ct : 0;

  this.iter = iter;
  this.initLen = state.settings.creationDt;
  this.attachedLane = 0;
  this.distFromHex = distFromHex || state.settings.startDist * state.settings.scale;
}

// 朝向插值：向 targetAngle 收敛
function spin(block, dt, angularVelocityConst) {
  if (block.angle > block.targetAngle) {
    block.angularVelocity -= angularVelocityConst * dt;
  } else if (block.angle < block.targetAngle) {
    block.angularVelocity += angularVelocityConst * dt;
  }

  if (Math.abs(block.angle - block.targetAngle + block.angularVelocity) <= Math.abs(block.angularVelocity)) {
    block.angle = block.targetAngle;
    block.angularVelocity = 0;
  } else {
    block.angle += block.angularVelocity;
  }
}

function traceQuad(ctx, x, y, points) {
  ctx.beginPath();
  ctx.moveTo(x + points[0].x, y + points[0].y);
  ctx.lineTo(x + points[1].x, y + points[1].y);
  ctx.lineTo(x + points[2].x, y + points[2].y);
  ctx.lineTo(x + points[3].x, y + points[3].y);
  ctx.closePath();
  ctx.fill();
}

Block.prototype.incrementOpacity = function () {
  if (!this.deleted) {
    return;
  }

  var state = this.state;
  var hex = state.MainHex;
  var dt = hex ? hex.dt : 1;

  if (this.opacity >= 0.925) {
    var tLane = this.attachedLane - hex.position;
    tLane = hex.sides - tLane;
    while (tLane < 0) {
      tLane += hex.sides;
    }
    tLane %= hex.sides;
    hex.shakes.push({
      lane: tLane,
      magnitude: 3 * state.settings.scale
    });
  }

  this.opacity -= 0.075 * dt;
  if (this.opacity <= 0) {
    this.opacity = 0;
    this.deleted = 2;
  }
};

Block.prototype.getIndex = function () {
  // 层号由棋盘在 push / removeAt 时维护
  return typeof this.level === 'number' ? this.level : 0;
};

Block.prototype.draw = function (attached, index) {
  var state = this.state;
  var ctx = state.ctx;
  var hex = state.MainHex;
  var settings = state.settings;

  this.height = settings.blockHeight;

  if (Math.abs(settings.scale - settings.prevScale) > 0.000000001) {
    this.distFromHex *= (settings.scale / settings.prevScale);
  }

  this.incrementOpacity();
  spin(this, hex.dt, state.angularVelocityConst);

  var ratio = 1;

  if (this.initializing) {
    var rat = (hex.ct - this.ict) / this.initLen;
    if (rat > 1) {
      rat = 1;
    }
    ratio = rat;

    if ((hex.ct - this.ict) >= this.initLen) {
      this.initializing = 0;
    }
  }

  var geo = geometry.quad(this.distFromHex, this.height, this.angle, ratio);
  var base = geometry.anchor(state.width / 2, state.height / 2, this.angle, this.distFromHex, this.height);
  var baseX = base.x + state.gdx;
  var baseY = base.y + state.gdy;

  ctx.fillStyle = this.deleted ? '#ffffff' : this.color;
  ctx.globalAlpha = this.opacity;
  traceQuad(ctx, baseX, baseY, geo.points);

  if (this.tint) {
    if (this.opacity < 1) {
      this.iter = 2.25;
      this.tint = 0;
    }

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = this.tint;
    traceQuad(ctx, baseX, baseY, geo.points);

    this.tint -= 0.02 * hex.dt;
    if (this.tint < 0) {
      this.tint = 0;
    }
  }

  ctx.globalAlpha = 1;
};

function findCenterOfBlocks(arr) {
  if (!arr.length) {
    return { x: 0, y: 0 };
  }

  var state = arr[0].state;
  return geometry.centroid(arr, state.width / 2, state.height / 2);
}

module.exports = {
  Block: Block,
  findCenterOfBlocks: findCenterOfBlocks
};

};
modules["js/checking.js"] = function(module, exports, require) {
'use strict';

var Text = require('./Text').Text;
var fadeUpAndOut = require('./Text').fadeUpAndOut;
var findCenterOfBlocks = require('./Block').findCenterOfBlocks;
var collectGroup = require('../core/match').collectGroup;
var boardApi = require('../core/board');

// 兼容旧导出：外部只用到 consolidateBlocks
function search(twoD, oneD) {
  for (var i = 0; i < twoD.length; i++) {
    if (twoD[i][0] === oneD[0] && twoD[i][1] === oneD[1]) {
      return true;
    }
  }
  return false;
}

function floodFill(hex, side, index, deleting) {
  var group = collectGroup(hex.board, side, index);

  for (var i = 0; i < group.length; i++) {
    if (!search(deleting, group[i])) {
      deleting.push(group[i]);
    }
  }
}

function consolidateBlocks(state, hex, side, index) {
  var deleting = collectGroup(hex.board, side, index);

  if (deleting.length < 3) {
    return;
  }

  var deletedBlocks = [];
  var i;

  for (i = 0; i < deleting.length; i++) {
    var arr = deleting[i];
    var piece = boardApi.at(hex.board, arr[0], arr[1]);

    if (piece) {
      piece.deleted = 1;
      deletedBlocks.push(piece);
    }
  }

  if (!deletedBlocks.length) {
    return;
  }

  var now = state.MainHex.ct;

  if (now - hex.lastCombo < hex.comboTime) {
    hex.comboTime = (1 / state.settings.creationSpeedModifier) * (state.waveone.nextGen / 16.666667) * 3;
    hex.comboMultiplier += 1;
    hex.lastCombo = now;

    var coords = findCenterOfBlocks(deletedBlocks);
    hex.texts.push(new Text(state, coords.x, coords.y, 'x ' + hex.comboMultiplier, 'bold', '#ffffff', fadeUpAndOut));
  } else {
    hex.comboTime = 240;
    hex.lastCombo = now;
    hex.comboMultiplier = 1;
  }

  var adder = deleting.length * deleting.length * hex.comboMultiplier;
  hex.texts.push(new Text(state, hex.x, hex.y, '+ ' + adder, 'bold', deletedBlocks[0].color, fadeUpAndOut));
  hex.lastColorScored = deletedBlocks[0].color;
  state.score += adder;
  state.lastClear = { at: Date.now(), count: deleting.length };

  if (state.audio) {
    state.audio.playSfx('clear');
  }
}

module.exports = {
  search: search,
  floodFill: floodFill,
  consolidateBlocks: consolidateBlocks
};

};
modules["js/cloud.js"] = function(module, exports, require) {
'use strict';

var guard = require('./guard');

var CLOUD_KEY = 'hextris_best_v1';

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function parseScore(value) {
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }

  if (value && typeof value === 'object' && typeof value.score === 'number') {
    return isFinite(value.score) ? value.score : 0;
  }

  if (!value) {
    return 0;
  }

  try {
    var obj = JSON.parse(value);
    if (obj && typeof obj.score === 'number' && isFinite(obj.score)) {
      return obj.score;
    }
  } catch (e) {
    // 兼容纯数字字符串
  }

  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function readBest(callback) {
  var api = getApi();

  if (!api || !api.getUserCloudStorage) {
    callback({ ok: false, found: false, best: 0 });
    return;
  }

  try {
    api.getUserCloudStorage({
      keyList: [CLOUD_KEY],
      success: function (res) {
        var list = (res && res.KVDataList) || [];
        var best = 0;
        var found = false;

        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].key === CLOUD_KEY) {
            var score = parseScore(list[i].value);

            if (guard.validateScore(score)) {
              best = Math.max(best, score);
              found = true;
            }
          }
        }

        callback({ ok: true, found: found, best: best });
      },
      fail: function () {
        callback({ ok: false, found: false, best: 0 });
      }
    });
  } catch (e) {
    callback({ ok: false, found: false, best: 0 });
  }
}

function writeBest(score, callback) {
  var api = getApi();

  if (!api || !api.setUserCloudStorage) {
    callback(false);
    return;
  }

  try {
    api.setUserCloudStorage({
      KVDataList: [
        {
          key: CLOUD_KEY,
          value: JSON.stringify({
            score: score,
            updatedAt: Date.now()
          })
        }
      ],
      success: function () {
        callback(true);
      },
      fail: function () {
        callback(false);
      }
    });
  } catch (e) {
    callback(false);
  }
}

function loadBest(state, callback) {
  readBest(function (result) {
    if (result.ok) {
      state.cloudBest = result.best;

      if (result.found && result.best > state.bestScore) {
        state.bestScore = result.best;
      } else if (
        (!result.found || state.bestScore > result.best) &&
        state.bestScore > 0 &&
        guard.validateScore(state.bestScore)
      ) {
        // 本地有纪录、云端没有或更低时，补一次同步
        writeBest(state.bestScore, function (ok) {
          if (ok) {
            state.cloudBest = state.bestScore;
          }
        });
      }
    }

    if (callback) {
      callback(state.bestScore);
    }
  });
}

function submitIfRecord(state, score, isNewRecord, callback) {
  if (!isNewRecord) {
    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  if (!guard.validateScore(score)) {
    state.scoreBlocked = true;

    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  if (!guard.canUpload(state, score).ok) {
    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  readBest(function (result) {
    var cloudBest = result.ok ? result.best : 0;

    // 云端已经是更高分时，不覆盖
    if (result.ok && result.found && cloudBest >= score) {
      state.cloudBest = cloudBest;
      state.bestScore = Math.max(state.bestScore, cloudBest);

      if (callback) {
        callback(false, state.bestScore);
      }
      return;
    }

    writeBest(score, function (ok) {
      if (ok) {
        state.bestScore = Math.max(state.bestScore, score);
        state.cloudBest = Math.max(cloudBest, score);
        guard.markUpload(state);
      }

      if (callback) {
        callback(ok, Math.max(cloudBest, state.bestScore));
      }
    });
  });
}

module.exports = {
  CLOUD_KEY: CLOUD_KEY,
  loadBest: loadBest,
  submitIfRecord: submitIfRecord
};

};
modules["js/consent.js"] = function(module, exports, require) {
'use strict';

var PRIVACY_KEY = 'hextris.privacy.v1';
var AUTH_KEY = 'hextris.auth.v1';

function getApi(state) {
  if (state && state.platform && state.platform.api) {
    return state.platform.api;
  }

  return typeof wx !== 'undefined' ? wx : null;
}

function load(state, callback) {
  var privacy = state.platform.storage.get(PRIVACY_KEY, null);
  var auth = state.platform.storage.get(AUTH_KEY, null);

  state.privacyPrompted = !!(privacy && typeof privacy === 'object');
  state.privacyAccepted = !!(privacy && privacy.accepted === true);
  state.privacyNeedAuth = false;
  state.privacyContractName = '';
  state.authLeaderboard = null;

  if (auth && typeof auth.leaderboard === 'boolean') {
    state.authLeaderboard = auth.leaderboard;
  }

  var api = getApi(state);
  var done = false;

  function finish() {
    if (!done) {
      done = true;
      if (callback) {
        callback();
      }
    }
  }

  // 查询微信侧是否还需要用户同意《用户隐私保护指引》。
  // 只有声明了隐私收集类型且用户尚未同意时，needAuthorization 才为 true。
  if (api && api.getPrivacySetting) {
    try {
      api.getPrivacySetting({
        success: function (res) {
          state.privacyNeedAuth = !!(res && res.needAuthorization);
          state.privacyContractName = (res && res.privacyContractName) || '';
          finish();
        },
        fail: finish
      });
      return;
    } catch (e) {
      // ignore
    }
  }

  finish();
}

function needsPrivacyPrompt(state) {
  // 本地拒绝过就不再每次启动重复弹窗；
  // 只有“之前同意过、但微信侧新增了隐私类型”时才需要重新确认。
  return !state.privacyPrompted ||
    (state.privacyNeedAuth === true && state.privacyAccepted === true);
}

/**
 * 本地记录同意，并在需要时调用微信官方隐私授权。
 * 官方弹窗由微信自动展示；用户拒绝时回调 false，游戏仍可继续。
 */
function acceptPrivacy(state, callback) {
  var api = getApi(state);
  var settled = false;

  function settle(ok) {
    if (settled) {
      return;
    }

    settled = true;

    if (ok) {
      state.privacyPrompted = true;
      state.privacyAccepted = true;
      state.privacyNeedAuth = false;

      state.platform.storage.set(PRIVACY_KEY, {
        accepted: true,
        at: Date.now()
      });
    } else {
      declinePrivacy(state);
    }

    if (callback) {
      callback(ok);
    }
  }

  // 老版本基础库或未配置隐私指引时，不需要额外授权
  if (!api || !api.requirePrivacyAuthorize || state.privacyNeedAuth !== true) {
    settle(true);
    return;
  }

  try {
    api.requirePrivacyAuthorize({
      success: function () {
        settle(true);
      },
      fail: function () {
        settle(false);
      }
    });
  } catch (e) {
    settle(true);
  }
}

function openContract(state) {
  var api = getApi(state);

  if (!api || !api.openPrivacyContract) {
    return false;
  }

  try {
    api.openPrivacyContract({
      fail: function () {}
    });
    return true;
  } catch (e) {
    return false;
  }
}

function getContractName(state) {
  return state.privacyContractName || '《星核轮转隐私保护指引》';
}

function declinePrivacy(state) {
  state.privacyPrompted = true;
  state.privacyAccepted = false;
  state.privacyNeedAuth = false;
  state.authLeaderboard = false;

  state.platform.storage.set(PRIVACY_KEY, {
    accepted: false,
    at: Date.now()
  });
  state.platform.storage.set(AUTH_KEY, {
    leaderboard: false,
    at: Date.now()
  });
}

function canUseCloud(state) {
  return state.privacyAccepted === true && state.authLeaderboard === true;
}

function canShowLeaderboard(state) {
  return state.privacyAccepted === true && state.authLeaderboard !== false;
}

function canUseRank(state) {
  return state.privacyAccepted === true && state.authLeaderboard === true;
}

function setLeaderboardAuth(state, allowed) {
  state.authLeaderboard = !!allowed;

  state.platform.storage.set(AUTH_KEY, {
    leaderboard: !!allowed,
    at: Date.now()
  });
}

module.exports = {
  PRIVACY_KEY: PRIVACY_KEY,
  AUTH_KEY: AUTH_KEY,
  load: load,
  needsPrivacyPrompt: needsPrivacyPrompt,
  acceptPrivacy: acceptPrivacy,
  declinePrivacy: declinePrivacy,
  openContract: openContract,
  getContractName: getContractName,
  canUseCloud: canUseCloud,
  canShowLeaderboard: canShowLeaderboard,
  canUseRank: canUseRank,
  setLeaderboardAuth: setLeaderboardAuth
};

};
modules["js/draw.js"] = function(module, exports, require) {
'use strict';

var rotatePoint = require('./math').rotatePoint;

var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

function drawPolygon(ctx, x, y, sides, radius, theta, fillColor, lineWidth, lineColor) {
  ctx.fillStyle = fillColor;
  ctx.lineWidth = lineWidth || 0;
  ctx.strokeStyle = lineColor || 'rgba(0,0,0,0)';

  ctx.beginPath();
  var coords = rotatePoint(0, radius, theta);
  ctx.moveTo(coords.x + x, coords.y + y);
  var oldX = coords.x;
  var oldY = coords.y;
  for (var i = 0; i < sides; i++) {
    coords = rotatePoint(oldX, oldY, 360 / sides);
    ctx.lineTo(coords.x + x, coords.y + y);
    oldX = coords.x;
    oldY = coords.y;
  }
  ctx.closePath();
  ctx.fill();
  if (lineWidth) {
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0)';
}

function renderText(state, x, y, size, color, text, font, align, baseline) {
  var ctx = state.ctx;
  ctx.save();
  ctx.font = size + 'px ' + (font || FONT);
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillStyle = color;
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawButton(state, rect, label, options) {
  options = options || {};
  var ctx = state.ctx;
  var ui = state.uiScale;
  var radius = options.radius == null ? 14 * ui : options.radius;

  ctx.save();
  ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius, options.fill || '#3498db');
  if (options.stroke) {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth || 1;
    ctx.stroke();
  }
  renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    (options.fontSize || 20) * ui,
    options.color || '#ffffff',
    label,
    FONT,
    'center',
    'middle'
  );
  ctx.restore();
}

function drawTextLink(state, rect, label, color) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var size = 14 * ui;
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;

  renderText(state, cx, cy, size, color || '#7f8c8d', label, FONT, 'center', 'middle');

  ctx.save();
  ctx.font = size + 'px ' + FONT;
  var width = ctx.measureText(label).width;
  ctx.strokeStyle = 'rgba(127,140,141,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, cy + size * 0.7);
  ctx.lineTo(cx + width / 2, cy + size * 0.7);
  ctx.stroke();
  ctx.restore();
}

function drawPanel(state, rect, fill, alpha) {
  var ctx = state.ctx;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 20 * state.uiScale, fill || '#ffffff');
  ctx.restore();
}

function drawPauseIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  var bw = 4.5 * ui;
  var bh = 18 * ui;
  fillRoundRect(ctx, cx - 8 * ui, cy - bh / 2, bw, bh, 2 * ui, '#ffffff');
  fillRoundRect(ctx, cx + 3.5 * ui, cy - bh / 2, bw, bh, 2 * ui, '#ffffff');
  ctx.restore();
}

function drawHelpIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  renderText(state, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1 * ui, 24 * ui, '#ffffff', '?', FONT, 'center', 'middle');
  ctx.restore();
}

function drawLeaderboardIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;

  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2 + 1 * ui,
    22 * ui,
    '#ffffff',
    '榜',
    FONT,
    'center',
    'middle'
  );
  ctx.restore();
}

function drawSettingsIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  var left = cx - 12 * ui;
  var right = cx + 12 * ui;
  var ys = [cy - 7 * ui, cy, cy + 7 * ui];
  var knobs = [cx - 4 * ui, cx + 5 * ui, cx - 1 * ui];

  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 * ui;
  ctx.lineCap = 'round';

  for (var i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(left, ys[i]);
    ctx.lineTo(right, ys[i]);
    ctx.stroke();
  }

  for (var j = 0; j < 3; j++) {
    ctx.beginPath();
    ctx.arc(knobs[j], ys[j], 3.6 * ui, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,62,80,0.55)';
    ctx.lineWidth = 1 * ui;
    ctx.stroke();
  }

  ctx.restore();
}

function drawToggle(state, rect, on) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var radius = rect.h / 2;

  ctx.save();
  fillRoundRect(
    ctx,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    radius,
    on ? '#3498db' : '#d5dde5'
  );

  var knobX = on ? rect.x + rect.w - radius : rect.x + radius;
  ctx.beginPath();
  ctx.arc(knobX, rect.y + radius, radius - 3 * ui, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(44,62,80,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  var lines = [];
  var current = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    var test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

module.exports = {
  FONT: FONT,
  drawPolygon: drawPolygon,
  renderText: renderText,
  roundRect: roundRect,
  fillRoundRect: fillRoundRect,
  drawButton: drawButton,
  drawTextLink: drawTextLink,
  drawPanel: drawPanel,
  drawPauseIcon: drawPauseIcon,
  drawHelpIcon: drawHelpIcon,
  drawLeaderboardIcon: drawLeaderboardIcon,
  drawSettingsIcon: drawSettingsIcon,
  drawToggle: drawToggle,
  wrapText: wrapText
};

};
modules["js/guard.js"] = function(module, exports, require) {
'use strict';

var UPLOAD_LOG_KEY = 'hextris.upload.v1';
var MAX_SCORE = 1000000;
var MIN_UPLOAD_INTERVAL = 30 * 1000;
var MAX_UPLOADS_PER_HOUR = 5;

function validateScore(score) {
  var n = Number(score);
  return isFinite(n) && n >= 0 && Math.floor(n) === n && n <= MAX_SCORE;
}

function readLog(state) {
  var raw = state.platform.storage.get(UPLOAD_LOG_KEY, null);

  if (!raw || !Array.isArray(raw.times)) {
    return [];
  }

  var now = Date.now();
  var list = [];

  for (var i = 0; i < raw.times.length; i++) {
    var t = Number(raw.times[i]);
    if (isFinite(t) && now - t >= 0 && now - t < 60 * 60 * 1000) {
      list.push(t);
    }
  }

  return list;
}

function canUpload(state, score) {
  if (!validateScore(score)) {
    return { ok: false, reason: 'score' };
  }

  var times = readLog(state);
  var now = Date.now();

  if (times.length >= MAX_UPLOADS_PER_HOUR) {
    return { ok: false, reason: 'rate' };
  }

  var last = times.length ? times[times.length - 1] : 0;
  if (last && now - last < MIN_UPLOAD_INTERVAL) {
    return { ok: false, reason: 'rate' };
  }

  return { ok: true, reason: '' };
}

function markUpload(state) {
  var times = readLog(state);
  times.push(Date.now());

  state.platform.storage.set(UPLOAD_LOG_KEY, {
    times: times
  });
}

module.exports = {
  MAX_SCORE: MAX_SCORE,
  MIN_UPLOAD_INTERVAL: MIN_UPLOAD_INTERVAL,
  MAX_UPLOADS_PER_HOUR: MAX_UPLOADS_PER_HOUR,
  validateScore: validateScore,
  canUpload: canUpload,
  markUpload: markUpload
};

};
modules["js/Hex.js"] = function(module, exports, require) {
'use strict';

var GS = require('./state').GS;
var drawPolygon = require('./draw').drawPolygon;
var boardApi = require('../core/board');
var physics = require('../core/physics');

function Hex(state, sideLength) {
  this.state = state;
  this.playThrough = 0;
  this.fillColor = [44, 62, 80];
  this.tempColor = [44, 62, 80];
  this.angularVelocity = 0;
  this.position = 0;
  this.dy = 0;
  this.dt = 1;
  this.sides = 6;
  this.board = boardApi.create(6);
  this.angle = 180 / this.sides;
  this.targetAngle = this.angle;
  this.shakes = [];
  this.sideLength = sideLength;
  this.strokeColor = 'blue';
  this.x = state.width / 2;
  this.y = state.height / 2;
  this.ct = 0;
  this.lastCombo = this.ct - state.settings.comboTime;
  this.lastColorScored = '#000000';
  this.comboTime = state.settings.comboTime;
  this.comboMultiplier = 1;
  this.texts = [];
  this.lastRotate = Date.now();
  this.delay = 15;
}

Hex.prototype.shake = function (obj) {
  var angle = 30 + obj.lane * 60;
  angle *= Math.PI / 180;
  var dx = Math.cos(angle) * obj.magnitude;
  var dy = Math.sin(angle) * obj.magnitude;
  var state = this.state;

  state.gdx -= dx;
  state.gdy += dy;
  obj.magnitude /= 2 * this.dt;

  if (obj.magnitude < 1) {
    for (var i = 0; i < this.shakes.length; i++) {
      if (this.shakes[i] === obj) {
        this.shakes.splice(i, 1);
        break;
      }
    }
  }
};

Hex.prototype.addBlock = function (block, lane) {
  var state = this.state;
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  block.settled = 1;
  block.tint = 0.6;

  if (lane === undefined) {
    lane = physics.landingLane(this.sides, block.fallingLane, this.position);
  }

  this.shakes.push({
    lane: block.fallingLane,
    magnitude: 4.5 * state.settings.scale
  });

  var level = boardApi.count(this.board, lane);
  block.distFromHex = physics.coreRadius(this.sideLength) + block.height * level;
  block.checked = 1;
  boardApi.push(this.board, lane, block);

  if (state.audio) {
    state.audio.playSfx('drop');
  }
};

// level 省略时：按下落方块的当前朝向解析目标边（下落阶段）
// level 传入时：检查该层方块是否落到下一层之上（重排阶段）
Hex.prototype.doesBlockCollide = function (block, level) {
  if (block.settled) {
    return;
  }

  var state = this.state;
  var core = physics.coreRadius(this.sideLength);
  var step = physics.stepOf(block, this.dt, state.settings.scale);
  var result;

  if (level !== undefined) {
    var below = level > 0 ? boardApi.at(this.board, block.attachedLane, level - 1) : null;
    result = physics.settleRadius(block, below, core, step);

    if (result.settled) {
      block.distFromHex = result.radius;
      block.settled = 1;
      block.checked = 1;
    } else {
      block.settled = 0;
      block.iter = 1.5 + (state.waveone.difficulty / 15) * 3;
    }
    return;
  }

  var lane = physics.landingLane(this.sides, block.fallingLane, this.position);
  var top = boardApi.top(this.board, lane);
  result = physics.landingRadius(block, top, core, step);

  if (result.land) {
    block.distFromHex = result.radius;
    this.addBlock(block, lane);
  }
};

Hex.prototype.rotate = function (steps) {
  var now = Date.now();
  if (now - this.lastRotate < 70) {
    return;
  }
  if (this.state.gameState !== GS.PLAYING) {
    return;
  }

  this.position += steps;

  while (this.position < 0) {
    this.position += 6;
  }
  this.position = this.position % this.sides;

  boardApi.forEach(this.board, function (block) {
    block.targetAngle = block.targetAngle - steps * 60;
  });

  this.targetAngle = this.targetAngle - steps * 60;
  this.lastRotate = now;

  if (this.state.audio) {
    this.state.audio.playSfx('rotate');
  }
};

Hex.prototype.draw = function () {
  var state = this.state;
  var ctx = state.ctx;

  this.x = state.width / 2;
  this.y = state.height / 2;
  this.sideLength = state.settings.hexWidth;

  state.gdx = 0;
  state.gdy = 0;

  for (var i = 0; i < this.shakes.length; i++) {
    this.shake(this.shakes[i]);
  }

  if (this.angle > this.targetAngle) {
    this.angularVelocity -= state.angularVelocityConst * this.dt;
  } else if (this.angle < this.targetAngle) {
    this.angularVelocity += state.angularVelocityConst * this.dt;
  }

  if (Math.abs(this.angle - this.targetAngle + this.angularVelocity) <= Math.abs(this.angularVelocity)) {
    this.angle = this.targetAngle;
    this.angularVelocity = 0;
  } else {
    this.angle += this.angularVelocity;
  }

  drawPolygon(
    ctx,
    this.x + state.gdx,
    this.y + state.gdy + this.dy,
    this.sides,
    this.sideLength,
    this.angle,
    arrayToColor(this.fillColor),
    0,
    'rgba(0,0,0,0)'
  );
};

function arrayToColor(arr) {
  return 'rgb(' + arr[0] + ',' + arr[1] + ',' + arr[2] + ')';
}

module.exports = {
  Hex: Hex,
  arrayToColor: arrayToColor
};

};
modules["js/input.js"] = function(module, exports, require) {
'use strict';

var GS = require('./state').GS;
var getLayout = require('./ui').getLayout;
var pointInRect = require('./ui').pointInRect;
var ads = require('./ads');

function setupInput(state, actions) {
  state.platform.onTouchStart(function (x, y) {
    handleTap(state, actions, x, y);
  });
}

function click(state) {
  if (state.audio) {
    state.audio.playSfx('click');
  }
}

function handleTap(state, actions, x, y) {
  var layout = getLayout(state);

  if (state.gameState === GS.START) {
    if (pointInRect(x, y, layout.homeHelpLink)) {
      click(state);
      actions.help();
      return;
    }
    if (state.privacyAccepted === true && state.authLeaderboard !== false && pointInRect(x, y, layout.homeLeaderboardLink)) {
      click(state);
      if (state.authLeaderboard === null) {
        actions.requestAuth();
      } else {
        actions.leaderboard();
      }
      return;
    }
    if (pointInRect(x, y, layout.homeSettingsLink)) {
      click(state);
      actions.settings();
      return;
    }
    if (state.hasSave && pointInRect(x, y, layout.continueLink)) {
      click(state);
      actions.continue();
      return;
    }
    if (pointInRect(x, y, layout.startNew)) {
      click(state);
      actions.startNew();
    }
    return;
  }

  if (state.gameState === GS.PLAYING) {
    if (pointInRect(x, y, layout.pauseBtn)) {
      click(state);
      actions.pause();
      return;
    }

    if (state.MainHex) {
      if (x < state.width / 2) {
        state.MainHex.rotate(1);
      } else {
        state.MainHex.rotate(-1);
      }
    }
    return;
  }

  if (state.gameState === GS.PAUSED) {
    if (pointInRect(x, y, layout.resume)) {
      click(state);
      actions.resume();
      return;
    }
    if (pointInRect(x, y, layout.restart)) {
      click(state);
      actions.restart();
      return;
    }
    if (pointInRect(x, y, layout.helpInPause)) {
      click(state);
      actions.help();
      return;
    }
    if (pointInRect(x, y, layout.settingsInPause)) {
      click(state);
      actions.settings();
      return;
    }
    if (pointInRect(x, y, layout.homeFromPause)) {
      click(state);
      actions.home();
    }
    return;
  }

  if (state.gameState === GS.SETTINGS) {
    if (pointInRect(x, y, layout.musicRow)) {
      click(state);
      actions.toggleMusic();
      return;
    }
    if (pointInRect(x, y, layout.sfxRow)) {
      click(state);
      actions.toggleSfx();
      return;
    }
    if (pointInRect(x, y, layout.vibrateRow)) {
      click(state);
      actions.toggleVibrate();
      return;
    }
    if (pointInRect(x, y, layout.settingsDone)) {
      click(state);
      actions.closeSettings();
    }
    return;
  }

  if (state.gameState === GS.CHALLENGE_PROMPT) {
    if (pointInRect(x, y, layout.challengeIgnore)) {
      click(state);
      actions.ignoreChallenge();
      return;
    }
    if (pointInRect(x, y, layout.challengeAccept)) {
      click(state);
      actions.acceptChallenge();
    }
    return;
  }

  if (state.gameState === GS.PRIVACY) {
    if (pointInRect(x, y, layout.privacyLink)) {
      click(state);
      actions.privacyContract();
      return;
    }
    if (pointInRect(x, y, layout.privacyDecline)) {
      click(state);
      actions.privacyDecline();
      return;
    }
    if (pointInRect(x, y, layout.privacyAgree)) {
      click(state);
      actions.privacyAgree();
    }
    return;
  }

  if (state.gameState === GS.AUTH) {
    if (pointInRect(x, y, layout.authDeny)) {
      click(state);
      actions.authDeny();
      return;
    }
    if (pointInRect(x, y, layout.authAllow)) {
      click(state);
      actions.authAllow();
    }
    return;
  }

  if (state.gameState === GS.LEADERBOARD) {
    if (pointInRect(x, y, layout.leaderboardBack)) {
      click(state);
      actions.closeLeaderboard();
    }
    return;
  }

  if (state.gameState === GS.CONFIRM_HOME) {
    if (pointInRect(x, y, layout.confirmCancel)) {
      click(state);
      actions.cancelHome();
      return;
    }
    if (pointInRect(x, y, layout.confirmOk)) {
      click(state);
      actions.confirmHome();
    }
    return;
  }

  if (state.gameState === GS.HELP) {
    if (pointInRect(x, y, layout.back)) {
      click(state);
      actions.closeHelp();
    }
    return;
  }

  if (state.gameState === GS.GAMEOVER) {
    if (
      ads.canRevive(state) &&
      state.adNoticeUntil <= Date.now() &&
      pointInRect(x, y, layout.overRevive)
    ) {
      click(state);
      actions.reviveByAd();
      return;
    }
    if (pointInRect(x, y, layout.playAgain)) {
      click(state);
      actions.startNew();
      return;
    }
    if (pointInRect(x, y, layout.share)) {
      click(state);
      actions.share();
      return;
    }
    if (pointInRect(x, y, layout.homeFromOver)) {
      click(state);
      actions.home();
    }
  }
}

module.exports = {
  setupInput: setupInput,
  handleTap: handleTap
};

};
modules["js/main.js"] = function(module, exports, require) {
'use strict';

var GS = require('./state').GS;
var createState = require('./state').createState;
var createPlatform = require('./platform').createPlatform;
var Hex = require('./Hex').Hex;
var WaveGen = require('./wavegen').WaveGen;
var update = require('./update').update;
var render = require('./render').render;
var setupInput = require('./input').setupInput;
var AudioManager = require('./audio').AudioManager;
var RankBridge = require('./rank').RankBridge;
var cloud = require('./cloud');
var share = require('./share');
var consent = require('./consent');
var guard = require('./guard');
var save = require('./save');
var ads = require('./ads');
var boardApi = require('../core/board');

var current = null;

var raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : function (cb) {
      return setTimeout(function () {
        cb(Date.now());
      }, 16);
    };

function start() {
  var platform = createPlatform();
  var state = createState(platform);
  current = state;

  platform.setupShare(function () {
    return share.getPayload(state);
  });
  platform.setKeepScreenOn();

  // 广告：默认关闭；开启后只会在结算页初始化，不影响对局
  ads.setup(platform);

  save.loadSettings(state);
  state.audio = new AudioManager(state);
  save.loadHighScores(state);
  state.rank = new RankBridge(state);
  consent.load(state, function () {
    // 微信侧新增隐私收集类型、或用户清空过授权时，重新展示隐私面板
    if (
      state.privacyNeedAuth === true &&
      state.privacyAccepted === true &&
      state.gameState === GS.START
    ) {
      state.gameState = GS.PRIVACY;
      if (state.audio) {
        state.audio.pauseBgm();
      }
    }

    if (consent.canUseCloud(state)) {
      cloud.loadBest(state, function (best) {
        if (state.rank && state.gameState === GS.LEADERBOARD) {
          state.rank.showLeaderboard(best);
        }
      });
    }
  });

  // 有存档就先恢复到棋盘上，开始界面显示“继续游戏”
  if (!save.restoreGame(state)) {
    state.MainHex = new Hex(state, state.settings.hexWidth);
    state.waveone = new WaveGen(state, state.MainHex);
  }

  state.gameState = consent.needsPrivacyPrompt(state) ? GS.PRIVACY : GS.START;
  state.lastTime = Date.now();

  var launchTarget = parseChallengeTarget(platform.getLaunchQuery());
  if (launchTarget) {
    state.pendingChallengeTarget = launchTarget;
  }

  if (state.gameState === GS.START) {
    maybeShowChallengePrompt(state);
  }

  // 隐私提示/挑战提示先不播音乐；进入首页后再开始
  if (state.audio) {
    if (state.gameState === GS.PRIVACY || state.gameState === GS.CHALLENGE_PROMPT) {
      state.audio.pauseBgm();
    } else {
      state.audio.unlock();
    }
  }

  setupInput(state, makeActions(state));

  platform.onHide(function () {
    ads.hideBanner();

    if (state.audio) {
      state.audio.pauseBgm();
    }

    if (state.gameState === GS.PLAYING) {
      state.gameState = GS.PAUSED;
      save.saveGame(state);
    } else if (state.gameState === GS.PAUSED) {
      save.saveGame(state);
    }
  });

  platform.onShow(function (query) {
    state.lastTime = Date.now();

    var target = parseChallengeTarget(query);
    if (target) {
      state.pendingChallengeTarget = target;

      if (state.gameState === GS.START) {
        maybeShowChallengePrompt(state);
      }
    }

    if (state.audio && (state.gameState === GS.START || state.gameState === GS.PLAYING)) {
      state.audio.playBgm();
    }

    if (state.rank && state.gameState === GS.LEADERBOARD) {
      state.rank.showLeaderboard(state.bestScore);
    }
  });

  raf(loop);
  return state;
}

function makeActions(state) {
  return {
    startNew: function () {
      startNewGame(state);
    },
    continue: function () {
      continueGame(state);
    },
    pause: function () {
      pauseGame(state);
    },
    resume: function () {
      resumeGame(state);
    },
    help: function () {
      openHelp(state);
    },
    closeHelp: function () {
      closeHelp(state);
    },
    leaderboard: function () {
      openLeaderboard(state);
    },
    closeLeaderboard: function () {
      closeLeaderboard(state);
    },
    requestAuth: function () {
      openAuth(state);
    },
    authAllow: function () {
      allowAuth(state);
    },
    authDeny: function () {
      denyAuth(state);
    },
    privacyAgree: function () {
      agreePrivacy(state);
    },
    privacyDecline: function () {
      declinePrivacy(state);
    },
    privacyContract: function () {
      consent.openContract(state);
    },
    acceptChallenge: function () {
      acceptChallenge(state);
    },
    ignoreChallenge: function () {
      ignoreChallenge(state);
    },
    settings: function () {
      openSettings(state);
    },
    closeSettings: function () {
      closeSettings(state);
    },
    toggleMusic: function () {
      state.audio.setMusic(!state.sound.music);
    },
    toggleSfx: function () {
      state.audio.setSfx(!state.sound.sfx);
    },
    toggleVibrate: function () {
      state.audio.setVibrate(!state.sound.vibrate);
    },
    home: function () {
      openHomeConfirm(state);
    },
    cancelHome: function () {
      closeHomeConfirm(state);
    },
    confirmHome: function () {
      goHome(state);
    },
    restart: function () {
      startNewGame(state);
    },
    share: function () {
      share.shareScore(state);
    },
    reviveByAd: function () {
      requestAdRevive(state);
    }
  };
}

function parseChallengeTarget(query) {
  if (!query) {
    return 0;
  }

  var raw = query.challengeScore;
  var target = Number(raw);

  if (!isFinite(target) || Math.floor(target) !== target || target <= 0) {
    return 0;
  }

  if (!guard.validateScore(target)) {
    return 0;
  }

  return target;
}

function maybeShowChallengePrompt(state) {
  if (!state.pendingChallengeTarget || state.gameState !== GS.START) {
    return;
  }

  state.gameState = GS.CHALLENGE_PROMPT;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function acceptChallenge(state) {
  if (state.gameState !== GS.CHALLENGE_PROMPT) {
    return;
  }

  var target = state.pendingChallengeTarget;
  if (!target) {
    ignoreChallenge(state);
    return;
  }

  startNewGame(state);
  state.challenge = {
    target: target,
    active: true,
    result: null
  };
}

function ignoreChallenge(state) {
  if (state.gameState !== GS.CHALLENGE_PROMPT) {
    return;
  }

  state.pendingChallengeTarget = 0;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }
}

function startNewGame(state) {
  save.clearSave(state);
  ads.hideBanner();

  if (state.rank) {
    state.rank.hide();
  }

  state.score = 0;
  state.scoreOpacity = 0;
  state.textOpacity = 0;
  state.prevScore = 0;
  state.blocks = [];
  state.gdx = 0;
  state.gdy = 0;
  state.rush = 1;
  state.lastClear = { at: 0, count: 0 };
  state.lastVibrateAt = 0;
  state.isNewRecord = false;
  state.scoreBlocked = false;
  state.reviveUsed = false;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.shareImagePath = null;
  state.shareImageScore = null;
  state.pendingChallengeTarget = 0;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };
  state.frameCount = 0;
  state.startTime = Date.now();

  state.settings.prevScale = state.settings.scale;
  state.settings.hexWidth = state.settings.baseHexWidth * state.settings.scale;
  state.settings.blockHeight = state.settings.baseBlockHeight * state.settings.scale;

  state.MainHex = new Hex(state, state.settings.hexWidth);
  state.waveone = new WaveGen(state, state.MainHex);
  state.gameState = GS.PLAYING;
  state.helpReturn = GS.START;
  state.settingsReturn = GS.START;
  state.homeReturnState = null;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.unlock();
  }
}

function continueGame(state) {
  if (!state.hasSave || !state.MainHex) {
    startNewGame(state);
    return;
  }

  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();
  state.rush = 1;

  if (state.audio) {
    state.audio.unlock();
  }
}

function pauseGame(state) {
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  state.gameState = GS.PAUSED;
  save.saveGame(state);

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function resumeGame(state) {
  if (state.gameState !== GS.PAUSED) {
    return;
  }

  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();
  state.rush = 1;

  if (state.audio) {
    state.audio.unlock();
  }
}

function openHelp(state) {
  if (state.gameState === GS.HELP) {
    return;
  }

  if (state.gameState === GS.START) {
    state.helpReturn = GS.START;
  } else {
    if (state.gameState === GS.PLAYING) {
      save.saveGame(state);
    }
    state.helpReturn = GS.PAUSED;
  }

  state.gameState = GS.HELP;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeHelp(state) {
  if (state.gameState !== GS.HELP) {
    return;
  }

  state.gameState = state.helpReturn;
  state.lastTime = Date.now();

  if (state.audio && state.gameState === GS.START) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function agreePrivacy(state) {
  if (state.gameState !== GS.PRIVACY) {
    return;
  }

  // 本地记录 + 微信官方隐私授权；用户拒绝时关闭云榜，但游戏照常进入首页
  consent.acceptPrivacy(state, function (accepted) {
    state.gameState = GS.START;
    state.lastTime = Date.now();

    if (state.audio) {
      state.audio.playBgm();
    }

    maybeShowChallengePrompt(state);

    if (!accepted || !consent.canUseCloud(state)) {
      return;
    }

    cloud.loadBest(state, function (best) {
      if (state.rank && state.gameState === GS.LEADERBOARD) {
        state.rank.showLeaderboard(best);
      }
    });
  });
}

function declinePrivacy(state) {
  if (state.gameState !== GS.PRIVACY) {
    return;
  }

  consent.declinePrivacy(state);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openAuth(state) {
  if (state.gameState !== GS.START || state.privacyAccepted !== true) {
    return;
  }

  state.gameState = GS.AUTH;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function allowAuth(state) {
  if (state.gameState !== GS.AUTH) {
    return;
  }

  consent.setLeaderboardAuth(state, true);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  openLeaderboard(state);
}

function denyAuth(state) {
  if (state.gameState !== GS.AUTH) {
    return;
  }

  consent.setLeaderboardAuth(state, false);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openLeaderboard(state) {
  if (state.gameState !== GS.START || !consent.canShowLeaderboard(state)) {
    return;
  }

  if (state.authLeaderboard === null) {
    openAuth(state);
    return;
  }

  state.leaderboardReturn = GS.START;
  state.gameState = GS.LEADERBOARD;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }

  if (state.rank) {
    state.rank.showLeaderboard(state.bestScore);
  }

  if (consent.canUseCloud(state)) {
    cloud.loadBest(state, function (best) {
      if (state.rank && state.gameState === GS.LEADERBOARD) {
        state.rank.showLeaderboard(best);
      }
    });
  }
}

function closeLeaderboard(state) {
  if (state.gameState !== GS.LEADERBOARD) {
    return;
  }

  state.gameState = state.leaderboardReturn || GS.START;
  state.lastTime = Date.now();

  if (state.rank) {
    state.rank.hide();
  }

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openSettings(state) {
  if (state.gameState === GS.SETTINGS) {
    return;
  }

  if (state.gameState === GS.START) {
    state.settingsReturn = GS.START;
  } else {
    if (state.gameState === GS.PLAYING) {
      save.saveGame(state);
    }
    state.settingsReturn = GS.PAUSED;
  }

  state.gameState = GS.SETTINGS;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeSettings(state) {
  if (state.gameState !== GS.SETTINGS) {
    return;
  }

  state.gameState = state.settingsReturn;
  state.lastTime = Date.now();

  if (state.audio) {
    if (state.gameState === GS.START) {
      state.audio.playBgm();
    } else {
      state.audio.pauseBgm();
    }
  }

  maybeShowChallengePrompt(state);
}

function openHomeConfirm(state) {
  if (state.gameState !== GS.PAUSED && state.gameState !== GS.GAMEOVER) {
    return;
  }

  state.homeReturnState = state.gameState;

  if (state.gameState === GS.PAUSED) {
    save.saveGame(state);
  }

  state.gameState = GS.CONFIRM_HOME;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeHomeConfirm(state) {
  if (state.gameState !== GS.CONFIRM_HOME) {
    return;
  }

  state.gameState = state.homeReturnState;
  state.homeReturnState = null;
  state.lastTime = Date.now();
}

function goHome(state) {
  if (state.gameState !== GS.CONFIRM_HOME) {
    return;
  }

  var from = state.homeReturnState;
  state.homeReturnState = null;
  state.helpReturn = GS.START;
  state.settingsReturn = GS.START;
  state.lastTime = Date.now();

  if (state.rank) {
    state.rank.hide();
  }

  if (from === GS.PAUSED) {
    // 保留当前局面，回到首页后可以“继续上一局”
    state.hasSave = true;
    state.gdx = 0;
    state.gdy = 0;
    state.MainHex.texts = [];
    state.MainHex.shakes = [];
    state.gameState = GS.START;
  } else {
    // 从结束页返回，给一个干净的首页
    save.clearSave(state);

    state.score = 0;
    state.prevScore = 0;
    state.scoreOpacity = 0;
    state.textOpacity = 0;
    state.blocks = [];
    state.gdx = 0;
    state.gdy = 0;
    state.rush = 1;
    state.lastClear = { at: 0, count: 0 };
    state.lastVibrateAt = 0;
    state.isNewRecord = false;
    state.frameCount = 0;
    state.challenge = {
      target: 0,
      active: false,
      result: null
    };
    state.MainHex = new Hex(state, state.settings.hexWidth);
    state.waveone = new WaveGen(state, state.MainHex);
    state.gameState = GS.START;
  }

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function endGame(state) {
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  state.gameState = GS.GAMEOVER;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.scoreBlocked = !guard.validateScore(state.score);

  if (state.scoreBlocked) {
    state.isNewRecord = false;
    state.challenge.result = null;
  } else {
    save.pushHighScore(state);

    if (state.challenge.active) {
      var diff = state.score - state.challenge.target;
      state.challenge.result = {
        success: diff >= 0,
        diff: diff,
        target: state.challenge.target
      };
    }
  }

  save.clearSave(state);

  if (state.audio) {
    state.audio.playSfx('gameover');
    state.audio.stopBgm();
  }

  if (state.sound.vibrate) {
    state.platform.vibrate();
  }

  if (state.rank && consent.canUseRank(state) && !state.scoreBlocked) {
    state.rank.showGameOver(state.score, state.bestScore, state.isNewRecord);
  } else if (state.rank) {
    state.rank.hide();
  }

  // 提前生成分享卡片，红点和右上角菜单分享也能带上分数图
  share.ensureCard(state, state.score);

  var newRecord = state.isNewRecord;

  if (newRecord && !state.scoreBlocked && consent.canUseCloud(state)) {
    cloud.submitIfRecord(state, state.score, true, function (ok, best) {
      if (best > state.bestScore) {
        state.bestScore = best;
      }

      if (state.gameState === GS.GAMEOVER && state.rank) {
        state.rank.showGameOver(state.score, state.bestScore, true);
      }
    });
  }
}

/**
 * 激励视频复活：保留分数与难度，清空棋盘后继续本局。
 * 只有广告开关打开、且本局还没用过时才允许。
 */
function requestAdRevive(state) {
  if (!ads.canRevive(state) || state.adBusy) {
    return;
  }

  state.adBusy = true;
  state.adNotice = '';
  state.adNoticeUntil = 0;

  ads.showRewarded(function (res) {
    state.adBusy = false;

    if (res && res.ok) {
      reviveGame(state);
      return;
    }

    // 用户取消 / 无库存 / 超时：只给一行提示，不改变结算状态
    state.adNotice = res && res.reason === 'cancel'
      ? '已取消，可直接再来一局'
      : '广告暂时不可用，可直接再来一局';
    state.adNoticeUntil = Date.now() + 4000;
  });
}

function reviveGame(state) {
  if (state.gameState !== GS.GAMEOVER || state.reviveUsed) {
    return false;
  }

  state.reviveUsed = true;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.scoreOpacity = 0;
  state.textOpacity = 0;
  state.isNewRecord = false;
  state.scoreBlocked = false;
  state.blocks = [];
  state.gdx = 0;
  state.gdy = 0;
  state.rush = 1;
  state.lastClear = { at: 0, count: 0 };
  state.lastVibrateAt = 0;

  if (state.challenge) {
    state.challenge.result = null;
  }

  var difficulty = state.waveone ? state.waveone.difficulty : 1;

  state.MainHex = new Hex(state, state.settings.hexWidth);
  state.MainHex.delay = 45;
  state.waveone = new WaveGen(state, state.MainHex);
  state.waveone.difficulty = difficulty;
  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();

  ads.hideBanner();

  if (state.rank) {
    state.rank.hide();
  }

  if (state.audio) {
    state.audio.unlock();
    state.audio.playBgm();
  }

  return true;
}

function checkGameOver(state) {
  var hex = state.MainHex;
  if (!hex) {
    return false;
  }

  return boardApi.overflow(hex.board, state.settings.rows);
}

function loop(now) {
  var state = current;
  if (!state) {
    return;
  }

  raf(loop);

  if (typeof now !== 'number') {
    now = Date.now();
  }

  var raw = (now - state.lastTime) / 16.666;
  var dt = Math.min(Math.max(raw, 0), 3) * state.rush;
  state.lastTime = now;
  state.time += dt;

  if (state.gameState === GS.PLAYING) {
    state.frameCount++;

    if (state.MainHex.delay > 0) {
      state.MainHex.delay -= 1;
    } else {
      update(state, dt);
    }

    if (state.lastClear.at > state.lastVibrateAt) {
      state.lastVibrateAt = state.lastClear.at;
      if (state.sound.vibrate) {
        state.platform.vibrate();
      }
    }

    if (state.frameCount % 300 === 0) {
      save.saveGame(state);
    }

    if (checkGameOver(state)) {
      endGame(state);
    }
  }

  render(state);

  // Banner 只在结算页出现，其它状态立即隐藏
  ads.syncBanner(state);
}

module.exports = {
  start: start,
  getState: function () {
    return current;
  }
};

};
modules["js/math.js"] = function(module, exports, require) {
'use strict';

// 兼容入口：实现已迁到 core/math.js
module.exports = require('../core/math');

};
modules["js/platform.js"] = function(module, exports, require) {
'use strict';

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function createPlatform() {
  var api = getApi();
  var info = {};

  // 只读取窗口尺寸、像素比和安全区，不采集设备型号、系统版本等设备信息。
  try {
    if (api && api.getWindowInfo) {
      info = api.getWindowInfo();
    }
  } catch (e) {
    info = {};
  }

  var width = Number(info.windowWidth || info.screenWidth) || 375;
  var height = Number(info.windowHeight || info.screenHeight) || 667;

  // 限制到 2 倍，避免低端机 3 倍屏填充率过高
  var dpr = Math.min(Number(info.pixelRatio) || 1, 2);

  var canvas;
  if (api && api.createCanvas) {
    canvas = api.createCanvas();
  } else if (typeof document !== 'undefined') {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'gameCanvas';
      document.body.appendChild(canvas);
    }
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  } else {
    throw new Error('当前环境没有 Canvas，请在微信开发者工具中运行');
  }

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  var ctx = canvas.getContext('2d');
  if (ctx.setTransform) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else {
    ctx.scale(dpr, dpr);
  }

  var safeArea = info.safeArea || {};
  var safeTop = Math.max(0, Number(safeArea.top) || 0);
  var safeBottom = Math.max(0, height - (Number(safeArea.bottom) || height));
  var safeLeft = Math.max(0, Number(safeArea.left) || 0);
  var safeRight = Math.max(0, width - (Number(safeArea.right) || width));

  var storage = {
    get: function (key, fallback) {
      if (!api || !api.getStorageSync) {
        try {
          var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      }

      try {
        var value = api.getStorageSync(key);
        return value === '' || value === undefined || value === null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      if (!api || !api.setStorageSync) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(value));
          }
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        api.setStorageSync(key, value);
      } catch (e) {
        // ignore
      }
    },
    remove: function (key) {
      if (!api || !api.removeStorageSync) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        api.removeStorageSync(key);
      } catch (e) {
        // ignore
      }
    }
  };

  var lastVibrate = 0;

  function vibrate() {
    if (!api || !api.vibrateShort) {
      return;
    }

    var now = Date.now();
    if (now - lastVibrate < 90) {
      return;
    }
    lastVibrate = now;

    // 部分机型不支持 type 参数，失败时退回不带参数调用
    var retried = false;

    function fallback() {
      if (retried) {
        return;
      }
      retried = true;

      try {
        api.vibrateShort();
      } catch (e) {
        // ignore
      }
    }

    try {
      api.vibrateShort({
        type: 'medium',
        fail: fallback
      });
    } catch (e) {
      fallback();
    }
  }

  function onTouchStart(handler) {
    if (api && api.onTouchStart) {
      api.onTouchStart(function (e) {
        var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        if (t) {
          handler(t.clientX, t.clientY);
        }
      });
      return;
    }

    if (typeof document !== 'undefined') {
      var fn = function (e) {
        var t = e.touches ? e.touches[0] : e;
        handler(t.clientX, t.clientY);
      };
      document.addEventListener('touchstart', fn, { passive: true });
      document.addEventListener('mousedown', fn);
    }
  }

  function onHide(handler) {
    if (api && api.onHide) {
      api.onHide(handler);
    }
  }

  function onShow(handler) {
    if (api && api.onShow) {
      api.onShow(function (res) {
        handler(res && res.query);
      });
    }
  }

  function getLaunchQuery() {
    if (!api || !api.getLaunchOptionsSync) {
      return {};
    }

    try {
      var options = api.getLaunchOptionsSync();
      return (options && options.query) || {};
    } catch (e) {
      return {};
    }
  }

  function share(payload) {
    if (!api || !api.shareAppMessage) {
      return;
    }

    payload = payload || {};

    try {
      var options = {
        title: payload.title || '来挑战我的 HEXORBIT 分数！'
      };

      if (payload.imageUrl) {
        options.imageUrl = payload.imageUrl;
      }

      if (payload.query) {
        options.query = payload.query;
      }

      api.shareAppMessage(options);
    } catch (e) {
      // ignore
    }
  }

  function setupShare(getPayload) {
    if (!api) {
      return;
    }

    try {
      if (api.showShareMenu) {
        api.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        });
      }
    } catch (e) {
      // ignore
    }

    try {
      if (api.onShareAppMessage) {
        api.onShareAppMessage(function () {
          var payload = getPayload ? getPayload() : null;
          payload = payload || {};

          var options = {
            title: payload.title || '来挑战我的 HEXORBIT 分数！'
          };

          if (payload.imageUrl) {
            options.imageUrl = payload.imageUrl;
          }

          if (payload.query) {
            options.query = payload.query;
          }

          return options;
        });
      }
    } catch (e) {
      // ignore
    }
  }

  function setKeepScreenOn() {
    if (api && api.setKeepScreenOn) {
      try {
        api.setKeepScreenOn({ keepScreenOn: true });
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    api: api,
    canvas: canvas,
    ctx: ctx,
    width: width,
    height: height,
    dpr: dpr,
    safeTop: safeTop,
    safeBottom: safeBottom,
    safeLeft: safeLeft,
    safeRight: safeRight,
    storage: storage,
    vibrate: vibrate,
    onTouchStart: onTouchStart,
    onHide: onHide,
    onShow: onShow,
    getLaunchQuery: getLaunchQuery,
    share: share,
    setupShare: setupShare,
    setKeepScreenOn: setKeepScreenOn
  };
}

module.exports = {
  createPlatform: createPlatform
};

};
modules["js/rank.js"] = function(module, exports, require) {
'use strict';

// 与 openDataContext/index.js 中的画布尺寸保持一致
var SHARED_W = 600;
var SHARED_H = 880;
var SUMMARY_H = 240;

function RankBridge(state) {
  this.state = state;
  this.api = typeof wx !== 'undefined' ? wx : null;
  this.enabled = !!(this.api && this.api.getOpenDataContext);
  this.context = null;
  this.canvas = null;
  this.view = null;

  if (!this.enabled) {
    return;
  }

  try {
    this.context = this.api.getOpenDataContext();
    this.canvas = this.context && this.context.canvas;

    if (!this.canvas && this.api.getSharedCanvas) {
      try {
        this.canvas = this.api.getSharedCanvas();
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    this.context = null;
    this.canvas = null;
    this.enabled = false;
  }
}

RankBridge.prototype.post = function (message) {
  if (!this.context || !this.context.postMessage) {
    return;
  }

  try {
    this.context.postMessage(message);
  } catch (e) {
    // ignore
  }
};

RankBridge.prototype.showLeaderboard = function (bestScore) {
  this.view = 'leaderboard';
  this.post({
    type: 'leaderboard',
    best: bestScore || 0,
    width: SHARED_W,
    height: SHARED_H
  });
};

RankBridge.prototype.showGameOver = function (score, bestScore, isNewRecord) {
  this.view = 'gameover';
  this.post({
    type: 'gameover',
    score: score || 0,
    best: bestScore || 0,
    isNewRecord: !!isNewRecord,
    width: SHARED_W,
    height: SHARED_H
  });
};

RankBridge.prototype.hide = function () {
  this.view = null;
  this.post({ type: 'hide' });
};

RankBridge.prototype.draw = function (ctx, rect, view) {
  if (!this.enabled || !this.canvas || this.view !== view) {
    return false;
  }

  var cw = this.canvas.width || SHARED_W;
  var ch = this.canvas.height || SHARED_H;

  if (!cw || !ch) {
    return false;
  }

  // 共享画布可能被客户端重设为屏幕尺寸，摘要区高度需按设计比例换算
  var sourceHeight = view === 'gameover' ? ch * (SUMMARY_H / SHARED_H) : ch;

  try {
    ctx.drawImage(
      this.canvas,
      0,
      0,
      cw,
      sourceHeight,
      rect.x,
      rect.y,
      rect.w,
      rect.h
    );
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  RankBridge: RankBridge,
  SHARED_W: SHARED_W,
  SHARED_H: SHARED_H,
  SUMMARY_H: SUMMARY_H
};

};
modules["js/render.js"] = function(module, exports, require) {
'use strict';

var GS = require('./state').GS;
var draw = require('./draw');
var getLayout = require('./ui').getLayout;
var consent = require('./consent');
var ads = require('./ads');
var boardApi = require('../core/board');

var FONT = draw.FONT;

function render(state) {
  var ctx = state.ctx;
  var w = state.width;
  var h = state.height;

  if (ctx.setTransform) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = state.hexagonBackgroundColor;
  ctx.fillRect(0, 0, w, h);

  drawBoard(state);
  drawTexts(state);

  if (state.gameState === GS.START) {
    drawStartScreen(state);
  } else if (state.gameState === GS.PLAYING) {
    drawHud(state, true);
  } else if (state.gameState === GS.PAUSED) {
    drawHud(state, false);
    drawPauseOverlay(state);
  } else if (state.gameState === GS.GAMEOVER) {
    drawGameOver(state);
  } else if (state.gameState === GS.HELP) {
    drawHelp(state);
  } else if (state.gameState === GS.SETTINGS) {
    drawSettings(state);
  } else if (state.gameState === GS.CONFIRM_HOME) {
    drawConfirmHome(state);
  } else if (state.gameState === GS.LEADERBOARD) {
    drawLeaderboard(state);
  } else if (state.gameState === GS.PRIVACY) {
    drawPrivacy(state);
  } else if (state.gameState === GS.AUTH) {
    drawAuth(state);
  } else if (state.gameState === GS.CHALLENGE_PROMPT) {
    drawChallengePrompt(state);
  }

  ctx.globalAlpha = 1;
}

function drawHomeBackground(state) {
  var ctx = state.ctx;
  var home = getLayout(state).homeHex;

  draw.drawPolygon(ctx, home.x, home.y, 6, home.r, 30, state.outerColor, 0, 'rgba(0,0,0,0)');
  draw.drawPolygon(ctx, home.x, home.y, 6, home.innerR, 30, state.centerColor, 0, 'rgba(0,0,0,0)');
}

function drawBoard(state) {
  var hex = state.MainHex;
  if (!hex) {
    return;
  }

  var ctx = state.ctx;
  var s = state.settings;
  if (
    state.gameState === GS.START ||
    state.gameState === GS.LEADERBOARD ||
    state.gameState === GS.PRIVACY ||
    state.gameState === GS.AUTH ||
    state.gameState === GS.CHALLENGE_PROMPT
  ) {
    drawHomeBackground(state);
    return;
  }

  var outerRadius = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;

  draw.drawPolygon(
    ctx,
    state.width / 2,
    state.height / 2,
    6,
    outerRadius,
    30,
    state.outerColor,
    0,
    'rgba(0,0,0,0)'
  );

  var i;

  boardApi.forEach(hex.board, function (block, side, level) {
    block.draw(true, level);
  });

  for (i = 0; i < state.blocks.length; i++) {
    state.blocks[i].draw();
  }

  hex.draw();
}

function drawTexts(state) {
  var hex = state.MainHex;
  if (
    !hex ||
    state.gameState === GS.START ||
    state.gameState === GS.LEADERBOARD ||
    state.gameState === GS.PRIVACY ||
    state.gameState === GS.AUTH ||
    state.gameState === GS.CHALLENGE_PROMPT
  ) {
    return;
  }

  for (var i = 0; i < hex.texts.length; i++) {
    var alive = hex.texts[i].draw();
    if (!alive) {
      hex.texts.splice(i, 1);
      i--;
    }
  }
}

function scoreSizeFor(score, base) {
  var len = String(score).length;
  if (len <= 5) {
    return base;
  }
  if (len === 6) {
    return base * 0.86;
  }
  if (len === 7) {
    return base * 0.72;
  }
  if (len === 8) {
    return base * 0.62;
  }
  return base * 0.52;
}

function drawScoreText(state) {
  var hex = state.MainHex;
  if (!hex) {
    return;
  }

  var size = scoreSizeFor(state.score, 58);
  var scoreString = String(state.score);

  draw.renderText(
    state,
    state.width / 2 + state.gdx,
    state.height / 2 + state.gdy,
    size * state.settings.scale,
    '#ecf0f1',
    scoreString,
    FONT,
    'center',
    'middle'
  );
}

function drawHud(state, showIcons) {
  var ui = state.uiScale;
  var layout = getLayout(state);

  draw.renderText(
    state,
    state.width / 2,
    state.safeTop + 22 * ui,
    14 * ui,
    '#7f8c8d',
    '最高分 ' + Math.max(state.bestScore, state.score),
    FONT,
    'center',
    'middle'
  );

  if (showIcons) {
    // 游戏中只保留暂停按钮；玩法说明和设置收进暂停页
    draw.drawPauseIcon(state, layout.pauseBtn);
  }

  drawScoreText(state);
  drawComboTimer(state);
}

function drawComboTimer(state) {
  var hex = state.MainHex;
  if (!hex || state.gameState !== GS.PLAYING) {
    return;
  }

  var elapsed = hex.ct - hex.lastCombo;
  if (elapsed < 0 || elapsed >= hex.comboTime) {
    return;
  }

  var s = state.settings;
  var outerRadius = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;
  var progress = Math.max(0, Math.min(1, 1 - elapsed / hex.comboTime));
  var ctx = state.ctx;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    state.width / 2,
    state.height / 2,
    outerRadius - 5 * s.scale,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * progress
  );
  ctx.strokeStyle = hex.lastColorScored || '#3498db';
  ctx.lineWidth = 5 * s.scale;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawStartScreen(state) {
  var ui = state.uiScale;
  var layout = getLayout(state);
  var w = state.width;
  var home = layout.homeHex;
  var titleY = layout.homeTitleY;
  var titleSize = Math.min(50 * ui, w * 0.13);
  var best = Math.max(state.bestScore, state.score);

  draw.renderText(state, w / 2, titleY, titleSize, '#2c3e50', 'HEXORBIT', FONT, 'center', 'middle');
  draw.renderText(state, w / 2, titleY + 42 * ui, 19 * ui, '#7f8c8d', '星核轮转', FONT, 'center', 'middle');

  // 回到最初版的画面：最高分放回中心六边形里
  draw.renderText(state, w / 2, home.y - 11 * ui, 11 * ui, '#bdc3c7', '历史最高', FONT, 'center', 'middle');
  draw.renderText(state, w / 2, home.y + 12 * ui, 20 * ui, '#ecf0f1', String(best), FONT, 'center', 'middle');

  // 首页只保留一个主按钮；“继续上一局”是弱化入口
  draw.drawButton(state, layout.startNew, state.hasSave ? '新游戏' : '开始游戏', {
    fill: '#3498db',
    fontSize: 21
  });

  if (state.hasSave) {
    draw.drawTextLink(state, layout.continueLink, '继续上一局');
  } else if (layout.showHint) {
    draw.renderText(
      state,
      w / 2,
      layout.homeHint.y + layout.homeHint.h / 2,
      12 * ui,
      '#95a5a6',
      '点击左右半屏旋转六边形',
      FONT,
      'center',
      'middle'
    );
  }

  drawHomeLink(state, layout.homeHelpLink, '玩法说明');

  if (consent.canShowLeaderboard(state)) {
    drawHomeLink(state, layout.homeLeaderboardLink, '好友排行榜');
  }

  drawHomeLink(state, layout.homeSettingsLink, '设置');
}

function drawHomeLink(state, rect, label) {
  draw.renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    13 * state.uiScale,
    '#7f8c8d',
    label,
    FONT,
    'center',
    'middle'
  );
}

function drawPauseOverlay(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.pausePanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  draw.renderText(state, panel.x + panel.w / 2, panel.y + 56 * ui, 28 * ui, '#2c3e50', '已暂停', FONT, 'center', 'middle');
  draw.renderText(state, panel.x + panel.w / 2, panel.y + 96 * ui, 14 * ui, '#7f8c8d', '休息一下，随时继续', FONT, 'center', 'middle');

  draw.drawButton(state, layout.resume, '继续游戏', { fill: '#3498db', fontSize: 19 });
  draw.drawButton(state, layout.restart, '重新开始', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawButton(state, layout.helpInPause, '玩法说明', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawButton(state, layout.settingsInPause, '设置', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawTextLink(state, layout.homeFromPause, '保存并返回首页');
}

function drawGameOver(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.overPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;
  var f = layout.overScale || 1;
  var challengeResult = state.challenge && state.challenge.active ? state.challenge.result : null;
  var title = '游戏结束';

  if (challengeResult) {
    title = challengeResult.success ? '挑战成功' : '挑战失败';
  }

  draw.renderText(state, cx, panel.y + 48 * ui * f, 28 * ui, '#2c3e50', title, FONT, 'center', 'middle');

  if (challengeResult) {
    var diff = Math.abs(challengeResult.diff);
    var line = challengeResult.success ? '超出 ' + diff + ' 分' : '还差 ' + diff + ' 分';

    if (state.isNewRecord) {
      line += ' · 新纪录！';
    }

    draw.renderText(
      state,
      cx,
      panel.y + 82 * ui * f,
      14 * ui,
      challengeResult.success ? '#2ecc71' : '#e67e22',
      line,
      FONT,
      'center',
      'middle'
    );
  } else if (state.isNewRecord) {
    draw.renderText(state, cx, panel.y + 82 * ui * f, 15 * ui, '#e67e22', '新纪录！', FONT, 'center', 'middle');
  }

  draw.renderText(state, cx, panel.y + 118 * ui * f, 14 * ui, '#95a5a6', '本次得分', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 162 * ui * f, scoreSizeFor(state.score, 62 * f) * ui, '#2c3e50', String(state.score), FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 220 * ui * f, 15 * ui, '#7f8c8d', '历史最高 ' + state.bestScore, FONT, 'center', 'middle');

  var rankRect = layout.overRank;
  var rankUsable = !!(state.rank && state.rank.enabled && state.rank.canvas && consent.canUseRank(state) && !state.scoreBlocked);
  var rankText = '好友排行榜需在微信中查看';
  var rankColor = '#95a5a6';

  if (state.scoreBlocked) {
    rankText = '成绩异常，未计入排行榜';
    rankColor = '#e67e22';
  } else if (!state.privacyAccepted || state.authLeaderboard === false) {
    rankText = '好友排行榜已关闭';
  } else if (state.authLeaderboard === null) {
    rankText = '开启后可查看好友排名';
  } else if (rankUsable) {
    rankText = '好友排行加载中…';
  }

  // 开放数据域异步渲染；先用一行加载文案兜底
  draw.renderText(
    state,
    rankRect.x + rankRect.w / 2,
    rankRect.y + rankRect.h / 2,
    13 * ui,
    rankColor,
    rankText,
    FONT,
    'center',
    'middle'
  );

  if (rankUsable) {
    state.rank.draw(ctx, rankRect, 'gameover');
  }

  // 激励视频复活入口：广告关闭 / 已用过 / 广告不可用时整块不绘制
  var revive = layout.overRevive;
  if (state.adNoticeUntil > Date.now()) {
    draw.renderText(
      state,
      cx,
      revive.y + revive.h / 2,
      13 * ui,
      '#e67e22',
      state.adNotice,
      FONT,
      'center',
      'middle'
    );
  } else if (ads.canRevive(state)) {
    ctx.save();
    draw.fillRoundRect(ctx, revive.x, revive.y, revive.w, revive.h, revive.h / 2, 'rgba(52,152,219,0.10)');
    ctx.restore();

    draw.renderText(
      state,
      cx,
      revive.y + revive.h / 2,
      13 * ui,
      state.adBusy ? '#95a5a6' : '#3498db',
      state.adBusy ? '广告加载中…' : '看完整视频，原地复活（本局限 1 次）',
      FONT,
      'center',
      'middle'
    );
  }

  draw.drawButton(state, layout.playAgain, '再来一局', { fill: '#3498db', fontSize: 15 });
  draw.drawButton(state, layout.share, '分享挑战', { fill: '#2ecc71', fontSize: 15 });
  draw.drawButton(state, layout.homeFromOver, '返回首页', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 15 });
}

function drawLeaderboard(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.leaderboardPanel;
  var content = layout.leaderboardContent;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 40 * ui, 26 * ui, '#2c3e50', '好友排行榜', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 68 * ui, 13 * ui, '#95a5a6', '按历史最高分排序', FONT, 'center', 'middle');

  var rankUsable = !!(state.rank && state.rank.enabled && state.rank.canvas && consent.canUseRank(state));

  draw.renderText(
    state,
    content.x + content.w / 2,
    content.y + content.h / 2,
    14 * ui,
    '#95a5a6',
    rankUsable ? '好友排行加载中…' : '好友排行榜需在微信中查看',
    FONT,
    'center',
    'middle'
  );

  if (rankUsable) {
    state.rank.draw(ctx, content, 'leaderboard');
  }

  draw.drawButton(state, layout.leaderboardBack, '返回', { fill: '#3498db', fontSize: 18 });
}

function drawParagraph(state, text, x, y, maxWidth, fontSize, lineHeight, color, align) {
  var ctx = state.ctx;

  ctx.save();
  ctx.font = fontSize + 'px ' + FONT;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;

  var lines = draw.wrapText(ctx, text, maxWidth);
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y);
    y += lineHeight;
  }

  ctx.restore();
  return y;
}

function drawPrivacy(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.privacyPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var fontSize = 13 * ui;
  var lineHeight = 21 * ui;
  var textX = panel.x + 28 * ui;
  var maxWidth = panel.w - 56 * ui;
  var y = panel.y + 104 * ui;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '隐私提示', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 72 * ui, 13 * ui, '#95a5a6', '请阅读以下说明', FONT, 'center', 'middle');

  var items = [
    '本地存储：保存游戏进度、最高分和声音设置',
    '好友排行榜（可选）：读取好友公开的游戏数据（昵称、头像、最高分）',
    '不接入自建服务器，不上传个人信息',
    '同意后微信会再确认隐私授权，拒绝仍可正常游玩'
  ];

  for (var i = 0; i < items.length; i++) {
    draw.renderText(state, textX, y, fontSize, '#3498db', '•', FONT, 'left', 'middle');
    y = drawParagraph(state, items[i], textX + 16 * ui, y, maxWidth - 16 * ui, fontSize, lineHeight, '#2c3e50', 'left');
    y += 8 * ui;
  }

  draw.drawTextLink(state, layout.privacyLink, '查看' + consent.getContractName(state), '#7f8c8d');

  draw.drawButton(state, layout.privacyDecline, '暂不同意', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.privacyAgree, '同意并继续', { fill: '#3498db', fontSize: 16 });
}

function drawAuth(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.authPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var fontSize = 13 * ui;
  var lineHeight = 22 * ui;
  var maxWidth = panel.w - 56 * ui;

  draw.renderText(state, cx, panel.y + 44 * ui, 25 * ui, '#2c3e50', '好友排行榜', FONT, 'center', 'middle');

  var y = panel.y + 96 * ui;
  y = drawParagraph(
    state,
    '开启后会通过微信开放数据读取好友的公开游戏数据（昵称、头像、最高分），仅用于排行榜展示。',
    cx,
    y,
    maxWidth,
    fontSize,
    lineHeight,
    '#2c3e50',
    'center'
  );
  y += 8 * ui;
  drawParagraph(
    state,
    '不会获取手机号、位置等其它信息。暂不开启时入口隐藏，游戏不受影响。',
    cx,
    y,
    maxWidth,
    fontSize,
    lineHeight,
    '#95a5a6',
    'center'
  );

  draw.drawButton(state, layout.authDeny, '暂不开启', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.authAllow, '开启排行榜', { fill: '#3498db', fontSize: 16 });
}

function drawChallengePrompt(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.challengePanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var target = state.pendingChallengeTarget || 0;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '好友挑战', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 90 * ui, 14 * ui, '#95a5a6', '目标分数', FONT, 'center', 'middle');
  draw.renderText(
    state,
    cx,
    panel.y + 140 * ui,
    scoreSizeFor(target, 58) * ui,
    '#2c3e50',
    String(target),
    FONT,
    'center',
    'middle'
  );

  var body = state.hasSave
    ? '接受挑战会开始新的一局，当前存档会被替换。'
    : '接受后会开始新的一局。';

  drawParagraph(
    state,
    body,
    cx,
    panel.y + 202 * ui,
    panel.w - 56 * ui,
    13 * ui,
    22 * ui,
    '#7f8c8d',
    'center'
  );

  draw.drawButton(state, layout.challengeIgnore, '先不挑战', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.challengeAccept, '接受挑战', { fill: '#3498db', fontSize: 16 });
}

function drawHelp(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.helpPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '玩法说明', FONT, 'center', 'middle');

  var items = [
    '点击屏幕左右两侧，旋转中间的六边形。',
    '方块落到六边形上后，3 个及以上同色方块相连即可消除。',
    '连续消除会提升连击倍率，分数更高。',
    '某一侧堆到 7 层方块时，游戏结束。',
    '游戏会自动保存，下次可从暂停处继续。'
  ];

  var fontSize = 15 * ui;
  var lineHeight = 25 * ui;
  var maxWidth = panel.w - 52 * ui;
  var y = panel.y + 92 * ui;

  ctx.save();
  ctx.font = fontSize + 'px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2c3e50';

  for (var i = 0; i < items.length; i++) {
    var lines = draw.wrapText(ctx, items[i], maxWidth - 16 * ui);
    for (var j = 0; j < lines.length; j++) {
      if (j === 0) {
        ctx.fillStyle = '#3498db';
        ctx.fillText('•', panel.x + 26 * ui, y);
        ctx.fillStyle = '#2c3e50';
      }
      ctx.fillText(lines[j], panel.x + 42 * ui, y);
      y += lineHeight;
    }
    y += 6 * ui;
  }

  ctx.restore();

  draw.drawButton(state, layout.back, '返回', { fill: '#3498db', fontSize: 18 });
}

function drawSettings(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.settingsPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 46 * ui, 27 * ui, '#2c3e50', '设置', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 82 * ui, 13 * ui, '#95a5a6', '声音与反馈', FONT, 'center', 'middle');

  drawSettingRow(
    state,
    panel,
    '背景音乐',
    '游戏内循环播放',
    layout.musicToggle,
    state.sound.music
  );

  drawSettingRow(
    state,
    panel,
    '游戏音效',
    '旋转、消除等提示音',
    layout.sfxToggle,
    state.sound.sfx
  );

  drawSettingRow(
    state,
    panel,
    '震动反馈',
    '消除方块时轻微震动',
    layout.vibrateToggle,
    state.sound.vibrate
  );

  draw.drawButton(state, layout.settingsDone, '完成', { fill: '#3498db', fontSize: 18 });
}

function drawConfirmHome(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.confirmPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 50 * ui, 24 * ui, '#2c3e50', '返回首页？', FONT, 'center', 'middle');

  var body = state.homeReturnState === GS.PAUSED
    ? '当前进度会保存，下次可以从首页继续。'
    : '本局已经结束，返回后可以重新开始。';

  ctx.save();
  ctx.font = 14 * ui + 'px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7f8c8d';

  var lines = draw.wrapText(ctx, body, panel.w - 56 * ui);
  var y = panel.y + 104 * ui;
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, y);
    y += 24 * ui;
  }
  ctx.restore();

  var okLabel = state.homeReturnState === GS.PAUSED ? '保存并返回' : '返回首页';

  draw.drawButton(state, layout.confirmCancel, '取消', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 17 });
  draw.drawButton(state, layout.confirmOk, okLabel, { fill: '#3498db', fontSize: 17 });
}

function drawSettingRow(state, panel, label, desc, toggleRect, on) {
  var ui = state.uiScale;
  var centerY = toggleRect.y + toggleRect.h / 2;

  draw.renderText(
    state,
    panel.x + 28 * ui,
    centerY - 8 * ui,
    17 * ui,
    '#2c3e50',
    label,
    FONT,
    'left',
    'middle'
  );

  draw.renderText(
    state,
    panel.x + 28 * ui,
    centerY + 14 * ui,
    12 * ui,
    '#95a5a6',
    desc,
    FONT,
    'left',
    'middle'
  );

  draw.drawToggle(state, toggleRect, on);
}

module.exports = {
  render: render
};

};
modules["js/save.js"] = function(module, exports, require) {
'use strict';

var GS = require('./state').GS;
var SAVE_KEY = require('./state').SAVE_KEY;
var HIGHSCORE_KEY = require('./state').HIGHSCORE_KEY;
var SETTINGS_KEY = require('./state').SETTINGS_KEY;
var Hex = require('./Hex').Hex;
var Block = require('./Block').Block;
var WaveGen = require('./wavegen').WaveGen;
var guard = require('./guard');
var boardApi = require('../core/board');

// 超过 3 小时的旧进度不再占用首页入口
var SAVE_MAX_AGE = 3 * 60 * 60 * 1000;

function num(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function loadSettings(state) {
  var raw = state.platform.storage.get(SETTINGS_KEY, null);

  if (raw && typeof raw === 'object') {
    state.sound.music = raw.music !== false;
    state.sound.sfx = raw.sfx !== false;
    state.sound.vibrate = raw.vibrate !== false;
  }
}

function loadHighScores(state) {
  var raw = state.platform.storage.get(HIGHSCORE_KEY, []);
  var list = [];

  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      var n = Number(raw[i]);
      if (isFinite(n) && guard.validateScore(n)) {
        list.push(n);
      }
    }
  }

  list.sort(function (a, b) {
    return b - a;
  });

  state.highscores = list.slice(0, 3);
  state.bestScore = state.highscores[0] || 0;
}

function pushHighScore(state) {
  if (!guard.validateScore(state.score)) {
    state.isNewRecord = false;
    return false;
  }

  var oldBest = state.bestScore;

  state.highscores.push(state.score);
  state.highscores.sort(function (a, b) {
    return b - a;
  });
  state.highscores = state.highscores.slice(0, 3);
  state.bestScore = Math.max(oldBest, state.highscores[0] || 0, state.score);
  state.isNewRecord = state.score > oldBest;

  state.platform.storage.set(HIGHSCORE_KEY, state.highscores);
  return state.isNewRecord;
}

function saveGame(state) {
  if (!state.MainHex || !state.waveone) {
    return;
  }
  if (state.gameState !== GS.PLAYING && state.gameState !== GS.PAUSED) {
    return;
  }

  var hex = state.MainHex;
  var data = {
    version: 1,
    savedAt: Date.now(),
    score: state.score,
    reviveUsed: !!state.reviveUsed,
    challenge: {
      target: state.challenge.target,
      active: state.challenge.active
    },
    hex: {
      position: hex.position,
      ct: hex.ct,
      angle: hex.angle,
      targetAngle: hex.targetAngle,
      angularVelocity: hex.angularVelocity,
      playThrough: hex.playThrough,
      lastCombo: hex.lastCombo,
      lastColorScored: hex.lastColorScored,
      comboMultiplier: hex.comboMultiplier,
      comboTime: hex.comboTime,
      blocks: []
    },
    falling: [],
    wavegen: {
      lastGen: state.waveone.lastGen,
      last: state.waveone.last,
      nextGen: state.waveone.nextGen,
      start: state.waveone.start,
      ct: state.waveone.ct,
      difficulty: state.waveone.difficulty,
      dt: state.waveone.dt,
      prevTimeScored: state.waveone.prevTimeScored,
      currentFunction: state.waveone.getFunctionName()
    }
  };

  var i;
  var j;

  for (var side = 0; side < hex.board.sides; side++) {
    var lane = [];
    var total = boardApi.count(hex.board, side);

    for (var level = 0; level < total; level++) {
      var b = boardApi.at(hex.board, side, level);

      if (b && !b.deleted) {
        lane.push({
          color: b.color,
          angle: b.angle,
          targetAngle: b.targetAngle
        });
      }
    }

    data.hex.blocks.push(lane);
  }

  for (i = 0; i < state.blocks.length; i++) {
    var falling = state.blocks[i];
    if (falling.removed || falling.deleted) {
      continue;
    }
    data.falling.push({
      fallingLane: falling.fallingLane,
      color: falling.color,
      iter: falling.iter,
      distFromHex: falling.distFromHex,
      angle: falling.angle,
      targetAngle: falling.targetAngle,
      height: falling.height,
      settled: falling.settled,
      initializing: falling.initializing,
      initLen: falling.initLen,
      ictOffset: falling.ict - hex.ct,
      opacity: falling.opacity,
      tint: falling.tint
    });
  }

  state.platform.storage.set(SAVE_KEY, data);
  state.hasSave = true;
}

function restoreGame(state) {
  var data = state.platform.storage.get(SAVE_KEY, null);

  if (!data || data.version !== 1 || !data.hex || !Array.isArray(data.hex.blocks)) {
    return false;
  }

  var savedAt = Number(data.savedAt);
  if (savedAt && Date.now() - savedAt > SAVE_MAX_AGE) {
    state.platform.storage.remove(SAVE_KEY);
    state.hasSave = false;
    return false;
  }

  var settings = state.settings;
  var hex = new Hex(state, settings.hexWidth);

  hex.position = num(data.hex.position, 0);
  hex.ct = num(data.hex.ct, 0);
  hex.angle = num(data.hex.angle, hex.angle);
  hex.targetAngle = num(data.hex.targetAngle, hex.angle);
  hex.angularVelocity = num(data.hex.angularVelocity, 0);
  hex.playThrough = num(data.hex.playThrough, 0);
  hex.lastCombo = num(data.hex.lastCombo, 0);
  hex.lastColorScored = data.hex.lastColorScored || '#000000';
  hex.comboMultiplier = num(data.hex.comboMultiplier, 1);
  hex.comboTime = num(data.hex.comboTime, settings.comboTime);
  hex.delay = 15;
  hex.texts = [];

  hex.board = boardApi.create(hex.sides);

  // 先挂到 state 上，Block 构造函数需要读取 MainHex.ct
  state.MainHex = hex;

  var laneIndex;
  var i;

  for (laneIndex = 0; laneIndex < hex.sides; laneIndex++) {
    var savedLane = data.hex.blocks[laneIndex] || [];
    for (i = 0; i < savedLane.length; i++) {
      var saved = savedLane[i];
      if (!saved || state.colors.indexOf(saved.color) === -1) {
        continue;
      }

      var dist = hex.sideLength / 2 * Math.sqrt(3) + settings.blockHeight * i;
      var block = new Block(state, laneIndex, saved.color, 1, dist, true);
      block.attachedLane = laneIndex;
      block.checked = 0;
      block.initializing = 0;
      block.opacity = 1;
      block.tint = 0;
      block.deleted = 0;
      block.removed = 0;
      block.height = settings.blockHeight;
      block.distFromHex = dist;
      block.angle = num(saved.angle, block.angle);
      block.targetAngle = num(saved.targetAngle, block.angle);
      boardApi.push(hex.board, laneIndex, block);
    }
  }

  state.blocks = [];
  var fallingData = Array.isArray(data.falling) ? data.falling : [];

  for (i = 0; i < fallingData.length; i++) {
    var d = fallingData[i];
    if (!d || state.colors.indexOf(d.color) === -1) {
      continue;
    }

    var falling = new Block(
      state,
      num(d.fallingLane, 0),
      d.color,
      num(d.iter, 1),
      num(d.distFromHex, settings.startDist * settings.scale),
      !!d.settled
    );

    falling.angle = num(d.angle, falling.angle);
    falling.targetAngle = num(d.targetAngle, falling.angle);
    falling.height = num(d.height, settings.blockHeight);
    falling.initializing = d.initializing ? 1 : 0;
    falling.initLen = num(d.initLen, settings.creationDt);
    falling.ict = hex.ct + num(d.ictOffset, 0);
    falling.opacity = d.opacity == null ? 1 : num(d.opacity, 1);
    falling.tint = num(d.tint, 0);
    falling.deleted = 0;
    falling.removed = 0;

    state.blocks.push(falling);
  }

  state.waveone = WaveGen.fromData(state, hex, data.wavegen);
  state.score = num(data.score, 0);
  // 已用过复活的局，读档后仍然不能再复活
  state.reviveUsed = data.reviveUsed === true;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };

  if (data.challenge && data.challenge.active) {
    var challengeTarget = num(data.challenge.target, 0);

    if (guard.validateScore(challengeTarget) && challengeTarget > 0) {
      state.challenge.target = challengeTarget;
      state.challenge.active = true;
    }
  }
  state.scoreOpacity = 1;
  state.textOpacity = 1;
  state.gdx = 0;
  state.gdy = 0;
  state.hasSave = true;
  state.isNewRecord = false;
  state.lastClear = { at: 0, count: 0 };

  return true;
}

function clearSave(state) {
  state.platform.storage.remove(SAVE_KEY);
  state.hasSave = false;
}

module.exports = {
  loadSettings: loadSettings,
  loadHighScores: loadHighScores,
  pushHighScore: pushHighScore,
  saveGame: saveGame,
  restoreGame: restoreGame,
  clearSave: clearSave
};

};
modules["js/share.js"] = function(module, exports, require) {
'use strict';

var CARD_W = 500;
var CARD_H = 400;
var FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

function isMiniGame() {
  return typeof GameGlobal !== 'undefined' && typeof wx !== 'undefined';
}

function titleFor(score) {
  return '我拿到 ' + score + ' 分，来挑战我！';
}

function drawHex(ctx, cx, cy, radius, rotation, color) {
  var start = rotation * Math.PI / 180;
  ctx.beginPath();

  for (var i = 0; i < 6; i++) {
    var angle = start + i * Math.PI / 3;
    var x = cx + Math.cos(angle) * radius;
    var y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCard(ctx, score) {
  var scoreText = String(score);

  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawHex(ctx, 250, 220, 150, 30, '#bdc3c7');
  drawHex(ctx, 250, 220, 70, 30, '#2c3e50');

  // 周围点缀几个色块，和游戏内配色一致
  var colors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'];
  var positions = [
    [95, 125],
    [405, 125],
    [95, 315],
    [405, 315]
  ];

  for (var i = 0; i < positions.length; i++) {
    drawHex(ctx, positions[i][0], positions[i][1], 20, 30, colors[i]);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#2c3e50';
  ctx.font = '38px ' + FONT;
  ctx.fillText('HEXORBIT', 250, 36);

  ctx.fillStyle = '#7f8c8d';
  ctx.font = '17px ' + FONT;
  ctx.fillText('星核轮转', 250, 68);

  ctx.fillStyle = '#95a5a6';
  ctx.font = '17px ' + FONT;
  ctx.fillText('我拿到', 250, 138);

  ctx.fillStyle = '#2c3e50';
  ctx.font = (scoreText.length >= 7 ? 52 : 66) + 'px ' + FONT;
  ctx.fillText(scoreText, 250, 205);

  ctx.fillStyle = '#3498db';
  ctx.font = '25px ' + FONT;
  ctx.fillText('来挑战我！', 250, 305);

  ctx.fillStyle = '#95a5a6';
  ctx.font = '14px ' + FONT;
  ctx.fillText('微信小游戏', 250, 370);
}

function toFile(canvas, callback) {
  if (canvas.toTempFilePathSync) {
    try {
      var path = canvas.toTempFilePathSync({
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        destWidth: CARD_W,
        destHeight: CARD_H,
        fileType: 'png'
      });
      callback(path || null);
      return;
    } catch (e) {
      // fallback
    }
  }

  if (canvas.toTempFilePath) {
    try {
      canvas.toTempFilePath({
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        destWidth: CARD_W,
        destHeight: CARD_H,
        fileType: 'png',
        success: function (res) {
          callback(res && res.tempFilePath ? res.tempFilePath : null);
        },
        fail: function () {
          callback(null);
        }
      });
      return;
    } catch (e) {
      // fallback
    }
  }

  callback(null);
}

function ensureCard(state, score, callback) {
  callback = callback || function () {};

  if (!isMiniGame() || !wx.createCanvas) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  if (state.shareImageScore === score && state.shareImagePath) {
    callback(state.shareImagePath);
    return;
  }

  var canvas;

  try {
    canvas = wx.createCanvas();
    canvas.width = CARD_W;
    canvas.height = CARD_H;
  } catch (e) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  drawCard(ctx, score);

  toFile(canvas, function (path) {
    state.shareImageScore = score;
    state.shareImagePath = path;
    callback(path);
  });
}

function getPayload(state) {
  return {
    title: titleFor(state.score),
    imageUrl: state.shareImagePath || '',
    query: 'challengeScore=' + String(state.score)
  };
}

function shareScore(state) {
  ensureCard(state, state.score, function () {
    var payload = getPayload(state);
    state.platform.share(payload);
  });
}

module.exports = {
  titleFor: titleFor,
  ensureCard: ensureCard,
  getPayload: getPayload,
  shareScore: shareScore
};

};
modules["js/spawn.js"] = function(module, exports, require) {
'use strict';

var Block = require('./Block').Block;

function addNewBlock(state, blocklane, color, iter, distFromHex, settled) {
  iter *= state.settings.speedModifier;
  state.blocks.push(new Block(state, blocklane, color, iter, distFromHex, settled));
}

module.exports = {
  addNewBlock: addNewBlock
};

};
modules["js/state.js"] = function(module, exports, require) {
'use strict';

var GS = {
  START: 0,
  PLAYING: 1,
  GAMEOVER: 2,
  PAUSED: -1,
  HELP: -2,
  SETTINGS: -3,
  CONFIRM_HOME: -4,
  LEADERBOARD: -5,
  PRIVACY: -6,
  AUTH: -7,
  CHALLENGE_PROMPT: -8
};

var SAVE_KEY = 'hextris.save.v1';
var HIGHSCORE_KEY = 'hextris.highscores.v1';
var SETTINGS_KEY = 'hextris.settings.v1';

// 前 4 个是开局的四种颜色；第 5 个在难度达到阈值后加入。
// 具体色值由皮肤系统最终确定，这里先用占位值。
var COLORS = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];

function createState(platform) {
  var width = platform.width;
  var height = platform.height;

  // 与原网页版移动端参数一致，按屏幕短边缩放
  var baseScale = 1.4;
  var rawScale = Math.min(width, height) / 800 * baseScale;
  var scale = Math.max(0.45, Math.min(rawScale, 2.4));

  var settings = {
    os: 'wechat',
    platform: 'mobile',
    startDist: 227,
    creationDt: 60,
    baseScale: baseScale,
    scale: scale,
    prevScale: scale,
    baseHexWidth: 87,
    hexWidth: 87 * scale,
    baseBlockHeight: 20,
    blockHeight: 20 * scale,
    rows: 7,
    speedModifier: 0.73,
    speedUpKeyHeld: false,
    creationSpeedModifier: 0.73,
    comboTime: 310,
    difficultyMax: 45,
    difficultyGrowth: 2.5
  };

  var state = {
    platform: platform,
    canvas: platform.canvas,
    ctx: platform.ctx,
    width: width,
    height: height,
    dpr: platform.dpr,
    safeTop: platform.safeTop,
    safeBottom: platform.safeBottom,
    safeLeft: platform.safeLeft,
    safeRight: platform.safeRight,

    // UI 字号缩放，和游戏内几何缩放分开；同时受高度约束，避免横屏预览时面板超出屏幕
    uiScale: Math.max(0.9, Math.min(width / 375, height / 667, 1.6)),

    gameState: GS.START,
    helpReturn: GS.START,
    settingsReturn: GS.START,
    leaderboardReturn: GS.START,
    homeReturnState: null,
    prevGameState: GS.START,
    rank: null,
    cloudBest: 0,
    privacyPrompted: false,
    privacyAccepted: false,
    // 微信官方隐私授权状态：needAuthorization 为 true 时必须先弹官方确认
    privacyNeedAuth: false,
    privacyContractName: '',
    authLeaderboard: null,
    pendingChallengeTarget: 0,
    challenge: {
      target: 0,
      active: false,
      result: null
    },

    sound: {
      music: true,
      sfx: true,
      vibrate: true
    },
    audio: null,

    settings: settings,
    colors: COLORS.slice(),
    // 调试用：>0 时强制使用该颜色数，便于真机验证第 5 色（正式对局保持 0）
    debugColorCount: 0,
    hexagonBackgroundColor: '#ecf0f1',
    outerColor: '#bdc3c7',
    centerColor: 'rgb(44,62,80)',
    angularVelocityConst: 4,

    score: 0,
    bestScore: 0,
    highscores: [],
    isNewRecord: false,
    scoreBlocked: false,
    // 广告：单局复活次数与请求状态（广告开关关闭时不会使用）
    reviveUsed: false,
    adBusy: false,
    adNotice: '',
    adNoticeUntil: 0,
    scoreOpacity: 0,
    textOpacity: 0,
    prevScore: 0,

    blocks: [],
    MainHex: null,
    waveone: null,

    gdx: 0,
    gdy: 0,
    rush: 1,
    lastClear: { at: 0, count: 0 },
    lastVibrateAt: 0,

    hasSave: false,
    shareImagePath: null,
    shareImageScore: null,
    startTime: 0,
    lastTime: Date.now(),
    time: 0,
    frameCount: 0
  };

  return state;
}

module.exports = {
  GS: GS,
  SAVE_KEY: SAVE_KEY,
  HIGHSCORE_KEY: HIGHSCORE_KEY,
  SETTINGS_KEY: SETTINGS_KEY,
  COLORS: COLORS,
  createState: createState
};

};
modules["js/Text.js"] = function(module, exports, require) {
'use strict';

var renderText = require('./draw').renderText;

function Text(state, x, y, text, font, color, incrementFunction) {
  this.state = state;
  this.x = x;
  this.y = y;
  this.font = font;
  this.color = color;
  this.opacity = 1;
  this.text = text;
  this.alive = 1;
  this.incrementFunction = incrementFunction || fadeUpAndOut;
}

Text.prototype.draw = function () {
  if (this.alive <= 0) {
    return false;
  }

  var state = this.state;
  state.ctx.globalAlpha = this.opacity;
  renderText(
    state,
    this.x + state.gdx,
    this.y + state.gdy,
    50 * state.settings.scale,
    this.color,
    this.text,
    '"PingFang SC","Microsoft YaHei",sans-serif',
    'center',
    'middle'
  );
  state.ctx.globalAlpha = 1;

  this.incrementFunction(this);
  return true;
};

function fadeUpAndOut(text) {
  var dt = text.state.MainHex ? text.state.MainHex.dt : 1;
  text.opacity -= dt * Math.pow(Math.pow(1 - text.opacity, 1 / 3) + 1, 3) / 100;
  text.alive = text.opacity;
  text.y -= 3 * dt;
}

module.exports = {
  Text: Text,
  fadeUpAndOut: fadeUpAndOut
};

};
modules["js/ui.js"] = function(module, exports, require) {
'use strict';

var ads = require('./ads');

function getLayout(state) {
  var w = state.width;
  var h = state.height;
  var ui = state.uiScale;
  var margin = 14 * ui;
  var top = state.safeTop + 10 * ui;
  var icon = 50 * ui;
  var cx = w / 2;

  var pauseBtn = {
    x: state.safeLeft + margin,
    y: top,
    w: icon,
    h: icon
  };

  // 首页纵向构图：标题 -> 六边形 -> 主按钮 -> 继续上一局 -> 底部文字入口。
  // 六边形按剩余空间放大，主按钮挂在六边形下沿，避免高屏手机上出现大片空白。
  var startW = Math.min(260 * ui, w - 100 * ui);
  var startH = 56 * ui;
  var titleH = 80 * ui;
  var hexGap = 24 * ui;
  var continueGap = 16 * ui;
  var continueH = 36 * ui;
  // 固定预留“继续上一局 / 首次提示”这一行，首页在各种状态下构图保持稳定
  var tailH = continueGap + continueH;

  var linkW = 100 * ui;
  var linkH = 40 * ui;
  var linkY = h - state.safeBottom - 46 * ui;
  var linkGap = 20 * ui;

  var availTop = state.safeTop + 20 * ui;
  var fixedH = titleH + hexGap * 2 + startH + tailH;
  var maxHexH = linkY - availTop - linkGap - fixedH;
  var hexH = Math.max(90 * ui, Math.min(maxHexH, w * 0.788));
  var hexR = hexH / 1.732;
  var contentH = fixedH + hexH;
  var leftover = Math.max(0, linkY - availTop - contentH - linkGap);
  var topY = availTop + leftover * 0.55;

  var s = state.settings;
  var gameHexR = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;
  var innerRatio = Math.max(0.3, Math.min(0.45, s.hexWidth / gameHexR));

  var homeHex = {
    x: cx,
    y: topY + titleH + hexGap + hexH / 2,
    r: hexR,
    innerR: hexR * innerRatio
  };

  var titleY = topY + titleH / 2;

  var startNew = {
    x: cx - startW / 2,
    y: homeHex.y + hexH / 2 + hexGap,
    w: startW,
    h: startH
  };

  var continueLink = {
    x: cx - startW / 2,
    y: startNew.y + startH + continueGap,
    w: startW,
    h: continueH
  };

  // 首次进入（没有存档且从未得分）时，用按钮下方同一位置显示一次操作提示
  var bestOnHome = Math.max(state.bestScore || 0, state.score || 0);
  var showHint = !state.hasSave && bestOnHome === 0;
  var homeHint = {
    x: cx - startW / 2,
    y: startNew.y + startH + continueGap,
    w: startW,
    h: continueH
  };

  var showLeaderboard = state.privacyAccepted === true && state.authLeaderboard !== false;
  var homeHelpLink;
  var homeLeaderboardLink;
  var homeSettingsLink;

  if (showLeaderboard) {
    homeHelpLink = { x: cx - 150 * ui, y: linkY, w: linkW, h: linkH };
    homeLeaderboardLink = { x: cx - 50 * ui, y: linkY, w: linkW, h: linkH };
    homeSettingsLink = { x: cx + 50 * ui, y: linkY, w: linkW, h: linkH };
  } else {
    homeHelpLink = { x: cx - 105 * ui, y: linkY, w: linkW, h: linkH };
    homeLeaderboardLink = { x: cx - 50 * ui, y: linkY, w: linkW, h: linkH };
    homeSettingsLink = { x: cx + 5 * ui, y: linkY, w: linkW, h: linkH };
  }

  var pauseW = Math.min(320 * ui, w - 44 * ui);
  var pauseH = 450 * ui;
  var pausePanel = {
    x: cx - pauseW / 2,
    y: h / 2 - pauseH / 2,
    w: pauseW,
    h: pauseH
  };

  var innerW = pauseW - 48 * ui;
  var buttonH = 52 * ui;
  var resume = {
    x: pausePanel.x + 24 * ui,
    y: pausePanel.y + 142 * ui,
    w: innerW,
    h: buttonH
  };

  var restart = {
    x: resume.x,
    y: resume.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var helpInPause = {
    x: resume.x,
    y: restart.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var settingsInPause = {
    x: resume.x,
    y: helpInPause.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var homeFromPause = {
    x: resume.x,
    y: pausePanel.y + pauseH - 48 * ui,
    w: innerW,
    h: 36 * ui
  };

  var overW = Math.min(330 * ui, w - 36 * ui);

  // 结算页底部给 Banner 预留空间（广告关闭时预留为 0，不影响现有布局）
  var bannerSpace = ads.bannerSpace(state);
  var overTopGap = (state.safeTop || 0) + 12 * ui;
  var overBottomGap = (state.safeBottom || 0) + bannerSpace + 12 * ui;
  var overMaxH = Math.min(500 * ui, h - 70 * ui);
  var overH = overMaxH;

  if (bannerSpace > 0) {
    // Banner 开启时面板贴底，按钮始终在 Banner 上方
    overH = Math.min(overMaxH, h - overTopGap - overBottomGap);
  }

  overH = Math.max(360 * ui, overH);

  var overScale = Math.min(1, overH / (500 * ui));
  var overY = bannerSpace > 0
    ? h - overBottomGap - overH
    : h / 2 - overH / 2;

  var overPanel = {
    x: cx - overW / 2,
    y: overY,
    w: overW,
    h: overH
  };

  var overButtonH = 48 * ui;
  var overButtonY = overPanel.y + overH - 76 * ui;
  var overInner = overW - 44 * ui;
  var overGap = 8 * ui;
  var overButtonW = (overInner - overGap * 2) / 3;

  var playAgain = {
    x: overPanel.x + 22 * ui,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var share = {
    x: playAgain.x + overButtonW + overGap,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var homeFromOver = {
    x: share.x + overButtonW + overGap,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var overRankW = overW - 56 * ui;
  var overRank = {
    x: overPanel.x + 28 * ui,
    y: overPanel.y + 242 * ui * overScale,
    w: overRankW,
    h: overRankW / 2.5
  };

  // 激励视频复活入口：放在底部三个按钮上方，广告关闭时不会绘制
  var overRevive = {
    x: overPanel.x + 24 * ui,
    y: overPanel.y + overH - 76 * ui - 34 * ui,
    w: overW - 48 * ui,
    h: 30 * ui
  };

  var helpW = Math.min(370 * ui, w - 28 * ui);
  var helpH = Math.min(580 * ui, h - 60 * ui);
  var helpPanel = {
    x: cx - helpW / 2,
    y: h / 2 - helpH / 2,
    w: helpW,
    h: helpH
  };

  var back = {
    x: helpPanel.x + 24 * ui,
    y: helpPanel.y + helpH - 76 * ui,
    w: helpW - 48 * ui,
    h: 48 * ui
  };

  var setW = Math.min(330 * ui, w - 36 * ui);
  var setH = Math.min(410 * ui, h - 70 * ui);
  var settingsPanel = {
    x: cx - setW / 2,
    y: h / 2 - setH / 2,
    w: setW,
    h: setH
  };

  var toggleW = 52 * ui;
  var toggleH = 30 * ui;
  var toggleX = settingsPanel.x + setW - 26 * ui - toggleW;
  var row1 = settingsPanel.y + 130 * ui;
  var row2 = row1 + 64 * ui;
  var row3 = row2 + 64 * ui;

  var musicToggle = {
    x: toggleX,
    y: row1 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var sfxToggle = {
    x: toggleX,
    y: row2 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var vibrateToggle = {
    x: toggleX,
    y: row3 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var rowW = setW - 52 * ui;
  var rowH = 60 * ui;

  var musicRow = {
    x: settingsPanel.x + 26 * ui,
    y: row1 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var sfxRow = {
    x: settingsPanel.x + 26 * ui,
    y: row2 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var vibrateRow = {
    x: settingsPanel.x + 26 * ui,
    y: row3 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var settingsDone = {
    x: settingsPanel.x + 32 * ui,
    y: settingsPanel.y + setH - 78 * ui,
    w: setW - 64 * ui,
    h: 50 * ui
  };

  var confirmW = Math.min(320 * ui, w - 44 * ui);
  var confirmH = 280 * ui;
  var confirmPanel = {
    x: cx - confirmW / 2,
    y: h / 2 - confirmH / 2,
    w: confirmW,
    h: confirmH
  };

  var confirmInner = confirmW - 48 * ui;
  var confirmGap = 12 * ui;
  var confirmButtonW = (confirmInner - confirmGap) / 2;
  var confirmCancel = {
    x: confirmPanel.x + 24 * ui,
    y: confirmPanel.y + confirmH - 76 * ui,
    w: confirmButtonW,
    h: 50 * ui
  };

  var confirmOk = {
    x: confirmCancel.x + confirmButtonW + confirmGap,
    y: confirmCancel.y,
    w: confirmButtonW,
    h: 50 * ui
  };

  var leaderboardW = Math.min(370 * ui, w - 28 * ui);
  var leaderboardH = Math.min(660 * ui, h - 50 * ui);
  var leaderboardPanel = {
    x: cx - leaderboardW / 2,
    y: h / 2 - leaderboardH / 2,
    w: leaderboardW,
    h: leaderboardH
  };

  var leaderboardContent = {
    x: leaderboardPanel.x + 18 * ui,
    y: leaderboardPanel.y + 92 * ui,
    w: leaderboardW - 36 * ui,
    h: leaderboardH - 170 * ui
  };

  var leaderboardBack = {
    x: leaderboardPanel.x + 24 * ui,
    y: leaderboardPanel.y + leaderboardH - 72 * ui,
    w: leaderboardW - 48 * ui,
    h: 48 * ui
  };

  var privacyW = Math.min(360 * ui, w - 28 * ui);
  var privacyH = Math.min(480 * ui, h - 50 * ui);
  var privacyPanel = {
    x: cx - privacyW / 2,
    y: h / 2 - privacyH / 2,
    w: privacyW,
    h: privacyH
  };
  var privacyInner = privacyW - 48 * ui;
  var privacyGap = 12 * ui;
  var privacyButtonW = (privacyInner - privacyGap) / 2;
  var privacyDecline = {
    x: privacyPanel.x + 24 * ui,
    y: privacyPanel.y + privacyH - 76 * ui,
    w: privacyButtonW,
    h: 50 * ui
  };
  var privacyAgree = {
    x: privacyDecline.x + privacyButtonW + privacyGap,
    y: privacyDecline.y,
    w: privacyButtonW,
    h: 50 * ui
  };
  var privacyLink = {
    x: privacyPanel.x + 24 * ui,
    y: privacyPanel.y + privacyH - 112 * ui,
    w: privacyW - 48 * ui,
    h: 28 * ui
  };

  var authW = Math.min(340 * ui, w - 32 * ui);
  var authH = 300 * ui;
  var authPanel = {
    x: cx - authW / 2,
    y: h / 2 - authH / 2,
    w: authW,
    h: authH
  };
  var authInner = authW - 48 * ui;
  var authButtonW = (authInner - privacyGap) / 2;
  var authDeny = {
    x: authPanel.x + 24 * ui,
    y: authPanel.y + authH - 76 * ui,
    w: authButtonW,
    h: 50 * ui
  };
  var authAllow = {
    x: authDeny.x + authButtonW + privacyGap,
    y: authDeny.y,
    w: authButtonW,
    h: 50 * ui
  };

  var challengeW = Math.min(340 * ui, w - 32 * ui);
  var challengeH = 340 * ui;
  var challengePanel = {
    x: cx - challengeW / 2,
    y: h / 2 - challengeH / 2,
    w: challengeW,
    h: challengeH
  };
  var challengeInner = challengeW - 48 * ui;
  var challengeButtonW = (challengeInner - privacyGap) / 2;
  var challengeIgnore = {
    x: challengePanel.x + 24 * ui,
    y: challengePanel.y + challengeH - 76 * ui,
    w: challengeButtonW,
    h: 50 * ui
  };
  var challengeAccept = {
    x: challengeIgnore.x + challengeButtonW + privacyGap,
    y: challengeIgnore.y,
    w: challengeButtonW,
    h: 50 * ui
  };

  return {
    pauseBtn: pauseBtn,
    homeHex: homeHex,
    homeTitleY: titleY,
    homeHint: homeHint,
    showHint: showHint,
    startNew: startNew,
    continueLink: continueLink,
    homeHelpLink: homeHelpLink,
    homeLeaderboardLink: homeLeaderboardLink,
    homeSettingsLink: homeSettingsLink,
    pausePanel: pausePanel,
    resume: resume,
    restart: restart,
    helpInPause: helpInPause,
    settingsInPause: settingsInPause,
    homeFromPause: homeFromPause,
    overPanel: overPanel,
    playAgain: playAgain,
    share: share,
    homeFromOver: homeFromOver,
    overRank: overRank,
    overRevive: overRevive,
    overScale: overScale,
    helpPanel: helpPanel,
    back: back,
    settingsPanel: settingsPanel,
    musicToggle: musicToggle,
    sfxToggle: sfxToggle,
    vibrateToggle: vibrateToggle,
    musicRow: musicRow,
    sfxRow: sfxRow,
    vibrateRow: vibrateRow,
    settingsDone: settingsDone,
    confirmPanel: confirmPanel,
    confirmCancel: confirmCancel,
    confirmOk: confirmOk,
    leaderboardPanel: leaderboardPanel,
    leaderboardContent: leaderboardContent,
    leaderboardBack: leaderboardBack,
    privacyPanel: privacyPanel,
    privacyAgree: privacyAgree,
    privacyDecline: privacyDecline,
    privacyLink: privacyLink,
    authPanel: authPanel,
    authAllow: authAllow,
    authDeny: authDeny,
    challengePanel: challengePanel,
    challengeAccept: challengeAccept,
    challengeIgnore: challengeIgnore
  };
}

function pointInRect(x, y, rect) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

module.exports = {
  getLayout: getLayout,
  pointInRect: pointInRect
};

};
modules["js/update.js"] = function(module, exports, require) {
'use strict';

var consolidateBlocks = require('./checking').consolidateBlocks;
var blockDestroyed = require('./wavegen').blockDestroyed;
var boardApi = require('../core/board');

function update(state, dt) {
  var MainHex = state.MainHex;
  MainHex.dt = dt;

  if (state.gameState === 1) {
    state.waveone.update();
    if (MainHex.ct - state.waveone.prevTimeScored > 1000) {
      state.waveone.prevTimeScored = MainHex.ct;
    }
  }

  var i;
  var block;
  var board = MainHex.board;
  var sides = boardApi.count ? board.sides : 0;

  // 1. 下落中的方块：先解析是否碰到栈顶，再推进
  for (i = 0; i < state.blocks.length; i++) {
    block = state.blocks[i];
    MainHex.doesBlockCollide(block);

    if (!block.settled) {
      if (!block.initializing) {
        block.distFromHex -= block.iter * dt * state.settings.scale;
      }
    } else if (!block.removed) {
      block.removed = 1;
    }
  }

  // 2. 消除判定
  for (var side = 0; side < sides; side++) {
    var count = boardApi.count(board, side);

    for (var level = 0; level < count; level++) {
      block = boardApi.at(board, side, level);

      if (block && block.checked === 1) {
        consolidateBlocks(state, MainHex, block.attachedLane, level);
        block.checked = 0;
      }
    }
  }

  // 3. 清掉淡出结束的方块，并从最低删除层开始重新落定
  for (side = 0; side < sides; side++) {
    var lowestDeleted = 99;
    var cursor = 0;

    while (cursor < boardApi.count(board, side)) {
      block = boardApi.at(board, side, cursor);

      if (block && block.deleted === 2) {
        boardApi.removeAt(board, side, cursor);
        blockDestroyed(state);

        if (cursor < lowestDeleted) {
          lowestDeleted = cursor;
        }
        continue;
      }

      cursor++;
    }

    var rest = boardApi.count(board, side);

    if (lowestDeleted < rest) {
      for (var k = lowestDeleted; k < rest; k++) {
        boardApi.at(board, side, k).settled = 0;
      }
    }
  }

  // 4. 重新落定：上方方块逐层贴回
  for (side = 0; side < sides; side++) {
    var total = boardApi.count(board, side);

    for (var index = 0; index < total; index++) {
      block = boardApi.at(board, side, index);
      MainHex.doesBlockCollide(block, index);

      if (!block.settled) {
        block.distFromHex -= block.iter * dt * state.settings.scale;
      }
    }
  }

  // 5. 移除已经挂到棋盘上的下落方块
  for (i = 0; i < state.blocks.length; i++) {
    if (state.blocks[i].removed === 1) {
      state.blocks.splice(i, 1);
      i--;
    }
  }

  MainHex.ct += dt;
}

module.exports = {
  update: update
};

};
modules["js/wavegen.js"] = function(module, exports, require) {
'use strict';

var addNewBlock = require('./spawn').addNewBlock;
var randInt = require('./math').randInt;
var difficultyApi = require('../core/difficulty');
var colorApi = require('../core/colors');

function blockDestroyed(state) {
  var w = state.waveone;
  if (!w) {
    return;
  }

  var next = difficultyApi.onBlockDestroyed(w.nextGen, w.difficulty, state.settings);
  w.nextGen = next.nextGen;
  w.difficulty = next.difficulty;
}

function WaveGen(state, hex) {
  this.state = state;
  this.lastGen = 0;
  this.last = 0;
  this.nextGen = 2700;
  this.start = 0;
  this.colors = state.colors;
  this.ct = 0;
  this.hex = hex;
  this.difficulty = 1;
  this.dt = 0;
  this.prevTimeScored = 0;
  this.currentFunction = this.randomGeneration;
}

// 当前难度下可用的颜色（难度到阈值后并入新颜色）
WaveGen.prototype.colorPool = function () {
  return colorApi.pool(this.colors, this.difficulty, this.state.debugColorCount);
};

WaveGen.prototype.pickColor = function () {
  var pool = this.colorPool();
  return pool[randInt(0, pool.length)];
};

WaveGen.prototype.update = function () {
  this.currentFunction();
  this.dt = 14 * this.state.MainHex.ct;
  this.computeDifficulty();

  if ((this.dt - this.lastGen) * this.state.settings.creationSpeedModifier > this.nextGen) {
    this.nextGen = difficultyApi.intervalAfterSpawn(this.nextGen, this.state.settings.creationSpeedModifier);
  }
};

WaveGen.prototype.randomGeneration = function () {
  if (this.dt - this.lastGen > this.nextGen) {
    this.ct++;
    this.lastGen = this.dt;

    var fv = randInt(0, this.state.MainHex.sides);
    addNewBlock(this.state, fv, this.pickColor(), 1.6 + (this.difficulty / 15) * 3);

    var lim = 5;
    if (this.ct > lim) {
      var nextPattern = randInt(0, 3 + 21);
      if (nextPattern > 15) {
        this.ct = 0;
        this.currentFunction = this.doubleGeneration;
      } else if (nextPattern > 10) {
        this.ct = 0;
        this.currentFunction = this.crosswiseGeneration;
      } else if (nextPattern > 7) {
        this.ct = 0;
        this.currentFunction = this.spiralGeneration;
      } else if (nextPattern > 4) {
        this.ct = 0;
        this.currentFunction = this.circleGeneration;
      } else if (nextPattern > 1) {
        this.ct = 0;
        this.currentFunction = this.halfCircleGeneration;
      }
    }
  }
};

WaveGen.prototype.computeDifficulty = function () {
  this.difficulty = difficultyApi.advance(
    this.difficulty,
    this.dt,
    this.last,
    this.state.settings
  );
};

WaveGen.prototype.circleGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen + 500) {
    return;
  }

  var numColors = randInt(1, 4);
  if (numColors === 3) {
    numColors = randInt(1, 4);
  }

  var colorList = [];
  var pool = this.colorPool();
  var i;
  var j;

  nextLoop:
  for (i = 0; i < numColors; i++) {
    var q = randInt(0, pool.length);
    for (j in colorList) {
      if (colorList[j] === pool[q]) {
        i--;
        continue nextLoop;
      }
    }
    colorList.push(pool[q]);
  }

  for (i = 0; i < this.state.MainHex.sides; i++) {
    addNewBlock(this.state, i, colorList[i % numColors], 1.5 + (this.difficulty / 15) * 3);
  }

  this.ct += 15;
  this.lastGen = this.dt;
  this.shouldChangePattern(1);
};

WaveGen.prototype.halfCircleGeneration = function () {
  if (this.dt - this.lastGen <= (this.nextGen + 500) / 2) {
    return;
  }

  var numColors = randInt(1, 3);
  var c = this.pickColor();
  var colorList = [c, c, c];

  if (numColors === 2) {
    colorList = [c, this.pickColor(), c];
  }

  var d = randInt(0, 6);
  for (var i = 0; i < 3; i++) {
    addNewBlock(this.state, (d + i) % 6, colorList[i], 1.5 + (this.difficulty / 15) * 3);
  }

  this.ct += 8;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.crosswiseGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen) {
    return;
  }

  var color = this.pickColor();
  var lane = randInt(0, this.state.MainHex.sides);
  var iter = 0.6 + (this.difficulty / 15) * 3;

  addNewBlock(this.state, lane, color, iter);
  addNewBlock(this.state, (lane + 3) % this.state.MainHex.sides, color, iter);

  this.ct += 1.5;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.spiralGeneration = function () {
  var dir = randInt(0, 2);
  if (this.dt - this.lastGen <= this.nextGen * (2 / 3)) {
    return;
  }

  if (dir) {
    addNewBlock(this.state, 5 - (this.ct % this.state.MainHex.sides), this.pickColor(), 1.5 + (this.difficulty / 15) * 1.5);
  } else {
    addNewBlock(this.state, this.ct % this.state.MainHex.sides, this.pickColor(), 1.5 + (this.difficulty / 15) * 1.5);
  }

  this.ct += 1;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.doubleGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen) {
    return;
  }

  var lane = randInt(0, this.state.MainHex.sides);
  addNewBlock(this.state, lane, this.pickColor(), 1.5 + (this.difficulty / 15) * 3);
  addNewBlock(this.state, (lane + 1) % this.state.MainHex.sides, this.pickColor(), 1.5 + (this.difficulty / 15) * 3);

  this.ct += 2;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.setRandom = function () {
  this.ct = 0;
  this.currentFunction = this.randomGeneration;
};

WaveGen.prototype.shouldChangePattern = function (x) {
  if (x) {
    var q = randInt(0, 4);
    this.ct = 0;
    switch (q) {
      case 0:
        this.currentFunction = this.doubleGeneration;
        break;
      case 1:
        this.currentFunction = this.spiralGeneration;
        break;
      case 2:
        this.currentFunction = this.crosswiseGeneration;
        break;
      default:
        break;
    }
  } else if (this.ct > 8) {
    if (randInt(0, 2) === 0) {
      this.setRandom();
      return 1;
    }
  }
  return 0;
};

WaveGen.FUNCTION_NAMES = [
  'randomGeneration',
  'circleGeneration',
  'halfCircleGeneration',
  'crosswiseGeneration',
  'spiralGeneration',
  'doubleGeneration'
];

WaveGen.prototype.getFunctionName = function () {
  for (var i = 0; i < WaveGen.FUNCTION_NAMES.length; i++) {
    var name = WaveGen.FUNCTION_NAMES[i];
    if (this.currentFunction === this[name]) {
      return name;
    }
  }
  return 'randomGeneration';
};

WaveGen.fromData = function (state, hex, data) {
  var w = new WaveGen(state, hex);
  if (!data) {
    return w;
  }

  w.lastGen = Number(data.lastGen) || 0;
  w.last = Number(data.last) || 0;
  w.nextGen = Number(data.nextGen) || 2700;
  w.start = Number(data.start) || 0;
  w.ct = Number(data.ct) || 0;
  w.difficulty = Math.min(Number(data.difficulty) || 1, state.settings.difficultyMax);
  w.dt = Number(data.dt) || 0;
  w.prevTimeScored = Number(data.prevTimeScored) || 0;

  if (WaveGen.FUNCTION_NAMES.indexOf(data.currentFunction) !== -1) {
    w.currentFunction = w[data.currentFunction];
  }

  return w;
};

module.exports = {
  WaveGen: WaveGen,
  blockDestroyed: blockDestroyed
};

};
modules["openDataContext/index.js"] = function(module, exports, require) {
'use strict';

// 与 js/rank.js 中的画布尺寸保持一致
var W = 600;
var H = 880;
var SUMMARY_H = 240;
var KEY = 'hextris_best_v1';
var MAX_SCORE = 1000000;
var FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

var sharedCanvas = wx.getSharedCanvas();
sharedCanvas.width = W;
sharedCanvas.height = H;

var ctx = sharedCanvas.getContext('2d');

// 部分客户端会把共享画布重设为屏幕尺寸（例如 390×844），
// 此时仍按 600×880 的设计坐标绘制就会被裁切并整体偏右。
// 每次绘制前把设计坐标缩放到画布真实尺寸，保证内容始终居中且完整。
function syncCanvasScale() {
  var cw = sharedCanvas.width || W;
  var ch = sharedCanvas.height || H;

  if (!(cw > 0) || !(ch > 0)) {
    return;
  }

  ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);
}

var view = 'none';
var loading = false;
var error = false;
var friends = [];
var sorted = [];
var myBest = 0;
var isNewRecord = false;
var rank = 0;
var total = 0;
var beaten = 0;
var empty = true;

var avatarCache = {};

function clear() {
  ctx.clearRect(0, 0, W, H);
}

function drawText(text, x, y, size, color, align, baseline) {
  ctx.font = size + 'px ' + FONT;
  ctx.fillStyle = color || '#2c3e50';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillText(String(text), x, y);
}

function drawCenter(text, y, size, color) {
  drawText(text, W / 2, y, size, color, 'center', 'middle');
}

function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(x, y, w, h, r, color) {
  roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function parseScore(value) {
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }

  if (value && typeof value === 'object' && typeof value.score === 'number') {
    return isFinite(value.score) ? value.score : 0;
  }

  if (!value) {
    return 0;
  }

  try {
    var obj = JSON.parse(value);
    if (obj && typeof obj.score === 'number' && isFinite(obj.score)) {
      return obj.score;
    }
  } catch (e) {
    // 兼容纯数字字符串
  }

  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function parseFriends(data) {
  var list = [];

  if (!data || !data.length) {
    return list;
  }

  for (var i = 0; i < data.length; i++) {
    var user = data[i];
    if (!user) {
      continue;
    }

    var score = null;
    var kvList = user.KVDataList || [];

    for (var j = 0; j < kvList.length; j++) {
      if (kvList[j] && kvList[j].key === KEY) {
        score = parseScore(kvList[j].value);
        break;
      }
    }

    if (score === null || score < 0 || score > MAX_SCORE) {
      continue;
    }

    list.push({
      nickname: user.nickname || '微信好友',
      avatarUrl: user.avatarUrl || '',
      score: score,
      self: false
    });
  }

  return list;
}

function compute() {
  sorted = friends.slice();
  sorted.push({
    nickname: '我',
    avatarUrl: '',
    score: myBest,
    self: true
  });

  sorted.sort(function (a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.self) {
      return 1;
    }
    if (b.self) {
      return -1;
    }
    return 0;
  });

  rank = 0;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].self) {
      rank = i + 1;
      break;
    }
  }

  total = sorted.length;
  beaten = 0;

  for (var j = 0; j < friends.length; j++) {
    if (friends[j].score < myBest) {
      beaten++;
    }
  }

  empty = friends.length === 0;
}

function getImage(url) {
  if (!url) {
    return null;
  }

  if (avatarCache[url]) {
    return avatarCache[url];
  }

  var item = { img: null, loaded: false };
  avatarCache[url] = item;

  try {
    var img = wx.createImage();
    item.img = img;
    img.onload = function () {
      item.loaded = true;
      draw();
    };
    img.onerror = function () {};
    img.src = url;
  } catch (e) {
    // ignore
  }

  return item;
}

function drawAvatar(user, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  var cached = getImage(user.avatarUrl);

  if (cached && cached.loaded && cached.img) {
    ctx.drawImage(cached.img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = user.self ? '#2c3e50' : '#3498db';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    var initial = user.self ? '我' : String(user.nickname || '?').charAt(0);
    drawText(initial, x, y + 1, 20, '#ffffff', 'center', 'middle');
  }

  ctx.restore();
}

function truncate(text, maxWidth) {
  var value = String(text || '');
  ctx.font = '25px ' + FONT;

  while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
    value = value.slice(0, -1);
  }

  if (value !== String(text || '')) {
    value = value.slice(0, -1) + '…';
  }

  return value;
}

function drawRow(user, rankValue, y, isSelf) {
  fillRoundRect(10, y, W - 20, 76, 14, isSelf ? '#eaf4fc' : '#f4f7f9');

  drawText(rankValue, 30, y + 38, 23, isSelf ? '#3498db' : '#95a5a6', 'left', 'middle');
  drawAvatar(user, 84, y + 38, 24);
  drawText(truncate(user.nickname, 300), 118, y + 38, 25, '#2c3e50', 'left', 'middle');
  drawText(user.score, W - 30, y + 38, 25, '#3498db', 'right', 'middle');
}

function drawGameover() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, SUMMARY_H);

  if (loading) {
    drawCenter('好友排行加载中…', 120, 26, '#95a5a6');
    return;
  }

  if (error) {
    drawCenter('好友排行加载失败', 100, 26, '#95a5a6');
    drawCenter('请稍后再试', 140, 20, '#bdc3c7');
    return;
  }

  if (empty) {
    drawCenter('暂无好友上榜', SUMMARY_H / 2 - 25, 28, '#2c3e50');
    drawCenter('邀请好友一起玩', SUMMARY_H / 2 + 25, 20, '#95a5a6');
    return;
  }

  if (isNewRecord) {
    drawCenter('超越 ' + beaten + ' 位好友', 88, 32, '#2c3e50');
    drawCenter('好友排名 #' + rank + ' / ' + total, 140, 23, '#7f8c8d');
  } else {
    drawCenter('好友排名 #' + rank + ' / ' + total, 88, 32, '#2c3e50');
    drawCenter('超越 ' + beaten + ' 位好友', 140, 23, '#7f8c8d');
  }
}

function drawLeaderboard() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 整块画布会被拉伸铺满主域的榜单内容区，以 H/2 为基准居中可以避免文案偏上
  if (loading) {
    drawCenter('好友排行加载中…', H / 2, 28, '#95a5a6');
    return;
  }

  if (error) {
    drawCenter('好友排行加载失败', H / 2 - 20, 28, '#95a5a6');
    drawCenter('请稍后再试', H / 2 + 20, 20, '#bdc3c7');
    return;
  }

  if (empty) {
    drawCenter('暂无好友上榜', H / 2 - 25, 30, '#2c3e50');
    drawCenter('邀请好友一起玩', H / 2 + 25, 22, '#95a5a6');
    return;
  }

  drawText('排名', 30, 26, 20, '#95a5a6', 'left', 'middle');
  drawText('好友', 112, 26, 20, '#95a5a6', 'left', 'middle');
  drawText('最高分', W - 30, 26, 20, '#95a5a6', 'right', 'middle');

  var startY = 50;
  var rowHeight = 80;
  var topCount = Math.min(8, sorted.length);

  for (var i = 0; i < topCount; i++) {
    drawRow(sorted[i], i + 1, startY + i * rowHeight, sorted[i].self);
  }

  if (rank > 8) {
    drawCenter('...', startY + 8 * rowHeight + 4, 22, '#bdc3c7');
    drawRow(sorted[rank - 1], rank, startY + 8 * rowHeight + 32, true);
  }
}

function draw() {
  syncCanvasScale();
  clear();

  if (view === 'gameover') {
    drawGameover();
  } else if (view === 'leaderboard') {
    drawLeaderboard();
  }
}

function load() {
  loading = true;
  error = false;
  friends = [];
  sorted = [];
  draw();

  if (!wx.getFriendCloudStorage) {
    loading = false;
    error = true;
    draw();
    return;
  }

  try {
    wx.getFriendCloudStorage({
      keyList: [KEY],
      success: function (res) {
        loading = false;
        error = false;
        friends = parseFriends(res && res.data);
        compute();
        draw();
      },
      fail: function () {
        loading = false;
        error = true;
        friends = [];
        compute();
        draw();
      }
    });
  } catch (e) {
    loading = false;
    error = true;
    compute();
    draw();
  }
}

wx.onMessage(function (message) {
  if (!message || !message.type) {
    return;
  }

  if (message.type === 'hide') {
    view = 'none';
    clear();
    return;
  }

  if (message.type === 'leaderboard') {
    view = 'leaderboard';
    myBest = Number(message.best) || 0;
    isNewRecord = false;
    load();
    return;
  }

  if (message.type === 'gameover') {
    view = 'gameover';
    myBest = Number(message.best) || 0;
    isNewRecord = !!message.isNewRecord;
    load();
  }
});

};

var cache = {};
function resolve(from, request) {
  if (request.charAt(0) !== ".") { return request; }
  var base = from.split("/").slice(0, -1);
  var parts = request.split("/");
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i] === ".") { continue; }
    if (parts[i] === "..") { base.pop(); } else { base.push(parts[i]); }
  }
  var id = base.join("/");
  if (!/\.js$/.test(id)) { id += ".js"; }
  return id;
}
function makeRequire(from) {
  return function (request) {
    var id = resolve(from, request);
    if (!modules[id]) { throw new Error("Cannot find module " + request + " from " + from); }
    if (!cache[id]) {
      var m = { exports: {} };
      cache[id] = m;
      modules[id](m, m.exports, makeRequire(id));
    }
    return cache[id].exports;
  };
}
makeRequire("game.js")("game.js");
})();