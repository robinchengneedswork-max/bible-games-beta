# Bible Games (beta)

Small browser games out of very old stories. No build step, no server, no install —
static HTML/JS. Open `index.html`, or deploy the repo root as a static site.

## Games

### Ahimaaz — The Way of the Plain (`ahimaaz/`)

2 Samuel 18:19–33. A QWOP-like. Joab sent the Cushite ahead with the news of Absalom's
death; Ahimaaz begged to run anyway, took the way of the plain, and overran him — then
reached the king and could not make himself say it.

**Controls:** `Q`/`W` drive the thighs against each other, `O`/`P` the calves. Both pairs
are antagonistic. There is no "run" button, only four muscles fighting.

Beat the Cushite to the gate of Mahanaim. Every fall sends you back to the start.

## Development

Each game is plain script tags sharing global scope — **load order in `index.html` is
dependency order**. Files are `kebab-case.js`, constants `UPPER_SNAKE`, functions
`camelCase`.

Ahimaaz's ragdoll is tuned by measurement, not by eye. Two headless harnesses load
`src/*.js` into a `vm` context the same way the browser does:

```bash
cd ahimaaz
node test/headless.js      # 21 checks — loads every module, drives the real key handlers
node test/tune.js smoke    # 8 checks — ragdoll stability + the race is winnable
node test/tune.js harder   # sweep the difficulty dials
node test/tune.js keys     # sweep GRAVITY: idle drift vs viable rhythms
```

Tuning is scored on **how many keyboard rhythms work**, not on top speed, and test gaits
must be binary — a player has no half-press.

Two constants in `ahimaaz/src/config.js` are pinned and commented as such: raising
`K_CORE` above 0.18, or dropping `GRAVITY` below ~1450, lets a runner who presses nothing
at all skate forward faster than the Cushite runs. Turn `GRIP_FOOT` and `MUSCLE_RATE` for
difficulty, `CUSHITE_PACE` for the race.
