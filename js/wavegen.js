'use strict';

var addNewBlock = require('./spawn').addNewBlock;
var randInt = require('./math').randInt;
var difficultyApi = require('../core/difficulty');
var colorApi = require('../core/colors');

function blockDestroyed(state) {
  var w = state.waveone;
  if (!w) {
    return;
  }

  var next = difficultyApi.onBlockDestroyed(w.nextGen, w.difficulty, state.settings);
  w.nextGen = next.nextGen;
  w.difficulty = next.difficulty;
}

function WaveGen(state, hex) {
  this.state = state;
  this.lastGen = 0;
  this.last = 0;
  this.nextGen = 2700;
  this.start = 0;
  this.colors = state.colors;
  this.ct = 0;
  this.hex = hex;
  this.difficulty = 1;
  this.dt = 0;
  this.prevTimeScored = 0;
  this.currentFunction = this.randomGeneration;
}

// 当前难度下可用的颜色（难度到阈值后并入新颜色）
WaveGen.prototype.colorPool = function () {
  return colorApi.pool(this.colors, this.difficulty, this.state.debugColorCount);
};

WaveGen.prototype.pickColor = function () {
  var pool = this.colorPool();
  return pool[randInt(0, pool.length)];
};

WaveGen.prototype.update = function () {
  this.currentFunction();
  this.dt = 14 * this.state.MainHex.ct;
  this.computeDifficulty();

  if ((this.dt - this.lastGen) * this.state.settings.creationSpeedModifier > this.nextGen) {
    this.nextGen = difficultyApi.intervalAfterSpawn(this.nextGen, this.state.settings.creationSpeedModifier);
  }
};

WaveGen.prototype.randomGeneration = function () {
  if (this.dt - this.lastGen > this.nextGen) {
    this.ct++;
    this.lastGen = this.dt;

    var fv = randInt(0, this.state.MainHex.sides);
    addNewBlock(this.state, fv, this.pickColor(), 1.6 + (this.difficulty / 15) * 3);

    var lim = 5;
    if (this.ct > lim) {
      var nextPattern = randInt(0, 3 + 21);
      if (nextPattern > 15) {
        this.ct = 0;
        this.currentFunction = this.doubleGeneration;
      } else if (nextPattern > 10) {
        this.ct = 0;
        this.currentFunction = this.crosswiseGeneration;
      } else if (nextPattern > 7) {
        this.ct = 0;
        this.currentFunction = this.spiralGeneration;
      } else if (nextPattern > 4) {
        this.ct = 0;
        this.currentFunction = this.circleGeneration;
      } else if (nextPattern > 1) {
        this.ct = 0;
        this.currentFunction = this.halfCircleGeneration;
      }
    }
  }
};

WaveGen.prototype.computeDifficulty = function () {
  this.difficulty = difficultyApi.advance(
    this.difficulty,
    this.dt,
    this.last,
    this.state.settings
  );
};

WaveGen.prototype.circleGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen + 500) {
    return;
  }

  var numColors = randInt(1, 4);
  if (numColors === 3) {
    numColors = randInt(1, 4);
  }

  var colorList = [];
  var pool = this.colorPool();
  var i;
  var j;

  nextLoop:
  for (i = 0; i < numColors; i++) {
    var q = randInt(0, pool.length);
    for (j in colorList) {
      if (colorList[j] === pool[q]) {
        i--;
        continue nextLoop;
      }
    }
    colorList.push(pool[q]);
  }

  for (i = 0; i < this.state.MainHex.sides; i++) {
    addNewBlock(this.state, i, colorList[i % numColors], 1.5 + (this.difficulty / 15) * 3);
  }

  this.ct += 15;
  this.lastGen = this.dt;
  this.shouldChangePattern(1);
};

