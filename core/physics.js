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
