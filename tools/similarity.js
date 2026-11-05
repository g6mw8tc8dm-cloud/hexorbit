'use strict';

// 相似度度量：把当前实现与原版 Hextris 的源码做 n-gram 比对。
//
// 用法：node tools/similarity.js
//
// 指标说明：
// - 归一化：去注释、压空白、去掉 { } ; 等结构性标点
// - 5-gram：把 token 序列切成 5 个一组的窗口，计算当前实现里
//   “能在原版中找到的窗口”占比
// - 该指标用于趋势判断，不是法律意义上的代码比对结论

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var originalDir = path.join(root, '..', 'js');
var N = 5;

function normalize(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[{};]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text) {
  return normalize(text).split(' ').filter(Boolean);
}

function shingles(list) {
  var set = new Set();
  for (var i = 0; i + N <= list.length; i++) {
    set.add(list.slice(i, i + N).join(' '));
  }
  return set;
}

function readDir(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(function (name) {
      return name.slice(-3) === '.js';
    })
    .map(function (name) {
      return {
        name: name,
        text: fs.readFileSync(path.join(dir, name), 'utf8')
      };
    });
}

var originalFiles = readDir(originalDir);
var originalShingles = originalFiles.map(function (file) {
  return { name: file.name, set: shingles(tokens(file.text)) };
});

var targets = [];
readDir(path.join(root, 'js')).forEach(function (file) {
  targets.push({ name: 'js/' + file.name, text: file.text });
});
readDir(path.join(root, 'core')).forEach(function (file) {
  targets.push({ name: 'core/' + file.name, text: file.text });
});

var rows = [];

targets.forEach(function (target) {
  var list = tokens(target.text);

  if (list.length < N) {
    return;
  }

  var own = shingles(list);
  var best = { name: '-', score: 0 };

  originalShingles.forEach(function (original) {
    var hit = 0;
    own.forEach(function (gram) {
      if (original.set.has(gram)) {
        hit++;
      }
    });
    var score = hit / own.size;

    if (score > best.score) {
      best = { name: original.name, score: score };
    }
  });

  rows.push({
    file: target.name,
    tokens: list.length,
    bestMatch: best.name,
    similarity: best.score
  });
});

rows.sort(function (a, b) {
  return b.similarity - a.similarity;
});

console.log('文件'.padEnd(24) + 'token'.padStart(7) + '  最相似原版文件'.padEnd(22) + '重合度');
console.log('-'.repeat(76));

rows.forEach(function (row) {
  console.log(
    row.file.padEnd(24) +
    String(row.tokens).padStart(7) +
    '  ' +
    String(row.bestMatch).padEnd(20) +
    (row.similarity * 100).toFixed(1) + '%'
  );
});

var weighted = rows.reduce(function (sum, row) {
  return sum + row.similarity * row.tokens;
}, 0);
var total = rows.reduce(function (sum, row) {
  return sum + row.tokens;
}, 0);

console.log('-'.repeat(76));
console.log('加权平均重合度：' + (weighted / Math.max(1, total) * 100).toFixed(1) + '%');
console.log('最高单文件重合度：' + (rows[0] ? (rows[0].similarity * 100).toFixed(1) + '% (' + rows[0].file + ')' : '-'));
