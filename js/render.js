'use strict';

var GS = require('./state').GS;
var draw = require('./draw');
var getLayout = require('./ui').getLayout;
var consent = require('./consent');
var ads = require('./ads');
var boardApi = require('../core/board');

var FONT = draw.FONT;

function render(state) {
  var ctx = state.ctx;
  var w = state.width;
  var h = state.height;

  if (ctx.setTransform) {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = state.hexagonBackgroundColor;
  ctx.fillRect(0, 0, w, h);

  drawBoard(state);
  drawTexts(state);

  if (state.gameState === GS.START) {
    drawStartScreen(state);
  } else if (state.gameState === GS.PLAYING) {
    drawHud(state, true);
  } else if (state.gameState === GS.PAUSED) {
    drawHud(state, false);
    drawPauseOverlay(state);
  } else if (state.gameState === GS.GAMEOVER) {
    drawGameOver(state);
  } else if (state.gameState === GS.HELP) {
    drawHelp(state);
  } else if (state.gameState === GS.SETTINGS) {
    drawSettings(state);
  } else if (state.gameState === GS.CONFIRM_HOME) {
    drawConfirmHome(state);
  } else if (state.gameState === GS.LEADERBOARD) {
    drawLeaderboard(state);
  } else if (state.gameState === GS.PRIVACY) {
    drawPrivacy(state);
  } else if (state.gameState === GS.AUTH) {
    drawAuth(state);
  } else if (state.gameState === GS.CHALLENGE_PROMPT) {
    drawChallengePrompt(state);
  }

  ctx.globalAlpha = 1;
}

function drawHomeBackground(state) {
  var ctx = state.ctx;
  var home = getLayout(state).homeHex;

  draw.drawPolygon(ctx, home.x, home.y, 6, home.r, 30, state.outerColor, 0, 'rgba(0,0,0,0)');
  draw.drawPolygon(ctx, home.x, home.y, 6, home.innerR, 30, state.centerColor, 0, 'rgba(0,0,0,0)');
}

function drawBoard(state) {
  var hex = state.MainHex;
  if (!hex) {
    return;
  }

  var ctx = state.ctx;
  var s = state.settings;
  if (
    state.gameState === GS.START ||
    state.gameState === GS.LEADERBOARD ||
    state.gameState === GS.PRIVACY ||
    state.gameState === GS.AUTH ||
    state.gameState === GS.CHALLENGE_PROMPT
  ) {
    drawHomeBackground(state);
    return;
  }

  var outerRadius = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;

  draw.drawPolygon(
    ctx,
    state.width / 2,
    state.height / 2,
    6,
    outerRadius,
    30,
    state.outerColor,
    0,
    'rgba(0,0,0,0)'
  );

  var i;

  boardApi.forEach(hex.board, function (block, side, level) {
    block.draw(true, level);
  });

  for (i = 0; i < state.blocks.length; i++) {
    state.blocks[i].draw();
  }

  hex.draw();
}

function drawTexts(state) {
  var hex = state.MainHex;
  if (
    !hex ||
    state.gameState === GS.START ||
    state.gameState === GS.LEADERBOARD ||
    state.gameState === GS.PRIVACY ||
    state.gameState === GS.AUTH ||
    state.gameState === GS.CHALLENGE_PROMPT
  ) {
    return;
  }

  for (var i = 0; i < hex.texts.length; i++) {
    var alive = hex.texts[i].draw();
    if (!alive) {
      hex.texts.splice(i, 1);
      i--;
    }
  }
}

function scoreSizeFor(score, base) {
  var len = String(score).length;
  if (len <= 5) {
    return base;
  }
  if (len === 6) {
    return base * 0.86;
  }
  if (len === 7) {
    return base * 0.72;
  }
  if (len === 8) {
    return base * 0.62;
  }
  return base * 0.52;
}

function drawScoreText(state) {
  var hex = state.MainHex;
  if (!hex) {
    return;
  }

  var size = scoreSizeFor(state.score, 58);
  var scoreString = String(state.score);

  draw.renderText(
    state,
    state.width / 2 + state.gdx,
    state.height / 2 + state.gdy,
    size * state.settings.scale,
    '#ecf0f1',
    scoreString,
    FONT,
    'center',
    'middle'
  );
}

function drawHud(state, showIcons) {
  var ui = state.uiScale;
  var layout = getLayout(state);

  draw.renderText(
    state,
    state.width / 2,
    state.safeTop + 22 * ui,
    14 * ui,
    '#7f8c8d',
    '最高分 ' + Math.max(state.bestScore, state.score),
    FONT,
    'center',
    'middle'
  );

  if (showIcons) {
    // 游戏中只保留暂停按钮；玩法说明和设置收进暂停页
    draw.drawPauseIcon(state, layout.pauseBtn);
  }

  drawScoreText(state);
  drawComboTimer(state);
}

function drawComboTimer(state) {
  var hex = state.MainHex;
  if (!hex || state.gameState !== GS.PLAYING) {
    return;
  }

  var elapsed = hex.ct - hex.lastCombo;
  if (elapsed < 0 || elapsed >= hex.comboTime) {
    return;
  }

  var s = state.settings;
  var outerRadius = (s.rows * s.blockHeight) * (2 / Math.sqrt(3)) + s.hexWidth;
  var progress = Math.max(0, Math.min(1, 1 - elapsed / hex.comboTime));
  var ctx = state.ctx;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    state.width / 2,
    state.height / 2,
    outerRadius - 5 * s.scale,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * progress
  );
  ctx.strokeStyle = hex.lastColorScored || '#3498db';
  ctx.lineWidth = 5 * s.scale;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawStartScreen(state) {
  var ui = state.uiScale;
  var layout = getLayout(state);
  var w = state.width;
  var home = layout.homeHex;
  var titleY = layout.homeTitleY;
  var titleSize = Math.min(50 * ui, w * 0.13);
  var best = Math.max(state.bestScore, state.score);

  draw.renderText(state, w / 2, titleY, titleSize, '#2c3e50', 'HEXORBIT', FONT, 'center', 'middle');
  draw.renderText(state, w / 2, titleY + 42 * ui, 19 * ui, '#7f8c8d', '星核轮转', FONT, 'center', 'middle');

  // 回到最初版的画面：最高分放回中心六边形里
  draw.renderText(state, w / 2, home.y - 11 * ui, 11 * ui, '#bdc3c7', '历史最高', FONT, 'center', 'middle');
  draw.renderText(state, w / 2, home.y + 12 * ui, 20 * ui, '#ecf0f1', String(best), FONT, 'center', 'middle');

  // 首页只保留一个主按钮；“继续上一局”是弱化入口
  draw.drawButton(state, layout.startNew, state.hasSave ? '新游戏' : '开始游戏', {
    fill: '#3498db',
    fontSize: 21
  });

  if (state.hasSave) {
    draw.drawTextLink(state, layout.continueLink, '继续上一局');
  } else if (layout.showHint) {
    draw.renderText(
      state,
      w / 2,
      layout.homeHint.y + layout.homeHint.h / 2,
      12 * ui,
      '#95a5a6',
      '点击左右半屏旋转六边形',
      FONT,
      'center',
      'middle'
    );
  }

  drawHomeLink(state, layout.homeHelpLink, '玩法说明');

  if (consent.canShowLeaderboard(state)) {
    drawHomeLink(state, layout.homeLeaderboardLink, '好友排行榜');
  }

  drawHomeLink(state, layout.homeSettingsLink, '设置');
}

function drawHomeLink(state, rect, label) {
  draw.renderText(
    state,
    rect.x + rect.w / 2,
    rect.y + rect.h / 2,
    13 * state.uiScale,
    '#7f8c8d',
    label,
    FONT,
    'center',
    'middle'
  );
}

function drawPauseOverlay(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.pausePanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  draw.renderText(state, panel.x + panel.w / 2, panel.y + 56 * ui, 28 * ui, '#2c3e50', '已暂停', FONT, 'center', 'middle');
  draw.renderText(state, panel.x + panel.w / 2, panel.y + 96 * ui, 14 * ui, '#7f8c8d', '休息一下，随时继续', FONT, 'center', 'middle');

  draw.drawButton(state, layout.resume, '继续游戏', { fill: '#3498db', fontSize: 19 });
  draw.drawButton(state, layout.restart, '重新开始', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawButton(state, layout.helpInPause, '玩法说明', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawButton(state, layout.settingsInPause, '设置', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 18 });
  draw.drawTextLink(state, layout.homeFromPause, '保存并返回首页');
}

function drawGameOver(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.overPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;
  var f = layout.overScale || 1;
  var challengeResult = state.challenge && state.challenge.active ? state.challenge.result : null;
  var title = '游戏结束';

  if (challengeResult) {
    title = challengeResult.success ? '挑战成功' : '挑战失败';
  }

  draw.renderText(state, cx, panel.y + 48 * ui * f, 28 * ui, '#2c3e50', title, FONT, 'center', 'middle');

  if (challengeResult) {
    var diff = Math.abs(challengeResult.diff);
    var line = challengeResult.success ? '超出 ' + diff + ' 分' : '还差 ' + diff + ' 分';

    if (state.isNewRecord) {
      line += ' · 新纪录！';
    }

    draw.renderText(
      state,
      cx,
      panel.y + 82 * ui * f,
      14 * ui,
      challengeResult.success ? '#2ecc71' : '#e67e22',
      line,
      FONT,
      'center',
      'middle'
    );
  } else if (state.isNewRecord) {
    draw.renderText(state, cx, panel.y + 82 * ui * f, 15 * ui, '#e67e22', '新纪录！', FONT, 'center', 'middle');
  }

  draw.renderText(state, cx, panel.y + 118 * ui * f, 14 * ui, '#95a5a6', '本次得分', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 162 * ui * f, scoreSizeFor(state.score, 62 * f) * ui, '#2c3e50', String(state.score), FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 220 * ui * f, 15 * ui, '#7f8c8d', '历史最高 ' + state.bestScore, FONT, 'center', 'middle');

  var rankRect = layout.overRank;
  var rankUsable = !!(state.rank && state.rank.enabled && state.rank.canvas && consent.canUseRank(state) && !state.scoreBlocked);
  var rankText = '好友排行榜需在微信中查看';
  var rankColor = '#95a5a6';

  if (state.scoreBlocked) {
    rankText = '成绩异常，未计入排行榜';
    rankColor = '#e67e22';
  } else if (!state.privacyAccepted || state.authLeaderboard === false) {
    rankText = '好友排行榜已关闭';
  } else if (state.authLeaderboard === null) {
    rankText = '开启后可查看好友排名';
  } else if (rankUsable) {
    rankText = '好友排行加载中…';
  }

  // 开放数据域异步渲染；先用一行加载文案兜底
  draw.renderText(
    state,
    rankRect.x + rankRect.w / 2,
    rankRect.y + rankRect.h / 2,
    13 * ui,
    rankColor,
    rankText,
    FONT,
    'center',
    'middle'
  );

  if (rankUsable) {
    state.rank.draw(ctx, rankRect, 'gameover');
  }

  // 激励视频复活入口：广告关闭 / 已用过 / 广告不可用时整块不绘制
  var revive = layout.overRevive;
  if (state.adNoticeUntil > Date.now()) {
    draw.renderText(
      state,
      cx,
      revive.y + revive.h / 2,
      13 * ui,
      '#e67e22',
      state.adNotice,
      FONT,
      'center',
      'middle'
    );
  } else if (ads.canRevive(state)) {
    ctx.save();
    draw.fillRoundRect(ctx, revive.x, revive.y, revive.w, revive.h, revive.h / 2, 'rgba(52,152,219,0.10)');
    ctx.restore();

    draw.renderText(
      state,
      cx,
      revive.y + revive.h / 2,
      13 * ui,
      state.adBusy ? '#95a5a6' : '#3498db',
      state.adBusy ? '广告加载中…' : '看完整视频，原地复活（本局限 1 次）',
      FONT,
      'center',
      'middle'
    );
  }

  draw.drawButton(state, layout.playAgain, '再来一局', { fill: '#3498db', fontSize: 15 });
  draw.drawButton(state, layout.share, '分享挑战', { fill: '#2ecc71', fontSize: 15 });
  draw.drawButton(state, layout.homeFromOver, '返回首页', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 15 });
}

function drawLeaderboard(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.leaderboardPanel;
  var content = layout.leaderboardContent;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 40 * ui, 26 * ui, '#2c3e50', '好友排行榜', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 68 * ui, 13 * ui, '#95a5a6', '按历史最高分排序', FONT, 'center', 'middle');

  var rankUsable = !!(state.rank && state.rank.enabled && state.rank.canvas && consent.canUseRank(state));

  draw.renderText(
    state,
    content.x + content.w / 2,
    content.y + content.h / 2,
    14 * ui,
    '#95a5a6',
    rankUsable ? '好友排行加载中…' : '好友排行榜需在微信中查看',
    FONT,
    'center',
    'middle'
  );

  if (rankUsable) {
    state.rank.draw(ctx, content, 'leaderboard');
  }

  draw.drawButton(state, layout.leaderboardBack, '返回', { fill: '#3498db', fontSize: 18 });
}

