'use strict';

/**
 * 广告占位接入层。
 *
 * 上线策略：
 * - 默认 enabled = false，所有广告接口都不会被调用，游戏完全不依赖广告。
 * - UV 达标、流量主开通后，把 enabled 改成 true，并填入两个广告位 ID 即可。
 * - 只接入两种形式：结算页激励视频复活（用户主动点击）、结算页底部 Banner。
 * - 对局中（PLAYING / PAUSED / 其它弹窗）绝不展示 Banner。
 *
 * 合规约定：
 * - 复活是可选项，不点击也能正常“再来一局 / 返回首页”。
 * - 文案不出现充值、购买、金币、付费等字样，也不做强制或诱导。
 * - 广告加载失败、无库存、用户中途关闭都按“不可用”处理，不阻断游戏。
 */

var GS = require('./state').GS;

var config = {
  // 总开关：上线先关，达标后改 true
  enabled: false,
  // 激励视频广告位 ID（adunit- 开头）
  rewardedUnitId: '',
  // Banner 广告位 ID（adunit- 开头）
  bannerUnitId: '',
  // 单局最多复活次数
  revivePerRun: 1,
  // Banner 预留高度上限（ui 单位）
  bannerMaxReserve: 110,
  // Banner 预留高度占屏高比例
  bannerReserveRatio: 0.16,
  // Banner 最大宽度
  bannerMaxWidth: 360,
  // 激励视频超时兜底（毫秒）
  rewardedTimeout: 12000
};

var api = null;
var rewarded = null;
var rewardedBroken = false;
var pendingCallback = null;
var pendingTimer = null;
var banner = null;
var bannerVisible = false;
var bannerBroken = false;
var bannerHeight = 0;
var screen = { width: 0, height: 0, safeBottom: 0, ui: 1 };

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function setup(platform) {
  api = (platform && platform.api) || getApi();
  rewarded = null;
  rewardedBroken = false;
  banner = null;
  bannerVisible = false;
  bannerBroken = false;
  bannerHeight = 0;
}

function isEnabled() {
  return config.enabled === true;
}

function hasRewarded() {
  return isEnabled() && !!config.rewardedUnitId && !!(api && api.createRewardedVideoAd);
}

function hasBanner() {
  return isEnabled() && !!config.bannerUnitId && !!(api && api.createBannerAd);
}

// ---------- 激励视频 ----------

function finish(result) {
  if (!pendingCallback) {
    return;
  }

  var cb = pendingCallback;
  pendingCallback = null;

  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  try {
    cb(result);
  } catch (e) {
    // 回调异常不能影响游戏主流程
  }
}

function ensureRewarded() {
  if (rewarded || rewardedBroken) {
    return rewarded;
  }

  if (!hasRewarded()) {
    return null;
  }

  try {
    rewarded = api.createRewardedVideoAd({ adUnitId: config.rewardedUnitId });

    rewarded.onError(function () {
      // 加载失败 / 无库存：如果正在等待结果，按不可用结束
      if (pendingCallback) {
        finish({ ok: false, reason: 'unavailable' });
      }
    });

    rewarded.onClose(function (res) {
      var ended = !res || res.isEnded === undefined || res.isEnded === true;
      finish(ended ? { ok: true, reason: 'ended' } : { ok: false, reason: 'cancel' });
    });

    if (rewarded.load) {
      var loading = rewarded.load();
      if (loading && loading.catch) {
        loading.catch(function () {});
      }
    }
  } catch (e) {
    rewarded = null;
    rewardedBroken = true;
  }

  return rewarded;
}

function canRevive(state) {
  return !!state &&
    state.gameState === GS.GAMEOVER &&
    !state.reviveUsed &&
    !state.scoreBlocked &&
    hasRewarded() &&
    !rewardedBroken;
}

function showRewarded(callback) {
  if (typeof callback !== 'function') {
    return;
  }

  // 上一次请求如果还挂着，先按取消收尾，避免回调丢失
  if (pendingCallback) {
    finish({ ok: false, reason: 'busy' });
  }

  var ad = ensureRewarded();
  if (!ad) {
    callback({ ok: false, reason: 'unavailable' });
    return;
  }

  pendingCallback = callback;
  pendingTimer = setTimeout(function () {
    finish({ ok: false, reason: 'timeout' });
  }, config.rewardedTimeout);

  var shown;
  try {
    shown = ad.show();
  } catch (e) {
    finish({ ok: false, reason: 'unavailable' });
    return;
  }

  if (shown && typeof shown.catch === 'function') {
    shown.catch(function () {
      // 首次展示失败时重新拉取一次；仍失败就按不可用处理
      try {
        ad.load().then(function () {
          return ad.show();
        }).catch(function () {
          finish({ ok: false, reason: 'unavailable' });
        });
      } catch (e) {
        finish({ ok: false, reason: 'unavailable' });
      }
    });
  }
}

