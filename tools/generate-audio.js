'use strict';

// 生成小游戏用的 WAV 音频文件。
// 用法：node wechat-minigame/tools/generate-audio.js

var fs = require('fs');
var path = require('path');

var OUT_DIR = path.join(__dirname, '..', 'audio');
var SAMPLE_RATE = 22050;

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

function writeWav(name, samples) {
  var count = samples.length;
  var peak = 0;
  var i;

  for (i = 0; i < count; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0) {
    var scale = 0.82 / peak;
    for (i = 0; i < count; i++) {
      samples[i] *= scale;
    }
  }

  var buffer = Buffer.alloc(44 + count * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + count * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(count * 2, 40);

  for (i = 0; i < count; i++) {
    var s = clamp(samples[i], -1, 1);
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  var file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, buffer);
  console.log('wrote', file, (buffer.length / 1024).toFixed(1) + ' KB');
}

function sine(phase) {
  return Math.sin(phase * Math.PI * 2);
}

function triangle(phase) {
  return 2 / Math.PI * Math.asin(Math.sin(phase * Math.PI * 2));
}

function softSquare(phase) {
  return Math.tanh(3.2 * Math.sin(phase * Math.PI * 2)) / Math.tanh(3.2);
}

function addTone(buffer, freq, start, duration, gain, waveform, attack, release, vibrato) {
  var begin = Math.floor(start * SAMPLE_RATE);
  var end = Math.min(buffer.length, Math.floor((start + duration) * SAMPLE_RATE));
  var phase = 0;
  var attackSamples = Math.max(1, Math.floor((attack || 0.01) * SAMPLE_RATE));
  var releaseSamples = Math.max(1, Math.floor((release || 0.05) * SAMPLE_RATE));
  var total = end - begin;

  for (var i = 0; i < total; i++) {
    var t = i / SAMPLE_RATE;
    var f = freq;
    if (vibrato) {
      f *= 1 + Math.sin(t * Math.PI * 2 * 5.2) * vibrato;
    }
    phase += f / SAMPLE_RATE;

    var env = 1;
    if (i < attackSamples) {
      env = i / attackSamples;
    }
    if (i > total - releaseSamples) {
      env = Math.min(env, (total - i) / releaseSamples);
    }

    var value;
    if (waveform === 'triangle') {
      value = triangle(phase);
    } else if (waveform === 'square') {
      value = softSquare(phase);
    } else {
      value = sine(phase);
    }

    buffer[begin + i] += value * gain * env;
  }
}

function addNoise(buffer, start, duration, gain, decay) {
  var begin = Math.floor(start * SAMPLE_RATE);
  var total = Math.floor(duration * SAMPLE_RATE);
  var end = Math.min(buffer.length, begin + total);

  for (var i = begin; i < end; i++) {
    var t = (i - begin) / Math.max(1, end - begin);
    var env = Math.pow(1 - t, decay || 2);
    buffer[i] += (Math.random() * 2 - 1) * gain * env;
  }
}

function addChord(buffer, freqs, start, duration, gain) {
  for (var i = 0; i < freqs.length; i++) {
    addTone(buffer, freqs[i], start, duration, gain, 'sine', 0.18, 0.35, 0.002);
  }
}

// ---------------------------------------------------------------------------
// 背景音乐：8 小节，100 BPM，Am - F - C - G，可循环
// ---------------------------------------------------------------------------

function buildBgm() {
  var bpm = 100;
  var beat = 60 / bpm;
  var bar = beat * 4;
  var bars = 8;
  var total = bar * bars;
  var buffer = new Float32Array(Math.ceil(total * SAMPLE_RATE));

  var chords = [
    { root: 110.00, notes: [220.00, 261.63, 329.63] }, // Am
    { root: 87.31, notes: [174.61, 220.00, 261.63] },  // F
    { root: 130.81, notes: [261.63, 329.63, 392.00] }, // C
    { root: 98.00, notes: [196.00, 246.94, 293.66] }   // G
  ];

  var melodies = [
    [440.00, 523.25, 659.25, 587.33, 523.25, 440.00, 392.00, 440.00],
    [349.23, 440.00, 523.25, 698.46, 659.25, 523.25, 440.00, 392.00],
    [392.00, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 392.00],
    [493.88, 587.33, 783.99, 698.46, 587.33, 493.88, 440.00, 392.00]
  ];

  for (var b = 0; b < bars; b++) {
    var chord = chords[b % 4];
    var barStart = b * bar;

    addChord(buffer, chord.notes, barStart, bar, 0.045);
    addTone(buffer, chord.root, barStart, beat * 1.4, 0.15, 'triangle', 0.01, 0.12, 0);
    addTone(buffer, chord.root, barStart + beat * 2, beat * 1.2, 0.13, 'triangle', 0.01, 0.12, 0);
    addTone(buffer, chord.root * 1.5, barStart + beat * 3.5, beat * 0.4, 0.07, 'triangle', 0.01, 0.08, 0);

    var arp = [chord.notes[0], chord.notes[1], chord.notes[2], chord.notes[1], chord.notes[2], chord.notes[0] * 2, chord.notes[2], chord.notes[1]];
    for (var a = 0; a < 8; a++) {
      addTone(buffer, arp[a], barStart + a * beat * 0.5, beat * 0.42, 0.055, 'triangle', 0.008, 0.06, 0.003);
    }

    var melody = melodies[b % 4];
    for (var m = 0; m < melody.length; m++) {
      var noteStart = barStart + m * beat * 0.5;
      var noteLen = beat * 0.62;
      if (m % 2 === 1) {
        noteLen = beat * 0.38;
      }
      addTone(buffer, melody[m], noteStart, noteLen, 0.075, 'square', 0.012, 0.08, 0.004);
    }

    addNoise(buffer, barStart, 0.035, 0.012, 3);
    addNoise(buffer, barStart + beat * 2, 0.035, 0.01, 3);
    addNoise(buffer, barStart + beat * 3.5, 0.025, 0.008, 3);
  }

  // 首尾各做 8ms 淡入淡出，避免循环爆音
  var fade = Math.floor(0.008 * SAMPLE_RATE);
  for (var i = 0; i < fade; i++) {
    buffer[i] *= i / fade;
    buffer[buffer.length - 1 - i] *= i / fade;
  }

  for (i = 0; i < buffer.length; i++) {
    buffer[i] = Math.tanh(buffer[i] * 1.15) * 0.85;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// 音效
// ---------------------------------------------------------------------------

function buildRotate() {
  var buffer = new Float32Array(Math.ceil(0.075 * SAMPLE_RATE));
  addTone(buffer, 980, 0, 0.045, 0.13, 'triangle', 0.002, 0.03, 0.01);
  addTone(buffer, 720, 0.02, 0.04, 0.08, 'triangle', 0.002, 0.03, 0);
  addNoise(buffer, 0, 0.018, 0.02, 3);
  return buffer;
}

function buildDrop() {
  var buffer = new Float32Array(Math.ceil(0.16 * SAMPLE_RATE));
  addTone(buffer, 170, 0, 0.14, 0.28, 'sine', 0.004, 0.12, 0);
  addTone(buffer, 92, 0.015, 0.12, 0.16, 'triangle', 0.004, 0.10, 0);
  addNoise(buffer, 0, 0.05, 0.02, 4);
  return buffer;
}

function buildClear() {
  var buffer = new Float32Array(Math.ceil(0.46 * SAMPLE_RATE));
  var notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
  for (var i = 0; i < notes.length; i++) {
    addTone(buffer, notes[i], i * 0.055, 0.16, 0.14, 'triangle', 0.004, 0.12, 0.003);
  }
  addTone(buffer, 1567.98, 0.2, 0.2, 0.05, 'sine', 0.01, 0.18, 0.004);
  addNoise(buffer, 0.02, 0.18, 0.012, 2);
  return buffer;
}

function buildGameOver() {
  var buffer = new Float32Array(Math.ceil(1.0 * SAMPLE_RATE));
  var notes = [440.00, 349.23, 293.66, 220.00];
  for (var i = 0; i < notes.length; i++) {
    addTone(buffer, notes[i], i * 0.2, 0.28, 0.16, 'square', 0.006, 0.16, 0.004);
    addTone(buffer, notes[i] / 2, i * 0.2, 0.28, 0.08, 'triangle', 0.006, 0.16, 0);
  }
  addNoise(buffer, 0.72, 0.2, 0.015, 2);
  return buffer;
}

function buildClick() {
  var buffer = new Float32Array(Math.ceil(0.05 * SAMPLE_RATE));
  addTone(buffer, 1050, 0, 0.035, 0.12, 'sine', 0.002, 0.03, 0);
  addNoise(buffer, 0, 0.012, 0.015, 3);
  return buffer;
}

writeWav('bgm.wav', buildBgm());
writeWav('rotate.wav', buildRotate());
writeWav('drop.wav', buildDrop());
writeWav('clear.wav', buildClear());
writeWav('gameover.wav', buildGameOver());
writeWav('click.wav', buildClick());
