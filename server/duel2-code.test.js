// Le Code : calcul des indices (doublons), règles, égalités, confidentialité (code secret et essais de l'adversaire).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CODE from './duel/minigames/code.js';
import { duel } from './duelTestKit.js';

test('indices : cas connus, avec doublons', () => {
  const t = (secret, guess, exact, misplaced) => assert.deepEqual(CODE.score(secret, guess), { exact, misplaced }, `${secret} / ${guess}`);
  t([0, 1, 2, 3], [0, 1, 2, 3], 4, 0);
  t([0, 1, 2, 3], [3, 2, 1, 0], 0, 4);
  t([0, 0, 1, 2], [0, 1, 0, 0], 1, 2);
  t([1, 1, 2, 3], [1, 2, 1, 1], 1, 2);
  t([0, 0, 0, 0], [0, 0, 1, 1], 2, 0);
  t([1, 2, 3, 4], [5, 5, 5, 5], 0, 0);
  t([2, 2, 3, 3], [3, 3, 2, 2], 0, 4);
  t([0, 1, 1, 2], [1, 1, 0, 0], 1, 2);
  // Le score ne dépend pas de l'ordre des arguments.
  for (let i = 0; i < 500; i++) {
    const a = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6));
    const b = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6));
    assert.deepEqual(CODE.score(a, b), CODE.score(b, a));
  }
});

test('jeu : le premier à trouver gagne, 8 essais au plus, code invalide refusé', async () => {
  const s = await duel('code');
  const secret = s.mgState().secret;
  assert.match(s.play('rouge', { guess: [0, 1, 2] }), /invalide/);
  assert.match(s.play('rouge', { guess: [0, 1, 2, 9] }), /invalide/);
  assert.equal(s.play('rouge', { guess: secret.map((x) => (x + 1) % 6) }), null);
  assert.equal(s.play('bleu', { guess: secret }), null);
  s.tick(CODE.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
  assert.equal(s.game.results.details.tries.rouge, 1);
  const t = await duel('code');
  const sec = t.mgState().secret;
  for (let i = 0; i < CODE.MAX_TRIES; i++) t.play('rouge', { guess: sec.map((x) => (x + 1) % 6) });
  assert.match(t.play('rouge', { guess: sec.map((x) => (x + 1) % 6) }), /Plus d’essai/);
});

test('confidentialité : ni la TV, ni les parieurs, ni l’adversaire ne voient les symboles joués ; le code n’est envoyé qu’à la fin', async () => {
  const s = await duel('code');
  const secret = s.mgState().secret;
  const guess = [0, 1, 2, 3];
  s.play('rouge', { guess });
  for (const who of ['tv', s.bettor, s.camp.bleu]) {
    const v = s.view(who);
    assert.deepEqual(v.mine ?? [], [], 'essais d’un autre');
    assert.equal(v.secret, undefined);
    assert.equal(JSON.stringify(v).includes('"guess"'), false);
    assert.equal(v.pips.rouge.length, 1);
  }
  assert.equal(s.view(s.camp.rouge).mine.length, 1);
  assert.deepEqual(s.view(s.camp.rouge).mine[0].guess, guess);
  assert.equal(s.view(s.camp.rouge).secret, undefined);
  s.play('bleu', { guess: secret });
  s.tick(CODE.SETTLE_MS);
  assert.deepEqual(s.game.results.details.secret, secret);
});

test('jeu : sans code trouvé, le meilleur dernier indice gagne ; rien joué : égalité ; égalité de vitesse : nouveau code puis égalité', async () => {
  const s = await duel('code');
  const sec = s.mgState().secret;
  const near = [...sec];
  near[0] = (near[0] + 1) % 6;
  s.play('rouge', { guess: sec.map((x) => (x + 1) % 6) });
  s.play('bleu', { guess: near });
  s.tick(CODE.MAX_MS);
  assert.equal(s.winner(), 'bleu');
  const u = await duel('code');
  u.tick(CODE.MAX_MS);
  assert.equal(u.winner(), 'égalité');
  const t = await duel('code', { latency: true });
  const first = JSON.stringify(t.mgState().secret);
  t.play('rouge', { guess: t.mgState().secret });
  t.tick(5);
  t.play('bleu', { guess: t.mgState().secret });
  t.tick(CODE.SETTLE_MS);
  assert.equal(t.game.phase, 'question');
  assert.notEqual(JSON.stringify(t.mgState().secret), first, 'nouveau code');
  t.play('rouge', { guess: t.mgState().secret });
  t.tick(5);
  t.play('bleu', { guess: t.mgState().secret });
  t.tick(CODE.SETTLE_MS);
  assert.equal(t.winner(), 'égalité');
});
