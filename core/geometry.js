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
