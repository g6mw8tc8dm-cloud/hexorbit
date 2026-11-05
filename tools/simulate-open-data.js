'use strict';

// 开放数据域绘制冒烟测试（不参与上传）
// 用法：node wechat-minigame/tools/simulate-open-data.js

var assert = require('assert');

var texts = [];
var calls = [];
var transform = null;
var messageHandler = null;
var friendData = [
  { nickname: 'A', avatarUrl: '', KVDataList: [{ key: 'hextris_best_v1', value: '100' }] },
  { nickname: 'B', avatarUrl: '', KVDataList: [{ key: 'hextris_best_v1', value: '300' }] },
  { nickname: 'C', avatarUrl: '', KVDataList: [{ key: 'hextris_best_v1', value: '50' }] }
];

var ctx = {
  font: '16px sans-serif',
  fillStyle: '#000',
  textAlign: 'left',
  textBaseline: 'alphabetic',
  clearRect: function () {},
  fillRect: function () {},
  beginPath: function () {},
  moveTo: function () {},
  arcTo: function () {},
  closePath: function () {},
  fill: function () {},
  arc: function () {},
  clip: function () {},
  save: function () {},
  restore: function () {},
  setTransform: function (a, b, c, d, e, f) {
    transform = { a: a, b: b, c: c, d: d, e: e, f: f };
  },
  drawImage: function () {},
  fillText: function (text, x, y) {
    texts.push(String(text));
    calls.push({ text: String(text), x: x, y: y, align: ctx.textAlign });
  },
  measureText: function (text) {
    return { width: String(text).length * 12 };
  }
};

var sharedCanvas = {
  width: 0,
  height: 0,
  getContext: function () {
    return ctx;
  }
};

global.wx = {
  getSharedCanvas: function () {
    return sharedCanvas;
  },
  onMessage: function (handler) {
    messageHandler = handler;
  },
  getFriendCloudStorage: function (options) {
    if (options.success) {
      options.success({ data: friendData });
    }
  },
  createImage: function () {
    return { onload: null, onerror: null, src: '' };
  }
};

require('../openDataContext/index.js');

assert(messageHandler, 'message handler should be registered');
assert.strictEqual(sharedCanvas.width, 600);
assert.strictEqual(sharedCanvas.height, 880);

texts = [];
messageHandler({ type: 'leaderboard', best: 200 });
assert(texts.indexOf('排名') !== -1, 'leaderboard should draw header');
assert(texts.indexOf('B') !== -1, 'leaderboard should draw friend names');
console.log('leaderboard texts:', texts.join(' | '));

texts = [];
messageHandler({ type: 'gameover', score: 200, best: 200, isNewRecord: true });
assert(texts.indexOf('超越 2 位好友') !== -1, 'new record copy should show beaten friends');
assert(texts.indexOf('好友排名 #2 / 4') !== -1, 'new record should show rank');
console.log('gameover texts:', texts.join(' | '));

texts = [];
messageHandler({ type: 'gameover', score: 80, best: 200, isNewRecord: false });
assert(texts.indexOf('好友排名 #2 / 4') !== -1, 'normal summary should show rank');
console.log('normal gameover texts:', texts.join(' | '));

// 空态：文案应水平居中，并整体垂直居中（画布会被拉伸铺满主域内容区）
friendData = [];
texts = [];
calls = [];
messageHandler({ type: 'leaderboard', best: 0 });
assert(texts.indexOf('暂无好友上榜') !== -1, 'empty leaderboard should show empty copy');

var emptyTitle = calls.filter(function (call) { return call.text === '暂无好友上榜'; })[0];
var emptyHint = calls.filter(function (call) { return call.text === '邀请好友一起玩'; })[0];

assert(emptyTitle && emptyHint, 'empty leaderboard should draw two lines');
assert.strictEqual(emptyTitle.x, 300, 'empty copy should be horizontally centered');
assert.strictEqual(emptyTitle.align, 'center', 'empty copy should use center alignment');
assert(Math.abs((emptyTitle.y + emptyHint.y) / 2 - 440) < 0.5, 'empty copy block should be vertically centered');
assert(emptyTitle.y < emptyHint.y, 'title should sit above hint');
console.log('empty leaderboard:', emptyTitle, emptyHint);

texts = [];
calls = [];
messageHandler({ type: 'gameover', score: 0, best: 0, isNewRecord: false });
var summaryTitle = calls.filter(function (call) { return call.text === '暂无好友上榜'; })[0];
var summaryHint = calls.filter(function (call) { return call.text === '邀请好友一起玩'; })[0];
assert(summaryTitle && summaryHint, 'empty summary should draw two lines');
assert(Math.abs((summaryTitle.y + summaryHint.y) / 2 - 120) < 0.5, 'empty summary block should be vertically centered');
console.log('empty gameover:', summaryTitle, summaryHint);

// 加载失败也走空态文案，不把网络错误暴露给玩家
var originalFriendStorage = global.wx.getFriendCloudStorage;
global.wx.getFriendCloudStorage = function (options) {
  if (options.fail) {
    options.fail({ errMsg: 'mock fail' });
  }
};

texts = [];
calls = [];
messageHandler({ type: 'leaderboard', best: 0 });
assert(texts.indexOf('暂无好友上榜') !== -1, 'load failure should fall back to empty copy');
assert(texts.indexOf('好友排行加载失败') === -1, 'failure copy should no longer be drawn');
console.log('load failure fallback:', texts.join(' | '));

global.wx.getFriendCloudStorage = originalFriendStorage;

// 部分客户端会把共享画布重设为屏幕尺寸：绘制坐标仍按 600×880 设计，需用变换缩放
sharedCanvas.width = 390;
sharedCanvas.height = 844;
texts = [];
calls = [];
messageHandler({ type: 'leaderboard', best: 0 });
assert(transform, 'draw should reset the canvas transform');
assert(Math.abs(transform.a - 390 / 600) < 1e-9, 'horizontal scale should match the real canvas width');
assert(Math.abs(transform.d - 844 / 880) < 1e-9, 'vertical scale should match the real canvas height');
assert(texts.indexOf('暂无好友上榜') !== -1, 'empty copy should still be drawn after rescale');
console.log('screen-sized canvas transform:', transform);

messageHandler({ type: 'hide' });

console.log('OK: open data smoke test passed');
