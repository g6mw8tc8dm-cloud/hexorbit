'use strict';

var CARD_W = 500;
var CARD_H = 400;
var FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

function isMiniGame() {
  return typeof GameGlobal !== 'undefined' && typeof wx !== 'undefined';
}

function titleFor(score) {
  return '我拿到 ' + score + ' 分，来挑战我！';
}

function drawHex(ctx, cx, cy, radius, rotation, color) {
  var start = rotation * Math.PI / 180;
  ctx.beginPath();

  for (var i = 0; i < 6; i++) {
    var angle = start + i * Math.PI / 3;
    var x = cx + Math.cos(angle) * radius;
    var y = cy + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCard(ctx, score) {
  var scoreText = String(score);

  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#ecf0f1';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawHex(ctx, 250, 220, 150, 30, '#bdc3c7');
  drawHex(ctx, 250, 220, 70, 30, '#2c3e50');

  // 周围点缀几个色块，和游戏内配色一致
  var colors = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'];
  var positions = [
    [95, 125],
    [405, 125],
    [95, 315],
    [405, 315]
  ];

  for (var i = 0; i < positions.length; i++) {
    drawHex(ctx, positions[i][0], positions[i][1], 20, 30, colors[i]);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#2c3e50';
  ctx.font = '38px ' + FONT;
  ctx.fillText('HEXORBIT', 250, 36);

  ctx.fillStyle = '#7f8c8d';
  ctx.font = '17px ' + FONT;
  ctx.fillText('星核轮转', 250, 68);

  ctx.fillStyle = '#95a5a6';
  ctx.font = '17px ' + FONT;
  ctx.fillText('我拿到', 250, 138);

  ctx.fillStyle = '#2c3e50';
  ctx.font = (scoreText.length >= 7 ? 52 : 66) + 'px ' + FONT;
  ctx.fillText(scoreText, 250, 205);

  ctx.fillStyle = '#3498db';
  ctx.font = '25px ' + FONT;
  ctx.fillText('来挑战我！', 250, 305);

  ctx.fillStyle = '#95a5a6';
  ctx.font = '14px ' + FONT;
  ctx.fillText('微信小游戏', 250, 370);
}

function toFile(canvas, callback) {
  if (canvas.toTempFilePathSync) {
    try {
      var path = canvas.toTempFilePathSync({
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        destWidth: CARD_W,
        destHeight: CARD_H,
        fileType: 'png'
      });
      callback(path || null);
      return;
    } catch (e) {
      // fallback
    }
  }

  if (canvas.toTempFilePath) {
    try {
      canvas.toTempFilePath({
        x: 0,
        y: 0,
        width: CARD_W,
        height: CARD_H,
        destWidth: CARD_W,
        destHeight: CARD_H,
        fileType: 'png',
        success: function (res) {
          callback(res && res.tempFilePath ? res.tempFilePath : null);
        },
        fail: function () {
          callback(null);
        }
      });
      return;
    } catch (e) {
      // fallback
    }
  }

  callback(null);
}

function ensureCard(state, score, callback) {
  callback = callback || function () {};

  if (!isMiniGame() || !wx.createCanvas) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  if (state.shareImageScore === score && state.shareImagePath) {
    callback(state.shareImagePath);
    return;
  }

  var canvas;

  try {
    canvas = wx.createCanvas();
    canvas.width = CARD_W;
    canvas.height = CARD_H;
  } catch (e) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  var ctx = canvas.getContext('2d');
  if (!ctx) {
    state.shareImagePath = null;
    callback(null);
    return;
  }

  drawCard(ctx, score);

  toFile(canvas, function (path) {
    state.shareImageScore = score;
    state.shareImagePath = path;
    callback(path);
  });
}

function getPayload(state) {
  return {
    title: titleFor(state.score),
    imageUrl: state.shareImagePath || '',
    query: 'challengeScore=' + String(state.score)
  };
}

function shareScore(state) {
  ensureCard(state, state.score, function () {
    var payload = getPayload(state);
    state.platform.share(payload);
  });
}

module.exports = {
  titleFor: titleFor,
  ensureCard: ensureCard,
  getPayload: getPayload,
  shareScore: shareScore
};
