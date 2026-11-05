'use strict';

// 与 js/rank.js 中的画布尺寸保持一致
var W = 600;
var H = 880;
var SUMMARY_H = 240;
var KEY = 'hextris_best_v1';
var MAX_SCORE = 1000000;
var FONT = '"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif';

var sharedCanvas = wx.getSharedCanvas();
sharedCanvas.width = W;
sharedCanvas.height = H;

var ctx = sharedCanvas.getContext('2d');

// 部分客户端会把共享画布重设为屏幕尺寸（例如 390×844），
// 此时仍按 600×880 的设计坐标绘制就会被裁切并整体偏右。
// 每次绘制前把设计坐标缩放到画布真实尺寸，保证内容始终居中且完整。
function syncCanvasScale() {
  var cw = sharedCanvas.width || W;
  var ch = sharedCanvas.height || H;

  if (!(cw > 0) || !(ch > 0)) {
    return;
  }

  ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0);
}

var view = 'none';
var loading = false;
var error = false;
var friends = [];
var sorted = [];
var myBest = 0;
var isNewRecord = false;
var rank = 0;
var total = 0;
var beaten = 0;
var empty = true;

var avatarCache = {};

function clear() {
  ctx.clearRect(0, 0, W, H);
}

function drawText(text, x, y, size, color, align, baseline) {
  ctx.font = size + 'px ' + FONT;
  ctx.fillStyle = color || '#2c3e50';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillText(String(text), x, y);
}

function drawCenter(text, y, size, color) {
  drawText(text, W / 2, y, size, color, 'center', 'middle');
}

function roundRect(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRoundRect(x, y, w, h, r, color) {
  roundRect(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function parseScore(value) {
  if (typeof value === 'number') {
    return isFinite(value) ? value : 0;
  }

  if (value && typeof value === 'object' && typeof value.score === 'number') {
    return isFinite(value.score) ? value.score : 0;
  }

  if (!value) {
    return 0;
  }

  try {
    var obj = JSON.parse(value);
    if (obj && typeof obj.score === 'number' && isFinite(obj.score)) {
      return obj.score;
    }
  } catch (e) {
    // 兼容纯数字字符串
  }

  var n = Number(value);
  return isFinite(n) ? n : 0;
}

function parseFriends(data) {
  var list = [];

  if (!data || !data.length) {
    return list;
  }

  for (var i = 0; i < data.length; i++) {
    var user = data[i];
    if (!user) {
      continue;
    }

    var score = null;
    var kvList = user.KVDataList || [];

    for (var j = 0; j < kvList.length; j++) {
      if (kvList[j] && kvList[j].key === KEY) {
        score = parseScore(kvList[j].value);
        break;
      }
    }

    if (score === null || score < 0 || score > MAX_SCORE) {
      continue;
    }

    list.push({
      nickname: user.nickname || '微信好友',
      avatarUrl: user.avatarUrl || '',
      score: score,
      self: false
    });
  }

  return list;
}

function compute() {
  sorted = friends.slice();
  sorted.push({
    nickname: '我',
    avatarUrl: '',
    score: myBest,
    self: true
  });

  sorted.sort(function (a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.self) {
      return 1;
    }
    if (b.self) {
      return -1;
    }
    return 0;
  });

  rank = 0;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].self) {
      rank = i + 1;
      break;
    }
  }

  total = sorted.length;
  beaten = 0;

  for (var j = 0; j < friends.length; j++) {
    if (friends[j].score < myBest) {
      beaten++;
    }
  }

  empty = friends.length === 0;
}

function getImage(url) {
  if (!url) {
    return null;
  }

  if (avatarCache[url]) {
    return avatarCache[url];
  }

  var item = { img: null, loaded: false };
  avatarCache[url] = item;

  try {
    var img = wx.createImage();
    item.img = img;
    img.onload = function () {
      item.loaded = true;
      draw();
    };
    img.onerror = function () {};
    img.src = url;
  } catch (e) {
    // ignore
  }

  return item;
}

function drawAvatar(user, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  var cached = getImage(user.avatarUrl);

  if (cached && cached.loaded && cached.img) {
    ctx.drawImage(cached.img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = user.self ? '#2c3e50' : '#3498db';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    var initial = user.self ? '我' : String(user.nickname || '?').charAt(0);
    drawText(initial, x, y + 1, 20, '#ffffff', 'center', 'middle');
  }

  ctx.restore();
}

function truncate(text, maxWidth) {
  var value = String(text || '');
  ctx.font = '25px ' + FONT;

  while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
    value = value.slice(0, -1);
  }

  if (value !== String(text || '')) {
    value = value.slice(0, -1) + '…';
  }

  return value;
}

