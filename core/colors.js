'use strict';

// 颜色数量随难度解锁。
//
// 规则：开局 N 色，难度达到阈值后加入下一色，之后不再回退。
// 只影响“新生成的方块可能是什么颜色”，不影响已有方块与消除判定。

// 解锁阶梯：难度达到 at 时，可用颜色数变为 count
// 2  = 开局缓冲结束（约 15 秒），回到 4 色
// 20 = 加入第 5 色（约 2 分钟）
var STEPS = [
  { at: 2, count: 4 },
  { at: 20, count: 5 }
];

// 开局只用 3 色，降低“前几块颜色太散、凑不出三连”的暴死率
var START_COUNT = 3;

// 运行时可覆盖的解锁阈值（仅用于真机/工具里试参数，不写入存档）
var unlockOverride = 0;

function setUnlockAt(difficulty) {
  unlockOverride = Number(difficulty) || 0;
  return unlockOverride;
}

function currentSteps() {
  if (unlockOverride > 0) {
    // 只替换最后一档（第 5 色），保留开局缓冲
    var steps = STEPS.slice(0, STEPS.length - 1);
    steps.push({ at: unlockOverride, count: STEPS[STEPS.length - 1].count });
    return steps;
  }

  return STEPS;
}

function activeCount(difficulty, override) {
  if (override > 0) {
    return override;
  }

  var steps = currentSteps();
  var count = START_COUNT;

  for (var i = 0; i < steps.length; i++) {
    if (difficulty >= steps[i].at) {
      count = steps[i].count;
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
  pool: pool,
  setUnlockAt: setUnlockAt
};
