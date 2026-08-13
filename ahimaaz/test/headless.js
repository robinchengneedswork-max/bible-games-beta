'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HEADLESS — loads every module the way index.html does, with the DOM,
//  canvas and Web Audio stubbed, then drives the real key handlers.
//  Catches load-order breaks, typos and dead references without a browser.
//
//    node test/headless.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const chk = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
};

// ── stubs ────────────────────────────────────────
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 40 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} });
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

const canvas = {
  clientWidth: 1280, clientHeight: 720, width: 0, height: 0,
  getContext: () => ctx2d, addEventListener() {},
};

function makeEl() {
  return {
    textContent: '', innerHTML: '', value: '', style: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
                 contains(c) { return this._s.has(c); } },
    addEventListener() {}, appendChild() {},
  };
}
const els = {};
const listeners = {};

const sandbox = {
  Math, console, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, isNaN, parseFloat, parseInt,
  setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0,          // never actually loops
  devicePixelRatio: 1,
  document: {
    getElementById(id) {
      if (id === 'gameCanvas') return canvas;
      if (!els[id]) els[id] = makeEl();
      return els[id];
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.addEventListener = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
sandbox.addEventListener = sandbox.window.addEventListener;
sandbox.AudioContext = function () {
  return {
    state: 'running', currentTime: 0, sampleRate: 44100,
    resume() {}, destination: {},
    createGain: () => ({ gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
    createOscillator: () => ({ type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                               connect() {}, start() {}, stop() {} }),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
    createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect() {} }),
  };
};

const ctx = vm.createContext(sandbox);

// ── load in the same order as index.html ─────────
const ORDER = ['config.js', 'audio.js', 'ragdoll.js', 'state.js', 'input.js',
               'logic.js', 'render.js', 'ui.js', 'main.js'];
console.log('headless integration');
let loadErr = null;
try {
  for (const f of ORDER)
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
} catch (e) { loadErr = e; }
chk('every module loads in index.html order', !loadErr, loadErr && (loadErr.message + '\n       ' + String(loadErr.stack).split('\n')[1]));
if (loadErr) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

const api = vm.runInContext(`({
  GS, KEYS, startRun, beginBrief, advanceBrief, updateRun, updateSprawl, drawFrame,
  toAudience, answerDavid, showTitle, resetRun, bodyX, arrive,
  PHYS_DT, PX_PER_CUBIT, GOAL_CUBITS, CUSHITE_PACE, CUSHITE_LEAD, FALL_GRACE_MS, BRIEF_LINES, SOURCES
})`, ctx);

// Move the WHOLE body, not one point — shifting a single node just gets
// yanked back by the constraint solver on the next step.
function teleportToGate() {
  const p = api.GS.body.p;
  const dx = (api.GOAL_CUBITS + 2) * api.PX_PER_CUBIT - p[2].x;
  for (let i = 0; i < p.length; i++) { p[i].x += dx; p[i].px += dx; }
}

const key = (code, down) => {
  const evs = listeners[down ? 'keydown' : 'keyup'] || [];
  for (const fn of evs) fn({ code, repeat: false, preventDefault() {} });
};

// ── 1. the opening flow ──────────────────────────
chk('starts on the title screen', api.GS.phase === 'title', 'phase=' + api.GS.phase);
key('Space', true);
chk('SPACE opens Joab\'s charge', api.GS.phase === 'brief', 'phase=' + api.GS.phase);
chk('the charge glosses the well at Bahurim', /Bahurim/.test(els.briefNote.innerHTML));
for (let i = 0; i < api.BRIEF_LINES.length; i++) key('Space', true);
chk('the charge glosses "come what may"',
    api.BRIEF_LINES.some(l => /come what may/i.test(l.note || '')));
const allRefs = api.BRIEF_LINES.flatMap(l => l.refs || []).concat(api.SOURCES);
chk('every commentary link is https and labelled',
    allRefs.length > 0 && allRefs.every(r => /^https:\/\//.test(r.u) && r.t.length > 8),
    allRefs.length + ' links');
chk('the charge leads into the run', api.GS.phase === 'run', 'phase=' + api.GS.phase);

// ── 2. frozen at the line ────────────────────────
chk('he is frozen until a key is struck', api.GS.started === false);
const x0 = api.bodyX(api.GS.body);
for (let i = 0; i < 120; i++) api.updateRun(1 / 60);
chk('two idle seconds do not move or fail him',
    api.GS.phase === 'run' && Math.abs(api.bodyX(api.GS.body) - x0) < 1,
    'phase=' + api.GS.phase + ' moved ' + (api.bodyX(api.GS.body) - x0).toFixed(2));

// ── 3. drawing does not throw ────────────────────
let drawErr = null;
try { api.drawFrame(); } catch (e) { drawErr = e; }
chk('drawFrame runs clean', !drawErr, drawErr && drawErr.message);

// ── 4. the real input path drives the body ───────
key('KeyQ', true);
chk('the first keypress starts the race', api.GS.started === true);
key('KeyQ', false);

// Run a scripted stride through the actual keydown/keyup handlers.
function driveRun(gait, maxSec) {
  api.startRun();
  let t = 0, held = { q: false, w: false, o: false, p: false };
  const press = (k, want) => {
    if (want === held[k]) return;
    key({ q: 'KeyQ', w: 'KeyW', o: 'KeyO', p: 'KeyP' }[k], want);
    held[k] = want;
  };
  while (t < maxSec && api.GS.phase === 'run') {
    const ph = ((t / gait.period) % 1 + 1) % 1;
    press('q', ph < 0.5); press('w', ph >= 0.5);
    const oPh = ((ph - gait.calfLead) % 1 + 1) % 1;
    press('o', oPh < gait.calfHold);
    press('p', oPh >= 0.5 && oPh < 0.5 + gait.calfHold);
    api.updateRun(1 / 60);
    t += 1 / 60;
  }
  for (const k of ['q', 'w', 'o', 'p']) press(k, false);
  return { cubits: api.GS.cubits, t: t, phase: api.GS.phase };
}

// Search what is reachable THROUGH THE KEYBOARD. Keys are binary, so the
// player cannot ask for a half-amplitude swing the way the offline sweep
// could — this is the honest ceiling.
let bestDrive = null, bestGait = null, viable = 0, tried = 0;
for (const period of [0.45, 0.55, 0.65, 0.75, 0.9, 1.05])
  for (const calfLead of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9])
    for (const calfHold of [0.2, 0.35, 0.5]) {
      const g = { period, calfLead, calfHold };
      const r = driveRun(g, 20);
      tried++;
      if (r.cubits > 12) viable++;
      if (!bestDrive || r.cubits > bestDrive.cubits) { bestDrive = r; bestGait = g; }
    }
chk('keyboard input actually moves him forward', bestDrive.cubits > 8,
    'best ' + bestDrive.cubits.toFixed(1) + ' cubits');
// The difficulty band. Too few and the body is undrivable; too many and the
// running stops being the game. Tuned to sit near the middle of this.
chk('difficulty stays in the playable band', viable >= 12 && viable <= 60,
    viable + '/' + tried + ' rhythms cleared 12 cubits');
console.log(`       best keyboard run: ${bestDrive.cubits.toFixed(1)} cubits in ${bestDrive.t.toFixed(1)}s ` +
            `(${(bestDrive.cubits / bestDrive.t).toFixed(2)} cub/s) gait=${JSON.stringify(bestGait)}`);
console.log(`       viable keyboard rhythms: ${viable}/${tried}`);

// ── 5. falling ───────────────────────────────────
// Under the light gravity he no longer sags over on his own, so topple him
// deliberately: throw the head out past his feet and let physics do the rest.
api.startRun();
key('KeyQ', true); key('KeyQ', false);
const hp = api.GS.body.p;
hp[0].x += 55; hp[0].px += 50;                  // shove the head forward
let guard = 0;
while (api.GS.phase === 'run' && guard++ < 3000) api.updateRun(1 / 60);
chk('losing your balance drops him', api.GS.phase === 'sprawl', 'phase=' + api.GS.phase);
guard = 0;
while (api.GS.phase === 'sprawl' && guard++ < 1000) api.updateSprawl(1 / 60);
chk('the sprawl resolves to the fail card', api.GS.phase === 'fallen', 'phase=' + api.GS.phase);
chk('the fail card reports a distance', els.fallDist && els.fallDist.textContent !== '');

// ── 6. retry ─────────────────────────────────────
key('Space', true);
chk('SPACE runs it again', api.GS.phase === 'run' && api.GS.runT === 0);

// ── 7. winning, and the king's question ──────────
api.startRun();
api.GS.started = true;
api.GS.runT = 10;                                 // Cushite is still far out
teleportToGate();                                 // stand him at the gate
api.updateRun(1 / 60);
chk('reaching the gate first wins the race',
    api.GS.phase === 'arrive' && api.GS.wonRace === true,
    'phase=' + api.GS.phase + ' won=' + api.GS.wonRace);
api.toAudience();
chk('a win leads to the king\'s question', api.GS.phase === 'audience', 'phase=' + api.GS.phase);
key('Digit1', true);
chk('answering ends the story', api.GS.phase === 'ending', 'phase=' + api.GS.phase);
chk('the ending names the dodge', /tumult/i.test(els.endBody.innerHTML));
chk('the ending offers its sources', /biblehub/.test(els.endSources.innerHTML));

// ── 8. losing the race skips the question ────────
api.startRun();
api.GS.started = true;
api.GS.runT = 1e4;                                // he got there long ago
teleportToGate();
api.updateRun(1 / 60);
chk('arriving second loses the race', api.GS.phase === 'arrive' && api.GS.wonRace === false,
    'phase=' + api.GS.phase + ' won=' + api.GS.wonRace);
api.toAudience();
chk('a loss goes straight to the end', api.GS.phase === 'ending', 'phase=' + api.GS.phase);
chk('the losing end credits the Cushite', /Cushite/i.test(els.endTitle.textContent),
    'title=' + els.endTitle.textContent);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