function drawRow(user, rankValue, y, isSelf) {
  fillRoundRect(10, y, W - 20, 76, 14, isSelf ? '#eaf4fc' : '#f4f7f9');

  drawText(rankValue, 30, y + 38, 23, isSelf ? '#3498db' : '#95a5a6', 'left', 'middle');
  drawAvatar(user, 84, y + 38, 24);
  drawText(truncate(user.nickname, 300), 118, y + 38, 25, '#2c3e50', 'left', 'middle');
  drawText(user.score, W - 30, y + 38, 25, '#3498db', 'right', 'middle');
}

function drawGameover() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, SUMMARY_H);

  if (loading) {
    drawCenter('好友排行加载中…', 120, 26, '#95a5a6');
    return;
  }

  // 加载失败与无数据统一按空态呈现：对玩家来说都是“暂时没榜单”，
  // 不必区分网络错误。内部仍保留 error 标记，便于排查。
  if (error || empty) {
    drawCenter('暂无好友上榜', SUMMARY_H / 2 - 25, 28, '#2c3e50');
    drawCenter('邀请好友一起玩', SUMMARY_H / 2 + 25, 20, '#95a5a6');
    return;
  }

  if (isNewRecord) {
    drawCenter('超越 ' + beaten + ' 位好友', 88, 32, '#2c3e50');
    drawCenter('好友排名 #' + rank + ' / ' + total, 140, 23, '#7f8c8d');
  } else {
    drawCenter('好友排名 #' + rank + ' / ' + total, 88, 32, '#2c3e50');
    drawCenter('超越 ' + beaten + ' 位好友', 140, 23, '#7f8c8d');
  }
}

function drawLeaderboard() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 整块画布会被拉伸铺满主域的榜单内容区，以 H/2 为基准居中可以避免文案偏上
  if (loading) {
    drawCenter('好友排行加载中…', H / 2, 28, '#95a5a6');
    return;
  }

  // 加载失败与无数据统一按空态呈现，文案与结算摘要保持一致
  if (error || empty) {
    drawCenter('暂无好友上榜', H / 2 - 25, 30, '#2c3e50');
    drawCenter('邀请好友一起玩', H / 2 + 25, 22, '#95a5a6');
    return;
  }

  drawText('排名', 30, 26, 20, '#95a5a6', 'left', 'middle');
  drawText('好友', 112, 26, 20, '#95a5a6', 'left', 'middle');
  drawText('最高分', W - 30, 26, 20, '#95a5a6', 'right', 'middle');

  var startY = 50;
  var rowHeight = 80;
  var topCount = Math.min(8, sorted.length);

  for (var i = 0; i < topCount; i++) {
    drawRow(sorted[i], i + 1, startY + i * rowHeight, sorted[i].self);
  }

  if (rank > 8) {
    drawCenter('...', startY + 8 * rowHeight + 4, 22, '#bdc3c7');
    drawRow(sorted[rank - 1], rank, startY + 8 * rowHeight + 32, true);
  }
}

function draw() {
  syncCanvasScale();
  clear();

  if (view === 'gameover') {
    drawGameover();
  } else if (view === 'leaderboard') {
    drawLeaderboard();
  }
}

function load() {
  loading = true;
  error = false;
  friends = [];
  sorted = [];
  draw();

  if (!wx.getFriendCloudStorage) {
    loading = false;
    error = true;
    draw();
    return;
  }

  try {
    wx.getFriendCloudStorage({
      keyList: [KEY],
      success: function (res) {
        loading = false;
        error = false;
        friends = parseFriends(res && res.data);
        compute();
        draw();
      },
      fail: function () {
        loading = false;
        error = true;
        friends = [];
        compute();
        draw();
      }
    });
  } catch (e) {
    loading = false;
    error = true;
    compute();
    draw();
  }
}

wx.onMessage(function (message) {
  if (!message || !message.type) {
    return;
  }

  if (message.type === 'hide') {
    view = 'none';
    clear();
    return;
  }

  if (message.type === 'leaderboard') {
    view = 'leaderboard';
    myBest = Number(message.best) || 0;
    isNewRecord = false;
    load();
    return;
  }

  if (message.type === 'gameover') {
    view = 'gameover';
    myBest = Number(message.best) || 0;
    isNewRecord = !!message.isNewRecord;
    load();
  }
});
