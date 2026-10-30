// Les 5 mini-jeux du mode Duel : règles, égalités, compensation de latence et confidentialité des vues, joués dans le vrai moteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { DUEL_TIMING } from './games/duel.js';
import { MINIGAMES } from './duel/minigames/index.js';
import * as PFC from './duel/minigames/pfc.js';
import * as SIMON from './duel/minigames/simon.js';
import * as COULEUR from './duel/minigames/couleur.js';
import * as FEU from './duel/minigames/feu.js';
import * as CULTURE from './duel/minigames/culture.js';

const CULTURE_FIXTURE = Array.from({ length: 30 }, (_, i) => ({
  id: `q${i}`,
  question: `Question ${i} ?`,
  choix: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
  bonne: i % 4,
  categorie: 'test',
  source: 'https://example.org',
}));

/** Partie à 5 joueurs, un seul mini-jeu actif, arrivée au début du duel. */
async function duel(id, { content, latency } = {}) {
  const ctx = await makeGame('duel', ['A', 'B', 'C', 'D', 'E']);
  ctx.game.duelOptions = { king: false, cote: 'standard', games: [id] };
  if (content) ctx.game.duelContent = content;
  if (latency) ctx.game.duelLatency = new Map();
  assert.equal(ctx.game.start(), null);
  const d = () => ctx.game.roundData;
  const T = DUEL_TIMING;
  ctx.tick(T.duelistsMs);
  ctx.tick(T.gameMs);
  ctx.tick(T.betsMs);
  ctx.tick(T.betsRevealMs);
  for (const pid of [d().red, d().blue]) ctx.game.action(pid, { type: 'ready' });
  ctx.tick(T.readyBeatMs);
  assert.equal(d().step, 'play');
  const camp = { rouge: d().red, blue: d().blue, bleu: d().blue };
  const play = (c, data) => ctx.game.action(camp[c], { type: 'play', data });
  const view = (who) => ctx.game.publicState(who === 'tv' ? { host: true } : { playerId: who }).round.play;
  const bettor = d().bettors[0];
  return { ...ctx, d, T, camp, play, view, bettor, ids: [d().red, d().blue], winner: () => ctx.game.results?.winner, mgState: () => d().mg };
}

const leaks = (value, words) => words.some((w) => JSON.stringify(value).includes(w));

// ---------- Pierre-feuille-ciseaux ----------

test('PFC : table des manches', () => {
  assert.equal(PFC.roundWinner('pierre', 'ciseaux'), 'rouge');
  assert.equal(PFC.roundWinner('ciseaux', 'pierre'), 'bleu');
  assert.equal(PFC.roundWinner('feuille', 'pierre'), 'rouge');
  assert.equal(PFC.roundWinner('ciseaux', 'feuille'), 'rouge');
  assert.equal(PFC.roundWinner('pierre', 'feuille'), 'bleu');
  assert.equal(PFC.roundWinner('feuille', 'feuille'), null);
});

test('PFC : meilleur des 3, manche nulle rejouée, le choix reste secret jusqu’à la révélation simultanée', async () => {
  const s = await duel('pfc');
  assert.match(s.play('rouge', { choice: 'laser' }), /invalide/);
  s.play('rouge', { choice: 'pierre' });
  s.play('rouge', { choice: 'feuille' }); // le premier choix est définitif
  for (const who of ['tv', s.bettor, s.camp.bleu]) assert.equal(leaks(s.view(who), ['pierre', 'feuille', 'ciseaux']), false, 'choix de ROUGE visible avant la révélation');
  assert.equal(s.view(s.camp.rouge).mine, 'pierre');
  assert.equal(s.view(s.camp.bleu).mine, null);
  assert.equal(s.view('tv').chosen.rouge, true);
  s.play('bleu', { choice: 'pierre' }); // manche nulle
  assert.equal(s.view('tv').shown.winner, null);
  assert.equal(s.view('tv').round, 1);
  s.tick(PFC.PAUSE_MS);
  assert.equal(s.view('tv').round, 2, 'manche nulle rejouée');
  s.play('rouge', { choice: 'pierre' });
  s.play('bleu', { choice: 'ciseaux' });
  s.tick(PFC.PAUSE_MS);
  s.play('rouge', { choice: 'feuille' });
  s.play('bleu', { choice: 'pierre' });
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'rouge');
  assert.deepEqual(s.game.results.details.wins, { rouge: 2, bleu: 0 });
});

