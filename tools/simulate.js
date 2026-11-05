'use strict';

// 仅用于本地 Node 冒烟测试，不参与小游戏上传。
// 用法：node wechat-minigame/tools/simulate.js

var path = require('path');
var assert = require('assert');

var clock = 100000;
Date.now = function () {
  return clock;
};

var canvas = {
  width: 0,
  height: 0,
  getContext: function () {
    return ctx;
  }
};

var ctx = {
  font: '16px sans-serif',
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  lineCap: 'butt',
  globalAlpha: 1,
  textAlign: 'left',
  textBaseline: 'alphabetic',
  setTransform: function () {},
  scale: function () {},
  clearRect: function () {},
  fillRect: function () {},
  beginPath: function () {},
  moveTo: function () {},
  lineTo: function () {},
  closePath: function () {},
  fill: function () {},
  stroke: function () {},
  save: function () {},
  restore: function () {},
  arc: function () {},
  arcTo: function () {},
  fillText: function () {},
  drawImage: function () {},
  measureText: function (text) {
    return { width: String(text).length * 8 };
  }
};

var sharedCanvas = {
  width: 600,
  height: 880
};

var offscreenCanvas = {
  width: 0,
  height: 0,
  getContext: function () {
    return ctx;
  },
  toTempFilePathSync: function () {
    return '/tmp/hextris-share.png';
  }
};

var canvasCount = 0;

var rankMessages = [];
var cloudWrites = [];
var cloudStorage = [];

var storage = {};
var touchHandler = null;
var hideHandler = null;
var showHandler = null;
var rafCallback = null;

// 广告 mock
var rewardedMode = 'ok'; // ok | cancel | throw
var rewardedCloseHandler = null;
var rewardedShowCount = 0;
var bannerShownNow = false;
var bannerShowCount = 0;
var bannerHideCount = 0;
var bannerResizeHandler = null;
var lastBannerAd = null;

global.wx = {
  getWindowInfo: function () {
    return {
      windowWidth: 375,
      windowHeight: 667,
      pixelRatio: 2,
      safeArea: { top: 20, bottom: 667, left: 0, right: 375 }
    };
  },
  createCanvas: function () {
    canvasCount++;
    return canvasCount === 1 ? canvas : offscreenCanvas;
  },
  getStorageSync: function (key) {
    return storage[key] === undefined ? '' : storage[key];
  },
  setStorageSync: function (key, value) {
    storage[key] = value;
  },
  removeStorageSync: function (key) {
    delete storage[key];
  },
  onTouchStart: function (handler) {
    touchHandler = handler;
  },
  onHide: function (handler) {
    hideHandler = handler;
  },
  onShow: function (handler) {
    showHandler = handler;
  },
  showShareMenu: function () {},
  onShareAppMessage: function () {},
  shareAppMessage: function () {},
  vibrateShort: function () {},
  setKeepScreenOn: function () {},
  setInnerAudioOption: function () {},
  getSetting: function (options) {
    if (options && options.success) {
      options.success({ authSetting: {} });
    }
  },
  getOpenDataContext: function () {
    return {
      canvas: sharedCanvas,
      postMessage: function (message) {
        rankMessages.push(message);
      }
    };
  },
  getUserCloudStorage: function (options) {
    if (options && options.success) {
      options.success({ KVDataList: cloudStorage.slice() });
    }
  },
  setUserCloudStorage: function (options) {
    cloudWrites.push(options);
    var list = (options && options.KVDataList) || [];
    for (var i = 0; i < list.length; i++) {
      cloudStorage.push(list[i]);
    }
    if (options && options.success) {
      options.success();
    }
  },
  createInnerAudioContext: function () {
    return {
      src: '',
      loop: false,
      volume: 1,
      obeyMuteSwitch: true,
      paused: true,
      play: function () { this.paused = false; },
      pause: function () { this.paused = true; },
      stop: function () { this.paused = true; },
      onError: function () {},
      destroy: function () {}
    };
  },
  createRewardedVideoAd: function () {
    return {
      load: function () { return Promise.resolve(); },
      show: function () {
        rewardedShowCount++;
        if (rewardedMode === 'throw') {
          throw new Error('mock ad unavailable');
        }
        if (rewardedCloseHandler) {
          rewardedCloseHandler({ isEnded: rewardedMode !== 'cancel' });
        }
        return Promise.resolve();
      },
      onClose: function (cb) { rewardedCloseHandler = cb; },
      onError: function () {},
      destroy: function () {}
    };
  },
  createBannerAd: function (options) {
    var style = (options && options.style) || {};
    var ad = {
      style: style,
      show: function () { bannerShownNow = true; bannerShowCount++; return Promise.resolve(); },
      hide: function () { bannerShownNow = false; bannerHideCount++; return Promise.resolve(); },
      onResize: function (cb) { bannerResizeHandler = cb; },
      onError: function () {},
      destroy: function () {}
    };
    lastBannerAd = ad;
    return ad;
  }
};

