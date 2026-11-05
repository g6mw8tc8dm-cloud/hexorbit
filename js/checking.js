'use strict';

var Text = require('./Text').Text;
var fadeUpAndOut = require('./Text').fadeUpAndOut;
var findCenterOfBlocks = require('./Block').findCenterOfBlocks;
var collectGroup = require('../core/match').collectGroup;
var boardApi = require('../core/board');

// 兼容旧导出：外部只用到 consolidateBlocks
function search(twoD, oneD) {
  for (var i = 0; i < twoD.length; i++) {
    if (twoD[i][0] === oneD[0] && twoD[i][1] === oneD[1]) {
      return true;
    }
  }
  return false;
}

function floodFill(hex, side, index, deleting) {
  var group = collectGroup(hex.board, side, index);

  for (var i = 0; i < group.length; i++) {
    if (!search(deleting, group[i])) {
      deleting.push(group[i]);
    }
  }
}

function consolidateBlocks(state, hex, side, index) {
  var deleting = collectGroup(hex.board, side, index);

  if (deleting.length < 3) {
    return;
  }

  var deletedBlocks = [];
  var i;

  for (i = 0; i < deleting.length; i++) {
    var arr = deleting[i];
    var piece = boardApi.at(hex.board, arr[0], arr[1]);

    if (piece) {
      piece.deleted = 1;
      deletedBlocks.push(piece);
    }
  }

  if (!deletedBlocks.length) {
    return;
  }

  var now = state.MainHex.ct;

  if (now - hex.lastCombo < hex.comboTime) {
    hex.comboTime = (1 / state.settings.creationSpeedModifier) * (state.waveone.nextGen / 16.666667) * 3;
    hex.comboMultiplier += 1;
    hex.lastCombo = now;

    var coords = findCenterOfBlocks(deletedBlocks);
    hex.texts.push(new Text(state, coords.x, coords.y, 'x ' + hex.comboMultiplier, 'bold', '#ffffff', fadeUpAndOut));
  } else {
    hex.comboTime = 240;
    hex.lastCombo = now;
    hex.comboMultiplier = 1;
  }

  var adder = deleting.length * deleting.length * hex.comboMultiplier;
  hex.texts.push(new Text(state, hex.x, hex.y, '+ ' + adder, 'bold', deletedBlocks[0].color, fadeUpAndOut));
  hex.lastColorScored = deletedBlocks[0].color;
  state.score += adder;
  state.lastClear = { at: Date.now(), count: deleting.length };

  if (state.audio) {
    state.audio.playSfx('clear');
  }
}

module.exports = {
  search: search,
  floodFill: floodFill,
  consolidateBlocks: consolidateBlocks
};
