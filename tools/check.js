'use strict';

// 统一验收命令。每一步改造前后都跑这一条。
//
// 用法：node tools/check.js            （全量）
//       node tools/check.js --quick    （跳过黄金快照，只跑冒烟）
//
// 退出码 0 表示全部通过。

var path = require('path');
var childProcess = require('child_process');

var root = path.join(__dirname, '..');
var quick = process.argv.indexOf('--quick') !== -1;

var steps = [
  { name: '语法检查', cmd: 'node', args: ['tools/syntax.js'] },
  { name: '核心单测', cmd: 'node', args: ['tools/core-test.js'] },
  { name: '主流程冒烟', cmd: 'node', args: ['tools/simulate.js'] },
  { name: '开放数据域冒烟', cmd: 'node', args: ['tools/simulate-open-data.js'] }
];

if (!quick) {
  steps.push({ name: '核心一致性', cmd: 'node', args: ['tools/core-diff.js'] });
}

var failed = 0;

steps.forEach(function (step) {
  var started = Date.now();
  var run = childProcess.spawnSync(step.cmd, step.args, {
    cwd: root,
    encoding: 'utf8'
  });

  var elapsed = Date.now() - started;
  var ok = run.status === 0;

  if (!ok) {
    failed++;
  }

  console.log((ok ? 'PASS ' : 'FAIL ') + step.name + '  (' + elapsed + 'ms)');

  if (!ok) {
    if (run.stdout) {
      console.log(indent(run.stdout));
    }
    if (run.stderr) {
      console.log(indent(run.stderr));
    }
  }
});

if (failed) {
  console.log('\n' + failed + ' step(s) failed');
  process.exit(1);
}

console.log('\nAll checks passed.');

function indent(text) {
  return String(text).trim().split(/\r?\n/).map(function (line) {
    return '  ' + line;
  }).join('\n');
}
