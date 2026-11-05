'use strict';

// 固定种子随机数，仅用于 tools/ 下的一致性测试。
// 参数与返回值与 Math.random 兼容。

function mulberry32(seed) {
  var a = seed >>> 0;

  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 从同一个种子派生出互不干扰的随机流
function derive(seed, salt) {
  return mulberry32((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0);
}

module.exports = {
  mulberry32: mulberry32,
  derive: derive
};
