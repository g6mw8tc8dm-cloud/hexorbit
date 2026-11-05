'use strict';

var consolidateBlocks = require('./checking').consolidateBlocks;
var blockDestroyed = require('./wavegen').blockDestroyed;
var boardApi = require('../core/board');

function update(state, dt) {
  var MainHex = state.MainHex;
  MainHex.dt = dt;

  if (state.gameState === 1) {
    state.waveone.update();
    if (MainHex.ct - state.waveone.prevTimeScored > 1000) {
      state.waveone.prevTimeScored = MainHex.ct;
    }
  }

  var i;
  var block;
  var board = MainHex.board;
  var sides = boardApi.count ? board.sides : 0;

  // 1. 下落中的方块：先解析是否碰到栈顶，再推进
  for (i = 0; i < state.blocks.length; i++) {
    block = state.blocks[i];
    MainHex.doesBlockCollide(block);

    if (!block.settled) {
      if (!block.initializing) {
        block.distFromHex -= block.iter * dt * state.settings.scale;
      }
    } else if (!block.removed) {
      block.removed = 1;
    }
  }

  // 2. 消除判定
  for (var side = 0; side < sides; side++) {
    var count = boardApi.count(board, side);

    for (var level = 0; level < count; level++) {
      block = boardApi.at(board, side, level);

      if (block && block.checked === 1) {
        consolidateBlocks(state, MainHex, block.attachedLane, level);
        block.checked = 0;
      }
    }
  }

  // 3. 清掉淡出结束的方块，并从最低删除层开始重新落定
  for (side = 0; side < sides; side++) {
    var lowestDeleted = 99;
    var cursor = 0;

    while (cursor < boardApi.count(board, side)) {
      block = boardApi.at(board, side, cursor);

      if (block && block.deleted === 2) {
        boardApi.removeAt(board, side, cursor);
        blockDestroyed(state);

        if (cursor < lowestDeleted) {
          lowestDeleted = cursor;
        }
        continue;
      }

      cursor++;
    }

    var rest = boardApi.count(board, side);

    if (lowestDeleted < rest) {
      for (var k = lowestDeleted; k < rest; k++) {
        boardApi.at(board, side, k).settled = 0;
      }
    }
  }

  // 4. 重新落定：上方方块逐层贴回
  for (side = 0; side < sides; side++) {
    var total = boardApi.count(board, side);

    for (var index = 0; index < total; index++) {
      block = boardApi.at(board, side, index);
      MainHex.doesBlockCollide(block, index);

      if (!block.settled) {
        block.distFromHex -= block.iter * dt * state.settings.scale;
      }
    }
  }

  // 5. 移除已经挂到棋盘上的下落方块
  for (i = 0; i < state.blocks.length; i++) {
    if (state.blocks[i].removed === 1) {
      state.blocks.splice(i, 1);
      i--;
    }
  }

  MainHex.ct += dt;
}

module.exports = {
  update: update
};
