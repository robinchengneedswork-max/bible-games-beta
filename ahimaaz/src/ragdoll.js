'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RAGDOLL — Verlet point mass body + position-based constraints
//  Pure: no DOM, no globals mutated. Node can require this for calibration.
//
//  Locomotion comes out of the physics, not out of an animation:
//  the servos rotate a limb, the planted foot has friction, the
//  reaction shoves the body forward. Or, more often, over.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Point indices
const HEAD = 0, NECK = 1, HIP = 2;
const KNEE_R = 3, ANK_R = 4, TOE_R = 5;
const KNEE_L = 6, ANK_L = 7, TOE_L = 8;
const ELB_R = 9, HAND_R = 10, ELB_L = 11, HAND_L = 12;
const NPTS = 13;

// Segment lengths (px)
const L_NECK = 20, L_TORSO = 36, L_THIGH = 30, L_CALF = 30, L_FOOT = 14;
const L_UARM = 18, L_FARM = 18;

// Rotation subtrees, keyed by joint
const SUB_LEG_R   = [KNEE_R, ANK_R, TOE_R];
const SUB_LEG_L   = [KNEE_L, ANK_L, TOE_L];
const SUB_SHANK_R = [ANK_R, TOE_R];
const SUB_SHANK_L = [ANK_L, TOE_L];
const SUB_UPPER   = [HEAD, NECK, ELB_R, HAND_R, ELB_L, HAND_L];
const SUB_ARM_R   = [ELB_R, HAND_R];
const SUB_ARM_L   = [ELB_L, HAND_L];

function makeBody(x0) {
  const p = [];
  const add = (x, y, grip) => p.push({ x, y, px: x, py: y, grip: grip, contact: false });

  const hipY = -(L_CALF + L_THIGH);           // -60
  add(x0,      hipY - L_TORSO - L_NECK, GRIP_BODY); // HEAD
  add(x0,      hipY - L_TORSO,          GRIP_BODY); // NECK
  add(x0,      hipY,                    GRIP_BODY); // HIP
  // right leg (far leg, drawn behind)
  add(x0 + 4,  hipY + L_THIGH, GRIP_BODY);          // KNEE_R
  add(x0 + 4,  -1,             GRIP_FOOT);          // ANK_R
  add(x0 + 4 + L_FOOT, 0,      GRIP_FOOT);          // TOE_R
  // left leg (near leg)
  add(x0 - 4,  hipY + L_THIGH, GRIP_BODY);          // KNEE_L
  add(x0 - 4,  -1,             GRIP_FOOT);          // ANK_L
  add(x0 - 4 + L_FOOT, 0,      GRIP_FOOT);          // TOE_L
  // arms
  add(x0 + 6,  hipY - L_TORSO + L_UARM, GRIP_BODY); // ELB_R
  add(x0 + 12, hipY - L_TORSO + L_UARM + L_FARM, GRIP_BODY); // HAND_R
  add(x0 - 6,  hipY - L_TORSO + L_UARM, GRIP_BODY); // ELB_L
  add(x0 - 12, hipY - L_TORSO + L_UARM + L_FARM, GRIP_BODY); // HAND_L

  const sticks = [
    [HEAD, NECK, L_NECK, 1.0],
    [NECK, HIP, L_TORSO, 1.0],
    [HIP, KNEE_R, L_THIGH, 1.0], [KNEE_R, ANK_R, L_CALF, 1.0], [ANK_R, TOE_R, L_FOOT, 1.0],
    [HIP, KNEE_L, L_THIGH, 1.0], [KNEE_L, ANK_L, L_CALF, 1.0], [ANK_L, TOE_L, L_FOOT, 1.0],
    [NECK, ELB_R, L_UARM, 0.9], [ELB_R, HAND_R, L_FARM, 0.9],
    [NECK, ELB_L, L_UARM, 0.9], [ELB_L, HAND_L, L_FARM, 0.9],
    // braces: keep the head on straight, keep the ankle rigid to the shin
    [HEAD, HIP, L_NECK + L_TORSO, 0.55],
    [KNEE_R, TOE_R, Math.hypot(L_CALF, L_FOOT) * 0.94, 0.55],
    [KNEE_L, TOE_L, Math.hypot(L_CALF, L_FOOT) * 0.94, 0.55],
  ].map(s => ({ a: s[0], b: s[1], len: s[2], stiff: s[3] }));

  // Knees bend one way only, and only so far.
  const limits = [
    { a: HIP, b: ANK_R, min: L_THIGH * 0.75, max: (L_THIGH + L_CALF) * 0.995 },
    { a: HIP, b: ANK_L, min: L_THIGH * 0.75, max: (L_THIGH + L_CALF) * 0.995 },
  ];

  const body = { p, sticks, limits, fallen: false, t: 0 };

  // Set him in a runner's stagger — one foot forward, one back. A man standing
  // to attention has his whole weight over a hand's breadth of dirt and falls
  // in a second; a split stance is what lets him hold the line before "Run."
  rotateAbout(p, SUB_LEG_R, p[HIP].x, p[HIP].y, STANCE_SPLIT);
  rotateAbout(p, SUB_LEG_L, p[HIP].x, p[HIP].y, -STANCE_SPLIT);
  let lowest = -Infinity;
  for (let i = 0; i < NPTS; i++) if (p[i].y > lowest) lowest = p[i].y;
  for (let i = 0; i < NPTS; i++) { p[i].y -= lowest; p[i].py -= lowest; }
  return body;
}

// ── helpers ──────────────────────────────────────
function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function segAngle(p, a, b) { return Math.atan2(p[b].y - p[a].y, p[b].x - p[a].x); }

