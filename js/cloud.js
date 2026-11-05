'use strict';

var guard = require('./guard');

var CLOUD_KEY = 'hextris_best_v1';

function getApi() {
  return typeof wx !== 'undefined' ? wx : null;
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

function readBest(callback) {
  var api = getApi();

  if (!api || !api.getUserCloudStorage) {
    callback({ ok: false, found: false, best: 0 });
    return;
  }

  try {
    api.getUserCloudStorage({
      keyList: [CLOUD_KEY],
      success: function (res) {
        var list = (res && res.KVDataList) || [];
        var best = 0;
        var found = false;

        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].key === CLOUD_KEY) {
            var score = parseScore(list[i].value);

            if (guard.validateScore(score)) {
              best = Math.max(best, score);
              found = true;
            }
          }
        }

        callback({ ok: true, found: found, best: best });
      },
      fail: function () {
        callback({ ok: false, found: false, best: 0 });
      }
    });
  } catch (e) {
    callback({ ok: false, found: false, best: 0 });
  }
}

function writeBest(score, callback) {
  var api = getApi();

  if (!api || !api.setUserCloudStorage) {
    callback(false);
    return;
  }

  try {
    api.setUserCloudStorage({
      KVDataList: [
        {
          key: CLOUD_KEY,
          value: JSON.stringify({
            score: score,
            updatedAt: Date.now()
          })
        }
      ],
      success: function () {
        callback(true);
      },
      fail: function () {
        callback(false);
      }
    });
  } catch (e) {
    callback(false);
  }
}

function loadBest(state, callback) {
  readBest(function (result) {
    if (result.ok) {
      state.cloudBest = result.best;

      if (result.found && result.best > state.bestScore) {
        state.bestScore = result.best;
      } else if (
        (!result.found || state.bestScore > result.best) &&
        state.bestScore > 0 &&
        guard.validateScore(state.bestScore)
      ) {
        // 本地有纪录、云端没有或更低时，补一次同步
        writeBest(state.bestScore, function (ok) {
          if (ok) {
            state.cloudBest = state.bestScore;
          }
        });
      }
    }

    if (callback) {
      callback(state.bestScore);
    }
  });
}

function submitIfRecord(state, score, isNewRecord, callback) {
  if (!isNewRecord) {
    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  if (!guard.validateScore(score)) {
    state.scoreBlocked = true;

    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  if (!guard.canUpload(state, score).ok) {
    if (callback) {
      callback(false, state.bestScore);
    }
    return;
  }

  readBest(function (result) {
    var cloudBest = result.ok ? result.best : 0;

    // 云端已经是更高分时，不覆盖
    if (result.ok && result.found && cloudBest >= score) {
      state.cloudBest = cloudBest;
      state.bestScore = Math.max(state.bestScore, cloudBest);

      if (callback) {
        callback(false, state.bestScore);
      }
      return;
    }

    writeBest(score, function (ok) {
      if (ok) {
        state.bestScore = Math.max(state.bestScore, score);
        state.cloudBest = Math.max(cloudBest, score);
        guard.markUpload(state);
      }

      if (callback) {
        callback(ok, Math.max(cloudBest, state.bestScore));
      }
    });
  });
}

module.exports = {
  CLOUD_KEY: CLOUD_KEY,
  loadBest: loadBest,
  submitIfRecord: submitIfRecord
};
