'use strict';

var PRIVACY_KEY = 'hextris.privacy.v1';
var AUTH_KEY = 'hextris.auth.v1';

function getApi(state) {
  if (state && state.platform && state.platform.api) {
    return state.platform.api;
  }

  return typeof wx !== 'undefined' ? wx : null;
}

function load(state, callback) {
  var privacy = state.platform.storage.get(PRIVACY_KEY, null);
  var auth = state.platform.storage.get(AUTH_KEY, null);

  state.privacyPrompted = !!(privacy && typeof privacy === 'object');
  state.privacyAccepted = !!(privacy && privacy.accepted === true);
  state.privacyNeedAuth = false;
  state.privacyContractName = '';
  state.authLeaderboard = null;

  if (auth && typeof auth.leaderboard === 'boolean') {
    state.authLeaderboard = auth.leaderboard;
  }

  var api = getApi(state);
  var done = false;

  function finish() {
    if (!done) {
      done = true;
      if (callback) {
        callback();
      }
    }
  }

  // 查询微信侧是否还需要用户同意《用户隐私保护指引》。
  // 只有声明了隐私收集类型且用户尚未同意时，needAuthorization 才为 true。
  if (api && api.getPrivacySetting) {
    try {
      api.getPrivacySetting({
        success: function (res) {
          state.privacyNeedAuth = !!(res && res.needAuthorization);
          state.privacyContractName = (res && res.privacyContractName) || '';
          finish();
        },
        fail: finish
      });
      return;
    } catch (e) {
      // ignore
    }
  }

  finish();
}

function needsPrivacyPrompt(state) {
  // 本地拒绝过就不再每次启动重复弹窗；
  // 只有“之前同意过、但微信侧新增了隐私类型”时才需要重新确认。
  return !state.privacyPrompted ||
    (state.privacyNeedAuth === true && state.privacyAccepted === true);
}

/**
 * 本地记录同意，并在需要时调用微信官方隐私授权。
 * 官方弹窗由微信自动展示；用户拒绝时回调 false，游戏仍可继续。
 */
function acceptPrivacy(state, callback) {
  var api = getApi(state);
  var settled = false;

  function settle(ok) {
    if (settled) {
      return;
    }

    settled = true;

    if (ok) {
      state.privacyPrompted = true;
      state.privacyAccepted = true;
      state.privacyNeedAuth = false;

      state.platform.storage.set(PRIVACY_KEY, {
        accepted: true,
        at: Date.now()
      });
    } else {
      declinePrivacy(state);
    }

    if (callback) {
      callback(ok);
    }
  }

  // 老版本基础库或未配置隐私指引时，不需要额外授权
  if (!api || !api.requirePrivacyAuthorize || state.privacyNeedAuth !== true) {
    settle(true);
    return;
  }

  try {
    api.requirePrivacyAuthorize({
      success: function () {
        settle(true);
      },
      fail: function () {
        settle(false);
      }
    });
  } catch (e) {
    settle(true);
  }
}

function openContract(state) {
  var api = getApi(state);

  if (!api || !api.openPrivacyContract) {
    return false;
  }

  try {
    api.openPrivacyContract({
      fail: function () {}
    });
    return true;
  } catch (e) {
    return false;
  }
}

function getContractName(state) {
  return state.privacyContractName || '《星核轮转隐私保护指引》';
}

function declinePrivacy(state) {
  state.privacyPrompted = true;
  state.privacyAccepted = false;
  state.privacyNeedAuth = false;
  state.authLeaderboard = false;

  state.platform.storage.set(PRIVACY_KEY, {
    accepted: false,
    at: Date.now()
  });
  state.platform.storage.set(AUTH_KEY, {
    leaderboard: false,
    at: Date.now()
  });
}

function canUseCloud(state) {
  return state.privacyAccepted === true && state.authLeaderboard === true;
}

function canShowLeaderboard(state) {
  return state.privacyAccepted === true && state.authLeaderboard !== false;
}

function canUseRank(state) {
  return state.privacyAccepted === true && state.authLeaderboard === true;
}

function setLeaderboardAuth(state, allowed) {
  state.authLeaderboard = !!allowed;

  state.platform.storage.set(AUTH_KEY, {
    leaderboard: !!allowed,
    at: Date.now()
  });
}

module.exports = {
  PRIVACY_KEY: PRIVACY_KEY,
  AUTH_KEY: AUTH_KEY,
  load: load,
  needsPrivacyPrompt: needsPrivacyPrompt,
  acceptPrivacy: acceptPrivacy,
  declinePrivacy: declinePrivacy,
  openContract: openContract,
  getContractName: getContractName,
  canUseCloud: canUseCloud,
  canShowLeaderboard: canShowLeaderboard,
  canUseRank: canUseRank,
  setLeaderboardAuth: setLeaderboardAuth
};
