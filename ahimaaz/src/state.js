'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STATE — the whole game in one object, plus pure mutators. No DOM here.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// phase: 'brief' | 'run' | 'sprawl' | 'fallen' | 'arrive' | 'audience' | 'ending'
const GS = {
  phase: 'brief',
  briefIdx: 0,

  body: null,
  ctrl: null,
  started: false,      // has the player struck a key yet? physics is frozen until then
  runT: 0,             // seconds since "Run."
  accum: 0,            // physics accumulator

  cubits: 0,           // how far Ahimaaz has come
  cushite: 0,          // how far the Cushite has come
  camX: 0,

  calls: [],           // watchman lines already spoken
  toast: null,         // { text, ttl }
  passedCushite: false,
  cushiteHome: false,  // he reached the gate before you

  sprawlT: 0,
  fallLine: '',
  wonRace: false,
  answer: null,        // 'dodge' | 'truth'
  best: 0,             // furthest run this session
  runs: 0,
};

function resetRun() {
  GS.body = makeBody(START_X);
  GS.ctrl = { thighR: THIGH_NEUTRAL, thighL: THIGH_NEUTRAL,
              calfR: CALF_NEUTRAL, calfL: CALF_NEUTRAL,
              armR: 0.35, armL: -0.35, limp: false };

  // Let him find his weight before the player touches anything. Without this
  // the first keypress swings a full stride out of a pose that has never felt
  // gravity, and he goes straight over — it cost most of the viable rhythms.
  const settleSteps = Math.round(SETTLE_S / PHYS_DT);
  for (let i = 0; i < settleSteps; i++) stepBody(GS.body, GS.ctrl, PHYS_DT);
  GS.started = false;
  GS.runT = 0;
  GS.accum = 0;
  GS.cubits = 0;
  GS.cushite = CUSHITE_LEAD;
  GS.camX = START_X - 200;
  GS.calls = [];
  GS.toast = null;
  GS.passedCushite = false;
  GS.cushiteHome = false;
  GS.sprawlT = 0;
  GS.fallLine = '';
  GS.wonRace = false;
  GS.answer = null;
  GS.phase = 'run';
}

function setToast(text, ttl) {
  GS.toast = { text: text, ttl: ttl == null ? 3.2 : ttl };
}

function tickToast(dt) {
  if (!GS.toast) return;
  GS.toast.ttl -= dt;
  if (GS.toast.ttl <= 0) GS.toast = null;
}
