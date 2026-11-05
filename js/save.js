'use strict';

var GS = require('./state').GS;
var SAVE_KEY = require('./state').SAVE_KEY;
var HIGHSCORE_KEY = require('./state').HIGHSCORE_KEY;
var SETTINGS_KEY = require('./state').SETTINGS_KEY;
var Hex = require('./Hex').Hex;
var Block = require('./Block').Block;
var WaveGen = require('./wavegen').WaveGen;
var guard = require('./guard');
var boardApi = require('../core/board');

// 超过 3 小时的旧进度不再占用首页入口
var SAVE_MAX_AGE = 3 * 60 * 60 * 1000;

function num(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function loadSettings(state) {
  var raw = state.platform.storage.get(SETTINGS_KEY, null);

  if (raw && typeof raw === 'object') {
    state.sound.music = raw.music !== false;
    state.sound.sfx = raw.sfx !== false;
    state.sound.vibrate = raw.vibrate !== false;
  }
}

function loadHighScores(state) {
  var raw = state.platform.storage.get(HIGHSCORE_KEY, []);
  var list = [];

  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      var n = Number(raw[i]);
      if (isFinite(n) && guard.validateScore(n)) {
        list.push(n);
      }
    }
  }

  list.sort(function (a, b) {
    return b - a;
  });

  state.highscores = list.slice(0, 3);
  state.bestScore = state.highscores[0] || 0;
}

function pushHighScore(state) {
  if (!guard.validateScore(state.score)) {
    state.isNewRecord = false;
    return false;
  }

  var oldBest = state.bestScore;

  state.highscores.push(state.score);
  state.highscores.sort(function (a, b) {
    return b - a;
  });
  state.highscores = state.highscores.slice(0, 3);
  state.bestScore = Math.max(oldBest, state.highscores[0] || 0, state.score);
  state.isNewRecord = state.score > oldBest;

  state.platform.storage.set(HIGHSCORE_KEY, state.highscores);
  return state.isNewRecord;
}

function saveGame(state) {
  if (!state.MainHex || !state.waveone) {
    return;
  }
  if (state.gameState !== GS.PLAYING && state.gameState !== GS.PAUSED) {
    return;
  }

  var hex = state.MainHex;
  var data = {
    version: 1,
    savedAt: Date.now(),
    score: state.score,
    reviveUsed: !!state.reviveUsed,
    challenge: {
      target: state.challenge.target,
      active: state.challenge.active
    },
    hex: {
      position: hex.position,
      ct: hex.ct,
      angle: hex.angle,
      targetAngle: hex.targetAngle,
      angularVelocity: hex.angularVelocity,
      playThrough: hex.playThrough,
      lastCombo: hex.lastCombo,
      lastColorScored: hex.lastColorScored,
      comboMultiplier: hex.comboMultiplier,
      comboTime: hex.comboTime,
      blocks: []
    },
    falling: [],
    wavegen: {
      lastGen: state.waveone.lastGen,
      last: state.waveone.last,
      nextGen: state.waveone.nextGen,
      start: state.waveone.start,
      ct: state.waveone.ct,
      difficulty: state.waveone.difficulty,
      dt: state.waveone.dt,
      prevTimeScored: state.waveone.prevTimeScored,
      currentFunction: state.waveone.getFunctionName()
    }
  };

  var i;
  var j;

  for (var side = 0; side < hex.board.sides; side++) {
    var lane = [];
    var total = boardApi.count(hex.board, side);

    for (var level = 0; level < total; level++) {
      var b = boardApi.at(hex.board, side, level);

      if (b && !b.deleted) {
        lane.push({
          color: b.color,
          angle: b.angle,
          targetAngle: b.targetAngle
        });
      }
    }

    data.hex.blocks.push(lane);
  }

  for (i = 0; i < state.blocks.length; i++) {
    var falling = state.blocks[i];
    if (falling.removed || falling.deleted) {
      continue;
    }
    data.falling.push({
      fallingLane: falling.fallingLane,
      color: falling.color,
      iter: falling.iter,
      distFromHex: falling.distFromHex,
      angle: falling.angle,
      targetAngle: falling.targetAngle,
      height: falling.height,
      settled: falling.settled,
      initializing: falling.initializing,
      initLen: falling.initLen,
      ictOffset: falling.ict - hex.ct,
      opacity: falling.opacity,
      tint: falling.tint
    });
  }

  state.platform.storage.set(SAVE_KEY, data);
  state.hasSave = true;
}