test('PFC : choix non fait en 8 s = hasard ; 6 manches nulles au plus, puis égalité', async () => {
  const s = await duel('pfc');
  s.tick(PFC.CHOOSE_MS);
  assert.ok(s.view('tv').shown, 'les deux choix tirés au hasard et révélés');
  assert.equal(s.game.phase, 'question');
  const t = await duel('pfc');
  for (let i = 0; i < PFC.MAX_ROUNDS; i++) {
    t.play('rouge', { choice: 'pierre' });
    t.play('bleu', { choice: 'pierre' });
    t.tick(PFC.PAUSE_MS);
  }
  assert.equal(t.game.phase, 'revealing');
  assert.equal(t.winner(), 'égalité');
});

// ---------- Simon ----------

const turnSeq = (s) => s.mgState().seq;
const waitInput = (s) => s.tick(SIMON.displayMs(s.mgState().turn) + 10);

test('Simon : même séquence pour les deux, seul le début du tour est envoyé, pavés bloqués pendant la séquence', async () => {
  const s = await duel('simon');
  const full = turnSeq(s);
  assert.equal(full.length, SIMON.MAX_TURNS);
  assert.equal(s.view('tv').seq.length, 1);
  assert.deepEqual(s.view(s.camp.rouge).seq, s.view(s.camp.bleu).seq);
  assert.equal(JSON.stringify(s.view(s.bettor).seq), JSON.stringify(full.slice(0, 1)));
  s.play('rouge', { pad: (full[0] + 1) % 4 }); // pendant la séquence : ignoré, pas d'erreur
  assert.equal(s.mgState().players.rouge.alive, true);
});

test('Simon : une erreur élimine, le survivant qui finit son tour gagne', async () => {
  const s = await duel('simon');
  const seq = turnSeq(s);
  waitInput(s);
  s.play('rouge', { pad: (seq[0] + 1) % 4 });
  assert.equal(s.mgState().players.rouge.alive, false);
  assert.equal(s.game.phase, 'question', 'le survivant n’a pas fini le tour');
  s.play('bleu', { pad: seq[0] });
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'bleu');
});

test('Simon : 5 s sans toucher = erreur ; les deux se trompent : le plus avancé gagne, à égalité parfaite égalité', async () => {
  const s = await duel('simon');
  const seq = turnSeq(s);
  waitInput(s);
  s.play('rouge', { pad: seq[0] });
  s.play('bleu', { pad: seq[0] });
  s.tick(SIMON.PAUSE_MS);
  waitInput(s);
  s.play('rouge', { pad: seq[0] });
  s.play('rouge', { pad: (seq[1] + 1) % 4 }); // rouge : 1 pas juste dans le tour 2
  s.play('bleu', { pad: (seq[0] + 1) % 4 }); // bleu : se trompe dès le premier pas
  assert.equal(s.winner(), 'rouge', 'rouge est allé plus loin');
  const t = await duel('simon');
  t.tick(SIMON.displayMs(1) + SIMON.STEP_MS + 50);
  assert.equal(t.winner(), 'égalité', 'personne ne touche : égalité parfaite');
});

test('Simon : 12 tours terminés, le plus rapide cumulé gagne (temps compensé de la latence)', async () => {
  const s = await duel('simon', { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 0);
  s.game.duelLatency.set(s.camp.bleu, 300); // bleu a un réseau lent : son temps est compensé
  const seq = turnSeq(s);
  for (let turn = 1; turn <= SIMON.MAX_TURNS; turn++) {
    waitInput(s);
    for (let i = 0; i < turn; i++) s.play('rouge', { pad: seq[i] });
    s.tick(100);
    for (let i = 0; i < turn; i++) s.play('bleu', { pad: seq[i] });
    if (turn < SIMON.MAX_TURNS) s.tick(SIMON.PAUSE_MS);
  }
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.game.results.details.reason, 'speed');
  assert.equal(s.winner(), 'bleu', 'rouge a tapé 100 ms plus tôt, mais bleu a 300 ms de latence compensés');
});

// ---------- Couleur piège ----------

