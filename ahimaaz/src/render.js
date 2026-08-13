'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  RENDER — reads state, draws. Never mutates the body.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let cv = null, cx = null, VW = 0, VH = 0, GY = 0;
const S = 1.15;             // world px → screen px

function initRender() {
  cv = document.getElementById('gameCanvas');
  cx = cv.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  VW = cv.clientWidth; VH = cv.clientHeight;
  cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  GY = VH * HORIZON_FRAC;
}

// world → screen
function sx(wx) { return (wx - GS.camX) * S; }
function sy(wy) { return GY + wy * S; }

// cheap deterministic scatter so scenery does not swim between frames
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

function drawFrame() {
  if (!cx) return;
  const goalX = START_X + GOAL_CUBITS * PX_PER_CUBIT;

  // camera keeps him a third of the way in
  if (GS.body) {
    const want = bodyX(GS.body) - (VW * 0.34) / S + CAM_AHEAD;
    GS.camX += (want - GS.camX) * CAM_LERP;
  }

  sky();
  hills();
  oaks();
  ground();
  mahanaim(goalX);
  if (GS.body) { cushiteRunner(); runner(GS.body); }
  hud(goalX);
}

// ── backdrop ─────────────────────────────────────
function sky() {
  const g = cx.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, COL.skyHi); g.addColorStop(1, COL.skyLo);
  cx.fillStyle = g; cx.fillRect(0, 0, VW, GY);
  // low sun over the Jordan
  const sunX = VW * 0.78, sunY = GY * 0.34;
  const sg = cx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  sg.addColorStop(0, COL.sun); sg.addColorStop(1, 'rgba(255,240,201,0)');
  cx.fillStyle = sg; cx.beginPath(); cx.arc(sunX, sunY, 90, 0, 7); cx.fill();
}

function hills() {
  for (let layer = 0; layer < 2; layer++) {
    const par = layer === 0 ? 0.12 : 0.26;
    const base = GY - (layer === 0 ? 26 : 10);
    const amp = layer === 0 ? 30 : 20;
    cx.fillStyle = layer === 0 ? COL.hillFar : COL.hillMid;
    cx.beginPath(); cx.moveTo(0, GY);
    const off = GS.camX * par;
    for (let x = 0; x <= VW; x += 12) {
      const t = (x + off) * 0.006;
      cx.lineTo(x, base - (Math.sin(t) + Math.sin(t * 2.3 + 1.7) * 0.5) * amp);
    }
    cx.lineTo(VW, GY); cx.closePath(); cx.fill();
  }
}

// The wood of Ephraim is behind him — thick at the start, thinning as he
// gains the plain, which is exactly the road Ahimaaz took.
function oaks() {
  const par = 0.42;
  const off = GS.camX * par;
  cx.fillStyle = COL.treeFar;
  const spacing = 90;
  const first = Math.floor(off / spacing) - 1;
  for (let i = first; i < first + VW / spacing + 3; i++) {
    const wx = i * spacing + hash(i) * 60;
    const x = wx - off;
    if (x < -60 || x > VW + 60) continue;
    // density falls off once he is out on the plain
    const worldCub = (wx / par - START_X) / PX_PER_CUBIT;
    const density = 1 - Math.min(1, Math.max(0, (worldCub - 10) / 70));
    if (hash(i * 3.3) > density * 0.9 + 0.05) continue;
    const h = 26 + hash(i * 7.7) * 22;
    const y = GY - 4;
    cx.beginPath(); cx.arc(x, y - h, h * 0.62, 0, 7); cx.fill();
    cx.fillRect(x - 2, y - h, 4, h);
  }
}

function ground() {
  cx.fillStyle = COL.ground; cx.fillRect(0, GY, VW, VH - GY);
  const g = cx.createLinearGradient(0, GY, 0, VH);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,50,20,0.35)');
  cx.fillStyle = g; cx.fillRect(0, GY, VW, VH - GY);
  // the beaten road
  cx.fillStyle = COL.road; cx.fillRect(0, GY, VW, 5);
  // stones and tufts, fixed to the world so speed reads honestly
  const step = 26;
  const first = Math.floor(GS.camX / step) - 1;
  for (let i = first; i < first + VW / (step * S) + 3; i++) {
    const wx = i * step + hash(i) * 20;
    const x = sx(wx);
    if (x < -20 || x > VW + 20) continue;
    const r = 1 + hash(i * 2.1) * 2.5;
    cx.fillStyle = hash(i * 5.5) > 0.5 ? COL.groundLo : COL.dust;
    cx.beginPath(); cx.arc(x, GY + 8 + hash(i * 9.1) * (VH - GY) * 0.5, r, 0, 7); cx.fill();
  }
}

