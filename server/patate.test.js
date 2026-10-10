import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedTargets, BOOM_SIPS, explode, fuseDuration, passBomb, randomPass, sipsPatate, startPatate } from './rules/patate.js';
import { IDLE_MS } from './games/patate.js';
import { makeGame } from './testClock.js';

const ids = ['a', 'b', 'c', 'd'];

test('mèche : entre 15 et 45 s', () => {
  assert.equal(fuseDuration(() => 0), 15000);
  assert.equal(fuseDuration(() => 0.999999), 45000);
});

test('anti-renvoi : impossible de rendre la bombe à ceux qui l’ont passée lors des 2 dernières passes', () => {
  let round = startPatate(ids, () => 0);
  assert.equal(round.holderId, 'a');
  round = passBomb(round, 'a', 'b', ids, 1).round;
  assert.match(passBomb(round, 'b', 'a', ids, 2).error, /renvoyer/);
  round = passBomb(round, 'b', 'c', ids, 2).round;
  assert.deepEqual(allowedTargets('c', ids, round.passes), ['d'], 'ni b (dernier) ni a (avant-dernier)');
  round = passBomb(round, 'c', 'd', ids, 3).round;
  assert.deepEqual(allowedTargets('d', ids, round.passes), ['a'], 'a est de nouveau autorisé');
  assert.equal(passBomb(round, 'a', 'b', ids, 4).error, 'Tu n’as pas la bombe.');
  assert.equal(passBomb(round, 'd', 'd', ids, 4).error, 'Tu ne peux pas te la passer à toi-même.');
  assert.match(passBomb(round, 'd', 'zz', ids, 4).error, /renvoyer/, 'joueur absent');
});

test('anti-renvoi à 3 et 2 joueurs : la règle s’assouplit, la bombe n’est jamais coincée', () => {
  const three = ['a', 'b', 'c'];
  let round = passBomb(startPatate(three, () => 0), 'a', 'b', three, 1).round;
  round = passBomb(round, 'b', 'c', three, 2).round;
  assert.deepEqual(allowedTargets('c', three, round.passes), ['a'], 'seul le dernier passeur reste bloqué');
  const two = ['a', 'b'];
  round = passBomb(startPatate(two, () => 0), 'a', 'b', two, 1).round;
  assert.deepEqual(allowedTargets('b', two, round.passes), ['a']);
});

test('anti-blocage : passe au hasard parmi les cibles autorisées', () => {
  let round = passBomb(startPatate(ids, () => 0), 'a', 'b', ids, 1).round;
  round = randomPass(round, ids, 2, () => 0.99);
  assert.equal(round.holderId, 'd');
  assert.equal(round.passes.at(-1).random, true);
  const alone = { holderId: 'a', passes: [] };
  assert.equal(randomPass(alone, ['a'], 3), alone, 'personne à qui la passer');
});

test('explosion : le porteur boit', () => {
  let round = passBomb(startPatate(ids, () => 0), 'a', 'c', ids, 1).round;
  const results = explode(round);
  assert.deepEqual(results, { loserId: 'c', passCount: 1, lastFromId: 'a', lastWasRandom: false });
  assert.deepEqual(sipsPatate(results), { c: BOOM_SIPS });
});

test('déroulé avec le moteur : passes, anti-blocage, porteur déconnecté, explosion et compteur de bombes', async () => {
  const { game, players, tick } = await makeGame('patate', ['A', 'B', 'C', 'D']);
  assert.equal(game.start(), null);
  const holder = () => game.roundData.holderId;
  const other = (id) => players.find((p) => p.id !== id && game.publicState({ host: true }).round.allowedIds.includes(p.id)).id;
  const tv = game.publicState({ host: true });
  assert.equal(tv.votingOpen, false);
  assert.equal(JSON.stringify(tv).includes(String(game.roundData.fuseMs)), false, 'durée cachée');
  assert.ok(game.publicState({ playerId: holder() }).round.idleTimer, 'le porteur voit son chrono anti-blocage');

  const first = holder();
  const target = other(first);
  assert.equal(game.action(target, { type: 'pass', targetId: first }), 'Tu n’as pas la bombe.');
  assert.equal(game.action(first, { type: 'pass', targetId: target }), null);
  assert.equal(holder(), target);
  assert.match(game.action(target, { type: 'pass', targetId: first }), /renvoyer/);

  tick(IDLE_MS);
  assert.notEqual(holder(), target, 'passée au hasard après le délai');
  assert.equal(game.roundData.passes.at(-1).random, true);

  const h = game.players.get(holder());
  game.disconnectPlayer(h, [...h.sockets][0]);
  assert.notEqual(holder(), h.id, 'porteur parti : la bombe repart');
  game.connectPlayer(h, 'back');

  tick(45000);
  assert.ok(['revealing', 'results'].includes(game.phase), 'explosion avant 45 s');
  tick(game.rules.revealMs);
  const loser = game.results.loserId;
  assert.equal(game.publicState().sips[loser], BOOM_SIPS);
  assert.equal(game.publicState().stats[loser].bombs, 1);
  assert.equal(game.nextQuestion(), null, 'manche suivante');
  assert.equal(game.phase, 'question');
});

test('pause : la mèche est gelée', async () => {
  const { game, tick } = await makeGame('patate', ['A', 'B', 'C']);
  game.start();
  game.pause();
  tick(120000);
  assert.equal(game.phase, 'question');
  game.resume();
  game.pause();
  tick(120000);
  assert.equal(game.phase, 'question', 'une deuxième pause gèle aussi');
  game.resume();
  tick(45000);
  assert.notEqual(game.phase, 'question');
});
