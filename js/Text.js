'use strict';

var renderText = require('./draw').renderText;

function Text(state, x, y, text, font, color, incrementFunction) {
  this.state = state;
  this.x = x;
  this.y = y;
  this.font = font;
  this.color = color;
  this.opacity = 1;
  this.text = text;
  this.alive = 1;
  this.incrementFunction = incrementFunction || fadeUpAndOut;
}

Text.prototype.draw = function () {
  if (this.alive <= 0) {
    return false;
  }

  var state = this.state;
  state.ctx.globalAlpha = this.opacity;
  renderText(
    state,
    this.x + state.gdx,
    this.y + state.gdy,
    50 * state.settings.scale,
    this.color,
    this.text,
    '"PingFang SC","Microsoft YaHei",sans-serif',
    'center',
    'middle'
  );
  state.ctx.globalAlpha = 1;

  this.incrementFunction(this);
  return true;
};

function fadeUpAndOut(text) {
  var dt = text.state.MainHex ? text.state.MainHex.dt : 1;
  text.opacity -= dt * Math.pow(Math.pow(1 - text.opacity, 1 / 3) + 1, 3) / 100;
  text.alive = text.opacity;
  text.y -= 3 * dt;
}

module.exports = {
  Text: Text,
  fadeUpAndOut: fadeUpAndOut
};
