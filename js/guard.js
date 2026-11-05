'use strict';

var UPLOAD_LOG_KEY = 'hextris.upload.v1';
var MAX_SCORE = 1000000;
var MIN_UPLOAD_INTERVAL = 30 * 1000;
var MAX_UPLOADS_PER_HOUR = 5;

function validateScore(score) {
  var n = Number(score);
  return isFinite(n) && n >= 0 && Math.floor(n) === n && n <= MAX_SCORE;
}

function readLog(state) {
  var raw = state.platform.storage.get(UPLOAD_LOG_KEY, null);

  if (!raw || !Array.isArray(raw.times)) {
    return [];
  }

  var now = Date.now();
  var list = [];

  for (var i = 0; i < raw.times.length; i++) {
    var t = Number(raw.times[i]);
    if (isFinite(t) && now - t >= 0 && now - t < 60 * 60 * 1000) {
      list.push(t);
    }
  }

  return list;
}

function canUpload(state, score) {
  if (!validateScore(score)) {
    return { ok: false, reason: 'score' };
  }

  var times = readLog(state);
  var now = Date.now();

  if (times.length >= MAX_UPLOADS_PER_HOUR) {
    return { ok: false, reason: 'rate' };
  }

  var last = times.length ? times[times.length - 1] : 0;
  if (last && now - last < MIN_UPLOAD_INTERVAL) {
    return { ok: false, reason: 'rate' };
  }

  return { ok: true, reason: '' };
}

function markUpload(state) {
  var times = readLog(state);
  times.push(Date.now());

  state.platform.storage.set(UPLOAD_LOG_KEY, {
    times: times
  });
}

module.exports = {
  MAX_SCORE: MAX_SCORE,
  MIN_UPLOAD_INTERVAL: MIN_UPLOAD_INTERVAL,
  MAX_UPLOADS_PER_HOUR: MAX_UPLOADS_PER_HOUR,
  validateScore: validateScore,
  canUpload: canUpload,
  markUpload: markUpload
};
