'use strict';

// 生成软件著作权登记用的源代码文档（前 30 页 + 后 30 页，每页 50 行）。
// 用法：node wechat-minigame/tools/build-copyright.js
// 输出：wechat-minigame/docs/copyright/源代码文档.html
// 用 Chrome 打开后「打印 → 另存为 PDF」即可提交。

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var outDir = path.join(root, 'docs', 'copyright');
var LINES_PER_PAGE = 50;
var PAGES = 60;

var SOURCE_FILES = [
  'game.js',
  'core/board.js',
  'core/colors.js',
  'core/difficulty.js',
  'core/geometry.js',
  'core/match.js',
  'core/math.js',
  'core/physics.js',
  'js/ads.js',
  'js/audio.js',
  'js/Block.js',
  'js/checking.js',
  'js/cloud.js',
  'js/consent.js',
  'js/draw.js',
  'js/guard.js',
  'js/Hex.js',
  'js/input.js',
  'js/main.js',
  'js/math.js',
  'js/platform.js',
  'js/rank.js',
  'js/render.js',
  'js/save.js',
  'js/share.js',
  'js/spawn.js',
  'js/state.js',
  'js/Text.js',
  'js/ui.js',
  'js/update.js',
  'js/wavegen.js',
  'openDataContext/index.js'
];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readSource() {
  var lines = [];

  SOURCE_FILES.forEach(function (rel) {
    var full = path.join(root, rel);
    if (!fs.existsSync(full)) {
      return;
    }

    var content = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
    var parts = content.split(/\r?\n/);

    // 版权文档惯例：去掉纯空行
    parts.forEach(function (line) {
      var trimmed = line.replace(/\t/g, '    ').replace(/\s+$/, '');
      if (trimmed.trim() !== '') {
        lines.push(trimmed);
      }
    });
  });

  return lines;
}

function pickLines(lines) {
  var need = LINES_PER_PAGE * PAGES;

  if (lines.length <= need) {
    return lines.slice();
  }

  var half = need / 2;
  return lines.slice(0, half).concat(lines.slice(lines.length - half));
}

function buildHtml(lines) {
  var pages = [];
  var totalPages = Math.ceil(lines.length / LINES_PER_PAGE);

  for (var p = 0; p < totalPages; p++) {
    var start = p * LINES_PER_PAGE;
    var pageLines = lines.slice(start, start + LINES_PER_PAGE);
    var rows = pageLines.map(function (line) {
      return '<div class="ln">' + (escapeHtml(line) || '&nbsp;') + '</div>';
    }).join('');

    pages.push(
      '<section class="page">' +
      '<header>星核轮转（HEXORBIT）小游戏软件 V1.0　源代码</header>' +
      '<main>' + rows + '</main>' +
      '<footer>第 ' + (p + 1) + ' 页 / 共 ' + totalPages + ' 页</footer>' +
      '</section>'
    );
  }

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>星核轮转（HEXORBIT）小游戏软件 V1.0 源代码</title>',
    '<style>',
    '@page { size: A4; margin: 18mm 16mm 16mm 16mm; }',
    'html, body { margin: 0; padding: 0; background: #fff; }',
    'body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; }',
    '.page { page-break-after: always; break-after: page; }',
    '.page:last-child { page-break-after: auto; break-after: auto; }',
    'header { font-size: 10px; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }',
    'main { font-family: Consolas, "Courier New", monospace; font-size: 9.2px; line-height: 1.55; }',
    '.ln { white-space: pre-wrap; word-break: break-all; }',
    'footer { font-size: 10px; color: #555; text-align: center; margin-top: 8px; }',
    '@media screen {',
    '  body { background: #f2f3f5; padding: 16px 0; }',
    '  .page { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 18mm 16mm; margin: 0 auto 16px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.12); }',
    '}',
    '</style>',
    '</head>',
    '<body>',
    pages.join('\n'),
    '</body>',
    '</html>'
  ].join('\n');
}

var all = readSource();
var picked = pickLines(all);
var html = buildHtml(picked);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, '源代码文档.html'), html, 'utf8');

console.log('source lines total:', all.length);
console.log('source lines used :', picked.length);
console.log('pages            :', Math.ceil(picked.length / LINES_PER_PAGE));
console.log('output           :', path.join(outDir, '源代码文档.html'));