function restoreGame(state) {
  var data = state.platform.storage.get(SAVE_KEY, null);

  if (!data || data.version !== 1 || !data.hex || !Array.isArray(data.hex.blocks)) {
    return false;
  }

  var savedAt = Number(data.savedAt);
  if (savedAt && Date.now() - savedAt > SAVE_MAX_AGE) {
    state.platform.storage.remove(SAVE_KEY);
    state.hasSave = false;
    return false;
  }

  var settings = state.settings;
  var hex = new Hex(state, settings.hexWidth);

  hex.position = num(data.hex.position, 0);
  hex.ct = num(data.hex.ct, 0);
  hex.angle = num(data.hex.angle, hex.angle);
  hex.targetAngle = num(data.hex.targetAngle, hex.angle);
  hex.angularVelocity = num(data.hex.angularVelocity, 0);
  hex.playThrough = num(data.hex.playThrough, 0);
  hex.lastCombo = num(data.hex.lastCombo, 0);
  hex.lastColorScored = data.hex.lastColorScored || '#000000';
  hex.comboMultiplier = num(data.hex.comboMultiplier, 1);
  hex.comboTime = num(data.hex.comboTime, settings.comboTime);
  hex.delay = 15;
  hex.texts = [];

  hex.board = boardApi.create(hex.sides);

  // 先挂到 state 上，Block 构造函数需要读取 MainHex.ct
  state.MainHex = hex;

  var laneIndex;
  var i;

  for (laneIndex = 0; laneIndex < hex.sides; laneIndex++) {
    var savedLane = data.hex.blocks[laneIndex] || [];
    for (i = 0; i < savedLane.length; i++) {
      var saved = savedLane[i];
      if (!saved || state.colors.indexOf(saved.color) === -1) {
        continue;
      }

      var dist = hex.sideLength / 2 * Math.sqrt(3) + settings.blockHeight * i;
      var block = new Block(state, laneIndex, saved.color, 1, dist, true);
      block.attachedLane = laneIndex;
      block.checked = 0;
      block.initializing = 0;
      block.opacity = 1;
      block.tint = 0;
      block.deleted = 0;
      block.removed = 0;
      block.height = settings.blockHeight;
      block.distFromHex = dist;
      block.angle = num(saved.angle, block.angle);
      block.targetAngle = num(saved.targetAngle, block.angle);
      boardApi.push(hex.board, laneIndex, block);
    }
  }

  state.blocks = [];
  var fallingData = Array.isArray(data.falling) ? data.falling : [];

  for (i = 0; i < fallingData.length; i++) {
    var d = fallingData[i];
    if (!d || state.colors.indexOf(d.color) === -1) {
      continue;
    }

    var falling = new Block(
      state,
      num(d.fallingLane, 0),
      d.color,
      num(d.iter, 1),
      num(d.distFromHex, settings.startDist * settings.scale),
      !!d.settled
    );

    falling.angle = num(d.angle, falling.angle);
    falling.targetAngle = num(d.targetAngle, falling.angle);
    falling.height = num(d.height, settings.blockHeight);
    falling.initializing = d.initializing ? 1 : 0;
    falling.initLen = num(d.initLen, settings.creationDt);
    falling.ict = hex.ct + num(d.ictOffset, 0);
    falling.opacity = d.opacity == null ? 1 : num(d.opacity, 1);
    falling.tint = num(d.tint, 0);
    falling.deleted = 0;
    falling.removed = 0;

    state.blocks.push(falling);
  }

  state.waveone = WaveGen.fromData(state, hex, data.wavegen);
  state.score = num(data.score, 0);
  // 已用过复活的局，读档后仍然不能再复活
  state.reviveUsed = data.reviveUsed === true;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };

  if (data.challenge && data.challenge.active) {
    var challengeTarget = num(data.challenge.target, 0);

    if (guard.validateScore(challengeTarget) && challengeTarget > 0) {
      state.challenge.target = challengeTarget;
      state.challenge.active = true;
    }
  }
  state.scoreOpacity = 1;
  state.textOpacity = 1;
  state.gdx = 0;
  state.gdy = 0;
  state.hasSave = true;
  state.isNewRecord = false;
  state.lastClear = { at: 0, count: 0 };

  return true;
}

function clearSave(state) {
  state.platform.storage.remove(SAVE_KEY);
  state.hasSave = false;
}

module.exports = {
  loadSettings: loadSettings,
  loadHighScores: loadHighScores,
  pushHighScore: pushHighScore,
  saveGame: saveGame,
  restoreGame: restoreGame,
  clearSave: clearSave
};
