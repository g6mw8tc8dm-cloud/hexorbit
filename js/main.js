'use strict';

var GS = require('./state').GS;
var createState = require('./state').createState;
var createPlatform = require('./platform').createPlatform;
var Hex = require('./Hex').Hex;
var WaveGen = require('./wavegen').WaveGen;
var update = require('./update').update;
var render = require('./render').render;
var setupInput = require('./input').setupInput;
var AudioManager = require('./audio').AudioManager;
var RankBridge = require('./rank').RankBridge;
var cloud = require('./cloud');
var share = require('./share');
var consent = require('./consent');
var guard = require('./guard');
var save = require('./save');
var ads = require('./ads');
var boardApi = require('../core/board');
var colorsApi = require('../core/colors');

var current = null;

var raf = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : function (cb) {
      return setTimeout(function () {
        cb(Date.now());
      }, 16);
    };

function start() {
  var platform = createPlatform();
  var state = createState(platform);
  current = state;

  platform.setupShare(function () {
    return share.getPayload(state);
  });
  platform.setKeepScreenOn();

  // 广告：默认关闭；开启后只会在结算页初始化，不影响对局
  ads.setup(platform);

  save.loadSettings(state);
  state.audio = new AudioManager(state);
  save.loadHighScores(state);
  state.rank = new RankBridge(state);
  consent.load(state, function () {
    // 微信侧新增隐私收集类型、或用户清空过授权时，重新展示隐私面板
    if (
      state.privacyNeedAuth === true &&
      state.privacyAccepted === true &&
      state.gameState === GS.START
    ) {
      state.gameState = GS.PRIVACY;
      if (state.audio) {
        state.audio.pauseBgm();
      }
    }

    if (consent.canUseCloud(state)) {
      cloud.loadBest(state, function (best) {
        if (state.rank && state.gameState === GS.LEADERBOARD) {
          state.rank.showLeaderboard(best);
        }
      });
    }
  });

  // 有存档就先恢复到棋盘上，开始界面显示“继续游戏”
  if (!save.restoreGame(state)) {
    state.MainHex = new Hex(state, state.settings.hexWidth);
    state.waveone = new WaveGen(state, state.MainHex);
  }

  state.gameState = consent.needsPrivacyPrompt(state) ? GS.PRIVACY : GS.START;
  state.lastTime = Date.now();

  var launchTarget = parseChallengeTarget(platform.getLaunchQuery());
  if (launchTarget) {
    state.pendingChallengeTarget = launchTarget;
  }

  if (state.gameState === GS.START) {
    maybeShowChallengePrompt(state);
  }

  // 隐私提示/挑战提示先不播音乐；进入首页后再开始
  if (state.audio) {
    if (state.gameState === GS.PRIVACY || state.gameState === GS.CHALLENGE_PROMPT) {
      state.audio.pauseBgm();
    } else {
      state.audio.unlock();
    }
  }

  setupInput(state, makeActions(state));

  platform.onHide(function () {
    ads.hideBanner();

    if (state.audio) {
      state.audio.pauseBgm();
    }

    if (state.gameState === GS.PLAYING) {
      state.gameState = GS.PAUSED;
      save.saveGame(state);
    } else if (state.gameState === GS.PAUSED) {
      save.saveGame(state);
    }
  });

  platform.onShow(function (query) {
    state.lastTime = Date.now();

    var target = parseChallengeTarget(query);
    if (target) {
      state.pendingChallengeTarget = target;

      if (state.gameState === GS.START) {
        maybeShowChallengePrompt(state);
      }
    }

    if (state.audio && (state.gameState === GS.START || state.gameState === GS.PLAYING)) {
      state.audio.playBgm();
    }

    if (state.rank && state.gameState === GS.LEADERBOARD) {
      state.rank.showLeaderboard(state.bestScore);
    }
  });

  raf(loop);

  // 本地调试入口：在开发者工具控制台可直接跳到指定难度 / 强制颜色数。
  // 只写全局对象，不改变正式玩法；提审前如需隐藏可删除本段。
  if (typeof GameGlobal !== 'undefined') {
    GameGlobal.HEXORBIT = {
      state: state,
      colorCount: function (n) {
        state.debugColorCount = Number(n) || 0;
        return state.debugColorCount;
      },
      difficulty: function (v) {
        if (state.waveone) {
          state.waveone.difficulty = Number(v) || 1;
        }
        return state.waveone ? state.waveone.difficulty : 0;
      },
      unlockAt: function (v) {
        return colorsApi.setUnlockAt(v);
      }
    };
  }

  return state;
}