test('Couleur piège : même série pour la même graine, encre toujours différente du mot sauf rares cas', () => {
  for (let i = 0; i < 50; i++) assert.deepEqual(COULEUR.stroopItem(1234, i), COULEUR.stroopItem(1234, i));
  const items = Array.from({ length: 400 }, (_, i) => COULEUR.stroopItem(99, i));
  const congruent = items.filter((it) => it.word === it.ink).length;
  assert.ok(congruent > 20 && congruent < 100, `part de mots congruents : ${congruent}`);
  assert.notDeepEqual(COULEUR.stroopItem(1, 0), COULEUR.stroopItem(2, 0).word === COULEUR.stroopItem(1, 0).word ? 0 : COULEUR.stroopItem(2, 0));
});

test('Couleur piège : score = bonnes − 2 × erreurs, la TV ne reçoit jamais les mots, chacun voit son propre mot', async () => {
  const s = await duel('couleur');
  const seed = s.mgState().seed;
  const mine = s.view(s.camp.rouge);
  assert.equal(mine.item.ink, COULEUR.stroopItem(seed, 0).ink);
  assert.equal(s.view(s.camp.bleu).item.ink, COULEUR.stroopItem(seed, 0).ink, 'même série');
  for (const who of ['tv', s.bettor]) {
    const v = s.view(who);
    assert.equal(v.item, undefined);
    assert.deepEqual(Object.keys(v).sort(), ['answered', 'endsAt', 'extra', 'gauge']);
  }
  s.play('rouge', { i: 0, color: COULEUR.stroopItem(seed, 0).ink });
  s.play('rouge', { i: 1, color: COULEUR.COLORS.find((c) => c.id !== COULEUR.stroopItem(seed, 1).ink).id });
  assert.equal(s.view('tv').gauge.rouge, 1 - 2);
  assert.match(s.play('rouge', { i: 1, color: 'rouge' }), /Trop tard/, 'mot déjà passé : ignoré sans pénalité');
  assert.equal(s.view('tv').gauge.rouge, -1);
  assert.match(s.play('rouge', { i: 2, color: 'orange' }), /invalide/);
});

test('Couleur piège : le meilleur score gagne à 15 s ; égalité : 5 s de plus, puis égalité finale', async () => {
  const s = await duel('couleur');
  const seed = s.mgState().seed;
  s.play('bleu', { i: 0, color: COULEUR.stroopItem(seed, 0).ink });
  s.tick(COULEUR.MAIN_MS);
  assert.equal(s.winner(), 'bleu');
  const t = await duel('couleur');
  t.tick(COULEUR.MAIN_MS);
  assert.equal(t.game.phase, 'question', 'égalité à 15 s : on continue');
  assert.ok(t.view('tv').extra);
  const seedT = t.mgState().seed;
  t.play('rouge', { i: 0, color: COULEUR.stroopItem(seedT, 0).ink });
  t.tick(COULEUR.EXTRA_MS);
  assert.equal(t.winner(), 'rouge', 'départagé dans les 5 s');
  const u = await duel('couleur');
  u.tick(COULEUR.MAIN_MS);
  u.tick(COULEUR.EXTRA_MS);
  assert.equal(u.winner(), 'égalité');
});

// ---------- Duel du Feu ----------

const toFeu = (s) => {
  const st = s.mgState();
  for (let guard = 0; guard < 400 && st.phase !== 'feu'; guard++) s.tick(250);
  assert.equal(st.phase, 'feu');
  return st;
};

test('Duel du Feu : un faux départ est une défaite immédiate', async () => {
  const s = await duel('feu');
  s.tick(FEU.START_MS + 50);
  assert.equal(s.mgState().phase, 'words');
  s.play('rouge', { type: 'tap' });
  assert.equal(s.view('tv').faults.rouge, true, 'le faux départ se voit tout de suite sur la TV');
  s.tick(FEU.FAULT_SETTLE_MS + 10);
  assert.equal(s.winner(), 'bleu');
  assert.equal(s.game.results.details.reason, 'falseStart');
});