// ── the city ─────────────────────────────────────
function mahanaim(goalX) {
  const x = sx(goalX);
  if (x > VW + 260 || x < -420) return;
  const wallH = 108, wallW = 260;
  cx.fillStyle = COL.wall;
  cx.fillRect(x, GY - wallH, wallW, wallH);
  cx.fillStyle = COL.wallDark;
  cx.fillRect(x, GY - wallH, wallW, 8);
  // crenellations
  for (let i = 0; i < 9; i++) cx.fillRect(x + i * 30, GY - wallH - 10, 18, 12);
  // the gate
  cx.fillStyle = '#5d4630';
  cx.beginPath();
  cx.moveTo(x + 22, GY);
  cx.lineTo(x + 22, GY - 46);
  cx.quadraticCurveTo(x + 42, GY - 68, x + 62, GY - 46);
  cx.lineTo(x + 62, GY); cx.closePath(); cx.fill();
  // the watchman on the wall, looking down the road
  const wmX = x + 150, wmY = GY - wallH - 10;
  cx.fillStyle = COL.ink;
  cx.beginPath(); cx.arc(wmX, wmY - 16, 5, 0, 7); cx.fill();
  cx.fillRect(wmX - 4, wmY - 11, 8, 12);
  cx.strokeStyle = COL.ink; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(wmX + 3, wmY - 9); cx.lineTo(wmX + 13, wmY - 13); cx.stroke();
}

// ── the Cushite ──────────────────────────────────
// Not a ragdoll. He is a metronome, and that is the joke.
function cushiteRunner() {
  const wx = START_X + Math.min(GS.cushite, GOAL_CUBITS + 2) * PX_PER_CUBIT;
  const x = sx(wx);
  if (x < -60 || x > VW + 60) return;
  const t = GS.runT * 7.5;
  const y = GY;
  const bob = Math.abs(Math.sin(t)) * 3;
  cx.strokeStyle = COL.cushite; cx.lineCap = 'round';
  // legs
  cx.lineWidth = 5;
  for (let s = 0; s < 2; s++) {
    const ph = t + s * Math.PI;
    cx.beginPath();
    cx.moveTo(x, y - 30 - bob);
    cx.lineTo(x + Math.sin(ph) * 12, y - 15 - bob);
    cx.lineTo(x + Math.sin(ph) * 16, y - Math.max(0, Math.cos(ph)) * 6);
    cx.stroke();
  }
  // robe
  cx.fillStyle = COL.cushRobe;
  cx.beginPath();
  cx.moveTo(x - 9, y - 26 - bob); cx.lineTo(x + 9, y - 26 - bob);
  cx.lineTo(x + 6, y - 52 - bob); cx.lineTo(x - 6, y - 52 - bob);
  cx.closePath(); cx.fill();
  // arms
  cx.lineWidth = 4; cx.strokeStyle = COL.cushite;
  for (let s = 0; s < 2; s++) {
    const ph = t + s * Math.PI;
    cx.beginPath();
    cx.moveTo(x, y - 50 - bob);
    cx.lineTo(x - Math.sin(ph) * 11, y - 38 - bob);
    cx.stroke();
  }
  // head
  cx.fillStyle = COL.cushite;
  cx.beginPath(); cx.arc(x, y - 60 - bob, 7, 0, 7); cx.fill();
}

// ── Ahimaaz ──────────────────────────────────────
function runner(b) {
  const p = b.p;
  const P = i => ({ x: sx(p[i].x), y: sy(p[i].y) });
  const head = P(HEAD), neck = P(NECK), hip = P(HIP);

  cx.lineCap = 'round'; cx.lineJoin = 'round';

  // shadow
  cx.fillStyle = 'rgba(70,40,15,0.22)';
  cx.beginPath();
  cx.ellipse(hip.x, GY + 3, 26, 5, 0, 0, 7);
  cx.fill();

  // far leg and arm first, so the near side reads on top
  limb(P(HIP), P(KNEE_R), P(ANK_R), P(TOE_R), '#a97346', 8);
  arm(P(NECK), P(ELB_R), P(HAND_R), '#a97346', 6);

  // robe: a tunic hanging off the shoulders, flaring at the hip
  const dx = hip.x - neck.x, dy = hip.y - neck.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;      // perpendicular to the torso
  cx.fillStyle = COL.robe;
  cx.beginPath();
  cx.moveTo(neck.x + nx * 11, neck.y + ny * 11);
  cx.lineTo(neck.x - nx * 11, neck.y - ny * 11);
  cx.lineTo(hip.x - nx * 16, hip.y - ny * 16);
  cx.lineTo(hip.x + nx * 16, hip.y + ny * 16);
  cx.closePath(); cx.fill();
  // the sash — the one spot of blood-red on him
  cx.strokeStyle = COL.sash; cx.lineWidth = 5;
  cx.beginPath();
  cx.moveTo(neck.x + nx * 9, neck.y + ny * 9);
  cx.lineTo(hip.x - nx * 12, hip.y - ny * 12);
  cx.stroke();

  // near leg and arm
  limb(P(HIP), P(KNEE_L), P(ANK_L), P(TOE_L), COL.skin, 9);
  arm(P(NECK), P(ELB_L), P(HAND_L), COL.skin, 7);

  // head, hair, beard
  const hAng = Math.atan2(head.y - neck.y, head.x - neck.x);
  cx.fillStyle = COL.skin;
  cx.beginPath(); cx.arc(head.x, head.y, 10, 0, 7); cx.fill();
  cx.fillStyle = COL.ink;
  cx.beginPath(); cx.arc(head.x, head.y, 10, hAng + 1.6, hAng + 4.7); cx.fill();
  // beard, hanging toward the ground rather than the skull
  cx.beginPath();
  cx.ellipse(head.x - Math.cos(hAng) * 3, head.y - Math.sin(hAng) * 3 + 6, 6, 8, 0, 0, 7);
  cx.fill();
}

