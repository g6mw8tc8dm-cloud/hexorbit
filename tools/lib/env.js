'use strict';

// P0 基线测试环境：虚拟时钟 + 固定种子随机 + 最小 wx mock。
// 只用于 tools/ 下的自动化测试，不参与小游戏打包（tools 目录已在 packOptions.ignore）。

var path = require('path');
var rngLib = require('./rng');

var JS_DIR = path.join(__dirname, '..', '..', 'js');

function createCtx() {
  return {
    font: '16px sans-serif',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setTransform: function () {},
    resetTransform: function () {},
    scale: function () {},
    translate: function () {},
    rotate: function () {},
    clearRect: function () {},
    fillRect: function () {},
    strokeRect: function () {},
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
    quadraticCurveTo: function () {},
    bezierCurveTo: function () {},
    arc: function () {},
    arcTo: function () {},
    ellipse: function () {},
    rect: function () {},
    closePath: function () {},
    fill: function () {},
    stroke: function () {},
    clip: function () {},
    save: function () {},
    restore: function () {},
    fillText: function () {},
    strokeText: function () {},
    measureText: function (text) {
      return { width: String(text).length * 8 };
    },
    drawImage: function () {},
    setLineDash: function () {},
    createLinearGradient: function () {
      return { addColorStop: function () {} };
    }
  };
}

function createEnv(options) {
  options = options || {};

  var seed = options.seed === undefined ? 1 : options.seed >>> 0;
  var clock = options.clock === undefined ? 1000000 : options.clock;
  var frameMs = options.frameMs === undefined ? 16.666 : options.frameMs;

  var ctx = createCtx();

  var mainCanvas = {
    width: 0,
    height: 0,
    getContext: function () {
      return ctx;
    }
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

  var sharedCanvas = {
    width: 600,
    height: 880
  };

  var canvasCount = 0;
  var storage = {};
  var touchHandler = null;
  var hideHandler = null;
  var showHandler = null;
  var rafCallback = null;
  var rankMessages = [];
  var cloudWrites = [];
  var cloudStorage = [];

  // 固定时钟与随机源：必须在 require 游戏代码之前生效
  Date.now = function () {
    return clock;
  };
  Math.random = rngLib.mulberry32(seed);

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
      return canvasCount === 1 ? mainCanvas : offscreenCanvas;
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
    clearStorageSync: function () {
      storage = {};
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
    getSetting: function (opts) {
      if (opts && opts.success) {
        opts.success({ authSetting: {} });
      }
    },
    openPrivacyContract: function () {},
    requirePrivacyAuthorize: function (opts) {
      if (opts && opts.success) {
        opts.success();
      }
    },
    getPrivacySetting: function (opts) {
      if (opts && opts.success) {
        opts.success({ needAuthorization: false });
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
    getUserCloudStorage: function (opts) {
      if (opts && opts.success) {
        opts.success({ KVDataList: cloudStorage.slice() });
      }
    },
    setUserCloudStorage: function (opts) {
      cloudWrites.push(opts);
      var list = (opts && opts.KVDataList) || [];
      for (var i = 0; i < list.length; i++) {
        cloudStorage.push(list[i]);
      }
      if (opts && opts.success) {
        opts.success();
      }
    },
    getFriendCloudStorage: function (opts) {
      if (opts && opts.success) {
        opts.success({ data: [] });
      }
    },
    createInnerAudioContext: function () {
      return {
        src: '',
        loop: false,
        volume: 1,
        obeyMuteSwitch: true,
        paused: true,
        play: function () {
          this.paused = false;
        },
        pause: function () {
          this.paused = true;
        },
        stop: function () {
          this.paused = true;
        },
        onError: function () {},
        onEnded: function () {},
        destroy: function () {}
      };
    },
    createRewardedVideoAd: function () {
      return {
        load: function () {
          return Promise.resolve();
        },
        show: function () {
          return Promise.resolve();
        },
        onClose: function () {},
        onError: function () {},
        destroy: function () {}
      };
    },
    createBannerAd: function (opts) {
      var style = (opts && opts.style) || {};
      return {
        style: style,
        show: function () {
          return Promise.resolve();
        },
        hide: function () {
          return Promise.resolve();
        },
        onResize: function () {},
        onError: function () {},
        destroy: function () {}
      };
    }
  };

  global.GameGlobal = global;

  global.requestAnimationFrame = function (cb) {
    rafCallback = cb;
    return 1;
  };

  var env = {
    seed: seed,
    get clock() {
      return clock;
    },
    storage: storage,
    rankMessages: rankMessages,
    cloudWrites: cloudWrites,
    sharedCanvas: sharedCanvas,
    mainCanvas: mainCanvas,
    ctx: ctx,

    // 加载并启动游戏，返回 state
    boot: function () {
      var main = require(path.join(JS_DIR, 'main.js'));
      env.main = main;
      env.state = main.start();
      return env.state;
    },

    // 只加载模块，不启动
    require: function (name) {
      return require(path.join(JS_DIR, name));
    },

    // 推进 n 帧
    step: function (n) {
      n = n || 1;
      for (var i = 0; i < n; i++) {
        clock += frameMs;
        var cb = rafCallback;
        rafCallback = null;
        if (!cb) {
          throw new Error('requestAnimationFrame callback missing');
        }
        cb(clock);
      }
    },

    // 只推进时钟，不跑帧。用于在两次帧之间插入多次触控（例如连续旋转）。
    // 同步平移 lastTime，保证下一帧的 dt 仍然是 1 帧。
    advanceClock: function (ms) {
      var delta = ms || 0;
      clock += delta;
      if (env.state && typeof env.state.lastTime === 'number') {
        env.state.lastTime += delta;
      }
    },

    // 推进一帧并返回耗时（毫秒）
    stepTimed: function () {
      var t0 = process.hrtime.bigint();
      env.step(1);
      var t1 = process.hrtime.bigint();
      return Number(t1 - t0) / 1e6;
    },

    tap: function (x, y) {
      if (!touchHandler) {
        throw new Error('touch handler missing');
      }
      touchHandler({
        touches: [{ clientX: x, clientY: y }],
        changedTouches: [{ clientX: x, clientY: y }]
      });
    },

    tapRect: function (rect) {
      env.tap(rect.x + rect.w / 2, rect.y + rect.h / 2);
    },

    hide: function () {
      if (hideHandler) {
        hideHandler();
      }
    },

    show: function (query) {
      if (showHandler) {
        showHandler(query);
      }
    }
  };

  return env;
}

module.exports = {
  createEnv: createEnv,
  createCtx: createCtx
};