test('Duel du Feu : les deux fautent → on rejoue (2 reprises au plus) puis égalité', async () => {
  const s = await duel('feu');
  for (let attempt = 0; attempt <= FEU.MAX_REPLAYS; attempt++) {
    for (let g = 0; g < 10 && s.mgState().phase === 'wait'; g++) s.tick(200);
    s.play('rouge', { type: 'tap' });
    s.play('bleu', { type: 'tap' });
    s.tick(FEU.FAULT_SETTLE_MS + 10);
    if (attempt < FEU.MAX_REPLAYS) {
      assert.equal(s.mgState().phase, 'replay');
      s.tick(2000);
    }
  }
  assert.equal(s.winner(), 'égalité');
  assert.equal(s.mgState().replays, FEU.MAX_REPLAYS);
});

test('Duel du Feu : le plus rapide gagne ; la latence de chacun est compensée ; moins de 20 ms : on rejoue', async () => {
  const s = await duel('feu', { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 0);
  s.game.duelLatency.set(s.camp.bleu, 200);
  const st = toFeu(s);
  s.game.gameHostAction({ type: 'spoken', index: st.seq.feuIndex });
  assert.equal(st.feuSpoken, true);
  s.tick(120);
  s.play('rouge', { type: 'tap' }); // rouge : 120 ms
  s.tick(60);
  s.play('bleu', { type: 'tap' }); // bleu : 180 ms reçus, 100 ms de trajet retirés → 80 ms : plus rapide
  s.tick(FEU.TAP_SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
  assert.deepEqual(s.game.results.details.times, { rouge: 120, bleu: 80 });
  const t = await duel('feu');
  toFeu(t);
  t.play('rouge', { type: 'tap' });
  t.tick(10);
  t.play('bleu', { type: 'tap' });
  t.tick(FEU.TAP_SETTLE_MS);
  assert.equal(t.mgState().phase, 'replay', 'écart de 10 ms : on rejoue');
});

test('Duel du Feu : personne ne tape en 3 s → on rejoue ; le « FEU » n’est jamais envoyé avant d’être dit, ni la liste des mots aux duellistes', async () => {
  const s = await duel('feu');
  const st = s.mgState();
  const feuWord = (i) => st.seq.words[i];
  for (let g = 0; g < 800 && st.phase !== 'feu'; g++) {
    s.tick(100);
    for (const who of ['tv', s.bettor]) assert.ok(s.view(who).word === null || st.seq.words.indexOf(s.view(who).word) <= st.index, 'mot futur envoyé');
    for (const pid of s.ids) {
      const v = s.view(pid);
      assert.equal(v.word, undefined, 'un duelliste n’a jamais les mots');
      assert.equal(JSON.stringify(v).includes('"words":'), false);
    }
  }
  assert.equal(feuWord(st.index), 'FEU');
  s.tick(3000 + 10);
  assert.equal(st.phase, 'replay', 'personne n’a tapé : on rejoue');
});

test('Duel du Feu : voix indiquée par la TV, signal « FEU » refusé s’il est périmé ou pour un autre mot', async () => {
  const s = await duel('feu');
  s.game.gameHostAction({ type: 'voice', available: false });
  assert.equal(s.view('tv').voice, false);
  s.game.gameHostAction({ type: 'voice', available: true });
  assert.equal(s.view('tv').voice, true);
  const st = toFeu(s);
  s.game.gameHostAction({ type: 'spoken', index: st.seq.feuIndex - 1 });
  assert.equal(st.feuSpoken, false);
  s.tick(2100);
  s.game.gameHostAction({ type: 'spoken', index: st.seq.feuIndex });
  assert.equal(st.feuSpoken, false, 'signal trop tardif ignoré');
});

// ---------- Culture G éclair ----------

const answer = (s, camp, which) => {
  const st = s.mgState();
  const right = st.q.right;
  return s.play(camp, { choice: which === 'right' ? right : (right + 1) % 4, n: st.n });
};

test('Culture G : la bonne réponse n’est jamais envoyée avant la fin de la question (ni TV, ni parieur, ni duelliste)', async () => {
  const s = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  const st = s.mgState();
  const rightText = st.q.choices[st.q.right];
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.shown, null);
    assert.equal(JSON.stringify(v).includes('right'), false, 'clé « right » dans une vue');
    assert.equal(v.choices.length, 4);
  }
  assert.ok(rightText);
  answer(s, 'rouge', 'right');
  assert.equal(s.view('tv').shown, null, 'toujours rien tant que la question n’est pas close');
  s.tick(CULTURE.SETTLE_MS);
  assert.equal(s.view('tv').shown.right, st.q.right, 'montrée une fois la question terminée');
  assert.equal(s.view('tv').shown.scorer, 'rouge');
});

