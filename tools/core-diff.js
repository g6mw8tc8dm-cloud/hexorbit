'use strict';

// 新旧核心一致性比对。
//
// 用法：
//   node tools/core-diff.js                      （比对 tests/golden 下全部快照）
//   node tools/core-diff.js --seed 1             （只比对一个 seed）
//   node tools/core-diff.js --tolerance 1        （允许分数/难度偏差 1，用于定点数改造）
//
// 判定：逐帧摘要必须完全一致；不一致时输出第一处分歧的帧号与上下文。

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

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
var root = path.join(__dirname, '..');
var goldenDir = path.join(root, 'tests', 'golden');
var tmpDir = path.join(root, 'tests', 'tmp');
var tolerance = args.tolerance === undefined ? 0 : Number(args.tolerance);

fs.mkdirSync(tmpDir, { recursive: true });

var files = fs.readdirSync(goldenDir).filter(function (name) {
  return /^seed\d+\.json$/.test(name);
});

if (args.seed !== undefined) {
  files = files.filter(function (name) {
    return name === 'seed' + args.seed + '.json';
  });
}

if (!files.length) {
  console.error('no golden snapshots found in ' + goldenDir);
  process.exit(1);
}

var failures = 0;

files.forEach(function (name) {
  var goldenPath = path.join(goldenDir, name);
  var golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  var seed = golden.meta.seed;
  var outPath = path.join(tmpDir, 'check-' + seed + '.json');

  var run = childProcess.spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'replay.js'),
      '--seed', String(seed),
      '--frames', String(golden.summary.frames),
      '--out', outPath
    ],
    { cwd: root, encoding: 'utf8' }
  );

  if (run.status !== 0) {
    console.error('[' + name + '] replay failed');
    console.error(run.stdout || '');
    console.error(run.stderr || '');
    failures++;
    return;
  }

  var actual = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  var report = compare(golden, actual);

  if (report.ok) {
    console.log('[' + name + '] OK  frames=' + golden.summary.frames +
      '  hash=' + golden.summary.overallHash);
  } else {
    failures++;
    console.error('[' + name + '] DIVERGED at frame ' + report.index);
    console.error('  golden: ' + JSON.stringify(report.expected));
    console.error('  actual: ' + JSON.stringify(report.actual));
    printContext(golden, report.index);
    printContext(actual, report.index);
  }
});

if (failures) {
  console.error('\n' + failures + ' snapshot(s) diverged');
  process.exit(1);
}

console.log('\nAll snapshots match.');

function compare(expected, actual) {
  var a = expected.frames;
  var b = actual.frames;
  var n = Math.min(a.length, b.length);

  for (var i = 0; i < n; i++) {
    if (!rowEqual(a[i], b[i])) {
      return { ok: false, index: i, expected: a[i], actual: b[i] };
    }
  }

  if (a.length !== b.length) {
    return {
      ok: false,
      index: n,
      expected: a[n] || '(end at ' + a.length + ')',
      actual: b[n] || '(end at ' + b.length + ')'
    };
  }

  return { ok: true };
}

function rowEqual(x, y) {
  if (!x || !y || x.length !== y.length) {
    return false;
  }

  for (var i = 0; i < x.length; i++) {
    if (i === 2 || i === 4) {
      // score / difficulty 允许容差（仅在显式指定时）
      if (Math.abs(x[i] - y[i]) > tolerance) {
        return false;
      }
    } else if (x[i] !== y[i]) {
      return false;
    }
  }

  return true;
}

function printContext(snapshot, index) {
  var from = Math.max(0, index - 2);
  var to = Math.min(snapshot.frames.length - 1, index + 2);
  var lines = [];

  for (var i = from; i <= to; i++) {
    lines.push('    f=' + i + ' ' + JSON.stringify(snapshot.frames[i]));
  }

  if (snapshot.keyframes && snapshot.keyframes[index]) {
    lines.push('    keyframe: ' + JSON.stringify(snapshot.keyframes[index]));
  }

  console.error('  ' + JSON.stringify(snapshot.meta));
  console.error(lines.join('\n'));
}