function limb(a, b, c, d, col, w) {
  cx.strokeStyle = col; cx.lineWidth = w;
  cx.beginPath();
  cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.lineTo(c.x, c.y);
  cx.stroke();
  // sandal
  cx.lineWidth = Math.max(4, w - 3); cx.strokeStyle = '#6b4a2c';
  cx.beginPath(); cx.moveTo(c.x, c.y); cx.lineTo(d.x, d.y); cx.stroke();
}

function arm(a, b, c, col, w) {
  cx.strokeStyle = col; cx.lineWidth = w;
  cx.beginPath();
  cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.lineTo(c.x, c.y);
  cx.stroke();
}

// ── HUD ──────────────────────────────────────────
function hud(goalX) {
  // the race rail
  const railX = VW * 0.12, railW = VW * 0.76, railY = 34;
  cx.fillStyle = 'rgba(43,27,16,0.22)';
  cx.fillRect(railX, railY, railW, 4);

  const frac = v => Math.max(0, Math.min(1, v / GOAL_CUBITS));
  // Cushite marker
  const cxp = railX + railW * frac(GS.cushite);
  cx.fillStyle = COL.cushite;
  cx.beginPath(); cx.arc(cxp, railY + 2, 6, 0, 7); cx.fill();
  // Ahimaaz marker
  const axp = railX + railW * frac(GS.cubits);
  cx.fillStyle = COL.sash;
  cx.beginPath(); cx.arc(axp, railY + 2, 7, 0, 7); cx.fill();
  cx.strokeStyle = COL.robe; cx.lineWidth = 2; cx.stroke();
  // the gate
  cx.fillStyle = COL.wallDark;
  cx.fillRect(railX + railW - 2, railY - 8, 4, 20);

  cx.font = '600 13px Georgia, serif';
  cx.fillStyle = COL.ink; cx.textAlign = 'left';
  cx.fillText('AHIMAAZ', railX, railY - 10);
  cx.textAlign = 'right';
  cx.fillText('MAHANAIM', railX + railW, railY - 10);

  // distance
  cx.textAlign = 'center';
  cx.font = '700 30px Georgia, serif';
  cx.fillText(Math.max(0, GS.cubits).toFixed(0) + ' cubits', VW / 2, railY + 44);
  cx.font = '400 12px Georgia, serif';
  cx.fillStyle = 'rgba(43,27,16,0.7)';
  const gap = GS.cubits - GS.cushite;
  cx.fillText(gap >= 0 ? `${gap.toFixed(0)} ahead of the Cushite`
                       : `${(-gap).toFixed(0)} behind the Cushite`, VW / 2, railY + 62);

  // the "on your marks" prompt
  if (GS.phase === 'run' && !GS.started) {
    cx.font = '600 17px Georgia, serif';
    cx.fillStyle = COL.ink; cx.textAlign = 'center';
    cx.fillText('Q W  drive the thighs      O P  drive the calves', VW / 2, GY + 78);
    cx.font = 'italic 400 15px Georgia, serif';
    cx.fillText('strike any of them to run', VW / 2, GY + 102);
  }

  // watchman toast
  if (GS.toast) {
    const a = Math.min(1, GS.toast.ttl / 0.6);
    cx.globalAlpha = a;
    cx.font = 'italic 500 19px Georgia, serif';
    cx.textAlign = 'center';
    cx.fillStyle = 'rgba(43,27,16,0.92)';
    wrapText(GS.toast.text, VW / 2, GY + 132, VW * 0.7, 26);
    cx.globalAlpha = 1;
  }
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (cx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
    else line = test;
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) cx.fillText(lines[i], x, y + i * lh);
}
