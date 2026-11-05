'use strict';

// 帧耗时基线（Node 侧 JS 成本）。
//
// 用法：
//   node tools/perf.js --seed 1 --frames 3000
//   node tools/perf.js --seed 1 --frames 3000 --json
//
// 说明：
// - 这里测的是“逻辑 + 绘制调用”的纯 JS 开销，不含 GPU/合成。
// - 用途是重写前后的相对对比，绝对值不能直接等同于真机帧时间。
// - 真机数据在 P5 由游戏内探针采集。

var path = require('path');
var createEnv = require('./lib/env').createEnv;

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
var seed = args.seed === undefined ? 1 : Number(args.seed);
var frames = args.frames === undefined ? 3000 : Number(args.frames);
var warmup = args.warmup === undefined ? 300 : Number(args.warmup);

var env = createEnv({ seed: seed });
var state = env.boot();

var GS = env.require('state.js').GS;
var ui = env.require('ui.js');
var ads = env.require('ads.js');

ads.config.enabled = false;

(function enterGame() {
  var layout = ui.getLayout(state);
  if (state.gameState === GS.PRIVACY) {
    env.tapRect(layout.privacyAgree);
    layout = ui.getLayout(state);
  }
  if (state.gameState === GS.START) {
    env.tapRect(layout.startNew);
  }
})();

if (state.gameState !== GS.PLAYING) {
  console.error('failed to enter PLAYING, gameState=' + state.gameState);
  process.exit(1);
}

var i;

for (i = 0; i < warmup; i++) {
  env.step(1);
}

var samples = [];

for (i = 0; i < frames; i++) {
  if (i % 24 === 0) {
    env.tap(state.width * 0.25, state.height * 0.7);
  }

  samples.push(env.stepTimed());

  if (state.gameState !== GS.PLAYING) {
    break;
  }
}

samples.sort(function (a, b) {
  return a - b;
});

function pct(p) {
  if (!samples.length) {
    return 0;
  }
  var idx = Math.min(samples.length - 1, Math.floor(samples.length * p));
  return samples[idx];
}

var result = {
  seed: seed,
  frames: samples.length,
  mean: round(samples.reduce(function (s, v) {
    return s + v;
  }, 0) / Math.max(1, samples.length)),
  p50: round(pct(0.5)),
  p95: round(pct(0.95)),
  p99: round(pct(0.99)),
  max: round(samples[samples.length - 1] || 0)
};

if (args.json) {
  console.log(JSON.stringify(result));
} else {
  console.log('seed=' + result.seed + '  frames=' + result.frames);
  console.log('  mean ' + result.mean + ' ms');
  console.log('  p50  ' + result.p50 + ' ms');
  console.log('  p95  ' + result.p95 + ' ms');
  console.log('  p99  ' + result.p99 + ' ms');
  console.log('  max  ' + result.max + ' ms');
}

if (args.out) {
  var fs = require('fs');
  var outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('written: ' + outPath);
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
