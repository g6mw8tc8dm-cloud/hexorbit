'use strict';

// 核心模块单元测试（不依赖微信环境与 canvas）。
// 用法：node tools/core-test.js

var assert = require('assert');
var path = require('path');

var root = path.join(__dirname, '..');
var boardApi = require(path.join(root, 'core', 'board.js'));
var match = require(path.join(root, 'core', 'match.js'));
var physics = require(path.join(root, 'core', 'physics.js'));
var colors = require(path.join(root, 'core', 'colors.js'));
var difficulty = require(path.join(root, 'core', 'difficulty.js'));
var geometry = require(path.join(root, 'core', 'geometry.js'));

var passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log('  ok  ' + name);
}

function piece(color, radius) {
  return {
    color: color,
    distFromHex: radius || 0,
    height: 10,
    settled: 1,
    deleted: 0,
    level: 0,
    attachedLane: 0
  };
}

console.log('board');

test('push 写入层号并保持顺序', function () {
  var board = boardApi.create(6);
  var a = piece('a');
  var b = piece('b');

  assert.strictEqual(boardApi.push(board, 2, a), 0);
  assert.strictEqual(boardApi.push(board, 2, b), 1);
  assert.strictEqual(boardApi.count(board, 2), 2);
  assert.strictEqual(boardApi.at(board, 2, 0), a);
  assert.strictEqual(boardApi.at(board, 2, 1), b);
  assert.strictEqual(boardApi.top(board, 2), b);
  assert.strictEqual(a.level, 0);
  assert.strictEqual(b.level, 1);
});

test('removeAt 压缩并重写层号', function () {
  var board = boardApi.create(6);
  var a = piece('a');
  var b = piece('b');
  var c = piece('c');

  boardApi.push(board, 0, a);
  boardApi.push(board, 0, b);
  boardApi.push(board, 0, c);

  var removed = boardApi.removeAt(board, 0, 0);

  assert.strictEqual(removed, a);
  assert.strictEqual(boardApi.count(board, 0), 2);
  assert.strictEqual(boardApi.at(board, 0, 0), b);
  assert.strictEqual(boardApi.at(board, 0, 1), c);
  assert.strictEqual(b.level, 0);
  assert.strictEqual(c.level, 1);
});

test('超过 cap 自动扩容且内容不丢', function () {
  var board = boardApi.create(6, 2);
  var list = [];

  for (var i = 0; i < 7; i++) {
    var p = piece('x' + i);
    list.push(p);
    boardApi.push(board, 1, p);
  }

  assert(board.cap >= 8);
  assert.strictEqual(boardApi.count(board, 1), 7);

  for (var j = 0; j < 7; j++) {
    assert.strictEqual(boardApi.at(board, 1, j), list[j]);
    assert.strictEqual(list[j].level, j);
  }
});

test('overflow 忽略已标记删除的方块', function () {
  var board = boardApi.create(6);

  for (var i = 0; i < 3; i++) {
    boardApi.push(board, 0, piece('a'));
  }

  assert.strictEqual(boardApi.overflow(board, 3), false);

  boardApi.at(board, 0, 0).deleted = 1;
  assert.strictEqual(boardApi.overflow(board, 3), false);

  boardApi.push(board, 0, piece('a'));
  assert.strictEqual(boardApi.overflow(board, 3), false);
  assert.strictEqual(boardApi.overflow(board, 2), true);
});

console.log('match');

test('同色三连被识别', function () {
  var board = boardApi.create(6);
  boardApi.push(board, 0, piece('r'));
  boardApi.push(board, 0, piece('r'));
  boardApi.push(board, 0, piece('r'));

  var group = match.collectGroup(board, 0, 0);
  assert.strictEqual(group.length, 3);
  assert.deepStrictEqual(group[0], [0, 0]);
});

test('跨边相邻也算连通', function () {
  var board = boardApi.create(6);
  boardApi.push(board, 0, piece('r'));
  boardApi.push(board, 1, piece('r'));
  boardApi.push(board, 2, piece('r'));

  assert.strictEqual(match.collectGroup(board, 1, 0).length, 3);
});

test('不同色不连通', function () {
  var board = boardApi.create(6);
  boardApi.push(board, 0, piece('r'));
  boardApi.push(board, 1, piece('b'));
  boardApi.push(board, 2, piece('r'));

  assert.strictEqual(match.collectGroup(board, 0, 0).length, 1);
});

test('首尾边相邻（环形边界）', function () {
  var board = boardApi.create(6);
  boardApi.push(board, 5, piece('r'));
  boardApi.push(board, 0, piece('r'));

  assert.strictEqual(match.collectGroup(board, 5, 0).length, 2);
});

test('已标记删除的方块不参与连通', function () {
  var board = boardApi.create(6);
  boardApi.push(board, 0, piece('r'));
  var mid = piece('r');
  mid.deleted = 1;
  boardApi.push(board, 1, mid);
  boardApi.push(board, 2, piece('r'));

  assert.strictEqual(match.collectGroup(board, 0, 0).length, 1);
});

console.log('physics');

