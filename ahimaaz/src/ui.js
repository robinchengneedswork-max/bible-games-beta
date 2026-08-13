'use strict';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UI — screens and overlays. The .screen / .screen.active pattern.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  const all = document.querySelectorAll('.screen');
  for (let i = 0; i < all.length; i++) all[i].classList.remove('active');
  $(id).classList.add('active');
}

function showTitle() {
  GS.phase = 'title';
  showScreen('titleScreen');
}

// commentary links — they leave the game, so they open in a new tab
function refsHTML(refs) {
  if (!refs || !refs.length) return '';
  let h = '<span class="refs">';
  for (let i = 0; i < refs.length; i++)
    h += '<a href="' + refs[i].u + '" target="_blank" rel="noopener">' + refs[i].t + '</a>';
  return h + '</span>';
}

function showBrief() {
  showScreen('briefScreen');
  const line = BRIEF_LINES[GS.briefIdx];
  $('briefWho').textContent = line.who;
  $('briefText').textContent = '"' + line.text + '"';
  $('briefStep').textContent = (GS.briefIdx + 1) + ' / ' + BRIEF_LINES.length;
  // the gloss under the verse — authorial voice, not scripture, so it is set apart
  $('briefNote').innerHTML = (line.note || '') + refsHTML(line.refs);
  $('briefNote').style.display = line.note ? '' : 'none';
}

function showRunScreen() {
  showScreen('gameScreen');
  resizeCanvas();
}

function showFallen() {
  showScreen('fallenScreen');
  $('fallLine').textContent = GS.fallLine;
  $('fallDist').textContent = Math.max(0, GS.cubits).toFixed(0);
  $('fallBest').textContent = Math.max(0, GS.best).toFixed(0);
  $('fallCush').textContent = Math.min(GOAL_CUBITS, GS.cushite).toFixed(0);
}

function showArrival() {
  showScreen('arriveScreen');
  const won = GS.wonRace;
  $('arriveTitle').textContent = won ? 'THE GATE OF MAHANAIM' : 'YOU CAME IN SECOND';
  $('arriveTime').textContent = GS.runT.toFixed(1) + 's';
  $('arriveBody').innerHTML = won
    ? '<p class="verse">"He is a good man, and cometh with good tidings."</p>' +
      '<p>You outran him. You come first to the gate, and the king rises from between the two gates to meet you.</p>' +
      '<p class="says"><b>DAVID:</b> "Is all well?"</p>' +
      '<p class="says"><b>AHIMAAZ:</b> "All is well."</p>'
    : '<p class="verse">"And, behold, the Cushite came."</p>' +
      '<p>He reached the gate while you were still on the plain. There is nothing left for you to tell him. ' +
      'The king already knows, and the king is already climbing to the chamber over the gate.</p>';
  $('arriveBtn').textContent = won ? 'THE KING ASKS AGAIN' : 'SEE THE END';
}

function showAudience() {
  showScreen('audienceScreen');
}

function showEnding() {
  showScreen('endScreen');
  let title, body;
  if (GS.answer === 'dodge') {
    title = 'THE TIDINGS YOU DID NOT BEAR';
    body = '<p class="verse">"I saw a great tumult, but I knew not what it was."</p>' +
      '<p>You ran the whole plain to say nothing. You outran the Cushite for the right to stand in front of ' +
      'a father and go quiet — and Joab, who would not send you, had already seen this coming.</p>' +
      '<p><i>Come what may</i>, you told him, back where the argument was cheap. You meant it about the running. ' +
      'The bill, when it came, was not for the running.</p>' +
      '<p>The king sets you aside. <i>"Turn aside, and stand here."</i> And you stand there while the Cushite ' +
      'comes up behind you and says it plainly.</p>';
  } else if (GS.answer === 'truth') {
    title = 'YOU TOLD HIM PLAINLY';
    body = '<p class="verse">"The young man is dead."</p>' +
      '<p>Not what Ahimaaz said. He ran faster than the Cushite and then could not make his mouth do it — ' +
      'that is the whole point of the story, and you have gone and spoiled it by being brave.</p>' +
      '<p>The king does not thank you for the speed. But it is the thing you actually promised Joab on the way ' +
      'out of the wood, in two words, before you knew what they would cost: <i>come what may</i>.</p>';
  } else {
    title = 'THE CUSHITE BORE THE TIDINGS';
    body = '<p class="verse">"Tidings, my lord the king: for the LORD hath avenged thee this day."</p>' +
      '<p>He said it plainly, because he had not spent the whole run dreading the question. ' +
      'You arrive to a gate that has already heard everything.</p>';
  }
  $('endTitle').textContent = title;
  $('endBody').innerHTML = body +
    '<p class="lament">"O my son Absalom, my son, my son Absalom! would God I had died for thee, ' +
    'O Absalom, my son, my son!"</p>' +
    '<p class="cite">2 Samuel 18:19&ndash;33</p>';
  $('endSources').innerHTML =
    '<details class="sources"><summary>Where this reading comes from</summary>' +
    '<p>Nothing above is invented except the running. The chapter does not tell you why Ahimaaz went quiet, ' +
    'and the commentators have never agreed &mdash; some read a lie, some read mercy, some read a man who ' +
    'understood Joab about four seconds too late.</p>' +
    refsHTML(SOURCES) + '</details>';
  $('endStats').textContent = GS.wonRace
    ? 'You beat him to the gate in ' + GS.runT.toFixed(1) + 's.'
    : 'He beat you to the gate.';
}
