'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AUDIO — procedural Web Audio. Lazy context (autoplay policy), so nothing
//  is created until the first keystroke.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let _ac = null;
function ac() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}
let _master = null;
function master() {
  if (!_master) {
    _master = ac().createGain();
    _master.gain.value = 0.4;
    _master.connect(ac().destination);
  }
  return _master;
}

function osc(type, f0, f1, gain, dur, dest) {
  const ctx = ac(), now = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
  o.connect(g); g.connect(dest || master());
  o.start(now); o.stop(now + dur + 0.02);
}

function noiseBurst(gain, dur, lpFreq, dest) {
  const ctx = ac(), now = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = gain;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpFreq || 1200;
  src.connect(lp); lp.connect(g); g.connect(dest || master());
  src.start(now);
}

const SFX = {
  // a sandal slapping dust
  step: function () { noiseBurst(0.16, 0.09, 900 + Math.random() * 500); },
  start: function () { osc('sine', 320, 480, 0.12, 0.18); },
  // going down hard
  thud: function () {
    noiseBurst(0.5, 0.4, 260);
    osc('sine', 130, 46, 0.35, 0.5);
  },
  // the watchman's voice carrying off the wall
  call: function () {
    osc('triangle', 520, 520, 0.07, 0.14);
    setTimeout(function () { osc('triangle', 660, 660, 0.06, 0.20); }, 130);
  },
  // overtaking him
  pass: function () {
    osc('triangle', 440, 660, 0.13, 0.22);
    setTimeout(function () { osc('triangle', 660, 880, 0.11, 0.28); }, 110);
  },
  // the gate of Mahanaim
  horn: function () {
    osc('sawtooth', 196, 196, 0.16, 0.9);
    osc('sawtooth', 294, 294, 0.10, 1.1);
    setTimeout(function () { osc('sawtooth', 392, 392, 0.12, 1.3); }, 220);
  },
  // O my son Absalom
  wail: function () {
    osc('sine', 330, 196, 0.13, 1.8);
    setTimeout(function () { osc('sine', 262, 165, 0.11, 2.2); }, 500);
  },
};
