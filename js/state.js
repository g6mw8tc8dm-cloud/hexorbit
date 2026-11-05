'use strict';

var GS = {
  START: 0,
  PLAYING: 1,
  GAMEOVER: 2,
  PAUSED: -1,
  HELP: -2,
  SETTINGS: -3,
  CONFIRM_HOME: -4,
  LEADERBOARD: -5,
  PRIVACY: -6,
  AUTH: -7,
  CHALLENGE_PROMPT: -8
};

var SAVE_KEY = 'hextris.save.v1';
var HIGHSCORE_KEY = 'hextris.highscores.v1';
var SETTINGS_KEY = 'hextris.settings.v1';

// 前 4 个是开局的四种颜色；第 5 个在难度达到阈值后加入。
// 具体色值由皮肤系统最终确定，这里先用占位值。
var COLORS = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'];

function createState(platform) {
  var width = platform.width;
  var height = platform.height;

  // 与原网页版移动端参数一致，按屏幕短边缩放
  var baseScale = 1.4;
  var rawScale = Math.min(width, height) / 800 * baseScale;
  var scale = Math.max(0.45, Math.min(rawScale, 2.4));

  var settings = {
    os: 'wechat',
    platform: 'mobile',
    startDist: 227,
    creationDt: 60,
    baseScale: baseScale,
    scale: scale,
    prevScale: scale,
    baseHexWidth: 87,
    hexWidth: 87 * scale,
    baseBlockHeight: 20,
    blockHeight: 20 * scale,
    rows: 7,
    speedModifier: 0.73,
    speedUpKeyHeld: false,
    creationSpeedModifier: 0.73,
    comboTime: 310,
    difficultyMax: 45,
    difficultyGrowth: 2.5
  };

  var state = {
    platform: platform,
    canvas: platform.canvas,
    ctx: platform.ctx,
    width: width,
    height: height,
    dpr: platform.dpr,
    safeTop: platform.safeTop,
    safeBottom: platform.safeBottom,
    safeLeft: platform.safeLeft,
    safeRight: platform.safeRight,

    // UI 字号缩放，和游戏内几何缩放分开；同时受高度约束，避免横屏预览时面板超出屏幕
    uiScale: Math.max(0.9, Math.min(width / 375, height / 667, 1.6)),

    gameState: GS.START,
    helpReturn: GS.START,
    settingsReturn: GS.START,
    leaderboardReturn: GS.START,
    homeReturnState: null,
    prevGameState: GS.START,
    rank: null,
    cloudBest: 0,
    privacyPrompted: false,
    privacyAccepted: false,
    // 微信官方隐私授权状态：needAuthorization 为 true 时必须先弹官方确认
    privacyNeedAuth: false,
    privacyContractName: '',
    authLeaderboard: null,
    pendingChallengeTarget: 0,
    challenge: {
      target: 0,
      active: false,
      result: null
    },

    sound: {
      music: true,
      sfx: true,
      vibrate: true
    },
    audio: null,

    settings: settings,
    colors: COLORS.slice(),
    // 调试用：>0 时强制使用该颜色数，便于真机验证第 5 色（正式对局保持 0）
    debugColorCount: 0,
    hexagonBackgroundColor: '#ecf0f1',
    outerColor: '#bdc3c7',
    centerColor: 'rgb(44,62,80)',
    angularVelocityConst: 4,

    score: 0,
    bestScore: 0,
    highscores: [],
    isNewRecord: false,
    scoreBlocked: false,
    // 广告：单局复活次数与请求状态（广告开关关闭时不会使用）
    reviveUsed: false,
    adBusy: false,
    adNotice: '',
    adNoticeUntil: 0,
    scoreOpacity: 0,
    textOpacity: 0,
    prevScore: 0,

    blocks: [],
    MainHex: null,
    waveone: null,

    gdx: 0,
    gdy: 0,
    rush: 1,
    lastClear: { at: 0, count: 0 },
    lastVibrateAt: 0,

    hasSave: false,
    shareImagePath: null,
    shareImageScore: null,
    startTime: 0,
    lastTime: Date.now(),
    time: 0,
    frameCount: 0
  };

  return state;
}

module.exports = {
  GS: GS,
  SAVE_KEY: SAVE_KEY,
  HIGHSCORE_KEY: HIGHSCORE_KEY,
  SETTINGS_KEY: SETTINGS_KEY,
  COLORS: COLORS,
  createState: createState
};
