'use strict';

// P0 基线工具：确定性重放，生成“黄金快照”。
//
// 用法：
//   node tools/replay.js --seed 1 --frames 12000 --out tests/golden/seed1.json
//   node tools/replay.js --seed 1 --frames 12000 --table          （打印难度-时间表）
//   node tools/replay.js --curve                                  （纯公式：无消除时的难度曲线）
//
// 设计要点：
// 1. 时钟、随机数全部固定，同一 seed 必须产生同一结果。
// 2. 输入策略是“贪心对色”，目的是让对局真的产生消除、连击、游戏结束，
//    覆盖尽可能多的代码路径。
// 3. 快照只记录语义状态，核心重写前后可直接逐帧比对。

var fs = require('fs');
var path = require('path');
var createEnv = require('./lib/env').createEnv;
var snapshot = require('./lib/snapshot');
var rngLib = require('./lib/rng');

function parseArgs(argv) {
  var out = {};
  for (var i = 2; i < argv.length; i++) {
    var arg = argv[i];
    if (arg.indexOf('--') !== 0) {
      continue;
    }
    var key = arg.slice(2);
    var next = argv[i + 1];

    if (next === undefined || next.indexOf('--') === 0) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

var args = parseArgs(process.argv);

function overallHash(frames) {
  var h = 2166136261;
  for (var i = 0; i < frames.length; i++) {
    var hex = frames[i][1];
    for (var j = 0; j < hex.length; j++) {
      h ^= hex.charCodeAt(j);
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
      h = h >>> 0;
    }
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

// ---------- 纯公式模式：无消除时的难度曲线 ----------
if (args.curve) {
  var settings = {
    speedModifier: 1,
    difficultyGrowth: 2.5,
    difficultyMax: 45
  };

  var diff = 1;
  var ct = 0;
  var marks = [];
  var nextMark = 0;

  for (var frame = 0; frame < 60000 && diff < settings.difficultyMax; frame++) {
    ct += 1;
    var dt = 14 * ct;

    if (diff < settings.difficultyMax) {
      var inc;
      if (diff < 8) {
        inc = dt / 5166667 * settings.speedModifier;
      } else if (diff < 15) {
        inc = dt / 72333333 * settings.speedModifier;
      } else {
        inc = dt / 90000000 * settings.speedModifier;
      }
      diff += inc * 0.5 * settings.difficultyGrowth;
    }

    var seconds = frame / 60;
    if (seconds >= nextMark) {
      marks.push({ seconds: Math.round(seconds), difficulty: Math.round(diff * 100) / 100 });
      nextMark += 30;
    }
  }

  console.log('无消除情况下的难度增长（纯公式，speedModifier=1）：');
  marks.forEach(function (m) {
    console.log('  ' + String(m.seconds).padStart(4) + 's  difficulty=' + m.difficulty);
  });
  return;
}

// ---------- 重放模式 ----------
var seed = args.seed === undefined ? 1 : Number(args.seed);
var maxFrames = args.frames === undefined ? 12000 : Number(args.frames);
var keyframeEvery = args['keyframe-every'] === undefined ? 600 : Number(args['keyframe-every']);

var env = createEnv({ seed: seed });
var state = env.boot();

var GS = env.require('state.js').GS;
var ui = env.require('ui.js');
var ads = env.require('ads.js');

ads.config.enabled = false;

// 输入使用独立随机流，避免消耗游戏本身的随机数
var inputRand = rngLib.derive(seed, 0x51ed270b);

function enterGame() {
  var layout = ui.getLayout(state);
  var guard = 0;

  while (guard++ < 10) {
    if (state.gameState === GS.PRIVACY) {
      env.tapRect(layout.privacyAgree);
    } else if (state.gameState === GS.CHALLENGE_PROMPT) {
      env.tapRect(layout.challengeIgnore);
    } else if (state.gameState === GS.START) {
      env.tapRect(layout.startNew);
      break;
    } else {
      break;
    }
    layout = ui.getLayout(state);
  }
}

// 贪心策略：把当前下落方块转到“最容易凑成三连”的边
function chooseRotation() {
  var hex = state.MainHex;
  if (!hex) {
    return 0;
  }

  var falling = (state.blocks || []).filter(function (b) {
    return !b.settled;
  });

  if (!falling.length) {
    return 0;
  }

  var fallingBlock = falling[0];
  var targetColor = snapshot.colorKey(fallingBlock.color);
  var lanes = snapshot.readLanes(hex);
  var sides = lanes.length || 6;
  var bestLane = 0;
  var bestScore = -1e9;
  var lane;

  for (lane = 0; lane < sides; lane++) {
    var stack = lanes[lane] || [];
    var value = -stack.length * 0.6;
    var top = stack[stack.length - 1];
    var second = stack[stack.length - 2];

    if (top && snapshot.colorKey(top.color) === targetColor) {
      value += 5;
      if (second && snapshot.colorKey(second.color) === targetColor) {
        value += 3;
      }
    }

    if (value > bestScore) {
      bestScore = value;
      bestLane = lane;
    }
  }

  var position = hex.position | 0;
  var currentLane = ((sides - (fallingBlock.fallingLane | 0) + position) % sides + sides) % sides;
  var delta = bestLane - currentLane;

  if (delta > sides / 2) {
    delta -= sides;
  }
  if (delta < -sides / 2) {
    delta += sides;
  }

  return delta;
}

enterGame();

if (state.gameState !== GS.PLAYING) {
  console.error('failed to enter PLAYING, gameState=' + state.gameState);
  process.exit(1);
}

var frames = [];
var keyframes = {};
var maxDifficulty = 0;
var gameOverFrame = -1;
var clears = 0;
var lastClearAt = state.lastClear ? state.lastClear.at : 0;
var halfW = state.width / 2;
var tapY = state.height * 0.7;

for (var f = 0; f < maxFrames; f++) {
  // 每 24 帧（约 400ms）调整一次方向
  if (f > 0 && f % 24 === 0 && state.gameState === GS.PLAYING) {
    var steps = chooseRotation();

    if (steps === 0 && inputRand() < 0.35) {
      steps = inputRand() < 0.5 ? 1 : -1;
    }

    var count = Math.abs(steps);

    for (var s = 0; s < count; s++) {
      if (steps > 0) {
        env.tap(halfW * 0.25, tapY);
      } else {
        env.tap(halfW * 1.75, tapY);
      }
      // rotate() 有 70ms 节流：只推进时钟，不跑帧
      env.advanceClock(80);
    }
  }

  env.step(1);

  var d = snapshot.digest(state);
  var difficulty = state.waveone ? state.waveone.difficulty : 0;

  if (difficulty > maxDifficulty) {
    maxDifficulty = difficulty;
  }

  if (state.lastClear && state.lastClear.at > lastClearAt) {
    lastClearAt = state.lastClear.at;
    clears += state.lastClear.count || 1;
  }

  frames.push([
    f,
    d,
    state.score | 0,
    state.gameState | 0,
    Math.round(difficulty * 1000),
    Math.round(state.waveone ? state.waveone.nextGen : 0)
  ]);

  if (f % keyframeEvery === 0) {
    keyframes[f] = snapshot.keyframe(state);
  }

  if (state.gameState !== GS.PLAYING) {
    if (gameOverFrame < 0) {
      gameOverFrame = f;
    }
    if (!args.restart) {
      break;
    }
    enterGame();
    if (state.gameState !== GS.PLAYING) {
      break;
    }
  }
}

var summary = {
  seed: seed,
  frames: frames.length,
  finalScore: state.score | 0,
  maxDifficulty: Math.round(maxDifficulty * 100) / 100,
  gameOverFrame: gameOverFrame,
  clearedBlocks: clears,
  overallHash: overallHash(frames),
  storageBytes: JSON.stringify(env.storage).length
};

if (args.table) {
  console.log('seed ' + seed + ' 难度-时间表：');
  var step = 600;
  for (var i = 0; i < frames.length; i += step) {
    var row = frames[i];
    console.log(
      '  ' + String(Math.round(i / 60)).padStart(4) + 's  difficulty=' +
      (row[4] / 1000).toFixed(2) + '  score=' + row[2]
    );
  }
  console.log(JSON.stringify(summary));
  return;
}

console.log(JSON.stringify(summary));

if (args.out) {
  var outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    meta: {
      version: 1,
      stage: 'p0',
      seed: seed,
      frames: frames.length,
      frameMs: 16.666,
      createdBy: 'tools/replay.js'
    },
    summary: summary,
    frames: frames,
    keyframes: keyframes
  }));
  console.log('written: ' + outPath);
}
