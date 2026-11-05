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