test('Culture G : mauvaise réponse = 2 s de blocage, le premier juste marque, 2 points gagnent', async () => {
  const s = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  answer(s, 'rouge', 'wrong');
  assert.match(answer(s, 'rouge', 'right'), /Bloqué/);
  assert.equal(answer(s, 'bleu', 'right'), null);
  s.tick(CULTURE.SETTLE_MS);
  assert.deepEqual(s.view('tv').score, { rouge: 0, bleu: 1 });
  s.tick(CULTURE.REVEAL_MS);
  assert.equal(s.mgState().n, 2);
  assert.equal(answer(s, 'bleu', 'right'), null);
  s.tick(CULTURE.SETTLE_MS);
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'bleu');
});

test('Culture G : 10 s sans réponse, question suivante ; 5 questions au plus puis le meilleur score ; égalité : mort subite', async () => {
  const s = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  s.tick(CULTURE.QUESTION_MS);
  assert.equal(s.view('tv').shown.scorer, null);
  s.tick(CULTURE.REVEAL_MS);
  assert.equal(s.mgState().n, 2);
  answer(s, 'rouge', 'right');
  s.tick(CULTURE.SETTLE_MS);
  s.tick(CULTURE.REVEAL_MS);
  for (let q = 0; q < 3; q++) {
    s.tick(CULTURE.QUESTION_MS);
    s.tick(CULTURE.REVEAL_MS);
  }
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'rouge', '1-0 après 5 questions');
  const t = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  answer(t, 'rouge', 'right');
  t.tick(CULTURE.SETTLE_MS + CULTURE.REVEAL_MS);
  answer(t, 'bleu', 'right');
  t.tick(CULTURE.SETTLE_MS + CULTURE.REVEAL_MS);
  for (let q = 0; q < 3; q++) t.tick(CULTURE.QUESTION_MS + CULTURE.REVEAL_MS);
  assert.equal(t.game.phase, 'question', '1-1 après 5 questions : mort subite');
  assert.equal(t.mgState().n, 6);
  answer(t, 'bleu', 'right');
  t.tick(CULTURE.SETTLE_MS);
  assert.equal(t.winner(), 'bleu');
});

test('Culture G : latence compensée (le plus rapide réellement gagne), égalité à 20 ms : question rejouée une fois', async () => {
  const s = await duel('culture', { content: { culture: CULTURE_FIXTURE }, latency: true });
  s.game.duelLatency.set(s.camp.rouge, 0);
  s.game.duelLatency.set(s.camp.bleu, 200);
  s.tick(1000);
  answer(s, 'rouge', 'right'); // 1000 ms
  s.tick(50);
  answer(s, 'bleu', 'right'); // 1050 − 200 = 850 ms : plus rapide malgré une arrivée plus tardive
  s.tick(CULTURE.SETTLE_MS);
  assert.equal(s.view('tv').shown.scorer, 'bleu');
  const t = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  const first = t.mgState().q.question;
  t.tick(1000);
  answer(t, 'rouge', 'right');
  t.tick(5);
  answer(t, 'bleu', 'right');
  t.tick(CULTURE.SETTLE_MS);
  assert.equal(t.view('tv').shown.tie, true);
  assert.deepEqual(t.view('tv').score, { rouge: 0, bleu: 0 });
  t.tick(CULTURE.REVEAL_MS);
  assert.equal(t.mgState().q.question, first, 'même question rejouée');
  assert.equal(t.mgState().n, 1);
});

test('Culture G : une même question ne revient pas dans un duel ; contenu insuffisant : mini-jeu jamais tiré', async () => {
  const s = await duel('culture', { content: { culture: CULTURE_FIXTURE } });
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    seen.add(s.mgState().q.id);
    s.tick(CULTURE.QUESTION_MS + CULTURE.REVEAL_MS);
  }
  assert.ok(seen.size >= 5);
  const g = await makeGame('duel', ['A', 'B', 'C']);
  g.game.duelContent = { culture: CULTURE_FIXTURE.slice(0, 3) };
  assert.equal(MINIGAMES.culture.available(g.game), false);
  g.game.duelOptions = { king: false, cote: 'standard', games: ['culture'] };
  assert.match(g.game.start(), /mini-jeu/);
});