test('landingLane 在六个朝向下闭合', function () {
  for (var pos = 0; pos < 6; pos++) {
    for (var lane = 0; lane < 6; lane++) {
      var result = physics.landingLane(6, lane, pos);
      assert(result >= 0 && result < 6);
    }
  }

  assert.strictEqual(physics.landingLane(6, 0, 0), 0);
  assert.strictEqual(physics.landingLane(6, 0, 1), 1);
  assert.strictEqual(physics.landingLane(6, 1, 0), 5);
});

test('没有栈顶时落到核心半径', function () {
  var p = piece('r', 10);
  var result = physics.landingRadius(p, null, 50, 40);
  assert.strictEqual(result.land, true);
  assert.strictEqual(result.radius, 50);
});

test('碰到栈顶时落在栈顶上方', function () {
  var p = piece('r', 10);
  var top = piece('r', 50);
  top.height = 20;

  var result = physics.landingRadius(p, top, 50, 20);
  assert.strictEqual(result.land, true);
  assert.strictEqual(result.radius, 70);
});

test('未接触时不下落', function () {
  var p = piece('r', 200);
  var result = physics.landingRadius(p, null, 50, 10);
  assert.strictEqual(result.land, false);
});

test('下方未落定时不吸附', function () {
  var p = piece('r', 60);
  var below = piece('r', 50);
  below.settled = 0;
  below.height = 10;

  var result = physics.settleRadius(p, below, 50, 20);
  assert.strictEqual(result.settled, false);
});

console.log('colors');

test('开局缓冲：难度低于 2 时只有 3 色', function () {
  assert.strictEqual(colors.activeCount(1), 3);
  assert.strictEqual(colors.activeCount(1.99), 3);
});

test('缓冲结束后回到 4 色', function () {
  assert.strictEqual(colors.activeCount(2), 4);
  assert.strictEqual(colors.activeCount(19.99), 4);
});

test('难度达到阈值后变为 5 色', function () {
  assert.strictEqual(colors.activeCount(20), 5);
  assert.strictEqual(colors.activeCount(45), 5);
});

test('pool 只取前 N 个颜色且顺序不变', function () {
  var palette = ['a', 'b', 'c', 'd', 'e'];
  assert.deepStrictEqual(colors.pool(palette, 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(colors.pool(palette, 2), ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(colors.pool(palette, 30), ['a', 'b', 'c', 'd', 'e']);
});

test('调试覆盖优先于难度', function () {
  assert.strictEqual(colors.activeCount(1, 5), 5);
});

test('运行时改阈值不影响开局缓冲', function () {
  colors.setUnlockAt(30);
  assert.strictEqual(colors.activeCount(1), 3, 'buffer should stay');
  assert.strictEqual(colors.activeCount(10), 4);
  assert.strictEqual(colors.activeCount(30), 5);
  colors.setUnlockAt(0);
  assert.strictEqual(colors.activeCount(30), 5, 'default threshold is 20');
  assert.strictEqual(colors.activeCount(25), 5);
});

console.log('difficulty');

test('难度单调递增且不超过上限', function () {
  var settings = {
    speedModifier: 1,
    difficultyGrowth: 2.5,
    difficultyMax: 45
  };

  var d = 1;
  for (var i = 1; i <= 20000; i++) {
    var next = difficulty.advance(d, 14 * i, 0, settings);
    assert(next >= d - 1e-9, 'difficulty must not decrease');
    assert(next <= settings.difficultyMax + 1e-9);
    d = next;
  }

  assert.strictEqual(d, settings.difficultyMax);
});

test('出块间隔不低于 600', function () {
  assert.strictEqual(difficulty.intervalAfterSpawn(600, 1), 600);
  assert.strictEqual(difficulty.intervalAfterSpawn(500, 1), 500);
  assert(difficulty.intervalAfterSpawn(1300, 1) < 1300);
});

test('消除加速难度并收紧间隔', function () {
  var settings = {
    speedModifier: 1,
    difficultyGrowth: 2.5,
    difficultyMax: 45,
    creationSpeedModifier: 1
  };

  var result = difficulty.onBlockDestroyed(2000, 10, settings);
  assert(result.nextGen < 2000);
  assert(result.difficulty > 10);
});

console.log('geometry');

test('quad 左右对称', function () {
  var q = geometry.quad(100, 20, 0, 1);
  assert(Math.abs(q.points[0].x + q.points[1].x) < 1e-9);
  assert(Math.abs(q.points[2].x + q.points[3].x) < 1e-9);
  assert(q.outer > q.inner);
});

test('anchor 随角度旋转', function () {
  var a = geometry.anchor(100, 100, 0, 50, 10);
  assert(Math.abs(a.x - 100) < 1e-9);
  assert(a.y < 100);

  var b = geometry.anchor(100, 100, 90, 50, 10);
  assert(b.x > 100);
});

test('centroid 取平均位置', function () {
  var pieces = [
    { angle: 0, distFromHex: 50, height: 10 },
    { angle: 0, distFromHex: 50, height: 10 }
  ];
  var c = geometry.centroid(pieces, 100, 100);
  assert(Math.abs(c.x - 100) < 1e-9);
  assert(Math.abs(c.y - (100 - 55)) < 1e-9);
});

console.log('\nOK: ' + passed + ' core tests passed');
