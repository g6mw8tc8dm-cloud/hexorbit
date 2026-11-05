'use strict';

var GS = require('./state').GS;
var drawPolygon = require('./draw').drawPolygon;
var boardApi = require('../core/board');
var physics = require('../core/physics');

function Hex(state, sideLength) {
  this.state = state;
  this.playThrough = 0;
  this.fillColor = [44, 62, 80];
  this.tempColor = [44, 62, 80];
  this.angularVelocity = 0;
  this.position = 0;
  this.dy = 0;
  this.dt = 1;
  this.sides = 6;
  this.board = boardApi.create(6);
  this.angle = 180 / this.sides;
  this.targetAngle = this.angle;
  this.shakes = [];
  this.sideLength = sideLength;
  this.strokeColor = 'blue';
  this.x = state.width / 2;
  this.y = state.height / 2;
  this.ct = 0;
  this.lastCombo = this.ct - state.settings.comboTime;
  this.lastColorScored = '#000000';
  this.comboTime = state.settings.comboTime;
  this.comboMultiplier = 1;
  this.texts = [];
  this.lastRotate = Date.now();
  this.delay = 15;
}

Hex.prototype.shake = function (obj) {
  var angle = 30 + obj.lane * 60;
  angle *= Math.PI / 180;
  var dx = Math.cos(angle) * obj.magnitude;
  var dy = Math.sin(angle) * obj.magnitude;
  var state = this.state;

  state.gdx -= dx;
  state.gdy += dy;
  obj.magnitude /= 2 * this.dt;

  if (obj.magnitude < 1) {
    for (var i = 0; i < this.shakes.length; i++) {
      if (this.shakes[i] === obj) {
        this.shakes.splice(i, 1);
        break;
      }
    }
  }
};

Hex.prototype.addBlock = function (block, lane) {
  var state = this.state;
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  block.settled = 1;
  block.tint = 0.6;

  if (lane === undefined) {
    lane = physics.landingLane(this.sides, block.fallingLane, this.position);
  }

  this.shakes.push({
    lane: block.fallingLane,
    magnitude: 4.5 * state.settings.scale
  });

  var level = boardApi.count(this.board, lane);
  block.distFromHex = physics.coreRadius(this.sideLength) + block.height * level;
  block.checked = 1;
  boardApi.push(this.board, lane, block);

  if (state.audio) {
    state.audio.playSfx('drop');
  }
};

// level 省略时：按下落方块的当前朝向解析目标边（下落阶段）
// level 传入时：检查该层方块是否落到下一层之上（重排阶段）
Hex.prototype.doesBlockCollide = function (block, level) {
  if (block.settled) {
    return;
  }

  var state = this.state;
  var core = physics.coreRadius(this.sideLength);
  var step = physics.stepOf(block, this.dt, state.settings.scale);
  var result;

  if (level !== undefined) {
    var below = level > 0 ? boardApi.at(this.board, block.attachedLane, level - 1) : null;
    result = physics.settleRadius(block, below, core, step);

    if (result.settled) {
      block.distFromHex = result.radius;
      block.settled = 1;
      block.checked = 1;
    } else {
      block.settled = 0;
      block.iter = 1.5 + (state.waveone.difficulty / 15) * 3;
    }
    return;
  }

  var lane = physics.landingLane(this.sides, block.fallingLane, this.position);
  var top = boardApi.top(this.board, lane);
  result = physics.landingRadius(block, top, core, step);

  if (result.land) {
    block.distFromHex = result.radius;
    this.addBlock(block, lane);
  }
};

Hex.prototype.rotate = function (steps) {
  var now = Date.now();
  if (now - this.lastRotate < 70) {
    return;
  }
  if (this.state.gameState !== GS.PLAYING) {
    return;
  }

  this.position += steps;

  while (this.position < 0) {
    this.position += 6;
  }
  this.position = this.position % this.sides;

  boardApi.forEach(this.board, function (block) {
    block.targetAngle = block.targetAngle - steps * 60;
  });

  this.targetAngle = this.targetAngle - steps * 60;
  this.lastRotate = now;

  if (this.state.audio) {
    this.state.audio.playSfx('rotate');
  }
};

Hex.prototype.draw = function () {
  var state = this.state;
  var ctx = state.ctx;

  this.x = state.width / 2;
  this.y = state.height / 2;
  this.sideLength = state.settings.hexWidth;

  state.gdx = 0;
  state.gdy = 0;

  for (var i = 0; i < this.shakes.length; i++) {
    this.shake(this.shakes[i]);
  }

  if (this.angle > this.targetAngle) {
    this.angularVelocity -= state.angularVelocityConst * this.dt;
  } else if (this.angle < this.targetAngle) {
    this.angularVelocity += state.angularVelocityConst * this.dt;
  }

  if (Math.abs(this.angle - this.targetAngle + this.angularVelocity) <= Math.abs(this.angularVelocity)) {
    this.angle = this.targetAngle;
    this.angularVelocity = 0;
  } else {
    this.angle += this.angularVelocity;
  }

  drawPolygon(
    ctx,
    this.x + state.gdx,
    this.y + state.gdy + this.dy,
    this.sides,
    this.sideLength,
    this.angle,
    arrayToColor(this.fillColor),
    0,
    'rgba(0,0,0,0)'
  );
};

function arrayToColor(arr) {
  return 'rgb(' + arr[0] + ',' + arr[1] + ',' + arr[2] + ')';
}

module.exports = {
  Hex: Hex,
  arrayToColor: arrayToColor
};
