// Dilemme en or : issues, gorgées propres au jeu, pas de reprise, et confidentialité des choix (test de fuite sur sockets réels inclus ailleurs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as DI from './duel/minigames/dilemme.js';
import { duel, leaks } from './duelTestKit.js';

test('issues pures : les 4 combinaisons', () => {
  assert.deepEqual(DI.outcomeOf('partager', 'partager'), { winner: 'égalité', sips: {} });
  assert.deepEqual(DI.outcomeOf('trahir', 'trahir'), { winner: 'égalité', sips: { rouge: 2, bleu: 2 } });
  assert.deepEqual(DI.outcomeOf('trahir', 'partager'), { winner: 'rouge' });
  assert.deepEqual(DI.outcomeOf('partager', 'trahir'), { winner: 'bleu' });
});

test('discussion de 20 s : aucun choix possible, puis 8 s ; premier choix définitif', async () => {
  const s = await duel('dilemme');
  assert.match(s.play('rouge', { choice: 'trahir' }), /Pas encore/);
  assert.ok(s.view('tv').talkEndsAt > 0);
  s.tick(DI.TALK_MS);
  assert.equal(s.mgState().phase, 'choose');
  assert.match(s.play('rouge', { choice: 'bof' }), /invalide/);
  s.play('rouge', { choice: 'partager' });
  s.play('rouge', { choice: 'trahir' });
  assert.equal(s.mgState().choices.rouge, 'partager');
});

test('un seul trahit : il gagne, le trahi boit selon la cote ; paris comptés comme d’habitude', async () => {
  const s = await duel('dilemme');
  s.tick(DI.TALK_MS);
  s.play('rouge', { choice: 'trahir' });
  s.play('bleu', { choice: 'partager' });
  assert.equal(s.winner(), 'rouge');
  s.tick(s.T.resultMs);
  assert.ok((s.game.sips.get(s.camp.bleu) ?? 0) >= 1);
  assert.equal(s.game.sips.get(s.camp.rouge) ?? 0, 0);
});

test('deux partagent : égalité, personne ne boit, parieurs épargnés', async () => {
  const s = await duel('dilemme');
  s.tick(DI.TALK_MS);
  s.play('rouge', { choice: 'partager' });
  s.play('bleu', { choice: 'partager' });
  assert.equal(s.winner(), 'égalité');
  s.tick(s.T.resultMs);
  assert.equal([...s.game.sips.values()].reduce((a, b) => a + b, 0), 0);
});

test('deux trahissent : égalité, les deux duellistes boivent 2, parieurs épargnés', async () => {
  const s = await duel('dilemme');
  s.tick(DI.TALK_MS);
  s.play('rouge', { choice: 'trahir' });
  s.play('bleu', { choice: 'trahir' });
  assert.equal(s.winner(), 'égalité');
  s.tick(s.T.resultMs);
  assert.equal(s.game.sips.get(s.camp.rouge), 2);
  assert.equal(s.game.sips.get(s.camp.bleu), 2);
  for (const b of s.d().bettors) assert.equal(s.game.sips.get(b) ?? 0, 0);
});

test('choix non fait en 8 s : tiré au hasard ; pas de reprise (le résultat est définitif)', async () => {
  const s = await duel('dilemme');
  s.tick(DI.TALK_MS + DI.CHOOSE_MS);
  assert.ok(s.game.results, 'résultat sans reprise');
  assert.ok(['rouge', 'bleu', 'égalité'].includes(s.winner()));
});

test('confidentialité : le choix d’un duelliste n’est visible de personne d’autre avant la fin, la règle est annoncée aux parieurs', async () => {
  const s = await duel('dilemme');
  s.tick(DI.TALK_MS);
  s.play('rouge', { choice: 'trahir' });
  for (const who of ['tv', s.bettor, s.camp.bleu]) {
    const v = s.view(who);
    assert.equal(leaks(v, ['trahir', 'partager']), false, 'choix visible');
    assert.equal(v.shown, undefined);
    assert.equal(v.chosen.rouge, true);
  }
  assert.equal(s.view(s.camp.rouge).mine, 'trahir');
  assert.equal(s.view(s.camp.bleu).mine, null);
  s.play('bleu', { choice: 'partager' });
  assert.deepEqual(s.view('tv').shown, { rouge: 'trahir', bleu: 'partager' });
  assert.match(s.game.publicState({ host: true }).round.mg.rule, /un seul peut trahir et gagner/);
});