WaveGen.prototype.halfCircleGeneration = function () {
  if (this.dt - this.lastGen <= (this.nextGen + 500) / 2) {
    return;
  }

  var numColors = randInt(1, 3);
  var c = this.pickColor();
  var colorList = [c, c, c];

  if (numColors === 2) {
    colorList = [c, this.pickColor(), c];
  }

  var d = randInt(0, 6);
  for (var i = 0; i < 3; i++) {
    addNewBlock(this.state, (d + i) % 6, colorList[i], 1.5 + (this.difficulty / 15) * 3);
  }

  this.ct += 8;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.crosswiseGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen) {
    return;
  }

  var color = this.pickColor();
  var lane = randInt(0, this.state.MainHex.sides);
  var iter = 0.6 + (this.difficulty / 15) * 3;

  addNewBlock(this.state, lane, color, iter);
  addNewBlock(this.state, (lane + 3) % this.state.MainHex.sides, color, iter);

  this.ct += 1.5;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.spiralGeneration = function () {
  var dir = randInt(0, 2);
  if (this.dt - this.lastGen <= this.nextGen * (2 / 3)) {
    return;
  }

  if (dir) {
    addNewBlock(this.state, 5 - (this.ct % this.state.MainHex.sides), this.pickColor(), 1.5 + (this.difficulty / 15) * 1.5);
  } else {
    addNewBlock(this.state, this.ct % this.state.MainHex.sides, this.pickColor(), 1.5 + (this.difficulty / 15) * 1.5);
  }

  this.ct += 1;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.doubleGeneration = function () {
  if (this.dt - this.lastGen <= this.nextGen) {
    return;
  }

  var lane = randInt(0, this.state.MainHex.sides);
  addNewBlock(this.state, lane, this.pickColor(), 1.5 + (this.difficulty / 15) * 3);
  addNewBlock(this.state, (lane + 1) % this.state.MainHex.sides, this.pickColor(), 1.5 + (this.difficulty / 15) * 3);

  this.ct += 2;
  this.lastGen = this.dt;
  this.shouldChangePattern();
};

WaveGen.prototype.setRandom = function () {
  this.ct = 0;
  this.currentFunction = this.randomGeneration;
};

WaveGen.prototype.shouldChangePattern = function (x) {
  if (x) {
    var q = randInt(0, 4);
    this.ct = 0;
    switch (q) {
      case 0:
        this.currentFunction = this.doubleGeneration;
        break;
      case 1:
        this.currentFunction = this.spiralGeneration;
        break;
      case 2:
        this.currentFunction = this.crosswiseGeneration;
        break;
      default:
        break;
    }
  } else if (this.ct > 8) {
    if (randInt(0, 2) === 0) {
      this.setRandom();
      return 1;
    }
  }
  return 0;
};

WaveGen.FUNCTION_NAMES = [
  'randomGeneration',
  'circleGeneration',
  'halfCircleGeneration',
  'crosswiseGeneration',
  'spiralGeneration',
  'doubleGeneration'
];

WaveGen.prototype.getFunctionName = function () {
  for (var i = 0; i < WaveGen.FUNCTION_NAMES.length; i++) {
    var name = WaveGen.FUNCTION_NAMES[i];
    if (this.currentFunction === this[name]) {
      return name;
    }
  }
  return 'randomGeneration';
};

WaveGen.fromData = function (state, hex, data) {
  var w = new WaveGen(state, hex);
  if (!data) {
    return w;
  }

  w.lastGen = Number(data.lastGen) || 0;
  w.last = Number(data.last) || 0;
  w.nextGen = Number(data.nextGen) || 2700;
  w.start = Number(data.start) || 0;
  w.ct = Number(data.ct) || 0;
  w.difficulty = Math.min(Number(data.difficulty) || 1, state.settings.difficultyMax);
  w.dt = Number(data.dt) || 0;
  w.prevTimeScored = Number(data.prevTimeScored) || 0;

  if (WaveGen.FUNCTION_NAMES.indexOf(data.currentFunction) !== -1) {
    w.currentFunction = w[data.currentFunction];
  }

  return w;
};

module.exports = {
  WaveGen: WaveGen,
  blockDestroyed: blockDestroyed
};