function drawParagraph(state, text, x, y, maxWidth, fontSize, lineHeight, color, align) {
  var ctx = state.ctx;

  ctx.save();
  ctx.font = fontSize + 'px ' + FONT;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;

  var lines = draw.wrapText(ctx, text, maxWidth);
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y);
    y += lineHeight;
  }

  ctx.restore();
  return y;
}

function drawPrivacy(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.privacyPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var fontSize = 13 * ui;
  var lineHeight = 21 * ui;
  var textX = panel.x + 28 * ui;
  var maxWidth = panel.w - 56 * ui;
  var y = panel.y + 104 * ui;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '隐私提示', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 72 * ui, 13 * ui, '#95a5a6', '请阅读以下说明', FONT, 'center', 'middle');

  var items = [
    '本地存储：保存游戏进度、最高分和声音设置',
    '好友排行榜（可选）：读取好友公开的游戏数据（昵称、头像、最高分）',
    '不接入自建服务器，不上传个人信息',
    '同意后微信会再确认隐私授权，拒绝仍可正常游玩'
  ];

  for (var i = 0; i < items.length; i++) {
    draw.renderText(state, textX, y, fontSize, '#3498db', '•', FONT, 'left', 'middle');
    y = drawParagraph(state, items[i], textX + 16 * ui, y, maxWidth - 16 * ui, fontSize, lineHeight, '#2c3e50', 'left');
    y += 8 * ui;
  }

  draw.drawTextLink(state, layout.privacyLink, '查看' + consent.getContractName(state), '#7f8c8d');

  draw.drawButton(state, layout.privacyDecline, '暂不同意', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.privacyAgree, '同意并继续', { fill: '#3498db', fontSize: 16 });
}

