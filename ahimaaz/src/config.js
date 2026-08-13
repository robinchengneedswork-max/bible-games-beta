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
// Every quoted line is 2 Samuel 18. The notes underneath are not — they are the
// context the chapter assumes you already have, because its first readers did.
const BRIEF_LINES = [
  { who:'AHIMAAZ', text:'Let me now run, and bear the king tidings, how that the LORD hath avenged him of his enemies.',
    note:'He is not volunteering out of nowhere. He has run for David before: when Absalom took Jerusalem, '
       + 'Ahimaaz and Jonathan waited at the spring En-rogel for word out of the city, and were nearly caught '
       + 'carrying it. They went down a well at Bahurim, and a woman spread a covering over the mouth of it and '
       + 'scattered ground corn on top, and Absalom\'s men searched the road above their heads and found nothing. '
       + 'Then they climbed out and ran, and David crossed the Jordan that night because they did. '
       + '<span class="ref">2 Samuel 17:17&ndash;21</span>',
    refs:[
      { t:'the well and the ground corn — commentaries on 17:19',
        u:'https://biblehub.com/commentaries/2_samuel/17-19.htm' },
      { t:'Barnes: "Ahimaaz was a well-known runner" — on 18:19',
        u:'https://biblehub.com/commentaries/2_samuel/18-19.htm' },
    ] },

  { who:'JOAB',    text:'Thou shalt not bear tidings this day… because the king\'s son is dead.',
    note:'Joab is not doubting the legs. He is doing arithmetic. David executed the Amalekite who brought him word '
       + 'of Saul\'s death, and executed the two men who brought him Ish-bosheth\'s head. A runner carrying this '
       + 'particular news is a runner with a price on him &mdash; so Joab sends a foreigner nobody will miss. '
       + 'The refusal is the last kind thing anyone does for Ahimaaz in this chapter. '
       + '<span class="ref">2 Samuel 1:15; 4:12</span>',
    refs:[
      { t:'Ellicott &amp; Cambridge: the Cushite was a man "who would have little to lose by the king\'s displeasure"',
        u:'https://biblehub.com/commentaries/2_samuel/18-21.htm' },
      { t:'Precept Austin: Joab knows what David does to messengers',
        u:'https://www.preceptaustin.org/2-samuel-18-commentary' },
    ] },

  { who:'AHIMAAZ', text:'But howsoever, let me, I pray thee, also run after the Cushite.',
    note:'"Howsoever" is two words of Hebrew &mdash; <span class="heb">&#1493;&#1460;&#1497;&#1492;&#1460;&#1497; '
       + '&#1502;&#1464;&#1492;</span>, <i>wihi mah</i>, "and let be &mdash; what." Come what may. It is a strange '
       + 'thing to say out loud. He is not arguing that the news is good; Joab has just told him it is not. He is '
       + 'agreeing, in advance and unread, to whatever this costs him. He does not know the price yet. He has '
       + 'already said yes to it. '
       + '<span class="ref">2 Samuel 18:22</span>',
    refs:[
      { t:'the Hebrew, word by word — interlinear of 18:22',
        u:'https://biblehub.com/text/2_samuel/18-22.htm' },
    ] },

  { who:'JOAB',    text:'Run.',
    note:'Joab stops arguing. That is not the same as agreeing. What he has just permitted is a race Ahimaaz '
       + 'can actually win: the Cushite goes over the hills, the short hard way, and Ahimaaz will take the '
       + '<i>kikkar</i>, the flat of the Jordan valley &mdash; further to run and faster to run it.',
    refs:[
      { t:'Barnes, Gill, Keil&ndash;Delitzsch on the two roads — on 18:23',
        u:'https://biblehub.com/commentaries/2_samuel/18-23.htm' },
    ] },
];

// ── Where this reading comes from, shown on the ending card ──
const SOURCES = [
  { t:'The tradition splits here: Ellicott calls it a lie, the Pulpit Commentary calls it mercy — on 18:29',
    u:'https://biblehub.com/commentaries/2_samuel/18-29.htm' },
  { t:'Matthew Henry on the whole passage, 18:19&ndash;33',
    u:'https://www.bibliaplus.org/en/commentaries/2/matthew-henry-commentary-on-the-whole-bible/2-samuel/18/19-33' },
  { t:'Precept Austin: verse-by-verse through 2 Samuel 18',
    u:'https://www.preceptaustin.org/2-samuel-18-commentary' },
  { t:'2 Samuel and the Architecture of Poetic Justice — Journal of Hebrew Scriptures',
    u:'https://jhsonline.org/index.php/jhs/article/view/29603' },
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
