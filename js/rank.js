'use strict';

// 与 openDataContext/index.js 中的画布尺寸保持一致
var SHARED_W = 600;
var SHARED_H = 880;
var SUMMARY_H = 240;

function RankBridge(state) {
  this.state = state;
  this.api = typeof wx !== 'undefined' ? wx : null;
  this.enabled = !!(this.api && this.api.getOpenDataContext);
  this.context = null;
  this.canvas = null;
  this.view = null;

  if (!this.enabled) {
    return;
  }

  try {
    this.context = this.api.getOpenDataContext();
    this.canvas = this.context && this.context.canvas;

    if (!this.canvas && this.api.getSharedCanvas) {
      try {
        this.canvas = this.api.getSharedCanvas();
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    this.context = null;
    this.canvas = null;
    this.enabled = false;
  }
}

RankBridge.prototype.post = function (message) {
  if (!this.context || !this.context.postMessage) {
    return;
  }

  try {
    this.context.postMessage(message);
  } catch (e) {
    // ignore
  }
};

RankBridge.prototype.showLeaderboard = function (bestScore) {
  this.view = 'leaderboard';
  this.post({
    type: 'leaderboard',
    best: bestScore || 0,
    width: SHARED_W,
    height: SHARED_H
  });
};

RankBridge.prototype.showGameOver = function (score, bestScore, isNewRecord) {
  this.view = 'gameover';
  this.post({
    type: 'gameover',
    score: score || 0,
    best: bestScore || 0,
    isNewRecord: !!isNewRecord,
    width: SHARED_W,
    height: SHARED_H
  });
};

RankBridge.prototype.hide = function () {
  this.view = null;
  this.post({ type: 'hide' });
};

RankBridge.prototype.draw = function (ctx, rect, view) {
  if (!this.enabled || !this.canvas || this.view !== view) {
    return false;
  }

  var cw = this.canvas.width || SHARED_W;
  var ch = this.canvas.height || SHARED_H;

  if (!cw || !ch) {
    return false;
  }

  // 共享画布可能被客户端重设为屏幕尺寸，摘要区高度需按设计比例换算
  var sourceHeight = view === 'gameover' ? ch * (SUMMARY_H / SHARED_H) : ch;

  try {
    ctx.drawImage(
      this.canvas,
      0,
      0,
      cw,
      sourceHeight,
      rect.x,
      rect.y,
      rect.w,
      rect.h
    );
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  RankBridge: RankBridge,
  SHARED_W: SHARED_W,
  SHARED_H: SHARED_H,
  SUMMARY_H: SUMMARY_H
};
