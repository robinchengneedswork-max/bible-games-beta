'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN — entry point and the game loop.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let lastTime = 0;

function loop(timestamp) {
  let dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  if (!(dt > 0)) dt = 1 / 60;
  if (dt > 0.1) dt = 0.1;              // tab was hidden; do not explode the physics
  dt *= TIME_SCALE;                    // everything downstream runs in game seconds

  if (GS.phase === 'run') updateRun(dt);
  else if (GS.phase === 'sprawl') updateSprawl(dt);

  // the canvas stays live behind the arrival and fail cards
  if (GS.phase === 'run' || GS.phase === 'sprawl' || GS.phase === 'fallen' ||
      GS.phase === 'arrive' || GS.phase === 'audience') {
    drawFrame();
  }

  requestAnimationFrame(loop);
}

(function init() {
  initRender();
  initInput();
  showTitle();
  requestAnimationFrame(function (t) { lastTime = t; requestAnimationFrame(loop); });
})();
