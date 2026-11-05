'use strict';

var SETTINGS_KEY = require('./state').SETTINGS_KEY;

function AudioManager(state) {
  this.state = state;
  this.api = typeof wx !== 'undefined' ? wx : null;
  this.enabled = !!(this.api && this.api.createInnerAudioContext);
  this.bgm = null;
  this.sfx = {};
  this.bgmPlaying = false;

  if (!this.enabled) {
    return;
  }

  try {
    if (this.api.setInnerAudioOption) {
      this.api.setInnerAudioOption({
        mixWithOther: true,
        obeyMuteSwitch: true
      });
    }
  } catch (e) {
    // 部分基础库不支持，忽略
  }

  this.bgm = this.create('audio/bgm.wav', true, 0.26);
  this.sfx.rotate = this.create('audio/rotate.wav', false, 0.16);
  this.sfx.drop = this.create('audio/drop.wav', false, 0.24);
  this.sfx.clear = this.create('audio/clear.wav', false, 0.24);
  this.sfx.gameover = this.create('audio/gameover.wav', false, 0.24);
  this.sfx.click = this.create('audio/click.wav', false, 0.10);
}

AudioManager.prototype.create = function (src, loop, volume) {
  var ctx;
  try {
    ctx = this.api.createInnerAudioContext();
  } catch (e) {
    return null;
  }

  if (!ctx) {
    return null;
  }

  ctx.src = src;
  ctx.loop = !!loop;
  ctx.volume = volume;
  ctx.obeyMuteSwitch = true;

  // 音频失败时不打断游戏
  if (ctx.onError) {
    ctx.onError(function () {});
  }

  return ctx;
};

AudioManager.prototype.playBgm = function () {
  if (!this.enabled || !this.bgm || !this.state.sound.music) {
    return;
  }

  if (this.bgmPlaying && this.bgm.paused !== true) {
    return;
  }

  try {
    this.bgm.play();
    this.bgmPlaying = true;
  } catch (e) {
    this.bgmPlaying = false;
  }
};

AudioManager.prototype.pauseBgm = function () {
  if (!this.bgm) {
    return;
  }

  try {
    this.bgm.pause();
  } catch (e) {
    // ignore
  }
  this.bgmPlaying = false;
};

AudioManager.prototype.stopBgm = function () {
  if (!this.bgm) {
    return;
  }

  try {
    this.bgm.stop();
  } catch (e) {
    // ignore
  }
  this.bgmPlaying = false;
};

AudioManager.prototype.playSfx = function (name) {
  if (!this.enabled || !this.state.sound.sfx) {
    return;
  }

  var audio = this.sfx[name];
  if (!audio) {
    return;
  }

  try {
    audio.stop();
  } catch (e) {
    // ignore
  }

  try {
    audio.play();
  } catch (e2) {
    // ignore
  }
};

AudioManager.prototype.setMusic = function (on) {
  this.state.sound.music = !!on;

  if (on) {
    this.playBgm();
  } else {
    this.pauseBgm();
  }

  this.persist();
};

AudioManager.prototype.setSfx = function (on) {
  this.state.sound.sfx = !!on;
  this.persist();

  if (on) {
    this.playSfx('click');
  }
};

AudioManager.prototype.setVibrate = function (on) {
  this.state.sound.vibrate = !!on;
  this.persist();

  if (on) {
    this.state.platform.vibrate();
  }
};

AudioManager.prototype.persist = function () {
  try {
    this.state.platform.storage.set(SETTINGS_KEY, this.state.sound);
  } catch (e) {
    // ignore
  }
};

AudioManager.prototype.unlock = function () {
  this.playBgm();
};

module.exports = {
  AudioManager: AudioManager
};
