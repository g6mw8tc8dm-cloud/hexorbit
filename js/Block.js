'use strict';

var geometry = require('../core/geometry');

// 方块：状态 + 生命周期。
// 几何计算在 core/geometry.js，绘制只负责把算好的四个角连成路径。

function Block(state, fallingLane, color, iter, distFromHex, settled) {
  this.state = state;

  // 是否已经落在中心六边形或其它方块上
  this.settled = settled ? 1 : 0;
  this.height = state.settings.blockHeight;

  // 方块从哪一条边落下
  this.fallingLane = fallingLane;
  this.checked = 0;

  // 方块当前角度
  this.angle = 90 - (30 + 60 * fallingLane);
  this.angularVelocity = 0;
  this.targetAngle = this.angle;

  this.color = color;

  // 已标记删除 / 已从下落列表移除
  this.deleted = 0;
  this.removed = 0;

  // 吸附白闪、删除淡出
  this.tint = 0;
  this.opacity = 1;
  this.initializing = 1;
  this.ict = state.MainHex ? state.MainHex.ct : 0;

  this.iter = iter;
  this.initLen = state.settings.creationDt;
  this.attachedLane = 0;
  this.distFromHex = distFromHex || state.settings.startDist * state.settings.scale;
}

// 朝向插值：向 targetAngle 收敛
function spin(block, dt, angularVelocityConst) {
  if (block.angle > block.targetAngle) {
    block.angularVelocity -= angularVelocityConst * dt;
  } else if (block.angle < block.targetAngle) {
    block.angularVelocity += angularVelocityConst * dt;
  }

  if (Math.abs(block.angle - block.targetAngle + block.angularVelocity) <= Math.abs(block.angularVelocity)) {
    block.angle = block.targetAngle;
    block.angularVelocity = 0;
  } else {
    block.angle += block.angularVelocity;
  }
}

function traceQuad(ctx, x, y, points) {
  ctx.beginPath();
  ctx.moveTo(x + points[0].x, y + points[0].y);
  ctx.lineTo(x + points[1].x, y + points[1].y);
  ctx.lineTo(x + points[2].x, y + points[2].y);
  ctx.lineTo(x + points[3].x, y + points[3].y);
  ctx.closePath();
  ctx.fill();
}

Block.prototype.incrementOpacity = function () {
  if (!this.deleted) {
    return;
  }

  var state = this.state;
  var hex = state.MainHex;
  var dt = hex ? hex.dt : 1;

  if (this.opacity >= 0.925) {
    var tLane = this.attachedLane - hex.position;
    tLane = hex.sides - tLane;
    while (tLane < 0) {
      tLane += hex.sides;
    }
    tLane %= hex.sides;
    hex.shakes.push({
      lane: tLane,
      magnitude: 3 * state.settings.scale
    });
  }

  this.opacity -= 0.075 * dt;
  if (this.opacity <= 0) {
    this.opacity = 0;
    this.deleted = 2;
  }
};

Block.prototype.getIndex = function () {
  // 层号由棋盘在 push / removeAt 时维护
  return typeof this.level === 'number' ? this.level : 0;
};

Block.prototype.draw = function (attached, index) {
  var state = this.state;
  var ctx = state.ctx;
  var hex = state.MainHex;
  var settings = state.settings;

  this.height = settings.blockHeight;

  if (Math.abs(settings.scale - settings.prevScale) > 0.000000001) {
    this.distFromHex *= (settings.scale / settings.prevScale);
  }

  this.incrementOpacity();
  spin(this, hex.dt, state.angularVelocityConst);

  var ratio = 1;

  if (this.initializing) {
    var rat = (hex.ct - this.ict) / this.initLen;
    if (rat > 1) {
      rat = 1;
    }
    ratio = rat;

    if ((hex.ct - this.ict) >= this.initLen) {
      this.initializing = 0;
    }
  }

  var geo = geometry.quad(this.distFromHex, this.height, this.angle, ratio);
  var base = geometry.anchor(state.width / 2, state.height / 2, this.angle, this.distFromHex, this.height);
  var baseX = base.x + state.gdx;
  var baseY = base.y + state.gdy;

  ctx.fillStyle = this.deleted ? '#ffffff' : this.color;
  ctx.globalAlpha = this.opacity;
  traceQuad(ctx, baseX, baseY, geo.points);

  if (this.tint) {
    if (this.opacity < 1) {
      this.iter = 2.25;
      this.tint = 0;
    }

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = this.tint;
    traceQuad(ctx, baseX, baseY, geo.points);

    this.tint -= 0.02 * hex.dt;
    if (this.tint < 0) {
      this.tint = 0;
    }
  }

  ctx.globalAlpha = 1;
};

function findCenterOfBlocks(arr) {
  if (!arr.length) {
    return { x: 0, y: 0 };
  }

  var state = arr[0].state;
  return geometry.centroid(arr, state.width / 2, state.height / 2);
}

module.exports = {
  Block: Block,
  findCenterOfBlocks: findCenterOfBlocks
};
