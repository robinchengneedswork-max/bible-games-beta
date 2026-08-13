'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TUNE — sweeps physics constants to find a body that can be run.
//  Overrides are applied by rewriting `const NAME = value;` in config.js
//  before it is compiled, so the shipped source stays plain.
//
//    node test/tune.js smoke     assert the body is stable, drivable, fallible
//    node test/tune.js stand     how long does it stay up, undriven?
//    node test/tune.js sweep     grid search balance constants
//    node test/tune.js refine    score configs by forgiveness (how it was tuned)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const RAW = {
  config: fs.readFileSync(path.join(SRC, 'config.js'), 'utf8'),
  ragdoll: fs.readFileSync(path.join(SRC, 'ragdoll.js'), 'utf8'),
};

function override(src, o) {
  for (const k of Object.keys(o)) {
    const re = new RegExp('(const\\s+' + k + '\\s*=\\s*)(-?[\\d.]+)', 'm');
    if (!re.test(src)) throw new Error('no such const: ' + k);
    src = src.replace(re, '$1' + o[k]);
  }
  return src;
}

function makeSim(o) {
  const ctx = vm.createContext({ Math, console });
  vm.runInContext(override(RAW.config, o || {}), ctx, { filename: 'config.js' });
  vm.runInContext(RAW.ragdoll, ctx, { filename: 'ragdoll.js' });
  return vm.runInContext(`({
    makeBody, stepBody, bodyHasFallen, bodyX, PHYS_DT, PX_PER_CUBIT,
    THIGH_FWD, THIGH_BACK, THIGH_NEUTRAL, CALF_EXTEND, CALF_TUCK, CALF_NEUTRAL,
    MUSCLE_RATE, HIP, NECK, HEAD
  })`, ctx);
}

// Drive a scripted stride; return distance/time/fall.
//
// IMPORTANT: gaits here are BINARY, exactly what a keyboard can produce. An
// earlier version scaled the target angles by a continuous `amp`, which made
// the body look far more drivable than it is — a player has no half-press.
function run(A, gait, maxSec) {
  const b = A.makeBody(0);
  const ctrl = { thighR: A.THIGH_NEUTRAL, thighL: A.THIGH_NEUTRAL,
                 calfR: A.CALF_NEUTRAL, calfL: A.CALF_NEUTRAL, armR: 0.3, armL: -0.3, limp: false };
  const x0 = A.bodyX(b);
  const settle = 0.6;
  let t = 0;
  while (t < maxSec) {
    let tR, tL, cR, cL;
    if (t < settle || !gait) { tR = tL = A.THIGH_NEUTRAL; cR = cL = A.CALF_NEUTRAL; }
    else {
      const ph = (((t - settle) / gait.period) % 1 + 1) % 1;
      const qOn = ph < 0.5;
      tR = qOn ? A.THIGH_FWD : A.THIGH_BACK;
      tL = qOn ? A.THIGH_BACK : A.THIGH_FWD;
      // O/P are antagonistic too: pressing one extends that calf and tucks the other
      const oPh = ((ph - gait.calfLead) % 1 + 1) % 1;
      const oOn = oPh < gait.calfHold;
      const pOn = oPh >= 0.5 && oPh < 0.5 + gait.calfHold;
      cR = oOn ? A.CALF_EXTEND : (pOn ? A.CALF_TUCK : A.CALF_NEUTRAL);
      cL = pOn ? A.CALF_EXTEND : (oOn ? A.CALF_TUCK : A.CALF_NEUTRAL);
    }
    const r = A.MUSCLE_RATE * A.PHYS_DT;
    const to = (c, g) => c + Math.max(-r, Math.min(r, g - c));
    ctrl.thighR = to(ctrl.thighR, tR); ctrl.thighL = to(ctrl.thighL, tL);
    ctrl.calfR = to(ctrl.calfR, cR);   ctrl.calfL = to(ctrl.calfL, cL);
    ctrl.armR = -ctrl.thighR * 0.7; ctrl.armL = -ctrl.thighL * 0.7;
    A.stepBody(b, ctrl, A.PHYS_DT);
    t += A.PHYS_DT;
    if (t > settle && A.bodyHasFallen(b)) break;
  }
  const cub = (A.bodyX(b) - x0) / A.PX_PER_CUBIT;
  return { cubits: cub, seconds: t, pace: cub / Math.max(t, 1e-6), fell: t < maxSec - 1e-9 };
}

const GAITS = [];
for (const period of [0.45, 0.55, 0.65, 0.8, 0.95])
  for (const calfLead of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9])
    for (const calfHold of [0.2, 0.35, 0.5])
      GAITS.push({ period, calfLead, calfHold });