function drawAuth(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.authPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var fontSize = 13 * ui;
  var lineHeight = 22 * ui;
  var maxWidth = panel.w - 56 * ui;

  draw.renderText(state, cx, panel.y + 44 * ui, 25 * ui, '#2c3e50', '好友排行榜', FONT, 'center', 'middle');

  var y = panel.y + 96 * ui;
  y = drawParagraph(
    state,
    '开启后会通过微信开放数据读取好友的公开游戏数据（昵称、头像、最高分），仅用于排行榜展示。',
    cx,
    y,
    maxWidth,
    fontSize,
    lineHeight,
    '#2c3e50',
    'center'
  );
  y += 8 * ui;
  drawParagraph(
    state,
    '不会获取手机号、位置等其它信息。暂不开启时入口隐藏，游戏不受影响。',
    cx,
    y,
    maxWidth,
    fontSize,
    lineHeight,
    '#95a5a6',
    'center'
  );

  draw.drawButton(state, layout.authDeny, '暂不开启', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.authAllow, '开启排行榜', { fill: '#3498db', fontSize: 16 });
}

function drawChallengePrompt(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.challengePanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.99);

  var cx = panel.x + panel.w / 2;
  var target = state.pendingChallengeTarget || 0;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '好友挑战', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 90 * ui, 14 * ui, '#95a5a6', '目标分数', FONT, 'center', 'middle');
  draw.renderText(
    state,
    cx,
    panel.y + 140 * ui,
    scoreSizeFor(target, 58) * ui,
    '#2c3e50',
    String(target),
    FONT,
    'center',
    'middle'
  );

  var body = state.hasSave
    ? '接受挑战会开始新的一局，当前存档会被替换。'
    : '接受后会开始新的一局。';

  drawParagraph(
    state,
    body,
    cx,
    panel.y + 202 * ui,
    panel.w - 56 * ui,
    13 * ui,
    22 * ui,
    '#7f8c8d',
    'center'
  );

  draw.drawButton(state, layout.challengeIgnore, '先不挑战', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 16 });
  draw.drawButton(state, layout.challengeAccept, '接受挑战', { fill: '#3498db', fontSize: 16 });
}

