import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEstimationPick, computeEstimation, isValidEstimate, sipsEstimation } from './rules/estimation.js';

const ids = ['a', 'b', 'c', 'd'];
const guesses = (entries) => new Map(Object.entries(entries));

test('plus proche et plus loin', () => {
  const r = computeEstimation(ids, guesses({ a: 2005, b: 2007, c: 1990, d: 2010 }), 2007);
  assert.deepEqual(r.closestIds, ['b']);
  assert.deepEqual(r.exactIds, ['b']);
  assert.deepEqual(r.furthestIds, ['c']);
  assert.equal(r.chooserId, 'b');
  assert.deepEqual(sipsEstimation(r), { c: 1 });
});

test('égalités : tous les plus loin boivent, plusieurs plus proches = personne ne désigne', () => {
  const r = computeEstimation(ids, guesses({ a: 10, b: 30, c: 0, d: 40 }), 20);
  assert.deepEqual(r.closestIds.sort(), ['a', 'b']);
  assert.deepEqual(r.furthestIds.sort(), ['c', 'd']);
  assert.equal(r.chooserId, null);
  assert.deepEqual(sipsEstimation(r), { c: 1, d: 1 });
});

test('non-votants boivent ; tous à égale distance = personne n’est le plus loin', () => {
  const r = computeEstimation(ids, guesses({ a: 15, b: 25 }), 20);
  assert.deepEqual(r.furthestIds, []);
  assert.deepEqual(r.nonVoterIds, ['c', 'd']);
  assert.deepEqual(sipsEstimation(r), { c: 1, d: 1 });
});

test('un seul joueur a répondu : il est le plus proche, pas le plus loin', () => {
  const r = computeEstimation(ids, guesses({ a: 99 }), 20);
  assert.deepEqual(r.closestIds, ['a']);
  assert.deepEqual(r.furthestIds, []);
});

test('le plus proche désigne quelqu’un qui boit en plus', () => {
  const r = computeEstimation(ids, guesses({ a: 1, b: 2, c: 50, d: 3 }), 2);
  assert.equal(applyEstimationPick(r, 'a', 'c', ids).error, 'Ce n’est pas à toi de choisir.');
  assert.equal(applyEstimationPick(r, 'b', 'b', ids).error, 'Choix invalide.');
  assert.equal(applyEstimationPick(r, 'b', 'zz', ids).error, 'Choix invalide.');
  const picked = applyEstimationPick(r, 'b', 'c', ids).results;
  assert.deepEqual(sipsEstimation(picked), { c: 2 }, 'le plus loin désigné boit deux fois');
});

test('valeurs refusées', () => {
  for (const v of ['12', NaN, Infinity, 1e13, null]) assert.equal(isValidEstimate(v), false);
  for (const v of [0, -5, 3.14, 1e12]) assert.equal(isValidEstimate(v), true);
  const r = computeEstimation(['a', 'b'], guesses({ a: 'oups', b: 5 }), 5);
  assert.deepEqual(r.nonVoterIds, ['a']);
});

test('déroulé avec le moteur : le plus proche choisit, sinon le délai finalise sans choix', async () => {
  const { Game } = await import('./gameStore.js');
  const timers = [];
  const clock = { t: 0, now: () => clock.t, setTimeout: (fn, ms) => timers.push({ fn, at: clock.t + ms }) - 1, clearTimeout: (i) => (timers[i] = null) };
  const tick = (ms) => {
    clock.t += ms;
    for (const [i, t] of timers.entries()) if (t && t.at <= clock.t) (timers[i] = null, t.fn());
  };
  const game = new Game('EST', 'estimation', { clock });
  const [a, b, c] = ['A', 'B', 'C'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  game.start();
  const answer = game.question.reponse;
  game.vote(a.id, answer);
  game.vote(b.id, answer + 1000);
  game.vote(c.id, answer + 5);
  assert.equal(game.vote(c.id, 'beaucoup'), 'Choix invalide.');
  game.reveal(1);
  tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  assert.equal(game.pending, true, 'A choisit');
  assert.deepEqual(game.publicState().sips, {}, 'rien n’est compté avant le choix');
  assert.equal(game.action(b.id, { type: 'pick', targetId: c.id }), 'Ce n’est pas à toi de choisir.');
  assert.equal(game.action(a.id, { type: 'pick', targetId: c.id }), null);
  assert.equal(game.pending, false);
  assert.deepEqual(game.publicState().sips, { [b.id]: 1, [c.id]: 1 });

  game.nextQuestion(1);
  const answer2 = game.question.reponse;
  game.vote(a.id, answer2);
  game.vote(b.id, answer2 + 1000);
  game.reveal(2);
  tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  tick(20000);
  assert.equal(game.pending, false, 'délai dépassé : on continue sans désignation');
  assert.equal(game.publicState().sips[c.id], 2, 'C n’a pas répondu au 2e tour');
});