function makeActions(state) {
  return {
    startNew: function () {
      startNewGame(state);
    },
    continue: function () {
      continueGame(state);
    },
    pause: function () {
      pauseGame(state);
    },
    resume: function () {
      resumeGame(state);
    },
    help: function () {
      openHelp(state);
    },
    closeHelp: function () {
      closeHelp(state);
    },
    leaderboard: function () {
      openLeaderboard(state);
    },
    closeLeaderboard: function () {
      closeLeaderboard(state);
    },
    requestAuth: function () {
      openAuth(state);
    },
    authAllow: function () {
      allowAuth(state);
    },
    authDeny: function () {
      denyAuth(state);
    },
    privacyAgree: function () {
      agreePrivacy(state);
    },
    privacyDecline: function () {
      declinePrivacy(state);
    },
    privacyContract: function () {
      consent.openContract(state);
    },
    acceptChallenge: function () {
      acceptChallenge(state);
    },
    ignoreChallenge: function () {
      ignoreChallenge(state);
    },
    settings: function () {
      openSettings(state);
    },
    closeSettings: function () {
      closeSettings(state);
    },
    toggleMusic: function () {
      state.audio.setMusic(!state.sound.music);
    },
    toggleSfx: function () {
      state.audio.setSfx(!state.sound.sfx);
    },
    toggleVibrate: function () {
      state.audio.setVibrate(!state.sound.vibrate);
    },
    home: function () {
      openHomeConfirm(state);
    },
    cancelHome: function () {
      closeHomeConfirm(state);
    },
    confirmHome: function () {
      goHome(state);
    },
    restart: function () {
      startNewGame(state);
    },
    share: function () {
      share.shareScore(state);
    },
    reviveByAd: function () {
      requestAdRevive(state);
    }
  };
}

function parseChallengeTarget(query) {
  if (!query) {
    return 0;
  }

  var raw = query.challengeScore;
  var target = Number(raw);

  if (!isFinite(target) || Math.floor(target) !== target || target <= 0) {
    return 0;
  }

  if (!guard.validateScore(target)) {
    return 0;
  }

  return target;
}

function maybeShowChallengePrompt(state) {
  if (!state.pendingChallengeTarget || state.gameState !== GS.START) {
    return;
  }

  state.gameState = GS.CHALLENGE_PROMPT;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function acceptChallenge(state) {
  if (state.gameState !== GS.CHALLENGE_PROMPT) {
    return;
  }

  var target = state.pendingChallengeTarget;
  if (!target) {
    ignoreChallenge(state);
    return;
  }

  startNewGame(state);
  state.challenge = {
    target: target,
    active: true,
    result: null
  };
}

function ignoreChallenge(state) {
  if (state.gameState !== GS.CHALLENGE_PROMPT) {
    return;
  }

  state.pendingChallengeTarget = 0;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }
}

