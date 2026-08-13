'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LOGIC — the race: stepping the body, the Cushite's steady pace,
//  the watchman on the wall, falling, and arriving.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function beginRunning() {
  GS.started = true;
  SFX.start();
}

// One frame of the run. dt already capped by the caller.
function updateRun(dt) {
  tickToast(dt);

  // He holds the stagger at the line until a muscle is asked for something.
  if (!GS.started) return;

  GS.runT += dt;

  // ── drive the muscles toward what the keys are asking for ──
  const cmd = commandedAngles();
  const c = GS.ctrl;
  const r = MUSCLE_RATE * dt;
  const to = (cur, tgt) => cur + Math.max(-r, Math.min(r, tgt - cur));
  c.thighR = to(c.thighR, cmd.tR); c.thighL = to(c.thighL, cmd.tL);
  c.calfR  = to(c.calfR,  cmd.cR); c.calfL  = to(c.calfL,  cmd.cL);
  // arms counter-swing off the legs; nobody runs with their arms still
  c.armR = -c.thighR * 0.7; c.armL = -c.thighL * 0.7;

  // ── fixed-step physics ──
  GS.accum += dt;
  let steps = 0;
  const wasDown = [footDown(TOE_R), footDown(TOE_L)];
  while (GS.accum >= PHYS_DT && steps < PHYS_MAX_STEPS) {
    stepBody(GS.body, GS.ctrl, PHYS_DT);
    GS.accum -= PHYS_DT;
    steps++;
  }
  if (GS.accum > PHYS_DT * PHYS_MAX_STEPS) GS.accum = 0;   // tab was suspended; drop the debt

  // footfall sounds on the rising edge of contact
  if (!wasDown[0] && footDown(TOE_R)) SFX.step();
  if (!wasDown[1] && footDown(TOE_L)) SFX.step();

  // ── distance ──
  GS.cubits = (bodyX(GS.body) - START_X) / PX_PER_CUBIT;
  if (GS.cubits > GS.best) GS.best = GS.cubits;
  GS.cushite = CUSHITE_LEAD + CUSHITE_PACE * GS.runT;

  // ── the watchman calls down as you pass each mark ──
  for (let i = 0; i < WATCHMAN_CALLS.length; i++) {
    const call = WATCHMAN_CALLS[i];
    if (GS.cubits >= call.at && GS.calls.indexOf(i) < 0) {
      GS.calls.push(i);
      setToast(call.text, 4.0);
      SFX.call();
    }
  }

  // ── overtaking him is the whole point of the story ──
  if (!GS.passedCushite && GS.cubits > GS.cushite && GS.cushite < GOAL_CUBITS) {
    GS.passedCushite = true;
    setToast(PASS_TAUNTS[0], 3.4);
    SFX.pass();
  }
  if (!GS.cushiteHome && GS.cushite >= GOAL_CUBITS) {
    GS.cushiteHome = true;
    if (GS.cubits < GOAL_CUBITS) setToast('The Cushite is at the gate.', 4.0);
  }

  // ── arriving ──
  if (GS.cubits >= GOAL_CUBITS) { arrive(); return; }

  // ── falling ──
  if (GS.runT * 1000 > FALL_GRACE_MS && bodyHasFallen(GS.body)) fall();
}

function footDown(idx) {
  return GS.body ? GS.body.p[idx].contact : false;
}

function fall() {
  GS.phase = 'sprawl';
  GS.sprawlT = 0;
  GS.ctrl.limp = true;               // let him tumble; no muscles left
  GS.fallLine = FALL_LINES[(Math.random() * FALL_LINES.length) | 0];
  SFX.thud();
}

// Keep simulating while he flops, then show the card.
function updateSprawl(dt) {
  GS.sprawlT += dt;
  GS.accum += dt;
  let steps = 0;
  while (GS.accum >= PHYS_DT && steps < PHYS_MAX_STEPS) {
    stepBody(GS.body, GS.ctrl, PHYS_DT);
    GS.accum -= PHYS_DT;
    steps++;
  }
  GS.cubits = (bodyX(GS.body) - START_X) / PX_PER_CUBIT;
  if (GS.sprawlT * 1000 >= SPRAWL_MS) {
    GS.phase = 'fallen';
    showFallen();
  }
}

function arrive() {
  GS.wonRace = GS.cushite < GOAL_CUBITS;
  GS.phase = 'arrive';
  SFX.horn();
  showArrival();
}

// Called from the arrival card.
function toAudience() {
  if (!GS.wonRace) { GS.answer = 'late'; endStory(); return; }
  GS.phase = 'audience';
  showAudience();
}

function answerDavid(which) {
  GS.answer = which;
  endStory();
}

function endStory() {
  GS.phase = 'ending';
  SFX.wail();
  showEnding();
}

function startRun() {
  resetRun();
  GS.runs++;
  showRunScreen();
}

function beginBrief() {
  GS.phase = 'brief';
  GS.briefIdx = 0;
  showBrief();
}

function advanceBrief() {
  GS.briefIdx++;
  if (GS.briefIdx >= BRIEF_LINES.length) startRun();
  else showBrief();
}
