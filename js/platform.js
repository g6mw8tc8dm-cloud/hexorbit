'use strict';

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function createPlatform() {
  var api = getApi();
  var info = {};

  // 只读取窗口尺寸、像素比和安全区，不采集设备型号、系统版本等设备信息。
  try {
    if (api && api.getWindowInfo) {
      info = api.getWindowInfo();
    }
  } catch (e) {
    info = {};
  }

  var width = Number(info.windowWidth || info.screenWidth) || 375;
  var height = Number(info.windowHeight || info.screenHeight) || 667;

  // 限制到 2 倍，避免低端机 3 倍屏填充率过高
  var dpr = Math.min(Number(info.pixelRatio) || 1, 2);

  var canvas;
  if (api && api.createCanvas) {
    canvas = api.createCanvas();
  } else if (typeof document !== 'undefined') {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'gameCanvas';
      document.body.appendChild(canvas);
    }
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
  } else {
    throw new Error('当前环境没有 Canvas，请在微信开发者工具中运行');
  }

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  var ctx = canvas.getContext('2d');
  if (ctx.setTransform) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  } else {
    ctx.scale(dpr, dpr);
  }

  var safeArea = info.safeArea || {};
  var safeTop = Math.max(0, Number(safeArea.top) || 0);
  var safeBottom = Math.max(0, height - (Number(safeArea.bottom) || height));
  var safeLeft = Math.max(0, Number(safeArea.left) || 0);
  var safeRight = Math.max(0, width - (Number(safeArea.right) || width));

  var storage = {
    get: function (key, fallback) {
      if (!api || !api.getStorageSync) {
        try {
          var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      }

      try {
        var value = api.getStorageSync(key);
        return value === '' || value === undefined || value === null ? fallback : value;
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      if (!api || !api.setStorageSync) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(value));
          }
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        api.setStorageSync(key, value);
      } catch (e) {
        // ignore
      }
    },
    remove: function (key) {
      if (!api || !api.removeStorageSync) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key);
          }
        } catch (e) {
          // ignore
        }
        return;
      }

      try {
        api.removeStorageSync(key);
      } catch (e) {
        // ignore
      }
    }
  };

  var lastVibrate = 0;

  function vibrate() {
    if (!api || !api.vibrateShort) {
      return;
    }

    var now = Date.now();
    if (now - lastVibrate < 90) {
      return;
    }
    lastVibrate = now;

    // 部分机型不支持 type 参数，失败时退回不带参数调用
    var retried = false;

    function fallback() {
      if (retried) {
        return;
      }
      retried = true;

      try {
        api.vibrateShort();
      } catch (e) {
        // ignore
      }
    }

    try {
      api.vibrateShort({
        type: 'medium',
        fail: fallback
      });
    } catch (e) {
      fallback();
    }
  }

  function onTouchStart(handler) {
    if (api && api.onTouchStart) {
      api.onTouchStart(function (e) {
        var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        if (t) {
          handler(t.clientX, t.clientY);
        }
      });
      return;
    }

    if (typeof document !== 'undefined') {
      var fn = function (e) {
        var t = e.touches ? e.touches[0] : e;
        handler(t.clientX, t.clientY);
      };
      document.addEventListener('touchstart', fn, { passive: true });
      document.addEventListener('mousedown', fn);
    }
  }

  function onHide(handler) {
    if (api && api.onHide) {
      api.onHide(handler);
    }
  }

  function onShow(handler) {
    if (api && api.onShow) {
      api.onShow(function (res) {
        handler(res && res.query);
      });
    }
  }

  function getLaunchQuery() {
    if (!api || !api.getLaunchOptionsSync) {
      return {};
    }

    try {
      var options = api.getLaunchOptionsSync();
      return (options && options.query) || {};
    } catch (e) {
      return {};
    }
  }

  function share(payload) {
    if (!api || !api.shareAppMessage) {
      return;
    }

    payload = payload || {};

    try {
      var options = {
        title: payload.title || '来挑战我的 HEXORBIT 分数！'
      };

      if (payload.imageUrl) {
        options.imageUrl = payload.imageUrl;
      }

      if (payload.query) {
        options.query = payload.query;
      }

      api.shareAppMessage(options);
    } catch (e) {
      // ignore
    }
  }

  function setupShare(getPayload) {
    if (!api) {
      return;
    }

    try {
      if (api.showShareMenu) {
        api.showShareMenu({
          withShareTicket: true,
          menus: ['shareAppMessage', 'shareTimeline']
        });
      }
    } catch (e) {
      // ignore
    }

    try {
      if (api.onShareAppMessage) {
        api.onShareAppMessage(function () {
          var payload = getPayload ? getPayload() : null;
          payload = payload || {};

          var options = {
            title: payload.title || '来挑战我的 HEXORBIT 分数！'
          };

          if (payload.imageUrl) {
            options.imageUrl = payload.imageUrl;
          }

          if (payload.query) {
            options.query = payload.query;
          }

          return options;
        });
      }
    } catch (e) {
      // ignore
    }
  }

  function setKeepScreenOn() {
    if (api && api.setKeepScreenOn) {
      try {
        api.setKeepScreenOn({ keepScreenOn: true });
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    api: api,
    canvas: canvas,
    ctx: ctx,
    width: width,
    height: height,
    dpr: dpr,
    safeTop: safeTop,
    safeBottom: safeBottom,
    safeLeft: safeLeft,
    safeRight: safeRight,
    storage: storage,
    vibrate: vibrate,
    onTouchStart: onTouchStart,
    onHide: onHide,
    onShow: onShow,
    getLaunchQuery: getLaunchQuery,
    share: share,
    setupShare: setupShare,
    setKeepScreenOn: setKeepScreenOn
  };
}

module.exports = {
  createPlatform: createPlatform
};