function startNewGame(state) {
  save.clearSave(state);
  ads.hideBanner();

  if (state.rank) {
    state.rank.hide();
  }

  state.score = 0;
  state.scoreOpacity = 0;
  state.textOpacity = 0;
  state.prevScore = 0;
  state.blocks = [];
  state.gdx = 0;
  state.gdy = 0;
  state.rush = 1;
  state.lastClear = { at: 0, count: 0 };
  state.lastVibrateAt = 0;
  state.isNewRecord = false;
  state.scoreBlocked = false;
  state.reviveUsed = false;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.shareImagePath = null;
  state.shareImageScore = null;
  state.pendingChallengeTarget = 0;
  state.challenge = {
    target: 0,
    active: false,
    result: null
  };
  state.frameCount = 0;
  state.startTime = Date.now();

  state.settings.prevScale = state.settings.scale;
  state.settings.hexWidth = state.settings.baseHexWidth * state.settings.scale;
  state.settings.blockHeight = state.settings.baseBlockHeight * state.settings.scale;

  state.MainHex = new Hex(state, state.settings.hexWidth);
  state.waveone = new WaveGen(state, state.MainHex);
  state.gameState = GS.PLAYING;
  state.helpReturn = GS.START;
  state.settingsReturn = GS.START;
  state.homeReturnState = null;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.unlock();
  }
}

function continueGame(state) {
  if (!state.hasSave || !state.MainHex) {
    startNewGame(state);
    return;
  }

  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();
  state.rush = 1;

  if (state.audio) {
    state.audio.unlock();
  }
}