global.GameGlobal = global;

global.requestAnimationFrame = function (cb) {
  rafCallback = cb;
  return 1;
};

var main = require(path.join(__dirname, '..', 'js', 'main.js'));
var layoutApi = require(path.join(__dirname, '..', 'js', 'ui.js'));
var save = require(path.join(__dirname, '..', 'js', 'save.js'));
var consent = require(path.join(__dirname, '..', 'js', 'consent.js'));
var guard = require(path.join(__dirname, '..', 'js', 'guard.js'));
var share = require(path.join(__dirname, '..', 'js', 'share.js'));
var Block = require(path.join(__dirname, '..', 'js', 'Block.js')).Block;
var adsApi = require(path.join(__dirname, '..', 'js', 'ads.js'));
var boardApi = require(path.join(__dirname, '..', 'core', 'board.js'));

// 测试用棋盘辅助：避免断言直接依赖内部数据结构
function laneCount(side) {
  return boardApi.count(state.MainHex.board, side);
}

function laneAt(side, level) {
  return boardApi.at(state.MainHex.board, side, level);
}

function attachedTotal() {
  var n = 0;
  boardApi.forEach(state.MainHex.board, function () {
    n++;
  });
  return n;
}

function clearBoard() {
  state.MainHex.board = boardApi.create(6);
}

function attachToLane(side, block) {
  boardApi.push(state.MainHex.board, side, block);
}

// 测试时打开广告总开关，验证占位 SDK 与异常分支
adsApi.config.enabled = true;
adsApi.config.rewardedUnitId = 'adunit-test-rewarded';
adsApi.config.bannerUnitId = 'adunit-test-banner';

var state = main.start();

function step(n) {
  n = n || 1;
  for (var i = 0; i < n; i++) {
    clock += 16.666;
    var cb = rafCallback;
    rafCallback = null;
    assert(cb, 'requestAnimationFrame callback missing');
    cb(clock);
  }
}

function tap(x, y) {
  assert(touchHandler, 'touch handler missing');
  touchHandler({ touches: [{ clientX: x, clientY: y }] });
}

