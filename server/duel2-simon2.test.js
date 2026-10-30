// Simon croisé : tours alternés, erreur et délai, 15 pas, et confidentialité de la séquence (jamais pendant la saisie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S2 from './duel/minigames/simon2.js';
import { duel } from './duelTestKit.js';

const other = (c) => (c === 'rouge' ? 'bleu' : 'rouge');

/** Joue un tour réussi : rejoue `seq` puis ajoute `pad`, puis attend la fin du rejeu sur la TV. */
function turn(s, seq, pad) {
  const who = s.mgState().turn;
  for (const p of seq) assert.equal(s.play(who, { pad: p }), null);
  assert.equal(s.play(who, { pad }), null);
  if (s.game.phase === 'question') s.tick(S2.replayMs(seq.length + 1));
}

test('tour : seul le joueur désigné joue, il rejoue la séquence puis ajoute un pas, les tours alternent', async () => {
  const s = await duel('simon2');
  const first = s.mgState().turn;
  assert.match(s.play(other(first), { pad: 1 }), /Pas ton tour/);
  assert.match(s.play(first, { pad: 9 }), /invalide/);
  turn(s, [], 2);
  assert.equal(s.mgState().turn, other(first));
  turn(s, [2], 0);
  assert.equal(s.mgState().turn, first);
  turn(s, [2, 0], 3);
  assert.deepEqual(s.mgState().seq, [2, 0, 3]);
  assert.equal(s.view('tv').steps, 3);
});

test('erreur ou 6 s sans toucher : le joueur perd', async () => {
  const s = await duel('simon2');
  turn(s, [], 1);
  const who = s.mgState().turn;
  s.play(who, { pad: 1 });
  s.play(who, { pad: 2 }); // il fallait ajouter un pas : ceci est le pas ajouté, donc valide
  assert.equal(s.game.phase, 'question');
  s.tick(S2.replayMs(2));
  const next = s.mgState().turn;
  s.play(next, { pad: 1 });
  s.play(next, { pad: 0 }); // 2e pas de la séquence est 2 : erreur
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), other(next));
  const t = await duel('simon2');
  const first = t.mgState().turn;
  t.tick(S2.STEP_MS);
  assert.equal(t.winner(), other(first), 'temps dépassé dès le premier pas');
});

test('15 pas sans erreur : égalité', async () => {
  const s = await duel('simon2');
  const seq = [];
  for (let i = 0; i < S2.MAX_STEPS; i++) {
    const pad = i % 4;
    turn(s, seq, pad);
    seq.push(pad);
  }
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'égalité');
});

test('confidentialité : la séquence n’est jamais envoyée pendant la saisie, et seule la TV la reçoit pendant son rejeu', async () => {
  const s = await duel('simon2');
  turn(s, [], 3);
  turn(s, [3], 1);
  // Phase de saisie : personne ne reçoit la séquence.
  assert.equal(s.mgState().phase, 'input');
  for (const who of ['tv', s.bettor, ...s.ids]) assert.equal(s.view(who).seq, undefined, 'séquence visible pendant la saisie');
  const who = s.mgState().turn;
  for (const p of [3, 1]) s.play(who, { pad: p });
  s.play(who, { pad: 2 });
  assert.equal(s.mgState().phase, 'replay');
  assert.deepEqual(s.view('tv').seq, [3, 1, 2], 'la TV la reçoit pendant le rejeu');
  for (const w of [s.bettor, ...s.ids]) assert.equal(s.view(w).seq, undefined, 'téléphone : jamais la séquence');
  assert.equal(JSON.stringify(s.view(s.camp.rouge)).includes('[3,1,2]'), false);
  assert.equal(s.play(s.mgState().turn, { pad: 3 }), null, 'pavés bloqués pendant le rejeu : ignoré');
  assert.equal(s.mgState().seq.length, 3);
});

test('le premier joueur est tiré au hasard', async () => {
  const seen = new Set();
  for (let i = 0; i < 40 && seen.size < 2; i++) seen.add((await duel('simon2')).mgState().turn);
  assert.equal(seen.size, 2);
});