function pauseGame(state) {
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  state.gameState = GS.PAUSED;
  save.saveGame(state);

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function resumeGame(state) {
  if (state.gameState !== GS.PAUSED) {
    return;
  }

  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();
  state.rush = 1;

  if (state.audio) {
    state.audio.unlock();
  }
}

function openHelp(state) {
  if (state.gameState === GS.HELP) {
    return;
  }

  if (state.gameState === GS.START) {
    state.helpReturn = GS.START;
  } else {
    if (state.gameState === GS.PLAYING) {
      save.saveGame(state);
    }
    state.helpReturn = GS.PAUSED;
  }

  state.gameState = GS.HELP;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeHelp(state) {
  if (state.gameState !== GS.HELP) {
    return;
  }

  state.gameState = state.helpReturn;
  state.lastTime = Date.now();

  if (state.audio && state.gameState === GS.START) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function agreePrivacy(state) {
  if (state.gameState !== GS.PRIVACY) {
    return;
  }

  // 本地记录 + 微信官方隐私授权；用户拒绝时关闭云榜，但游戏照常进入首页
  consent.acceptPrivacy(state, function (accepted) {
    state.gameState = GS.START;
    state.lastTime = Date.now();

    if (state.audio) {
      state.audio.playBgm();
    }

    maybeShowChallengePrompt(state);

    if (!accepted || !consent.canUseCloud(state)) {
      return;
    }

    cloud.loadBest(state, function (best) {
      if (state.rank && state.gameState === GS.LEADERBOARD) {
        state.rank.showLeaderboard(best);
      }
    });
  });
}

function declinePrivacy(state) {
  if (state.gameState !== GS.PRIVACY) {
    return;
  }

  consent.declinePrivacy(state);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openAuth(state) {
  if (state.gameState !== GS.START || state.privacyAccepted !== true) {
    return;
  }

  state.gameState = GS.AUTH;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function allowAuth(state) {
  if (state.gameState !== GS.AUTH) {
    return;
  }

  consent.setLeaderboardAuth(state, true);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  openLeaderboard(state);
}

function denyAuth(state) {
  if (state.gameState !== GS.AUTH) {
    return;
  }

  consent.setLeaderboardAuth(state, false);
  state.gameState = GS.START;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openLeaderboard(state) {
  if (state.gameState !== GS.START || !consent.canShowLeaderboard(state)) {
    return;
  }

  if (state.authLeaderboard === null) {
    openAuth(state);
    return;
  }

  state.leaderboardReturn = GS.START;
  state.gameState = GS.LEADERBOARD;
  state.lastTime = Date.now();

  if (state.audio) {
    state.audio.pauseBgm();
  }

  if (state.rank) {
    state.rank.showLeaderboard(state.bestScore);
  }

  if (consent.canUseCloud(state)) {
    cloud.loadBest(state, function (best) {
      if (state.rank && state.gameState === GS.LEADERBOARD) {
        state.rank.showLeaderboard(best);
      }
    });
  }
}

function closeLeaderboard(state) {
  if (state.gameState !== GS.LEADERBOARD) {
    return;
  }

  state.gameState = state.leaderboardReturn || GS.START;
  state.lastTime = Date.now();

  if (state.rank) {
    state.rank.hide();
  }

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function openSettings(state) {
  if (state.gameState === GS.SETTINGS) {
    return;
  }

  if (state.gameState === GS.START) {
    state.settingsReturn = GS.START;
  } else {
    if (state.gameState === GS.PLAYING) {
      save.saveGame(state);
    }
    state.settingsReturn = GS.PAUSED;
  }

  state.gameState = GS.SETTINGS;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeSettings(state) {
  if (state.gameState !== GS.SETTINGS) {
    return;
  }

  state.gameState = state.settingsReturn;
  state.lastTime = Date.now();

  if (state.audio) {
    if (state.gameState === GS.START) {
      state.audio.playBgm();
    } else {
      state.audio.pauseBgm();
    }
  }

  maybeShowChallengePrompt(state);
}

function openHomeConfirm(state) {
  if (state.gameState !== GS.PAUSED && state.gameState !== GS.GAMEOVER) {
    return;
  }

  state.homeReturnState = state.gameState;

  if (state.gameState === GS.PAUSED) {
    save.saveGame(state);
  }

  state.gameState = GS.CONFIRM_HOME;

  if (state.audio) {
    state.audio.pauseBgm();
  }
}

function closeHomeConfirm(state) {
  if (state.gameState !== GS.CONFIRM_HOME) {
    return;
  }

  state.gameState = state.homeReturnState;
  state.homeReturnState = null;
  state.lastTime = Date.now();
}

function goHome(state) {
  if (state.gameState !== GS.CONFIRM_HOME) {
    return;
  }

  var from = state.homeReturnState;
  state.homeReturnState = null;
  state.helpReturn = GS.START;
  state.settingsReturn = GS.START;
  state.lastTime = Date.now();

  if (state.rank) {
    state.rank.hide();
  }

  if (from === GS.PAUSED) {
    // 保留当前局面，回到首页后可以“继续上一局”
    state.hasSave = true;
    state.gdx = 0;
    state.gdy = 0;
    state.MainHex.texts = [];
    state.MainHex.shakes = [];
    state.gameState = GS.START;
  } else {
    // 从结束页返回，给一个干净的首页
    save.clearSave(state);

    state.score = 0;
    state.prevScore = 0;
    state.scoreOpacity = 0;
    state.textOpacity = 0;
    state.blocks = [];
    state.gdx = 0;
    state.gdy = 0;
    state.rush = 1;
    state.lastClear = { at: 0, count: 0 };
    state.lastVibrateAt = 0;
    state.isNewRecord = false;
    state.frameCount = 0;
    state.challenge = {
      target: 0,
      active: false,
      result: null
    };
    state.MainHex = new Hex(state, state.settings.hexWidth);
    state.waveone = new WaveGen(state, state.MainHex);
    state.gameState = GS.START;
  }

  if (state.audio) {
    state.audio.playBgm();
  }

  maybeShowChallengePrompt(state);
}

function endGame(state) {
  if (state.gameState !== GS.PLAYING) {
    return;
  }

  state.gameState = GS.GAMEOVER;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.scoreBlocked = !guard.validateScore(state.score);

  if (state.scoreBlocked) {
    state.isNewRecord = false;
    state.challenge.result = null;
  } else {
    save.pushHighScore(state);

    if (state.challenge.active) {
      var diff = state.score - state.challenge.target;
      state.challenge.result = {
        success: diff >= 0,
        diff: diff,
        target: state.challenge.target
      };
    }
  }

  save.clearSave(state);

  if (state.audio) {
    state.audio.playSfx('gameover');
    state.audio.stopBgm();
  }

  if (state.sound.vibrate) {
    state.platform.vibrate();
  }

  if (state.rank && consent.canUseRank(state) && !state.scoreBlocked) {
    state.rank.showGameOver(state.score, state.bestScore, state.isNewRecord);
  } else if (state.rank) {
    state.rank.hide();
  }

  // 提前生成分享卡片，红点和右上角菜单分享也能带上分数图
  share.ensureCard(state, state.score);

  var newRecord = state.isNewRecord;

  if (newRecord && !state.scoreBlocked && consent.canUseCloud(state)) {
    cloud.submitIfRecord(state, state.score, true, function (ok, best) {
      if (best > state.bestScore) {
        state.bestScore = best;
      }

      if (state.gameState === GS.GAMEOVER && state.rank) {
        state.rank.showGameOver(state.score, state.bestScore, true);
      }
    });
  }
}

/**
 * 激励视频复活：保留分数与难度，清空棋盘后继续本局。
 * 只有广告开关打开、且本局还没用过时才允许。
 */
function requestAdRevive(state) {
  if (!ads.canRevive(state) || state.adBusy) {
    return;
  }

  state.adBusy = true;
  state.adNotice = '';
  state.adNoticeUntil = 0;

  ads.showRewarded(function (res) {
    state.adBusy = false;

    if (res && res.ok) {
      reviveGame(state);
      return;
    }

    // 用户取消 / 无库存 / 超时：只给一行提示，不改变结算状态
    state.adNotice = res && res.reason === 'cancel'
      ? '已取消，可直接再来一局'
      : '广告暂时不可用，可直接再来一局';
    state.adNoticeUntil = Date.now() + 4000;
  });
}

function reviveGame(state) {
  if (state.gameState !== GS.GAMEOVER || state.reviveUsed) {
    return false;
  }

  state.reviveUsed = true;
  state.adBusy = false;
  state.adNotice = '';
  state.adNoticeUntil = 0;
  state.scoreOpacity = 0;
  state.textOpacity = 0;
  state.isNewRecord = false;
  state.scoreBlocked = false;
  state.blocks = [];
  state.gdx = 0;
  state.gdy = 0;
  state.rush = 1;
  state.lastClear = { at: 0, count: 0 };
  state.lastVibrateAt = 0;

  if (state.challenge) {
    state.challenge.result = null;
  }

  var difficulty = state.waveone ? state.waveone.difficulty : 1;

  state.MainHex = new Hex(state, state.settings.hexWidth);
  state.MainHex.delay = 45;
  state.waveone = new WaveGen(state, state.MainHex);
  state.waveone.difficulty = difficulty;
  state.gameState = GS.PLAYING;
  state.lastTime = Date.now();

  ads.hideBanner();

  if (state.rank) {
    state.rank.hide();
  }

  if (state.audio) {
    state.audio.unlock();
    state.audio.playBgm();
  }

  return true;
}

function checkGameOver(state) {
  var hex = state.MainHex;
  if (!hex) {
    return false;
  }

  return boardApi.overflow(hex.board, state.settings.rows);
}

function loop(now) {
  var state = current;
  if (!state) {
    return;
  }

  raf(loop);

  if (typeof now !== 'number') {
    now = Date.now();
  }

  var raw = (now - state.lastTime) / 16.666;
  var dt = Math.min(Math.max(raw, 0), 3) * state.rush;
  state.lastTime = now;
  state.time += dt;

  if (state.gameState === GS.PLAYING) {
    state.frameCount++;

    if (state.MainHex.delay > 0) {
      state.MainHex.delay -= 1;
    } else {
      update(state, dt);
    }

    if (state.lastClear.at > state.lastVibrateAt) {
      state.lastVibrateAt = state.lastClear.at;
      if (state.sound.vibrate) {
        state.platform.vibrate();
      }
    }

    if (state.frameCount % 300 === 0) {
      save.saveGame(state);
    }

    if (checkGameOver(state)) {
      endGame(state);
    }
  }

  render(state);

  // Banner 只在结算页出现，其它状态立即隐藏
  ads.syncBanner(state);
}

module.exports = {
  start: start,
  getState: function () {
    return current;
  }
};
