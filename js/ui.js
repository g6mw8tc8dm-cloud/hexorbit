'use strict';

var ads = require('./ads');

function getLayout(state) {
  var w = state.width;
  var h = state.height;
  var ui = state.uiScale;
  var margin = 14 * ui;
  var top = state.safeTop + 10 * ui;
  var icon = 50 * ui;
  var cx = w / 2;

  var pauseBtn = {
    x: state.safeLeft + margin,
    y: top,
    w: icon,
    h: icon
  };

  // 首页纵向构图：标题 -> 六边形 -> 主按钮 -> 继续上一局 -> 底部文字入口。
  // 六边形按剩余空间放大，主按钮挂在六边形下沿，避免高屏手机上出现大片空白。
  var startW = Math.min(260 * ui, w - 100 * ui);
  var startH = 56 * ui;
  var titleH = 80 * ui;
  var hexGap = 24 * ui;
  var continueGap = 16 * ui;
  var continueH = 36 * ui;
  // 固定预留“继续上一局 / 首次提示”这一行，首页在各种状态下构图保持稳定
  var tailH = continueGap + continueH;

  var linkW = 100 * ui;
  var linkH = 40 * ui;
  var linkY = h - state.safeBottom - 46 * ui;
  var linkGap = 20 * ui;

  var availTop = state.safeTop + 20 * ui;
  var fixedH = titleH + hexGap * 2 + startH + tailH;
  var maxHexH = linkY - availTop - linkGap - fixedH;
  var hexH = Math.max(90 * ui, Math.min(maxHexH, w * 0.788));
  var hexR = hexH / 1.732;
  var contentH = fixedH + hexH;
  var leftover = Math.max(0, linkY - availTop - contentH - linkGap);
  var topY = availTop + leftover * 0.55;

  var s = state.settings;
  var gameHexR = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;
  var innerRatio = Math.max(0.3, Math.min(0.45, s.hexWidth / gameHexR));

  var homeHex = {
    x: cx,
    y: topY + titleH + hexGap + hexH / 2,
    r: hexR,
    innerR: hexR * innerRatio
  };

  var titleY = topY + titleH / 2;

  var startNew = {
    x: cx - startW / 2,
    y: homeHex.y + hexH / 2 + hexGap,
    w: startW,
    h: startH
  };

  var continueLink = {
    x: cx - startW / 2,
    y: startNew.y + startH + continueGap,
    w: startW,
    h: continueH
  };

  // 首次进入（没有存档且从未得分）时，用按钮下方同一位置显示一次操作提示
  var bestOnHome = Math.max(state.bestScore || 0, state.score || 0);
  var showHint = !state.hasSave && bestOnHome === 0;
  var homeHint = {
    x: cx - startW / 2,
    y: startNew.y + startH + continueGap,
    w: startW,
    h: continueH
  };

  var showLeaderboard = state.privacyAccepted === true && state.authLeaderboard !== false;
  var homeHelpLink;
  var homeLeaderboardLink;
  var homeSettingsLink;

  if (showLeaderboard) {
    homeHelpLink = { x: cx - 150 * ui, y: linkY, w: linkW, h: linkH };
    homeLeaderboardLink = { x: cx - 50 * ui, y: linkY, w: linkW, h: linkH };
    homeSettingsLink = { x: cx + 50 * ui, y: linkY, w: linkW, h: linkH };
  } else {
    homeHelpLink = { x: cx - 105 * ui, y: linkY, w: linkW, h: linkH };
    homeLeaderboardLink = { x: cx - 50 * ui, y: linkY, w: linkW, h: linkH };
    homeSettingsLink = { x: cx + 5 * ui, y: linkY, w: linkW, h: linkH };
  }

  var pauseW = Math.min(320 * ui, w - 44 * ui);
  var pauseH = 450 * ui;
  var pausePanel = {
    x: cx - pauseW / 2,
    y: h / 2 - pauseH / 2,
    w: pauseW,
    h: pauseH
  };

  var innerW = pauseW - 48 * ui;
  var buttonH = 52 * ui;
  var resume = {
    x: pausePanel.x + 24 * ui,
    y: pausePanel.y + 142 * ui,
    w: innerW,
    h: buttonH
  };

  var restart = {
    x: resume.x,
    y: resume.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var helpInPause = {
    x: resume.x,
    y: restart.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var settingsInPause = {
    x: resume.x,
    y: helpInPause.y + 64 * ui,
    w: innerW,
    h: buttonH
  };

  var homeFromPause = {
    x: resume.x,
    y: pausePanel.y + pauseH - 48 * ui,
    w: innerW,
    h: 36 * ui
  };

  var overW = Math.min(330 * ui, w - 36 * ui);

  // 结算页底部给 Banner 预留空间（广告关闭时预留为 0，不影响现有布局）
  var bannerSpace = ads.bannerSpace(state);
  var overTopGap = (state.safeTop || 0) + 12 * ui;
  var overBottomGap = (state.safeBottom || 0) + bannerSpace + 12 * ui;
  var overMaxH = Math.min(500 * ui, h - 70 * ui);
  var overH = overMaxH;

  if (bannerSpace > 0) {
    // Banner 开启时面板贴底，按钮始终在 Banner 上方
    overH = Math.min(overMaxH, h - overTopGap - overBottomGap);
  }

  overH = Math.max(360 * ui, overH);

  var overScale = Math.min(1, overH / (500 * ui));
  var overY = bannerSpace > 0
    ? h - overBottomGap - overH
    : h / 2 - overH / 2;

  var overPanel = {
    x: cx - overW / 2,
    y: overY,
    w: overW,
    h: overH
  };

  var overButtonH = 48 * ui;
  var overButtonY = overPanel.y + overH - 76 * ui;
  var overInner = overW - 44 * ui;
  var overGap = 8 * ui;
  var overButtonW = (overInner - overGap * 2) / 3;

  var playAgain = {
    x: overPanel.x + 22 * ui,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var share = {
    x: playAgain.x + overButtonW + overGap,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var homeFromOver = {
    x: share.x + overButtonW + overGap,
    y: overButtonY,
    w: overButtonW,
    h: overButtonH
  };

  var overRankW = overW - 56 * ui;
  var overRank = {
    x: overPanel.x + 28 * ui,
    y: overPanel.y + 242 * ui * overScale,
    w: overRankW,
    h: overRankW / 2.5
  };

  // 激励视频复活入口：放在底部三个按钮上方，广告关闭时不会绘制
  var overRevive = {
    x: overPanel.x + 24 * ui,
    y: overPanel.y + overH - 76 * ui - 34 * ui,
    w: overW - 48 * ui,
    h: 30 * ui
  };

  var helpW = Math.min(370 * ui, w - 28 * ui);
  var helpH = Math.min(580 * ui, h - 60 * ui);
  var helpPanel = {
    x: cx - helpW / 2,
    y: h / 2 - helpH / 2,
    w: helpW,
    h: helpH
  };

  var back = {
    x: helpPanel.x + 24 * ui,
    y: helpPanel.y + helpH - 76 * ui,
    w: helpW - 48 * ui,
    h: 48 * ui
  };

  var setW = Math.min(330 * ui, w - 36 * ui);
  var setH = Math.min(410 * ui, h - 70 * ui);
  var settingsPanel = {
    x: cx - setW / 2,
    y: h / 2 - setH / 2,
    w: setW,
    h: setH
  };

  var toggleW = 52 * ui;
  var toggleH = 30 * ui;
  var toggleX = settingsPanel.x + setW - 26 * ui - toggleW;
  var row1 = settingsPanel.y + 130 * ui;
  var row2 = row1 + 64 * ui;
  var row3 = row2 + 64 * ui;

  var musicToggle = {
    x: toggleX,
    y: row1 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var sfxToggle = {
    x: toggleX,
    y: row2 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var vibrateToggle = {
    x: toggleX,
    y: row3 - toggleH / 2,
    w: toggleW,
    h: toggleH
  };

  var rowW = setW - 52 * ui;
  var rowH = 60 * ui;

  var musicRow = {
    x: settingsPanel.x + 26 * ui,
    y: row1 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var sfxRow = {
    x: settingsPanel.x + 26 * ui,
    y: row2 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var vibrateRow = {
    x: settingsPanel.x + 26 * ui,
    y: row3 - rowH / 2,
    w: rowW,
    h: rowH
  };

  var settingsDone = {
    x: settingsPanel.x + 32 * ui,
    y: settingsPanel.y + setH - 78 * ui,
    w: setW - 64 * ui,
    h: 50 * ui
  };

  var confirmW = Math.min(320 * ui, w - 44 * ui);
  var confirmH = 280 * ui;
  var confirmPanel = {
    x: cx - confirmW / 2,
    y: h / 2 - confirmH / 2,
    w: confirmW,
    h: confirmH
  };

  var confirmInner = confirmW - 48 * ui;
  var confirmGap = 12 * ui;
  var confirmButtonW = (confirmInner - confirmGap) / 2;
  var confirmCancel = {
    x: confirmPanel.x + 24 * ui,
    y: confirmPanel.y + confirmH - 76 * ui,
    w: confirmButtonW,
    h: 50 * ui
  };

  var confirmOk = {
    x: confirmCancel.x + confirmButtonW + confirmGap,
    y: confirmCancel.y,
    w: confirmButtonW,
    h: 50 * ui
  };

  var leaderboardW = Math.min(370 * ui, w - 28 * ui);
  var leaderboardH = Math.min(660 * ui, h - 50 * ui);
  var leaderboardPanel = {
    x: cx - leaderboardW / 2,
    y: h / 2 - leaderboardH / 2,
    w: leaderboardW,
    h: leaderboardH
  };

  var leaderboardContent = {
    x: leaderboardPanel.x + 18 * ui,
    y: leaderboardPanel.y + 92 * ui,
    w: leaderboardW - 36 * ui,
    h: leaderboardH - 170 * ui
  };

  var leaderboardBack = {
    x: leaderboardPanel.x + 24 * ui,
    y: leaderboardPanel.y + leaderboardH - 72 * ui,
    w: leaderboardW - 48 * ui,
    h: 48 * ui
  };

  var privacyW = Math.min(360 * ui, w - 28 * ui);
  var privacyH = Math.min(480 * ui, h - 50 * ui);
  var privacyPanel = {
    x: cx - privacyW / 2,
    y: h / 2 - privacyH / 2,
    w: privacyW,
    h: privacyH
  };
  var privacyInner = privacyW - 48 * ui;
  var privacyGap = 12 * ui;
  var privacyButtonW = (privacyInner - privacyGap) / 2;
  var privacyDecline = {
    x: privacyPanel.x + 24 * ui,
    y: privacyPanel.y + privacyH - 76 * ui,
    w: privacyButtonW,
    h: 50 * ui
  };
  var privacyAgree = {
    x: privacyDecline.x + privacyButtonW + privacyGap,
    y: privacyDecline.y,
    w: privacyButtonW,
    h: 50 * ui
  };
  var privacyLink = {
    x: privacyPanel.x + 24 * ui,
    y: privacyPanel.y + privacyH - 112 * ui,
    w: privacyW - 48 * ui,
    h: 28 * ui
  };

  var authW = Math.min(340 * ui, w - 32 * ui);
  var authH = 300 * ui;
  var authPanel = {
    x: cx - authW / 2,
    y: h / 2 - authH / 2,
    w: authW,
    h: authH
  };
  var authInner = authW - 48 * ui;
  var authButtonW = (authInner - privacyGap) / 2;
  var authDeny = {
    x: authPanel.x + 24 * ui,
    y: authPanel.y + authH - 76 * ui,
    w: authButtonW,
    h: 50 * ui
  };
  var authAllow = {
    x: authDeny.x + authButtonW + privacyGap,
    y: authDeny.y,
    w: authButtonW,
    h: 50 * ui
  };

  var challengeW = Math.min(340 * ui, w - 32 * ui);
  var challengeH = 340 * ui;
  var challengePanel = {
    x: cx - challengeW / 2,
    y: h / 2 - challengeH / 2,
    w: challengeW,
    h: challengeH
  };
  var challengeInner = challengeW - 48 * ui;
  var challengeButtonW = (challengeInner - privacyGap) / 2;
  var challengeIgnore = {
    x: challengePanel.x + 24 * ui,
    y: challengePanel.y + challengeH - 76 * ui,
    w: challengeButtonW,
    h: 50 * ui
  };
  var challengeAccept = {
    x: challengeIgnore.x + challengeButtonW + privacyGap,
    y: challengeIgnore.y,
    w: challengeButtonW,
    h: 50 * ui
  };

  return {
    pauseBtn: pauseBtn,
    homeHex: homeHex,
    homeTitleY: titleY,
    homeHint: homeHint,
    showHint: showHint,
    startNew: startNew,
    continueLink: continueLink,
    homeHelpLink: homeHelpLink,
    homeLeaderboardLink: homeLeaderboardLink,
    homeSettingsLink: homeSettingsLink,
    pausePanel: pausePanel,
    resume: resume,
    restart: restart,
    helpInPause: helpInPause,
    settingsInPause: settingsInPause,
    homeFromPause: homeFromPause,
    overPanel: overPanel,
    playAgain: playAgain,
    share: share,
    homeFromOver: homeFromOver,
    overRank: overRank,
    overRevive: overRevive,
    overScale: overScale,
    helpPanel: helpPanel,
    back: back,
    settingsPanel: settingsPanel,
    musicToggle: musicToggle,
    sfxToggle: sfxToggle,
    vibrateToggle: vibrateToggle,
    musicRow: musicRow,
    sfxRow: sfxRow,
    vibrateRow: vibrateRow,
    settingsDone: settingsDone,
    confirmPanel: confirmPanel,
    confirmCancel: confirmCancel,
    confirmOk: confirmOk,
    leaderboardPanel: leaderboardPanel,
    leaderboardContent: leaderboardContent,
    leaderboardBack: leaderboardBack,
    privacyPanel: privacyPanel,
    privacyAgree: privacyAgree,
    privacyDecline: privacyDecline,
    privacyLink: privacyLink,
    authPanel: authPanel,
    authAllow: authAllow,
    authDeny: authDeny,
    challengePanel: challengePanel,
    challengeAccept: challengeAccept,
    challengeIgnore: challengeIgnore
  };
}

function pointInRect(x, y, rect) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

module.exports = {
  getLayout: getLayout,
  pointInRect: pointInRect
};
