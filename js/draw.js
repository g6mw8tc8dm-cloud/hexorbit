'use strict';

var rotatePoint = require('./math').rotatePoint;

var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

function drawPolygon(ctx, x, y, sides, radius, theta, fillColor, lineWidth, lineColor) {
  ctx.fillStyle = fillColor;
  ctx.lineWidth = lineWidth || 0;
  ctx.strokeStyle = lineColor || 'rgba(0,0,0,0)';

  ctx.beginPath();
  var coords = rotatePoint(0, radius, theta);
  ctx.moveTo(coords.x + x, coords.y + y);
  var oldX = coords.x;
  var oldY = coords.y;
  for (var i = 0; i < sides; i++) {
    coords = rotatePoint(oldX, oldY, 360 / sides);
    ctx.lineTo(coords.x + x, coords.y + y);
    oldX = coords.x;
    oldY = coords.y;
  }
  ctx.closePath();
  ctx.fill();
  if (lineWidth) {
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0)';
}

function renderText(state, x, y, size, color, text, font, align, baseline) {
  var ctx = state.ctx;
  ctx.save();
  ctx.font = size + 'px ' + (font || FONT);
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillStyle = color;
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawButton(state, rect, label, options) {
  options = options || {};
  var ctx = state.ctx;
  var ui = state.uiScale;
  var radius = options.radius == null ? 14 * ui : options.radius;

  ctx.save();
  ctx.globalAlpha = options.alpha == null ? 1 : options.alpha;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius, options.fill || '#3498db');
  if (options.stroke) {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth || 1;
    ctx.stroke();
  }
  renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    (options.fontSize || 20) * ui,
    options.color || '#ffffff',
    label,
    FONT,
    'center',
    'middle'
  );
  ctx.restore();
}

function drawTextLink(state, rect, label, color) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var size = 14 * ui;
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;

  renderText(state, cx, cy, size, color || '#7f8c8d', label, FONT, 'center', 'middle');

  ctx.save();
  ctx.font = size + 'px ' + FONT;
  var width = ctx.measureText(label).width;
  ctx.strokeStyle = 'rgba(127,140,141,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, cy + size * 0.7);
  ctx.lineTo(cx + width / 2, cy + size * 0.7);
  ctx.stroke();
  ctx.restore();
}

function drawPanel(state, rect, fill, alpha) {
  var ctx = state.ctx;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 20 * state.uiScale, fill || '#ffffff');
  ctx.restore();
}

function drawPauseIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  var bw = 4.5 * ui;
  var bh = 18 * ui;
  fillRoundRect(ctx, cx - 8 * ui, cy - bh / 2, bw, bh, 2 * ui, '#ffffff');
  fillRoundRect(ctx, cx + 3.5 * ui, cy - bh / 2, bw, bh, 2 * ui, '#ffffff');
  ctx.restore();
}

function drawHelpIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  renderText(state, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1 * ui, 24 * ui, '#ffffff', '?', FONT, 'center', 'middle');
  ctx.restore();
}

function drawLeaderboardIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;

  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');
  renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2 + 1 * ui,
    22 * ui,
    '#ffffff',
    '榜',
    FONT,
    'center',
    'middle'
  );
  ctx.restore();
}

function drawSettingsIcon(state, rect) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  var left = cx - 12 * ui;
  var right = cx + 12 * ui;
  var ys = [cy - 7 * ui, cy, cy + 7 * ui];
  var knobs = [cx - 4 * ui, cx + 5 * ui, cx - 1 * ui];

  ctx.save();
  fillRoundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14 * ui, 'rgba(44,62,80,0.72)');

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 * ui;
  ctx.lineCap = 'round';

  for (var i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(left, ys[i]);
    ctx.lineTo(right, ys[i]);
    ctx.stroke();
  }

  for (var j = 0; j < 3; j++) {
    ctx.beginPath();
    ctx.arc(knobs[j], ys[j], 3.6 * ui, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(44,62,80,0.55)';
    ctx.lineWidth = 1 * ui;
    ctx.stroke();
  }

  ctx.restore();
}

function drawToggle(state, rect, on) {
  var ctx = state.ctx;
  var ui = state.uiScale;
  var radius = rect.h / 2;

  ctx.save();
  fillRoundRect(
    ctx,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    radius,
    on ? '#3498db' : '#d5dde5'
  );

  var knobX = on ? rect.x + rect.w - radius : rect.x + radius;
  ctx.beginPath();
  ctx.arc(knobX, rect.y + radius, radius - 3 * ui, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(44,62,80,0.12)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function wrapText(ctx, text, maxWidth) {
  var lines = [];
  var current = '';
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ch === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    var test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

module.exports = {
  FONT: FONT,
  drawPolygon: drawPolygon,
  renderText: renderText,
  roundRect: roundRect,
  fillRoundRect: fillRoundRect,
  drawButton: drawButton,
  drawTextLink: drawTextLink,
  drawPanel: drawPanel,
  drawPauseIcon: drawPauseIcon,
  drawHelpIcon: drawHelpIcon,
  drawLeaderboardIcon: drawLeaderboardIcon,
  drawSettingsIcon: drawSettingsIcon,
  drawToggle: drawToggle,
  wrapText: wrapText
};