function rotateAbout(p, idxs, cx, cy, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let i = 0; i < idxs.length; i++) {
    const q = p[idxs[i]];
    const dx = q.x - cx, dy = q.y - cy;
    const nx = cx + dx * c - dy * s, ny = cy + dx * s + dy * c;
    // move the previous position too, so a servo adds position, not velocity
    const vx = q.x - q.px, vy = q.y - q.py;
    q.x = nx; q.y = ny;
    q.px = nx - (vx * c - vy * s); q.py = ny - (vx * s + vy * c);
  }
}

// Drive segment (pivot→child) toward targetAng. The subtree swings one way,
// everything else gets the reaction the other way — that is the wobble.
//
// Points touching the ground are left out of the reaction: a planted foot is
// braced against the earth, so that half of the torque goes into the dirt
// rather than sliding the man backwards across it.
function servo(body, pivot, child, subtree, targetAng, k) {
  const p = body.p;
  const cur = segAngle(p, pivot, child);
  const delta = wrapPi(targetAng - cur) * k;
  if (Math.abs(delta) < 1e-6) return;
  const w = subtree.length / NPTS;
  const cx = p[pivot].x, cy = p[pivot].y;
  rotateAbout(p, subtree, cx, cy, delta * (1 - w * COUNTER));
  const rest = [];
  for (let i = 0; i < NPTS; i++)
    if (i !== pivot && !p[i].contact && subtree.indexOf(i) < 0) rest.push(i);
  rotateAbout(p, rest, cx, cy, -delta * w * COUNTER);
}

// ── one fixed physics step ───────────────────────
// ctrl: { thighR, thighL, calfR, calfL, armR, armL, limp }
function stepBody(body, ctrl, dt) {
  const p = body.p;
  const g = GRAVITY * dt * dt;

  // 1. integrate
  for (let i = 0; i < NPTS; i++) {
    const q = p[i];
    const vx = (q.x - q.px) * DAMPING, vy = (q.y - q.py) * DAMPING;
    q.px = q.x; q.py = q.y;
    q.x += vx; q.y += vy + g;
  }

  // 2. muscles (a sprawling ragdoll has none)
  if (!ctrl.limp) {
    const torso = segAngle(p, HIP, NECK);          // ~ -PI/2 when upright
    const down = torso + Math.PI;                  // straight down the torso line
    servo(body, HIP, KNEE_R, SUB_LEG_R, down + ctrl.thighR, K_THIGH);
    servo(body, HIP, KNEE_L, SUB_LEG_L, down + ctrl.thighL, K_THIGH);
    servo(body, KNEE_R, ANK_R, SUB_SHANK_R, segAngle(p, HIP, KNEE_R) + ctrl.calfR, K_CALF);
    servo(body, KNEE_L, ANK_L, SUB_SHANK_L, segAngle(p, HIP, KNEE_L) + ctrl.calfL, K_CALF);
    servo(body, HIP, NECK, SUB_UPPER, -Math.PI / 2, K_CORE);
    servo(body, NECK, ELB_R, SUB_ARM_R, torso + Math.PI + ctrl.armR, K_ARM);
    servo(body, NECK, ELB_L, SUB_ARM_L, torso + Math.PI + ctrl.armL, K_ARM);
  }

  // 3. constraints
  //
  // Deliberately a plain 50/50 relaxation. Weighting corrections by contact
  // (treating a planted foot as braced against the earth) is more honest, and
  // it does kill the idle skate — but it also kills the propulsion, because on
  // this body the forward drive genuinely comes from the servo working against
  // a foot that grips. Measured: 0 of 105 gaits stayed viable. The skate is
  // instead held below a winning pace by the choice of GRAVITY.
  for (let it = 0; it < SOLVER_ITERS; it++) {
    for (let i = 0; i < body.sticks.length; i++) {
      const s = body.sticks[i], a = p[s.a], b = p[s.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy) || 1e-6;
      const f = ((d - s.len) / d) * 0.5 * s.stiff;
      dx *= f; dy *= f;
      a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
    }
    for (let i = 0; i < body.limits.length; i++) {
      const L = body.limits[i], a = p[L.a], b = p[L.b];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy) || 1e-6;
      const tgt = d < L.min ? L.min : (d > L.max ? L.max : d);
      if (tgt === d) continue;
      const f = ((d - tgt) / d) * 0.5;
      dx *= f; dy *= f;
      a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
    }
  }

  // 4. ground — contact flags persist into the next step's muscle phase
  for (let i = 0; i < NPTS; i++) {
    const q = p[i];
    if (q.y < GROUND_Y) { q.contact = false; continue; }
    q.y = GROUND_Y;
    if (q.py < q.y) q.py = q.y;           // kill downward velocity, no bounce
    q.contact = true;

    let vx = q.x - q.px;
    vx *= (1 - q.grip);
    if (Math.abs(vx) < STATIC_SNAP) vx = 0;
    q.px = q.x - vx;
  }

  body.t += dt;
}

// Anything but feet on the dirt and the run is over.
function bodyHasFallen(body) {
  const p = body.p;
  return p[HIP].y > FALL_HIP || p[NECK].y > FALL_NECK || p[HEAD].y > FALL_HEAD ||
         p[KNEE_R].y > FALL_KNEE || p[KNEE_L].y > FALL_KNEE;
}

function bodyX(body) { return body.p[HIP].x; }

// Everything above is plain top-level script scope — the browser loads it via a
// script tag, and test/sim.js loads it into a vm context. (Note for the harness:
// top-level `const` is NOT a property of the context object, so sim.js pulls
// these out with an explicit export snippet rather than reading ctx directly.)
