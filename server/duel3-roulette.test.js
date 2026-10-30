// Roulette des duellistes : le résultat vient du serveur (avant l'animation), les deux élus sont différents, la bande n'a jamais deux voisins identiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStrip, travel } from '../shared/roulette.js';
import { makeGame } from './testClock.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);

test('bande : au moins 16 vignettes, finit sur l’élu, jamais deux voisins identiques, même avec 2 ou 3 joueurs (liste dupliquée en boucle)', () => {
  for (const n of [2, 3, 4, 5, 12, 30]) {
    for (let seed = 0; seed < 60; seed++) {
      const strip = buildStrip(ids(n), `p${seed % n}`, `graine${seed}`);
      assert.ok(strip.length >= 15, `${n} joueurs : ${strip.length} vignettes`);
      assert.equal(strip.at(-1), `p${seed % n}`, 'la bande finit sur l’élu');
      for (let i = 1; i < strip.length; i++) assert.notEqual(strip[i], strip[i - 1], `voisins identiques (${n} joueurs, graine ${seed}, rang ${i})`);
      assert.ok(strip.every((id) => ids(n).includes(id)));
    }
  }
  assert.deepEqual(buildStrip(ids(5), 'p2', 'x'), buildStrip(ids(5), 'p2', 'x'), 'reproductible : même bande à chaque image');
});

test('trajet : rapide au départ, ralentit, arrêt net à la fin', () => {
  assert.equal(travel(0, 4000), 0);
  assert.equal(travel(4000, 4000), 1);
  assert.equal(travel(9999, 4000), 1);
  const early = travel(500, 4000) - travel(0, 4000);
  const late = travel(3500, 4000) - travel(3000, 4000);
  assert.ok(early > late * 3, 'ralentissement progressif');
  let last = -1;
  for (let t = 0; t <= 4000; t += 50) {
    assert.ok(travel(t, 4000) >= last);
    last = travel(t, 4000);
  }
});

test('les deux élus sont décidés par le serveur dès le début de la roulette et sont toujours différents', async () => {
  for (let i = 0; i < 40; i++) {
    const { game } = await makeGame('duel', ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, 3 + (i % 4)));
    game.duelOptions = { king: false, cote: 'standard', games: ['pfc'] };
    game.start();
    const round = game.publicState({ host: true }).round;
    assert.equal(round.step, 'duelists');
    assert.ok(round.red && round.blue && round.red !== round.blue, 'élus différents');
    // L'animation n'a rien à décider : les identifiants sont déjà dans l'état, les mêmes pour la TV et les téléphones.
    const phone = game.publicState({ playerId: [...game.players.keys()][0] }).round;
    assert.equal(phone.red, round.red);
    assert.equal(phone.blue, round.blue);
    const strips = [buildStrip([...game.players.keys()], round.red, 'a'), buildStrip([...game.players.keys()], round.blue, 'b')];
    assert.equal(strips[0].at(-1), round.red);
    assert.equal(strips[1].at(-1), round.blue);
    assert.notEqual(strips[0].at(-1), strips[1].at(-1), 'les deux colonnes ne s’arrêtent jamais sur la même personne');
  }
});
