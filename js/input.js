'use strict';

var GS = require('./state').GS;
var getLayout = require('./ui').getLayout;
var pointInRect = require('./ui').pointInRect;
var ads = require('./ads');

function setupInput(state, actions) {
  state.platform.onTouchStart(function (x, y) {
    handleTap(state, actions, x, y);
  });
}

function click(state) {
  if (state.audio) {
    state.audio.playSfx('click');
  }
}

function handleTap(state, actions, x, y) {
  var layout = getLayout(state);

  if (state.gameState === GS.START) {
    if (pointInRect(x, y, layout.homeHelpLink)) {
      click(state);
      actions.help();
      return;
    }
    if (state.privacyAccepted === true && state.authLeaderboard !== false && pointInRect(x, y, layout.homeLeaderboardLink)) {
      click(state);
      if (state.authLeaderboard === null) {
        actions.requestAuth();
      } else {
        actions.leaderboard();
      }
      return;
    }
    if (pointInRect(x, y, layout.homeSettingsLink)) {
      click(state);
      actions.settings();
      return;
    }
    if (state.hasSave && pointInRect(x, y, layout.continueLink)) {
      click(state);
      actions.continue();
      return;
    }
    if (pointInRect(x, y, layout.startNew)) {
      click(state);
      actions.startNew();
    }
    return;
  }

  if (state.gameState === GS.PLAYING) {
    if (pointInRect(x, y, layout.pauseBtn)) {
      click(state);
      actions.pause();
      return;
    }

    if (state.MainHex) {
      if (x < state.width / 2) {
        state.MainHex.rotate(1);
      } else {
        state.MainHex.rotate(-1);
      }
    }
    return;
  }

  if (state.gameState === GS.PAUSED) {
    if (pointInRect(x, y, layout.resume)) {
      click(state);
      actions.resume();
      return;
    }
    if (pointInRect(x, y, layout.restart)) {
      click(state);
      actions.restart();
      return;
    }
    if (pointInRect(x, y, layout.helpInPause)) {
      click(state);
      actions.help();
      return;
    }
    if (pointInRect(x, y, layout.settingsInPause)) {
      click(state);
      actions.settings();
      return;
    }
    if (pointInRect(x, y, layout.homeFromPause)) {
      click(state);
      actions.home();
    }
    return;
  }

  if (state.gameState === GS.SETTINGS) {
    if (pointInRect(x, y, layout.musicRow)) {
      click(state);
      actions.toggleMusic();
      return;
    }
    if (pointInRect(x, y, layout.sfxRow)) {
      click(state);
      actions.toggleSfx();
      return;
    }
    if (pointInRect(x, y, layout.vibrateRow)) {
      click(state);
      actions.toggleVibrate();
      return;
    }
    if (pointInRect(x, y, layout.settingsDone)) {
      click(state);
      actions.closeSettings();
    }
    return;
  }

  if (state.gameState === GS.CHALLENGE_PROMPT) {
    if (pointInRect(x, y, layout.challengeIgnore)) {
      click(state);
      actions.ignoreChallenge();
      return;
    }
    if (pointInRect(x, y, layout.challengeAccept)) {
      click(state);
      actions.acceptChallenge();
    }
    return;
  }

  if (state.gameState === GS.PRIVACY) {
    if (pointInRect(x, y, layout.privacyLink)) {
      click(state);
      actions.privacyContract();
      return;
    }
    if (pointInRect(x, y, layout.privacyDecline)) {
      click(state);
      actions.privacyDecline();
      return;
    }
    if (pointInRect(x, y, layout.privacyAgree)) {
      click(state);
      actions.privacyAgree();
    }
    return;
  }

  if (state.gameState === GS.AUTH) {
    if (pointInRect(x, y, layout.authDeny)) {
      click(state);
      actions.authDeny();
      return;
    }
    if (pointInRect(x, y, layout.authAllow)) {
      click(state);
      actions.authAllow();
    }
    return;
  }

  if (state.gameState === GS.LEADERBOARD) {
    if (pointInRect(x, y, layout.leaderboardBack)) {
      click(state);
      actions.closeLeaderboard();
    }
    return;
  }

  if (state.gameState === GS.CONFIRM_HOME) {
    if (pointInRect(x, y, layout.confirmCancel)) {
      click(state);
      actions.cancelHome();
      return;
    }
    if (pointInRect(x, y, layout.confirmOk)) {
      click(state);
      actions.confirmHome();
    }
    return;
  }

  if (state.gameState === GS.HELP) {
    if (pointInRect(x, y, layout.back)) {
      click(state);
      actions.closeHelp();
    }
    return;
  }

  if (state.gameState === GS.GAMEOVER) {
    if (
      ads.canRevive(state) &&
      state.adNoticeUntil <= Date.now() &&
      pointInRect(x, y, layout.overRevive)
    ) {
      click(state);
      actions.reviveByAd();
      return;
    }
    if (pointInRect(x, y, layout.playAgain)) {
      click(state);
      actions.startNew();
      return;
    }
    if (pointInRect(x, y, layout.share)) {
      click(state);
      actions.share();
      return;
    }
    if (pointInRect(x, y, layout.homeFromOver)) {
      click(state);
      actions.home();
    }
  }
}

module.exports = {
  setupInput: setupInput,
  handleTap: handleTap
};