function best(A, maxSec) {
  let b = null;
  for (const g of GAITS) {
    const r = run(A, g, maxSec);
    if (!b || r.cubits > b.res.cubits) b = { gait: g, res: r };
  }
  return b;
}

const MODE = process.argv[2] || 'sweep';

if (MODE === 'smoke') {
  let pass = 0, fail = 0;
  const chk = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
  };
  console.log('ragdoll smoke tests (shipped config)');
  const A = makeSim({});

  const idle = run(A, null, 6);
  chk('idle body produces finite numbers', Number.isFinite(idle.cubits), 'got ' + idle.cubits);
  chk('idle body does not skate away', Math.abs(idle.cubits) < 6, 'drifted ' + idle.cubits.toFixed(2) + ' cub');
  // Standing still is not a strategy: he sags and goes down. The game freezes
  // him at the line until the first keypress, so this never punishes a player
  // who has not started yet.
  chk('doing nothing eventually falls', idle.fell, 'stayed up the whole time');
  chk('but not instantly — a beat to react', run(A, null, 1.0).fell === false, 'fell inside 1s');

  let bestRes = null, working = 0;
  for (const g of GAITS) {
    const r = run(A, g, 30);
    if (!r.fell && r.pace > 1.5) working++;
    if (!bestRes || r.cubits > bestRes.cubits) bestRes = r;
  }
  chk('a driven gait runs forward', bestRes.cubits > 40, 'best ' + bestRes.cubits.toFixed(1) + ' cub');
  // Deliberately unforgiving — most rhythms fail. test/headless.js is the
  // authoritative playability gate; this is just a floor so a tuning change
  // cannot quietly leave the body undrivable.
  chk('some gait still runs cleanly', working >= 5, 'only ' + working + '/' + GAITS.length);
  const cush = CUSHITE_PACE_OF();
  chk('the race is winnable with margin', bestRes.pace > cush * 1.8,
      `ceiling ${bestRes.pace.toFixed(2)} vs Cushite ${cush}`);

  const limp = (() => {
    const b = A.makeBody(0);
    const c = { thighR: 0, thighL: 0, calfR: 0, calfL: 0, armR: 0, armL: 0, limp: true };
    for (let i = 0; i < 400; i++) A.stepBody(b, c, A.PHYS_DT);
    return A.bodyHasFallen(b);
  })();
  chk('a limp body falls down', limp);

  console.log(`\nceiling ${bestRes.pace.toFixed(2)} cub/s   viable gaits ${working}/${GAITS.length}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

function CUSHITE_PACE_OF() {
  const ctx = vm.createContext({ Math, console });
  vm.runInContext(RAW.config, ctx, { filename: 'config.js' });
  return vm.runInContext('CUSHITE_PACE', ctx);
}

if (MODE === 'harder') {
  // Make the RUNNING harder without touching the race. Two honest dials:
  //   K_CORE   — how much torso authority he has (less = tips more easily)
  //   COUNTER  — how much servo torque kicks back into the body (more = wobble)
  //   FALL_HIP — how far he may sag before it counts as down
  // Goal: roughly halve the number of workable rhythms while keeping the
  // ceiling comfortably above the ~1.4 cub/s needed to beat the Cushite.
  const cush = CUSHITE_PACE_OF();
  console.log(`K_CORE MUSC_RT  GRIP  viable/${GAITS.length}  ceiling  idle drift   (need >${(cush * 1.3).toFixed(2)})`);
  // K_CORE is pinned at 0.18: raising it re-opens the idle skate (0.22 drifts
  // 4.15 cub/s, which beats the Cushite for free). Slowing MUSCLE_RATE makes it
  // EASIER, not harder. That leaves grip and muscle snap as the safe dials.
  for (const kc of [0.18])
    for (const co of [9.0, 12.0, 15.0])
      for (const fh of [0.36, 0.30, 0.24, 0.18]) {
        const A = makeSim({ K_CORE: kc, MUSCLE_RATE: co, GRIP_FOOT: fh });
        const idle = run(A, null, 8);
        let viable = 0, best = null;
        for (const g of GAITS) {
          const r = run(A, g, 25);
          if (r.cubits > 12) viable++;
          if (!best || r.cubits > best.cubits) best = r;
        }
        const pace = best.cubits / best.seconds;
        const ok = viable >= 12 && viable <= 30 && pace > cush * 1.3 && Math.abs(idle.cubits / 8) < 0.8;
        process.stdout.write(
          `  ${kc.toFixed(2)}   ${co.toFixed(1).padStart(4)}   ${fh.toFixed(2)}   ` +
          `${String(viable).padStart(3)}/${GAITS.length}   ${pace.toFixed(2)}    ` +
          `${(idle.cubits / 8).toFixed(2).padStart(6)}   ${ok ? 'GOOD' : ''}\n`);
      }
  process.exit(0);
}

if (MODE === 'muscles') {
  // Re-tune propulsion for the honest contact model: planted feet no longer
  // slide, so all forward motion has to come through the constraint solver.
  // The old constants were fitted to a body that cheated.
  const SUB = GAITS.filter((g, i) => i % 3 === 0);
  const rows = [];
  for (const kt of [0.18, 0.30, 0.45, 0.60])
    for (const kc2 of [0.22, 0.38, 0.55])
      for (const co of [0.30, 0.65, 0.95]) {
        const A = makeSim({ K_THIGH: kt, K_CALF: kc2, COUNTER: co });
        let viable = 0, best = null;
        for (const g of SUB) {
          const r = run(A, g, 15);
          if (r.cubits > 8) viable++;
          if (!best || r.cubits > best.cubits) best = r;
        }
        const idle = run(A, null, 6);
        rows.push({ kt, kc2, co, viable, best, idle });
        process.stdout.write(`K_THIGH=${kt} K_CALF=${kc2} COUNTER=${co}  viable ${String(viable).padStart(2)}/${SUB.length}  best ${best.cubits.toFixed(0).padStart(3)} cub  pace ${(best.cubits / best.seconds).toFixed(2)}  idle ${idle.cubits.toFixed(1)}\n`);
      }
  rows.sort((a, z) => (z.viable - a.viable) || (z.best.cubits - a.best.cubits));
  console.log('\nTOP 6 (need viable gaits AND idle drift near zero)');
  for (const r of rows.slice(0, 6))
    console.log(`  K_THIGH=${r.kt} K_CALF=${r.kc2} COUNTER=${r.co}  viable ${r.viable}/${SUB.length}  best ${r.best.cubits.toFixed(0)} cub  idle ${r.idle.cubits.toFixed(1)}`);
  process.exit(0);
}

if (MODE === 'grip') {
  // A planted foot must not creep. Servo torque injects position directly, so
  // with light gravity an idle body can skate forward faster than it can run —
  // free distance for pressing nothing. Static friction has to catch that
  // without gluing down the push-off that makes running work.
  const cush = CUSHITE_PACE_OF();
  console.log("slip  invM   idle drift   viable/105   best cub  pace");
  for (const snap of [0.06, 0.12, 0.16, 0.25, 0.4])
    for (const grip of [0.05, 0.15, 0.35]) {
      const A = makeSim({ SLIP_MAX: snap, CONTACT_INV_MASS: grip });
      const idle = run(A, null, 8);
      let viable = 0, best = null;
      for (const g of GAITS) {
        const r = run(A, g, 25);
        if (r.cubits > 12) viable++;
        if (!best || r.cubits > best.cubits) best = r;
      }
      const pace = best.cubits / best.seconds;
      process.stdout.write(
        `${snap.toFixed(2)}  ${grip.toFixed(2)}  ${idle.cubits.toFixed(1).padStart(8)}   ` +
        `${String(viable).padStart(3)}/${GAITS.length}      ${best.cubits.toFixed(0).padStart(4)}   ` +
        `${pace.toFixed(2)}  ${Math.abs(idle.cubits) < 1.5 && pace > cush * 1.6 ? 'GOOD' : ''}\n`);
    }
  process.exit(0);
}

if (MODE === 'keys') {
  // The honest playability sweep: binary gaits only. Slowing the world down
  // (gravity) buys the player reaction time, which is the cheapest way to make
  // a QWOP body drivable without making it feel stiff.
  // Idle drift is the one that decides the gravity: this body's propulsion
  // comes partly from the servo dragging a gripping foot, so a stationary
  // runner always creeps. That is only a CHEAT if creeping alone can beat the
  // Cushite. Pick the lightest gravity whose drift stays well under his pace.
  const cush = CUSHITE_PACE_OF();
  const needed = 1.45;   // cub/game-sec a player must average to win
  console.log(`gravity  idle drift   viable/${GAITS.length}  best cub  pace    (Cushite ${cush}, need ~${needed})`);
  for (const G of [1900, 1750, 1600, 1450, 1300, 1150]) {
    const A = makeSim({ GRAVITY: G });
    const idle = run(A, null, 8);
    const drift = idle.cubits / 8;
    let viable = 0, best = null;
    for (const g of GAITS) {
      const r = run(A, g, 25);
      if (r.cubits > 12) viable++;
      if (!best || r.cubits > best.cubits) best = r;
    }
    const pace = best.cubits / best.seconds;
    const ok = drift < needed * 0.55 && pace > cush * 1.6 && viable >= 25;
    process.stdout.write(
      `${String(G).padStart(6)}   ${drift.toFixed(2).padStart(6)}     ` +
      `${String(viable).padStart(3)}/${GAITS.length}    ${best.cubits.toFixed(0).padStart(4)}   ` +
      `${pace.toFixed(2)}  ${ok ? 'GOOD' : ''}\n`);
  }
  process.exit(0);
}

if (MODE === 'stand') {
  // A config must BOTH stand at the start line and be drivable. Score both.
  const cands = [];
  for (const kc of [0.16, 0.18, 0.20, 0.21, 0.23, 0.25, 0.27])
    for (const co of [0.55, 0.65, 0.75])
      cands.push({ K_CORE: kc, COUNTER: co, K_THIGH: 0.18 });
  for (const c of cands) {
    const A = makeSim(c);
    const s = run(A, null, 10);
    let working = 0, peak = 0;
    for (const g of GAITS) {
      const r = run(A, g, 30);
      if (!r.fell && r.pace > 1.5) working++;
      if (r.cubits > peak) peak = r.cubits;
    }
    console.log(`K_CORE=${c.K_CORE} COUNTER=${c.COUNTER}  stand ${s.fell ? 'FELL@' + s.seconds.toFixed(1) + 's' : 'ok  '}  drift ${s.cubits.toFixed(1).padStart(6)}  viable ${String(working).padStart(2)}/${GAITS.length}  peak ${peak.toFixed(0)}`);
  }
  process.exit(0);
}

if (MODE === 'refine') {
  // Peak pace is a poor target — a human cannot hit a metronome. Score each
  // config by how BROAD the set of working gaits is (forgiveness), and report
  // the sustained pace of its best gait as the ceiling.
  const rows = [];
  for (const kc of [0.18, 0.21, 0.24, 0.28])
    for (const co of [0.35, 0.45, 0.55, 0.65])
      for (const kt of [0.15, 0.18, 0.22]) {
        const A = makeSim({ K_CORE: kc, COUNTER: co, K_THIGH: kt });
        let survived = 0, decent = 0, peak = null;
        for (const g of GAITS) {
          const r = run(A, g, 30);
          if (!r.fell) survived++;
          if (!r.fell && r.pace > 1.5) decent++;
          if (!peak || r.cubits > peak.cubits) peak = r;
        }
        const row = { kc, co, kt, survived, decent, peak, n: GAITS.length };
        rows.push(row);
        process.stdout.write(`K_CORE=${kc} COUNTER=${co} K_THIGH=${kt}  survive ${survived}/${GAITS.length}  decent ${decent}  peak ${peak.cubits.toFixed(1)}cub pace ${peak.pace.toFixed(2)}\n`);
      }
  rows.sort((a, z) => (z.decent - a.decent) || (z.peak.pace - a.peak.pace));
  console.log('\nMOST FORGIVING CONFIGS');
  for (const r of rows.slice(0, 6))
    console.log(`  K_CORE=${r.kc} COUNTER=${r.co} K_THIGH=${r.kt}  decent ${r.decent}/${r.n}  survive ${r.survived}  ceiling ${r.peak.pace.toFixed(2)} cub/s`);
  process.exit(0);
}

// sweep
const results = [];
for (const kc of [0.24, 0.32, 0.42])
  for (const co of [0.15, 0.30, 0.50])
    for (const kt of [0.18, 0.28]) {
      const A = makeSim({ K_CORE: kc, COUNTER: co, K_THIGH: kt });
      const b = best(A, 15);
      results.push({ kc, co, kt, b });
      process.stdout.write(`K_CORE=${kc} COUNTER=${co} K_THIGH=${kt} -> ${b.res.cubits.toFixed(1)} cub in ${b.res.seconds.toFixed(1)}s (pace ${b.res.pace.toFixed(2)}, fell=${b.res.fell}) gait=${JSON.stringify(b.gait)}\n`);
    }
results.sort((a, z) => z.b.res.cubits - a.b.res.cubits);
console.log('\nTOP 5');
for (const r of results.slice(0, 5))
  console.log(`  K_CORE=${r.kc} COUNTER=${r.co} K_THIGH=${r.kt}  ${r.b.res.cubits.toFixed(1)} cub  pace ${r.b.res.pace.toFixed(2)}  ${JSON.stringify(r.b.gait)}`);