function drawHelp(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.helpPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 44 * ui, 26 * ui, '#2c3e50', '玩法说明', FONT, 'center', 'middle');

  var items = [
    '点击屏幕左右两侧，旋转中间的六边形。',
    '方块落到六边形上后，3 个及以上同色方块相连即可消除。',
    '连续消除会提升连击倍率，分数更高。',
    '某一侧堆到 7 层方块时，游戏结束。',
    '游戏会自动保存，下次可从暂停处继续。'
  ];

  var fontSize = 15 * ui;
  var lineHeight = 25 * ui;
  var maxWidth = panel.w - 52 * ui;
  var y = panel.y + 92 * ui;

  ctx.save();
  ctx.font = fontSize + 'px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2c3e50';

  for (var i = 0; i < items.length; i++) {
    var lines = draw.wrapText(ctx, items[i], maxWidth - 16 * ui);
    for (var j = 0; j < lines.length; j++) {
      if (j === 0) {
        ctx.fillStyle = '#3498db';
        ctx.fillText('•', panel.x + 26 * ui, y);
        ctx.fillStyle = '#2c3e50';
      }
      ctx.fillText(lines[j], panel.x + 42 * ui, y);
      y += lineHeight;
    }
    y += 6 * ui;
  }

  ctx.restore();

  draw.drawButton(state, layout.back, '返回', { fill: '#3498db', fontSize: 18 });
}