// ---------- Banner ----------

function bannerSpace(state) {
  if (!state || !hasBanner() || bannerBroken) {
    return 0;
  }

  var ui = state.uiScale || 1;

  // 优先使用 onResize 返回的真实高度；首次展示前先用保守估算值
  var fallback = Math.min(config.bannerMaxReserve * ui, state.height * config.bannerReserveRatio);
  var space = bannerHeight > 0 ? bannerHeight : fallback;

  // 异常广告位高度兜底，最多占屏高 42%
  space = Math.min(space, state.height * 0.42);

  if (space < 1) {
    return 0;
  }

  // 结算面板至少需要 380ui；放不下就放弃本次 Banner，避免遮挡按钮
  var available = state.height - (state.safeTop || 0) - (state.safeBottom || 0) - space - 24 * ui;

  if (available < 380 * ui) {
    return 0;
  }

  return space;
}

function ensureBanner(state) {
  if (banner || bannerBroken) {
    return banner;
  }

  if (!hasBanner()) {
    return null;
  }

  screen.width = state.width;
  screen.height = state.height;
  screen.safeBottom = state.safeBottom || 0;
  screen.ui = state.uiScale || 1;

  var width = Math.min(screen.width - 24 * screen.ui, config.bannerMaxWidth);

  try {
    banner = api.createBannerAd({
      adUnitId: config.bannerUnitId,
      adIntervals: 30,
      style: {
        left: (screen.width - width) / 2,
        top: screen.height - screen.safeBottom,
        width: width
      }
    });

    banner.onResize(function (size) {
      if (!banner) {
        return;
      }

      var w = (size && size.width) || width;
      var h = (size && size.height) || 0;

      // 记录真实高度，下一帧布局会据此重新预留空间
      if (h > 0) {
        bannerHeight = h;
      }

      try {
        banner.style.left = (screen.width - w) / 2;
        banner.style.top = screen.height - screen.safeBottom - (h || bannerHeight || 0);
      } catch (e) {
        // ignore
      }
    });

    banner.onError(function () {
      bannerBroken = true;
      bannerVisible = false;
    });
  } catch (e) {
    banner = null;
    bannerBroken = true;
  }

  return banner;
}

function showBanner(state) {
  if (bannerVisible) {
    return;
  }

  var space = bannerSpace(state);
  if (!space) {
    return;
  }

  var ad = ensureBanner(state);
  if (!ad) {
    return;
  }

  var ui = state.uiScale || 1;
  var width = Math.min(state.width - 24 * ui, config.bannerMaxWidth);

  // 窗口信息可能变化，展示前同步一次
  screen.width = state.width;
  screen.height = state.height;
  screen.safeBottom = state.safeBottom || 0;
  screen.ui = ui;

  try {
    ad.style.left = (state.width - width) / 2;
    ad.style.top = state.height - (state.safeBottom || 0) - space;
    ad.style.width = width;
  } catch (e) {
    // ignore
  }

  bannerVisible = true;

  try {
    var shown = ad.show();
    if (shown && typeof shown.catch === 'function') {
      shown.catch(function () {
        bannerVisible = false;
        bannerBroken = true;
      });
    }
  } catch (e) {
    bannerVisible = false;
    bannerBroken = true;
  }
}

function hideBanner() {
  if (!banner || !bannerVisible) {
    return;
  }

  bannerVisible = false;

  try {
    banner.hide();
  } catch (e) {
    // ignore
  }
}

/**
 * 每帧同步 Banner 可见性：只有结算页允许展示，其余状态一律隐藏。
 */
function syncBanner(state) {
  if (!state) {
    return;
  }

  if (state.gameState === GS.GAMEOVER && bannerSpace(state) > 0) {
    showBanner(state);
  } else {
    hideBanner();
  }
}

function isBannerVisible() {
  return bannerVisible;
}

module.exports = {
  config: config,
  setup: setup,
  isEnabled: isEnabled,
  canRevive: canRevive,
  showRewarded: showRewarded,
  bannerSpace: bannerSpace,
  syncBanner: syncBanner,
  hideBanner: hideBanner,
  isBannerVisible: isBannerVisible
};
