'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  AHIMAAZ — CONFIG: constants, tuning, scripture text
//  "And Ahimaaz ran by the way of the plain, and overran the Cushite."
//                                            — 2 Samuel 18:23
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── World / scale ────────────────────────────────
// World coords: ground is y = 0, up is negative y, forward is +x.
const GROUND_Y      = 0;
const PX_PER_CUBIT  = 26;     // a man ~4 cubits tall ≈ 110px
// Short course. Everything runs at quarter speed, so 140 cubits was a
// four-minute race; this keeps a winning run near 90 seconds of wall clock
// and makes the fall-and-retry loop bearable.
const GOAL_CUBITS   = 36;     // gate of Mahanaim
const START_X       = 0;

// ── The Cushite ──────────────────────────────────
// Calibrated against test/headless.js, which drives the real key handlers.
// He reaches the gate at 26 game-seconds — about 104 real seconds at quarter
// speed — so the player must average ~1.4 cubits/game-sec. A metronome does
// the course in 17.8, so there is real margin, and every fall sends you back.
// THIS IS THE DIFFICULTY DIAL. Raise it to punish, drop it to be kind.
const CUSHITE_LEAD  = 6;      // cubits he had before Joab said "Run"
const CUSHITE_PACE  = 1.15;   // cubits per GAME second — steady, tireless, never falls

// ── Time ─────────────────────────────────────────
// The whole simulation runs in slow motion. Everything below is in GAME
// seconds; main.js scales real time down before anything else sees it, so the
// race stays balanced against itself while the player gets four times as long
// to think. Physics, the Cushite and the muscles all slow together.
const TIME_SCALE    = 0.25;

// ── Physics (Verlet / position-based) ────────────
const PHYS_DT       = 1 / 120;  // fixed physics step (game s)
const PHYS_MAX_STEPS= 8;        // catch-up cap after a tab suspension
// Lightened from 1900. This is the FLOOR, not a taste call: below ~1400 the
// servo drags a gripping foot faster than the body can be run, and a player
// who presses nothing at all skates to the gate at 4.6 cubits/sec. At 1450 a
// stationary runner drifts -0.07 and 45 of 105 rhythms still work.
// See `node test/tune.js keys`.
const GRAVITY       = 1450;     // px/s² — light. He floats, and hangs at the top of a stride.
const DAMPING       = 0.994;    // velocity retained per step
const SOLVER_ITERS  = 8;        // constraint relaxation passes

// Ground contact
// Dry plain dust. Lowered from 0.42 to make the running harder: less traction
// to catch yourself with when a stride lands wrong.
const GRIP_FOOT     = 0.32;     // horizontal velocity killed per step by a planted foot
const GRIP_BODY     = 0.55;     // dragging your face costs more
const STATIC_SNAP   = 0.35;     // px/step below which a contact point sticks

// ── Muscles ──────────────────────────────────────
// Grid-searched (test/tune.js harder) against the number of keyboard rhythms
// that actually work — 29 of 126, down from 47. Difficulty lives HERE and in
// GRIP_FOOT, not in the Cushite: he sets the target, these set how hard the
// man is to steer.
//
// Raised from 9. The limb snaps to the commanded angle faster, so a press is
// more violent and a mistimed one throws him harder. Counter-intuitively,
// SLOWING this makes the game easier — a lazy muscle smooths out bad input.
const MUSCLE_RATE   = 12.0;     // rad/s the target angle slews toward the commanded one
const K_THIGH       = 0.18;     // servo stiffness per physics step
const K_CALF        = 0.22;
// PINNED. Raising this to 0.22 re-opens the idle skate — a stationary runner
// drifts 4.15 cub/s and beats the Cushite by pressing nothing. Do not raise it
// to make the game harder; use GRIP_FOOT and MUSCLE_RATE.
const K_CORE        = 0.18;     // weak — you cannot really control your torso. That is the game.
const K_ARM         = 0.10;
const COUNTER       = 0.65;     // how much of each servo torque kicks back into the rest of the body

// Commanded joint angles (radians, relative to parent segment).
// Both pairs are antagonistic, as in QWOP: Q/W drive the thighs against each
// other, O/P the calves. Release everything and you stand in the neutral pose.
const THIGH_FWD     = -0.85;    // knee driven forward/up
const THIGH_BACK    =  0.70;    // knee driven behind you
const THIGH_NEUTRAL = -0.05;
const CALF_EXTEND   =  0.06;    // shin driven straight — the push-off
const CALF_TUCK     =  1.05;    // heel folded up toward the seat
const CALF_NEUTRAL  =  0.20;    // resting knee bend; a standing man, not a squatting one
const STANCE_SPLIT  =  0.34;    // the stagger he holds at the start line
const SETTLE_S      =  0.60;    // physics run at the line before the player takes over

// ── Fall thresholds (world y, remember: up is negative) ──
const FALL_HIP      = -24;
const FALL_NECK     = -30;
const FALL_HEAD     = -16;
const FALL_KNEE     = -5;
const SPRAWL_MS     = 1400;     // ragdoll flops this long before the fail card
// A body this loose cannot stand still — do nothing and you sag and fall, which
// is the honest QWOP bargain. So the clock and the physics do not start until
// the first key is struck (see logic.js), and the fall check gets a moment more.
const FALL_GRACE_MS = 600;

// ── Camera ───────────────────────────────────────
const CAM_AHEAD     = 90;       // px of road shown ahead of the runner
const CAM_LERP      = 0.10;
const HORIZON_FRAC  = 0.62;     // where the ground line sits on screen

// ── Watchman calls, fired once as you pass each mark ──
const WATCHMAN_CALLS = [
  { at:  8, text: 'The watchman upon the gate lifteth up his eyes…' },
  { at: 16, text: '"I see a man running alone."' },
  { at: 25, text: '"Me thinketh the running of the foremost is like the running of Ahimaaz the son of Zadok."' },
  { at: 32, text: '"He is a good man, and cometh with good tidings."' },
];

const PASS_TAUNTS = [
  'Thou hast overrun the Cushite.',
  'The way of the plain is thine.',
];

// ── Joab's charge, shown before the run ──────────
const BRIEF_LINES = [
  { who:'AHIMAAZ', text:'Let me now run, and bear the king tidings, how that the LORD hath avenged him of his enemies.' },
  { who:'JOAB',    text:'Thou shalt not bear tidings this day… because the king\'s son is dead.' },
  { who:'AHIMAAZ', text:'But howsoever, let me, I pray thee, also run after the Cushite.' },
  { who:'JOAB',    text:'Run.' },
];

// ── Fail cards ───────────────────────────────────
const FALL_LINES = [
  'The plain is long, and thou art dust.',
  'Thy feet were not made for such tidings.',
  'Thou hast fallen, and the Cushite runneth on.',
  'The wood of Ephraim devoured more people that day than the sword — and now thee.',
  'A good man, perhaps. A runner, not yet.',
];

// ── Palette ──────────────────────────────────────
const COL = {
  skyHi:   '#f3c98b',
  skyLo:   '#e08a4e',
  sun:     '#fff0c9',
  hillFar: '#a8734a',
  hillMid: '#8a5535',
  treeFar: '#6b4028',
  ground:  '#c9955c',
  groundLo:'#a97643',
  road:    '#d8ab72',
  dust:    '#e8c393',
  ink:     '#2b1b10',
  robe:    '#efe3cb',
  sash:    '#b8452f',
  skin:    '#c08a5a',
  cushite: '#3a2a22',
  cushRobe:'#6d5340',
  wall:    '#b09272',
  wallDark:'#8a6f54',
  gold:    '#e8b53f',
};
