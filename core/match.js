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