function tapRect(rect) {
  tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function center(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

// 在 0 号槽位堆满 9 层，稳定触发游戏结束
function forceGameOver(score) {
  state.score = score;
  state.blocks.length = 0;
  state.MainHex.board = boardApi.create(6);

  var s = state.settings;
  for (var i = 0; i < 9; i++) {
    var b = new Block(state, 0, '#e74c3c', 1, s.hexWidth / 2 * Math.sqrt(3) + i * s.blockHeight, true);
    b.attachedLane = 0;
    b.settled = 1;
    b.checked = 0;
    b.initializing = 0;
    b.height = s.blockHeight;
    boardApi.push(state.MainHex.board, 0, b);
  }

  step(1);
}

// 1. 首次启动隐私提示
assert.strictEqual(state.gameState, -6, 'first launch should show privacy prompt');
assert.strictEqual(state.audio.bgmPlaying, false, 'privacy prompt should pause bgm');
step(30);

var layout = layoutApi.getLayout(state);
tapRect(layout.privacyAgree);
assert.strictEqual(state.gameState, 0, 'agree privacy should return home');
assert.strictEqual(state.audio.bgmPlaying, true, 'home should play bgm after privacy');
assert.strictEqual(consent.canShowLeaderboard(state), true, 'leaderboard should be available after consent');

// 1.0 授权提示与好友排行榜
assert.strictEqual(state.rank.enabled, true, 'rank bridge should be enabled');
assert.strictEqual(state.authLeaderboard, null, 'first leaderboard open should ask for auth');

tapRect(layout.homeLeaderboardLink);
assert.strictEqual(state.gameState, -7, 'leaderboard should ask for auth first');
assert.strictEqual(state.audio.bgmPlaying, false, 'auth prompt should pause bgm');

layout = layoutApi.getLayout(state);
tapRect(layout.authDeny);
assert.strictEqual(state.gameState, 0, 'deny auth should return home');
assert.strictEqual(consent.canShowLeaderboard(state), false, 'denied auth should hide leaderboard entry');
assert.strictEqual(state.audio.bgmPlaying, true, 'deny auth should resume bgm');

// 再模拟一次允许授权
state.authLeaderboard = null;
layout = layoutApi.getLayout(state);
tapRect(layout.homeLeaderboardLink);
assert.strictEqual(state.gameState, -7, 'leaderboard should ask for auth again');
layout = layoutApi.getLayout(state);
tapRect(layout.authAllow);
assert.strictEqual(state.gameState, -5, 'allowing auth should open leaderboard');
assert.strictEqual(rankMessages[rankMessages.length - 1].type, 'leaderboard', 'leaderboard message should be sent');

layout = layoutApi.getLayout(state);
tapRect(layout.leaderboardBack);
assert.strictEqual(state.gameState, 0, 'leaderboard back should return home');
assert.strictEqual(rankMessages[rankMessages.length - 1].type, 'hide', 'leaderboard hide message should be sent');
assert.strictEqual(state.audio.bgmPlaying, true, 'home should resume bgm after leaderboard');

layout = layoutApi.getLayout(state);

// 1.1 设置面板与音频开关
tapRect(layout.homeSettingsLink);
assert.strictEqual(state.gameState, -3, 'settings should open');

layout = layoutApi.getLayout(state);
tapRect(layout.musicToggle);
assert.strictEqual(state.sound.music, false, 'music toggle should turn off');
tapRect(layout.musicToggle);
assert.strictEqual(state.sound.music, true, 'music toggle should turn on');

tapRect(layout.sfxToggle);
assert.strictEqual(state.sound.sfx, false, 'sfx toggle should turn off');
tapRect(layout.sfxToggle);
assert.strictEqual(state.sound.sfx, true, 'sfx toggle should turn on');

tapRect(layout.vibrateToggle);
assert.strictEqual(state.sound.vibrate, false, 'vibrate toggle should turn off');
tapRect(layout.vibrateToggle);
assert.strictEqual(state.sound.vibrate, true, 'vibrate toggle should turn on');
assert(storage['hextris.settings.v1'], 'audio settings should persist');

// 不支持 type 参数的机型：失败时应回退到无参数调用
clock += 200;
var vibrateCalls = [];
var originalVibrateShort = state.platform.api.vibrateShort;

state.platform.api.vibrateShort = function (options) {
  vibrateCalls.push(options || null);
  if (options && options.fail) {
    options.fail({ errMsg: 'vibrateShort:fail' });
  }
};

state.platform.vibrate();
state.platform.api.vibrateShort = originalVibrateShort;

assert.strictEqual(vibrateCalls.length, 2, 'vibrate should retry without type');
assert.strictEqual(vibrateCalls[0].type, 'medium', 'first vibrate attempt should pass a type');
assert.strictEqual(vibrateCalls[1], null, 'vibrate fallback should call without options');

tapRect(layout.settingsDone);
assert.strictEqual(state.gameState, 0, 'closing settings should return to start');

layout = layoutApi.getLayout(state);
tapRect(layout.startNew);
assert.strictEqual(state.gameState, 1, 'tap start should enter playing state');
assert.strictEqual(state.audio.bgmPlaying, true, 'bgm should play after starting');

// 2. 跑 1200 帧，确认出块 / 渲染 / 碰撞没有异常
step(1200);
assert(state.MainHex.ct > 0, 'hex clock should advance');
assert(state.MainHex.board.sides === 6, 'hex should have 6 lanes');
console.log('after 1200 frames:',
  'score=', state.score,
  'falling=', state.blocks.length,
  'attached=', attachedTotal());

// 2.1 消除与计分
var consolidateBlocks = require(path.join(__dirname, '..', 'js', 'checking.js')).consolidateBlocks;
clearBoard();
state.blocks.length = 0;
state.MainHex.ct = 1000;
state.MainHex.lastCombo = 1000 - 310;
state.MainHex.lastColorScored = '#e74c3c';

var settings = state.settings;

for (var bi = 0; bi < 3; bi++) {
  var sb = new Block(state, 0, '#e74c3c', 1, settings.hexWidth / 2 * Math.sqrt(3) + bi * settings.blockHeight, true);
  sb.attachedLane = 0;
  sb.settled = 1;
  sb.checked = 0;
  sb.initializing = 0;
  sb.height = settings.blockHeight;
  attachToLane(0, sb);
}

var beforeScore = state.score;
consolidateBlocks(state, state.MainHex, 0, 0);
assert.strictEqual(state.score, beforeScore + 9, '3 same-color blocks should add 9 points');

var deletedCount = 0;
for (var di = 0; di < laneCount(0); di++) {
  if (laneAt(0, di).deleted === 1) {
    deletedCount++;
  }
}
assert.strictEqual(deletedCount, 3, '3 blocks should be marked deleted');
step(30);
assert.strictEqual(laneCount(0), 0, 'deleted blocks should be removed after fade');

// 3. 左右点击旋转
layout = layoutApi.getLayout(state);
for (var i = 0; i < 6; i++) {
  tap(40, state.height / 2);
  step(6);
  tap(state.width - 40, state.height / 2);
  step(6);
}
assert(state.MainHex.position >= 0 && state.MainHex.position < 6, 'position should stay in range');

// 4. 暂停 / 继续
layout = layoutApi.getLayout(state);
tapRect(layout.pauseBtn);
assert.strictEqual(state.gameState, -1, 'pause should set state -1');
assert(storage['hextris.save.v1'], 'pause should create a save');
assert.strictEqual(state.audio.bgmPlaying, false, 'pause should stop bgm');
step(10);

layout = layoutApi.getLayout(state);
tapRect(layout.settingsInPause);
assert.strictEqual(state.gameState, -3, 'pause page settings should open');
layout = layoutApi.getLayout(state);
tapRect(layout.settingsDone);
assert.strictEqual(state.gameState, -1, 'closing pause settings should return to pause');

layout = layoutApi.getLayout(state);
tapRect(layout.resume);
assert.strictEqual(state.gameState, 1, 'resume should set state 1');
assert.strictEqual(state.audio.bgmPlaying, true, 'resume should restart bgm');

// 4.1 返回首页：取消 -> 保存并返回 -> 首页继续游戏
layout = layoutApi.getLayout(state);
tapRect(layout.pauseBtn);
assert.strictEqual(state.gameState, -1, 'pause again before home test');

layout = layoutApi.getLayout(state);
tapRect(layout.homeFromPause);
assert.strictEqual(state.gameState, -4, 'pause home should ask for confirmation');

layout = layoutApi.getLayout(state);
tapRect(layout.confirmCancel);
assert.strictEqual(state.gameState, -1, 'cancel should return to pause');

layout = layoutApi.getLayout(state);
tapRect(layout.homeFromPause);
layout = layoutApi.getLayout(state);
tapRect(layout.confirmOk);
assert.strictEqual(state.gameState, 0, 'confirm home should return to start');
assert.strictEqual(state.hasSave, true, 'home from pause should keep save');
assert.strictEqual(state.audio.bgmPlaying, true, 'home screen should play bgm');

layout = layoutApi.getLayout(state);
tapRect(layout.continueLink);
assert.strictEqual(state.gameState, 1, 'continue should resume saved game');

// 5. 暂停页帮助 / 返回
layout = layoutApi.getLayout(state);
tapRect(layout.pauseBtn);
assert.strictEqual(state.gameState, -1, 'pause before help');

layout = layoutApi.getLayout(state);
tapRect(layout.helpInPause);
assert.strictEqual(state.gameState, -2, 'help should set state -2');
step(5);
tapRect(layout.back);
assert.strictEqual(state.gameState, -1, 'closing help should return to pause');

// 6. 暂停页重新开始
layout = layoutApi.getLayout(state);
tapRect(layout.restart);
assert.strictEqual(state.gameState, 1, 'restart should start playing');
assert.strictEqual(state.score, 0, 'restart should reset score');

// 7. 构造 9 层方块，触发游戏结束
var settings = state.settings;
state.score = 1234;
for (var k = 0; k < 9; k++) {
  var b = new Block(state, 0, '#e74c3c', 1, settings.hexWidth / 2 * Math.sqrt(3) + k * settings.blockHeight, true);
  b.attachedLane = 0;
  b.settled = 1;
  b.checked = 0;
  b.initializing = 0;
  b.height = settings.blockHeight;
  attachToLane(0, b);
}
step(1);
assert.strictEqual(state.gameState, 2, 'overflowing lane should trigger game over');
assert.strictEqual(state.audio.bgmPlaying, false, 'game over should stop bgm');
assert.strictEqual(rankMessages[rankMessages.length - 1].type, 'gameover', 'game over rank message should be sent');
assert.strictEqual(state.shareImagePath, '/tmp/hextris-share.png', 'share card should be generated');
assert.strictEqual(share.getPayload(state).query, 'challengeScore=1234', 'share query should carry score');
assert(cloudWrites.length > 0, 'new record should write cloud storage');
assert.strictEqual(cloudWrites[cloudWrites.length - 1].KVDataList[0].key, 'hextris_best_v1', 'cloud key should match');
step(5);

// 8. 游戏结束页返回首页
layout = layoutApi.getLayout(state);
tapRect(layout.homeFromOver);
assert.strictEqual(state.gameState, -4, 'game over home should ask for confirmation');

layout = layoutApi.getLayout(state);
tapRect(layout.confirmCancel);
assert.strictEqual(state.gameState, 2, 'cancel should return to game over');

layout = layoutApi.getLayout(state);
tapRect(layout.homeFromOver);
layout = layoutApi.getLayout(state);
tapRect(layout.confirmOk);
assert.strictEqual(state.gameState, 0, 'confirm home should return to clean start');
assert.strictEqual(state.hasSave, false, 'home from game over should have no save');
assert.strictEqual(state.score, 0, 'home from game over should reset score');
assert.strictEqual(
  attachedTotal(),
  0,
  'home from game over should clear board'
);
assert.strictEqual(state.audio.bgmPlaying, true, 'home screen should restart bgm');

layout = layoutApi.getLayout(state);
tapRect(layout.startNew);
assert.strictEqual(state.gameState, 1, 'new game should start from home');
assert.strictEqual(state.audio.bgmPlaying, true, 'new game should play bgm');
step(200);

// 9. 存档 / 读档
state.score = 1234;
state.gameState = -1;
save.saveGame(state);
var savedScore = state.score;
var savedBlocks = attachedTotal();

state.score = 0;
state.MainHex = null;
state.blocks = [];
assert.strictEqual(save.restoreGame(state), true, 'restore should succeed');
assert.strictEqual(state.score, savedScore, 'score should restore');
assert.strictEqual(
  attachedTotal(),
  savedBlocks,
  'attached block count should restore'
);

// 9.1 超过 3 小时的旧存档应被忽略并删除
state.gameState = -1;
save.saveGame(state);
var stale = storage['hextris.save.v1'];
stale.savedAt = clock - 4 * 60 * 60 * 1000;
storage['hextris.save.v1'] = stale;
state.MainHex = null;
assert.strictEqual(save.restoreGame(state), false, 'stale save should be ignored');
assert.strictEqual(storage['hextris.save.v1'], undefined, 'stale save should be removed');

// 9.2 云端最高分不能被本地低分覆盖
state.bestScore = 1000;
state.highscores = [];
state.score = 800;
save.pushHighScore(state);
assert.strictEqual(state.bestScore, 1000, 'lower local score should not overwrite cloud best');
assert.strictEqual(state.isNewRecord, false, 'lower score is not a new record');

// 9.3 异常高分与隐私拒绝
assert.strictEqual(guard.validateScore(1000001), false, 'absurd score should be rejected');
assert.strictEqual(guard.validateScore(1234), true, 'normal score should pass');

// 9.4 挑战分享：忽略 -> 接受 -> 挑战结算
state.gameState = 0;
state.pendingChallengeTarget = 0;
state.hasSave = false;

showHandler({ query: { challengeScore: '1234' } });
assert.strictEqual(state.gameState, -8, 'challenge query should open prompt');
assert.strictEqual(state.pendingChallengeTarget, 1234, 'challenge target should be parsed');

layout = layoutApi.getLayout(state);
tapRect(layout.challengeIgnore);
assert.strictEqual(state.gameState, 0, 'ignore challenge should return home');

showHandler({ query: { challengeScore: '1234' } });
assert.strictEqual(state.gameState, -8, 'challenge prompt should open again');

layout = layoutApi.getLayout(state);
tapRect(layout.challengeAccept);
assert.strictEqual(state.gameState, 1, 'accept challenge should start a new game');
assert.strictEqual(state.challenge.active, true, 'challenge should be active');
assert.strictEqual(state.challenge.target, 1234, 'challenge target should be stored');

state.score = 1500;
for (var ci = 0; ci < 9; ci++) {
  var cb = new Block(state, 0, '#e74c3c', 1, settings.hexWidth / 2 * Math.sqrt(3) + ci * settings.blockHeight, true);
  cb.attachedLane = 0;
  cb.settled = 1;
  cb.checked = 0;
  cb.initializing = 0;
  cb.height = settings.blockHeight;
  attachToLane(0, cb);
}
step(1);
assert.strictEqual(state.gameState, 2, 'challenge run should end');
assert.strictEqual(state.challenge.result.success, true, 'challenge should succeed');
assert.strictEqual(state.challenge.result.diff, 266, 'challenge diff should match');

consent.declinePrivacy(state);
assert.strictEqual(consent.canShowLeaderboard(state), false, 'privacy decline should hide leaderboard');
assert.strictEqual(consent.canUseCloud(state), false, 'privacy decline should disable cloud');

state.gameState = 0;
step(5);

// 10. 广告：激励视频复活 + Banner 只在结算页出现
assert.strictEqual(adsApi.config.enabled, true, 'ads switch should be on in test');
assert.strictEqual(adsApi.canRevive(state), false, 'revive should not be available outside game over');

layout = layoutApi.getLayout(state);
tapRect(layout.startNew);
assert.strictEqual(state.gameState, 1, 'ad test game should start');
assert.strictEqual(bannerShownNow, false, 'banner must not show during play');

forceGameOver(800);
assert.strictEqual(state.gameState, 2, 'ad test should reach game over');
assert.strictEqual(adsApi.canRevive(state), true, 'revive should be available');
assert.strictEqual(state.reviveUsed, false, 'revive should start unused');
assert.strictEqual(bannerShownNow, true, 'banner should show on game over');
assert.strictEqual(adsApi.isBannerVisible(), true, 'banner should be marked visible');

state.waveone.difficulty = 12;
var reviveScore = state.score;

rewardedMode = 'ok';
layout = layoutApi.getLayout(state);
tapRect(layout.overRevive);
assert.strictEqual(state.gameState, 1, 'finished rewarded video should revive');
assert.strictEqual(state.reviveUsed, true, 'revive should be limited to once per run');
assert.strictEqual(state.score, reviveScore, 'revive should keep the score');
assert.strictEqual(state.waveone.difficulty, 12, 'revive should keep difficulty');
assert.strictEqual(
  attachedTotal(),
  0,
  'revive should clear the board'
);
step(2);
assert.strictEqual(bannerShownNow, false, 'banner must hide when playing again');

forceGameOver(900);
assert.strictEqual(state.gameState, 2, 'revived run should end again');
assert.strictEqual(adsApi.canRevive(state), false, 'used revive should hide the entry');
layout = layoutApi.getLayout(state);
tapRect(layout.overRevive);
assert.strictEqual(state.gameState, 2, 'revive slot should be inert after use');

// 用户中途关闭：不复活、不消耗次数、给出提示
layout = layoutApi.getLayout(state);
tapRect(layout.playAgain);
assert.strictEqual(state.gameState, 1, 'play again should start');
forceGameOver(500);
rewardedMode = 'cancel';
layout = layoutApi.getLayout(state);
tapRect(layout.overRevive);
assert.strictEqual(state.gameState, 2, 'cancelled video should keep game over');
assert.strictEqual(state.reviveUsed, false, 'cancelled video should not consume revive');
assert(state.adNotice.indexOf('取消') >= 0, 'cancel should show a notice');
assert.strictEqual(state.adBusy, false, 'cancel should release busy state');

// 广告加载异常：不阻断游戏
layout = layoutApi.getLayout(state);
tapRect(layout.playAgain);
forceGameOver(400);
rewardedMode = 'throw';
layout = layoutApi.getLayout(state);
tapRect(layout.overRevive);
assert.strictEqual(state.gameState, 2, 'failed ad should not revive');
assert.strictEqual(state.adBusy, false, 'failed ad should release busy state');
assert(state.adNotice.length > 0, 'failed ad should show a notice');
step(2);
assert.strictEqual(bannerShownNow, true, 'banner can still show after ad failure');

// 总开关关闭：复活入口和 Banner 预留位一起消失
adsApi.config.enabled = false;
assert.strictEqual(adsApi.canRevive(state), false, 'disabled switch should hide revive');
assert.strictEqual(adsApi.bannerSpace(state), 0, 'disabled switch should not reserve banner');
layout = layoutApi.getLayout(state);
assert.strictEqual(layout.overScale, 1, 'panel should return to normal height without ads');
adsApi.config.enabled = true;

// 12. Banner 实测高度回写：结算面板始终在 Banner 上方
assert(bannerResizeHandler, 'banner resize handler should be registered');

bannerResizeHandler({ width: 351, height: 200 });
layout = layoutApi.getLayout(state);

var panelBottom = layout.overPanel.y + layout.overPanel.h;
var bannerTop = state.height - (state.safeBottom || 0) - 200;

assert(panelBottom <= bannerTop, 'game over panel should stay above the banner');
assert.strictEqual(lastBannerAd.style.top, bannerTop, 'banner should use the measured height');
assert(layout.overScale < 1, 'panel should shrink for a taller banner');

step(2);
assert.strictEqual(bannerShownNow, true, 'measured banner should keep showing');

// 11. 微信官方隐私授权：同意 / 拒绝都不阻断游戏
var requireCalls = 0;
var contractOpened = 0;

state.platform.api.openPrivacyContract = function () {
  contractOpened++;
};

state.gameState = -6;
layout = layoutApi.getLayout(state);
tapRect(layout.privacyLink);
assert.strictEqual(contractOpened, 1, 'privacy link should open the official contract');

state.privacyNeedAuth = true;
state.authLeaderboard = null;
state.platform.api.requirePrivacyAuthorize = function (options) {
  requireCalls++;
  options.success();
};

var privacyResult = null;
consent.acceptPrivacy(state, function (ok) {
  privacyResult = ok;
});
assert.strictEqual(requireCalls, 1, 'official privacy authorize should be requested');
assert.strictEqual(privacyResult, true, 'accepted official privacy should proceed');
assert.strictEqual(consent.canShowLeaderboard(state), true, 'official consent should enable leaderboard');

state.privacyNeedAuth = true;
state.platform.api.requirePrivacyAuthorize = function (options) {
  options.fail();
};
consent.acceptPrivacy(state, function (ok) {
  privacyResult = ok;
});
assert.strictEqual(privacyResult, false, 'official privacy refusal should be reported');
assert.strictEqual(consent.canUseCloud(state), false, 'official refusal should disable cloud');
assert.strictEqual(consent.canShowLeaderboard(state), false, 'official refusal should hide leaderboard');
assert.strictEqual(consent.needsPrivacyPrompt(state), false, 'refusal should not loop the prompt');

if (hideHandler) {
  hideHandler();
}
if (showHandler) {
  showHandler();
}

console.log('OK: smoke test passed');
