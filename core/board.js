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
