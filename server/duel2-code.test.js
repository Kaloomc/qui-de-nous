// Le Code : code secret sans doublon, retour façon Wordle (vert / orange / gris), règles, égalités, confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as CODE from './duel/minigames/code.js';
import { duel } from './duelTestKit.js';

test('code secret : 4 symboles toujours tous différents (1 000 tirages)', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const secret = CODE.drawSecret(seededRng(seed));
    assert.equal(secret.length, 4);
    assert.equal(new Set(secret).size, 4, `doublon dans le code ${secret}`);
    assert.ok(secret.every((x) => Number.isInteger(x) && x >= 0 && x < CODE.SYMBOLS));
    seen.add(secret.join());
  }
  assert.ok(seen.size > 100, 'les codes varient');
});

test('retour façon Wordle : G bien placé, O mal placé, X absent', () => {
  const t = (secret, guess, marks) => assert.deepEqual(CODE.score(secret, guess).marks, [...marks], `${secret} / ${guess}`);
  t([0, 1, 2, 3], [0, 1, 2, 3], 'GGGG');
  t([0, 1, 2, 3], [3, 2, 1, 0], 'OOOO');
  t([0, 1, 2, 3], [0, 2, 4, 5], 'GOXX');
  t([0, 1, 2, 3], [4, 5, 0, 1], 'XXOO');
  t([5, 4, 3, 2], [0, 1, 3, 4], 'XXGO');
  t([0, 1, 2, 3], [4, 5, 4, 5].map((x, i) => [4, 5, 0, 1][i]), 'XXOO');
  const r = CODE.score([0, 1, 2, 3], [0, 2, 4, 5]);
  assert.equal(r.exact, 1);
  assert.equal(r.misplaced, 1);
  // Tous les essais sans doublon sur 1 000 tirages : le retour est cohérent avec la position et la présence.
  const rng = seededRng(9);
  for (let i = 0; i < 1000; i++) {
    const secret = CODE.drawSecret(rng);
    const guess = CODE.drawSecret(rng);
    CODE.score(secret, guess).marks.forEach((m, k) => {
      if (m === 'G') assert.equal(guess[k], secret[k]);
      else if (m === 'O') assert.ok(secret.includes(guess[k]) && guess[k] !== secret[k]);
      else assert.ok(!secret.includes(guess[k]));
    });
  }
});

test('jeu : le premier à trouver gagne, 8 essais au plus, essai invalide ou avec un symbole répété refusé', async () => {
  const s = await duel('code');
  const secret = s.mgState().secret;
  assert.equal(new Set(secret).size, 4);
  assert.match(s.play('rouge', { guess: [0, 1, 2] }), /invalide/);
  assert.match(s.play('rouge', { guess: [0, 1, 2, 9] }), /invalide/);
  assert.match(s.play('rouge', { guess: [0, 0, 1, 2] }), /même symbole/);
  const miss = secret.map((x) => (x + 1) % 6); // reste sans doublon : décalage des 4 symboles distincts
  assert.equal(s.play('rouge', { guess: miss }), null);
  assert.equal(s.play('bleu', { guess: secret }), null);
  s.tick(CODE.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
  assert.equal(s.game.results.details.tries.rouge, 1);
  const t = await duel('code');
  const sec = t.mgState().secret;
  for (let i = 0; i < CODE.MAX_TRIES; i++) t.play('rouge', { guess: sec.map((x) => (x + 1) % 6) });
  assert.match(t.play('rouge', { guess: sec.map((x) => (x + 1) % 6) }), /Plus d’essai/);
});

test('confidentialité : la TV et l’adversaire ne voient que des cases de retour, jamais les symboles joués ; le code n’est envoyé qu’à la fin', async () => {
  const s = await duel('code');
  const secret = s.mgState().secret;
  const guess = [0, 1, 2, 3];
  s.play('rouge', { guess });
  for (const who of ['tv', s.bettor, s.camp.bleu]) {
    const v = s.view(who);
    assert.deepEqual(v.mine ?? [], [], 'essais d’un autre');
    assert.equal(v.secret, undefined);
    assert.equal(JSON.stringify(v).includes('"guess"'), false);
    assert.equal(v.grids.rouge.length, 1);
    assert.ok(v.grids.rouge[0].every((m) => ['G', 'O', 'X'].includes(m)));
  }
  assert.equal(s.view(s.camp.rouge).mine.length, 1);
  assert.deepEqual(s.view(s.camp.rouge).mine[0].guess, guess);
  assert.equal(s.view(s.camp.rouge).secret, undefined);
  s.play('bleu', { guess: secret });
  s.tick(CODE.SETTLE_MS);
  assert.deepEqual(s.game.results.details.secret, secret);
});

test('jeu : sans code trouvé, le meilleur dernier retour gagne ; rien joué : égalité ; égalité de vitesse : nouveau code puis égalité', async () => {
  const s = await duel('code');
  const sec = s.mgState().secret;
  const near = [sec[1], sec[0], sec[2], sec[3]]; // deux symboles échangés : 2 verts, 2 oranges
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
