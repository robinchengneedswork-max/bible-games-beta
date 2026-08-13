'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INPUT — e.code only (physical keys), so QWOP sits under the fingers
//  regardless of layout.
//
//    Q / W  — thighs, driven against each other
//    O / P  — calves, likewise
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const KEYS = { q: false, w: false, o: false, p: false };

const RUN_CODES = { KeyQ: 'q', KeyW: 'w', KeyO: 'o', KeyP: 'p' };
const SWALLOW = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Slash', 'Digit1', 'Digit2'];

function initInput() {
  window.addEventListener('keydown', function (e) {
    if (e.repeat) { if (RUN_CODES[e.code] || SWALLOW.indexOf(e.code) >= 0) e.preventDefault(); return; }
    if (SWALLOW.indexOf(e.code) >= 0) e.preventDefault();

    const limb = RUN_CODES[e.code];
    if (limb) {
      e.preventDefault();
      KEYS[limb] = true;
      // The first touch of a muscle is what starts the race.
      if (GS.phase === 'run' && !GS.started) beginRunning();
      return;
    }

    switch (GS.phase) {
      case 'brief':
        if (e.code === 'Space' || e.code === 'Enter') advanceBrief();
        break;
      case 'fallen':
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') startRun();
        break;
      case 'audience':
        if (e.code === 'Digit1') answerDavid('dodge');
        else if (e.code === 'Digit2') answerDavid('truth');
        break;
      case 'ending':
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') showTitle();
        break;
      case 'title':
        if (e.code === 'Space' || e.code === 'Enter') beginBrief();
        break;
    }
  });

  window.addEventListener('keyup', function (e) {
    const limb = RUN_CODES[e.code];
    if (limb) { KEYS[limb] = false; e.preventDefault(); }
  });

  // Losing focus mid-stride should not leave a muscle clamped on.
  window.addEventListener('blur', function () {
    KEYS.q = KEYS.w = KEYS.o = KEYS.p = false;
  });
}

// Fold the key state into the commanded joint angles. Both pairs are
// antagonistic; press both of a pair and they cancel to neutral.
function commandedAngles() {
  let tR, tL, cR, cL;
  if (KEYS.q === KEYS.w) { tR = THIGH_NEUTRAL; tL = THIGH_NEUTRAL; }
  else if (KEYS.q)       { tR = THIGH_FWD;     tL = THIGH_BACK; }
  else                   { tR = THIGH_BACK;    tL = THIGH_FWD; }

  if (KEYS.o === KEYS.p) { cR = CALF_NEUTRAL;  cL = CALF_NEUTRAL; }
  else if (KEYS.o)       { cR = CALF_EXTEND;   cL = CALF_TUCK; }
  else                   { cR = CALF_TUCK;     cL = CALF_EXTEND; }

  return { tR: tR, tL: tL, cR: cR, cL: cL };
}