function drawSettings(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.settingsPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.45)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 46 * ui, 27 * ui, '#2c3e50', '设置', FONT, 'center', 'middle');
  draw.renderText(state, cx, panel.y + 82 * ui, 13 * ui, '#95a5a6', '声音与反馈', FONT, 'center', 'middle');

  drawSettingRow(
    state,
    panel,
    '背景音乐',
    '游戏内循环播放',
    layout.musicToggle,
    state.sound.music
  );

  drawSettingRow(
    state,
    panel,
    '游戏音效',
    '旋转、消除等提示音',
    layout.sfxToggle,
    state.sound.sfx
  );

  drawSettingRow(
    state,
    panel,
    '震动反馈',
    '消除方块时轻微震动',
    layout.vibrateToggle,
    state.sound.vibrate
  );

  draw.drawButton(state, layout.settingsDone, '完成', { fill: '#3498db', fontSize: 18 });
}

function drawConfirmHome(state) {
  var ctx = state.ctx;
  var layout = getLayout(state);
  var ui = state.uiScale;
  var panel = layout.confirmPanel;

  ctx.save();
  ctx.fillStyle = 'rgba(44,62,80,0.55)';
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.restore();

  draw.drawPanel(state, panel, '#ffffff', 0.98);

  var cx = panel.x + panel.w / 2;

  draw.renderText(state, cx, panel.y + 50 * ui, 24 * ui, '#2c3e50', '返回首页？', FONT, 'center', 'middle');

  var body = state.homeReturnState === GS.PAUSED
    ? '当前进度会保存，下次可以从首页继续。'
    : '本局已经结束，返回后可以重新开始。';

  ctx.save();
  ctx.font = 14 * ui + 'px ' + FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7f8c8d';

  var lines = draw.wrapText(ctx, body, panel.w - 56 * ui);
  var y = panel.y + 104 * ui;
  for (var i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, y);
    y += 24 * ui;
  }
  ctx.restore();

  var okLabel = state.homeReturnState === GS.PAUSED ? '保存并返回' : '返回首页';

  draw.drawButton(state, layout.confirmCancel, '取消', { fill: '#ecf0f1', color: '#2c3e50', fontSize: 17 });
  draw.drawButton(state, layout.confirmOk, okLabel, { fill: '#3498db', fontSize: 17 });
}

function drawSettingRow(state, panel, label, desc, toggleRect, on) {
  var ui = state.uiScale;
  var centerY = toggleRect.y + toggleRect.h / 2;

  draw.renderText(
    state,
    panel.x + 28 * ui,
    centerY - 8 * ui,
    17 * ui,
    '#2c3e50',
    label,
    FONT,
    'left',
    'middle'
  );

  draw.renderText(
    state,
    panel.x + 28 * ui,
    centerY + 14 * ui,
    12 * ui,
    '#95a5a6',
    desc,
    FONT,
    'left',
    'middle'
  );

  draw.drawToggle(state, toggleRect, on);
}

module.exports = {
  render: render
};
