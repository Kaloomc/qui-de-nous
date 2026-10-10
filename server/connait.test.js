import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConnait, pickTarget, sipsConnait, updateConnaitStats } from './rules/connait.js';

const ids = ['cible', 'b', 'c', 'd'];
const votes = (entries) => new Map(Object.entries(entries));

test('certains ont trouvé : seuls ceux qui se trompent (ou n’ont pas répondu) boivent', () => {
  const r = computeConnait(ids, votes({ cible: 'b', b: 'b', c: 'a' }), 'cible');
  assert.equal(r.answer, 'b');
  assert.deepEqual(r.correctIds, ['b']);
  assert.deepEqual(r.wrongIds, ['c']);
  assert.deepEqual(r.nonVoterIds, ['d']);
  assert.equal(r.targetDrinks, false);
  assert.deepEqual(sipsConnait(r), { c: 1, d: 1 });
});

test('personne n’a trouvé : tout le monde boit, la cible aussi', () => {
  const r = computeConnait(ids, votes({ cible: 'c', b: 'a', c: 'a', d: 'b' }), 'cible');
  assert.equal(r.reason, 'nobody');
  assert.deepEqual(sipsConnait(r), { b: 1, c: 1, d: 1, cible: 1 });
});

test('tout le monde a trouvé : seule la cible boit (trop prévisible)', () => {
  const r = computeConnait(ids, votes({ cible: 'd', b: 'd', c: 'd', d: 'd' }), 'cible');
  assert.equal(r.reason, 'everyone');
  assert.deepEqual(sipsConnait(r), { cible: 1 });
});

test('la cible n’a pas répondu : elle seule boit', () => {
  const r = computeConnait(ids, votes({ b: 'a', c: 'b' }), 'cible');
  assert.equal(r.reason, 'noAnswer');
  assert.deepEqual(sipsConnait(r), { cible: 1 });
});

test('cible à tour de rôle et statistiques de bonnes réponses', () => {
  assert.equal(pickTarget(ids, 1), 'cible');
  assert.equal(pickTarget(ids, 2), 'b');
  assert.equal(pickTarget(ids, 5), 'cible');
  assert.equal(pickTarget([], 1), null);
  const stats = { cible: {}, b: {}, c: {}, d: {} };
  updateConnaitStats(stats, computeConnait(ids, votes({ cible: 'a', b: 'a', c: 'b' }), 'cible'));
  updateConnaitStats(stats, computeConnait(ids, votes({ b: 'a', cible: 'a', c: 'a', d: 'a' }), 'b'));
  assert.deepEqual(stats.c, { guesses: 2, correct: 1 });
  assert.deepEqual(stats.cible, { guesses: 1, correct: 1 });
  assert.deepEqual(stats.d, { guesses: 2, correct: 1 });
});

test('déroulé avec le moteur : cible à tour de rôle, réponses secrètes, statistiques', async () => {
  const { Game } = await import('./gameStore.js');
  const clock = { t: 0, timers: [], now: () => clock.t, setTimeout: (fn, ms) => clock.timers.push({ fn, at: clock.t + ms }) - 1, clearTimeout: (i) => (clock.timers[i] = null) };
  const tick = (ms) => {
    clock.t += ms;
    for (const [i, t] of clock.timers.entries()) if (t && t.at <= clock.t) (clock.timers[i] = null, t.fn());
  };
  const game = new Game('KNOW', 'qui-me-connait', { clock });
  const ps = ['A', 'B'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  assert.equal(game.start(), 'Il faut au moins 3 joueurs.');
  const { player: c } = game.upsertPlayer({ name: 'C' });
  game.connectPlayer(c, 's2');
  ps.push(c);
  assert.equal(game.start(), null);
  const target = game.publicState().round.targetId;
  assert.equal(target, ps[0].id);
  assert.equal(game.vote(ps[1].id, 'e'), 'Choix invalide.');
  game.vote(ps[0].id, 'c');
  game.vote(ps[1].id, 'c');
  game.vote(ps[2].id, 'a');
  game.reveal(1);
  assert.equal(game.publicState({ playerId: ps[1].id }).results, null, 'pas de spoiler côté téléphone');
  tick(game.rules.revealMs);
  assert.deepEqual(game.publicState().sips, { [ps[2].id]: 1 });
  assert.deepEqual(game.publicState().stats[ps[1].id], { guesses: 1, correct: 1 });
  game.nextQuestion(1);
  assert.equal(game.publicState().round.targetId, ps[1].id, 'la cible change à chaque tour');
});
