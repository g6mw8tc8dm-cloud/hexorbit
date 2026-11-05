'use strict';

// 语法检查：对参与打包的脚本逐个执行 node --check。
// 用法：node tools/syntax.js

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var root = path.join(__dirname, '..');
var dirs = ['js', 'core', 'openDataContext', '.'];
var files = [];

function walk(dir) {
  var full = path.join(root, dir);

  if (!fs.existsSync(full)) {
    return;
  }

  fs.readdirSync(full).forEach(function (name) {
    var target = path.join(full, name);
    var stat = fs.statSync(target);

    if (stat.isDirectory()) {
      if (name !== 'node_modules' && name !== 'tools' && name !== 'docs' && name !== 'tests') {
        walk(path.join(dir, name));
      }
      return;
    }

    if (name.slice(-3) === '.js') {
      files.push(target);
    }
  });
}

dirs.forEach(walk);

var failed = 0;

files.forEach(function (file) {
  var run = childProcess.spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });

  if (run.status !== 0) {
    failed++;
    console.error('FAIL ' + path.relative(root, file));
    if (run.stderr) {
      console.error(run.stderr.trim());
    }
  }
});

if (failed) {
  console.error(failed + ' file(s) failed syntax check');
  process.exit(1);
}

console.log('syntax ok: ' + files.length + ' files');
