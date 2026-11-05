'use strict';

// 状态快照与摘要。
// 只读取“语义状态”（每条边的栈、颜色、半径、分数、难度），
// 不读取任何内部动画字段，因此在核心重写前后保持可比。

var PALETTE = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'];
var LANES = 6;
var boardApi = require('../../core/board');

function mix(h, value) {
  h ^= value | 0;
  h = Math.imul(h, 16777619);
  h ^= h >>> 13;
  return h >>> 0;
}

function fnv1a(text) {
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) {
    h = mix(h, text.charCodeAt(i));
  }
  return h >>> 0;
}

// 颜色统一成稳定的整数键：调色板内用下标，其它用字符串哈希
function colorKey(color) {
  if (typeof color === 'number') {
    return color;
  }

  var idx = PALETTE.indexOf(String(color));
  if (idx >= 0) {
    return idx;
  }

  return 1000 + (fnv1a(String(color)) % 1000);
}

// 兼容棋盘布局：P2 之后是 board 槽位表，旧版是 blocks[边][层]
function readLanes(hex) {
  if (!hex) {
    return [];
  }

  if (hex.board) {
    var board = hex.board;
    var out = [];

    for (var side = 0; side < board.sides; side++) {
      var lane = [];
      for (var level = 0; level < boardApi.count(board, side); level++) {
        lane.push(boardApi.at(board, side, level));
      }
      out.push(lane);
    }

    return out;
  }

  if (Array.isArray(hex.blocks)) {
    return hex.blocks;
  }

  return [];
}

function pieceRadius(piece) {
  if (!piece) {
    return 0;
  }
  if (typeof piece.r === 'number') {
    // 定点整数（P2 之后）
    return Math.round(piece.r);
  }
  if (typeof piece.distFromHex === 'number') {
    return Math.round(piece.distFromHex * 1000);
  }
  return 0;
}

// 逐帧摘要：用于“新旧实现是否完全一致”的判定
function digest(state) {
  var hex = state.MainHex;
  var lanes = readLanes(hex);
  var h = 2166136261;
  var i;
  var j;

  h = mix(h, lanes.length);

  for (i = 0; i < lanes.length; i++) {
    var stack = lanes[i] || [];
    h = mix(h, i);
    h = mix(h, stack.length);

    for (j = 0; j < stack.length; j++) {
      var piece = stack[j];
      h = mix(h, colorKey(piece.color));
      h = mix(h, pieceRadius(piece));
      h = mix(h, piece.deleted ? 1 : 0);
      h = mix(h, piece.settled ? 1 : 0);
    }
  }

  var falling = state.blocks || [];
  h = mix(h, falling.length);

  for (i = 0; i < falling.length; i++) {
    var b = falling[i];
    h = mix(h, colorKey(b.color));
    h = mix(h, b.fallingLane | 0);
    h = mix(h, pieceRadius(b));
    h = mix(h, b.settled ? 1 : 0);
  }

  h = mix(h, state.score | 0);
  h = mix(h, Math.round((state.waveone ? state.waveone.difficulty : 0) * 1000));
  h = mix(h, Math.round(state.waveone ? state.waveone.nextGen : 0));
  h = mix(h, (state.MainHex && state.MainHex.position) | 0);

  return ('0000000' + h.toString(16)).slice(-8);
}

// 关键帧：出问题时用来看具体棋盘，而不是只有哈希
function keyframe(state) {
  var lanes = readLanes(state.MainHex || {});
  var out = {
    score: state.score,
    gameState: state.gameState,
    difficulty: state.waveone ? round3(state.waveone.difficulty) : 0,
    nextGen: state.waveone ? Math.round(state.waveone.nextGen) : 0,
    position: state.MainHex ? state.MainHex.position | 0 : 0,
    lanes: [],
    falling: []
  };

  var i;
  var j;

  for (i = 0; i < lanes.length; i++) {
    var stack = lanes[i] || [];
    var lane = [];
    for (j = 0; j < stack.length; j++) {
      lane.push({
        c: colorKey(stack[j].color),
        r: pieceRadius(stack[j]),
        d: stack[j].deleted ? 1 : 0
      });
    }
    out.lanes.push(lane);
  }

  var falling = state.blocks || [];
  for (i = 0; i < falling.length; i++) {
    out.falling.push({
      c: colorKey(falling[i].color),
      lane: falling[i].fallingLane | 0,
      r: pieceRadius(falling[i]),
      s: falling[i].settled ? 1 : 0
    });
  }

  return out;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

module.exports = {
  PALETTE: PALETTE,
  LANES: LANES,
  colorKey: colorKey,
  readLanes: readLanes,
  digest: digest,
  keyframe: keyframe
};
