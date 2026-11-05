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
