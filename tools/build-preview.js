'use strict';

// 仅用于浏览器里预览小游戏画面，不参与上传。
// 用法：node wechat-minigame/tools/build-preview.js
// 然后打开 wechat-minigame/tools/preview.html

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var files = [];

function walk(dir) {
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.name === 'tools') {
      continue;
    }
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.js$/.test(entry.name)) {
      files.push(full);
    }
  }
}

walk(root);

var modulesSource = 'var modules = {};\n';

files.forEach(function (file) {
  var rel = path.relative(root, file).replace(/\\/g, '/');
  var code = fs.readFileSync(file, 'utf8');
  modulesSource += 'modules[' + JSON.stringify(rel) + '] = function(module, exports, require) {\n' + code + '\n};\n';
});

var bundle = [
  '(function () {',
  modulesSource,
  'var cache = {};',
  'function resolve(from, request) {',
  '  if (request.charAt(0) !== ".") { return request; }',
  '  var base = from.split("/").slice(0, -1);',
  '  var parts = request.split("/");',
  '  for (var i = 0; i < parts.length; i++) {',
  '    if (!parts[i] || parts[i] === ".") { continue; }',
  '    if (parts[i] === "..") { base.pop(); } else { base.push(parts[i]); }',
  '  }',
  '  var id = base.join("/");',
  '  if (!/\\.js$/.test(id)) { id += ".js"; }',
  '  return id;',
  '}',
  'function makeRequire(from) {',
  '  return function (request) {',
  '    var id = resolve(from, request);',
  '    if (!modules[id]) { throw new Error("Cannot find module " + request + " from " + from); }',
  '    if (!cache[id]) {',
  '      var m = { exports: {} };',
  '      cache[id] = m;',
  '      modules[id](m, m.exports, makeRequire(id));',
  '    }',
  '    return cache[id].exports;',
  '  };',
  '}',
  'makeRequire("game.js")("game.js");',
  '})();'
].join('\n');

fs.writeFileSync(path.join(__dirname, 'preview.bundle.js'), bundle, 'utf8');

var html = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
  '<title>HEXORBIT 星核轮转 微信小游戏预览</title>',
  '<style>',
  'html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#ecf0f1;}',
  '#gameCanvas{display:block;width:100vw;height:100vh;}',
  '</style>',
  '</head>',
  '<body>',
  '<canvas id="gameCanvas"></canvas>',
  '<script>',
  'window.wx = {',
  '  getWindowInfo: function () {',
  '    return {',
  '      windowWidth: window.innerWidth,',
  '      windowHeight: window.innerHeight,',
  '      pixelRatio: window.devicePixelRatio || 1,',
  '      safeArea: { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }',
  '    };',
  '  },',
  '  createCanvas: function () { return document.getElementById("gameCanvas"); },',
  '  getStorageSync: function (key) {',
  '    var raw = localStorage.getItem(key);',
  '    if (raw === null) { return ""; }',
  '    try { return JSON.parse(raw); } catch (e) { return raw; }',
  '  },',
  '  setStorageSync: function (key, value) { localStorage.setItem(key, JSON.stringify(value)); },',
  '  removeStorageSync: function (key) { localStorage.removeItem(key); },',
  '  onTouchStart: function (handler) {',
  '    document.addEventListener("touchstart", function (e) { handler(e); }, { passive: true });',
  '    document.addEventListener("mousedown", function (e) { handler(e); });',
  '  },',
  '  onHide: function (handler) { document.addEventListener("visibilitychange", function () { if (document.hidden) { handler(); } }); },',
  '  onShow: function (handler) { document.addEventListener("visibilitychange", function () { if (!document.hidden) { handler(); } }); },',
  '  showShareMenu: function () {},',
  '  onShareAppMessage: function () {},',
  '  shareAppMessage: function (options) { console.log("share", options); },',
  '  vibrateShort: function () {},',
  '  setKeepScreenOn: function () {},',
  '  setInnerAudioOption: function () {},',
  '  createInnerAudioContext: function () {',
  '    var audio = new Audio();',
  '    function resolve(src) { return src.indexOf("audio/") === 0 ? "../" + src : src; }',
  '    var api = {',
  '      src: "", loop: false, volume: 1, obeyMuteSwitch: true, paused: true,',
  '      play: function () {',
  '        audio.src = resolve(api.src);',
  '        audio.loop = api.loop;',
  '        audio.volume = api.volume;',
  '        api.paused = false;',
  '        var p = audio.play();',
  '        if (p && p.catch) { p.catch(function () { api.paused = true; }); }',
  '      },',
  '      pause: function () { api.paused = true; audio.pause(); },',
  '      stop: function () { api.paused = true; audio.pause(); audio.currentTime = 0; },',
  '      onError: function (cb) { audio.addEventListener("error", cb); },',
  '      destroy: function () { audio.pause(); audio.src = ""; }',
  '    };',
  '    return api;',
  '  },',
  '  createRewardedVideoAd: function () {',
  '    var closeHandler = null;',
  '    return {',
  '      load: function () { return Promise.resolve(); },',
  '      show: function () {',
  '        console.log("mock rewarded ad");',
  '        setTimeout(function () { if (closeHandler) { closeHandler({ isEnded: true }); } }, 400);',
  '        return Promise.resolve();',
  '      },',
  '      onClose: function (cb) { closeHandler = cb; },',
  '      onError: function () {},',
  '      destroy: function () {}',
  '    };',
  '  },',
  '  createBannerAd: function (options) {',
  '    var ad = {',
  '      style: (options && options.style) || {},',
  '      show: function () { console.log("mock banner show", ad.style); return Promise.resolve(); },',
  '      hide: function () { return Promise.resolve(); },',
  '      onResize: function (cb) { setTimeout(function () { cb({ width: ad.style.width, height: 96 }); }, 0); },',
  '      onError: function () {},',
  '      destroy: function () {}',
  '    };',
  '    return ad;',
  '  }',
  '};',
  '</script>',
  '<script src="preview.bundle.js"></script>',
  '</body>',
  '</html>'
].join('\n');

fs.writeFileSync(path.join(__dirname, 'preview.html'), html, 'utf8');

console.log('preview written:');
console.log(path.join(__dirname, 'preview.html'));
