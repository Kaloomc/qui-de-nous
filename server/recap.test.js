import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrophies, recordRound, sipsRanking } from './recap.js';
import { computePreferesResults, computeResults } from './rules.js';
import { makeGame } from './testClock.js';

const P = ['Alice', 'Bob', 'Chloé', 'Dan'].map((name) => ({ id: name[0].toLowerCase(), name }));
const ids = P.map((p) => p.id);
const votes = (o) => new Map(Object.entries(o));
const byId = (trophies) => Object.fromEntries(trophies.map((t) => [t.id, t]));

test('statistiques : chaque jeu note ce qu’il faut', () => {
  const stats = new Map();
  recordRound(stats, 'qui-de-nous', computeResults(ids, votes({ a: 'b', b: 'b', c: 'b', d: 'a' })), ids);
  recordRound(stats, 'tu-preferes', computePreferesResults(ids, votes({ a: 'a', b: 'a', c: 'a', d: 'b' })), ids);
  recordRound(stats, 'tu-preferes', computePreferesResults(ids, votes({ a: 'a', b: 'a', c: 'b', d: 'b' })), ids); // égalité : ignorée
  recordRound(stats, 'imposteur', { present: true, unmasked: false, imposterId: 'c', votersForImposter: ['a'] }, ids);
  recordRound(stats, 'feu', { ranking: [{ id: 'd', ms: 420 }, { id: 'a', ms: 600 }] }, ids);
  recordRound(stats, 'feu', { ranking: [{ id: 'd', ms: 380 }] }, ids);
  recordRound(stats, 'patate', { loserId: 'zz' }, ids); // joueur parti : ignoré
  assert.deepEqual(stats.get('b'), { accused: 3, sheep: 1 });
  assert.deepEqual(stats.get('a'), { accused: 1, sheep: 1, found: 1, bestMs: 600 });
  assert.deepEqual(stats.get('c'), { sheep: 1, fooled: 1 });
  assert.deepEqual(stats.get('d'), { rebel: 1, bestMs: 380 });
  assert.equal(stats.has('zz'), false);
});

test('trophées : cas normal, plusieurs joueurs mis en avant', () => {
  const stats = new Map([
    ['a', { accused: 6, sheep: 5, found: 2 }],
    ['b', { accused: 4, rebel: 3, bestMs: 450 }],
    ['c', { fooled: 2, sheep: 4, bestMs: 400 }],
    ['d', { closest: 3, rebel: 2 }],
  ]);
  const t = byId(computeTrophies(P, { a: 9, b: 4, c: 2, d: 1 }, stats));
  assert.equal(t.roi.playerId, 'a');
  assert.equal(t.roi.label, '9 gorgées');
  // Alice a déjà la couronne : Bob, assez proche (4 contre 6), prend « le plus accusé ».
  assert.equal(t.accuse.playerId, 'b');
  assert.equal(t.menteur.playerId, 'c');
  assert.equal(t.detective.playerId, 'a');
  assert.equal(t.rapide.playerId, 'c');
  assert.equal(t.rapide.label, '0,40 s au « FEU »');
  assert.equal(t.precis.playerId, 'd');
  assert.ok(new Set(Object.values(t).map((x) => x.playerId)).size >= 4);
});

test('trophées : jeux non joués ou valeurs trop faibles = pas de trophée', () => {
  const t = byId(computeTrophies(P, {}, new Map([['a', { accused: 1, sheep: 1 }]])));
  assert.deepEqual(Object.keys(t), []);
  const only = byId(computeTrophies(P, { b: 1 }, {}));
  assert.deepEqual(Object.keys(only), ['roi']);
});

test('trophées : le vrai premier garde la couronne, un gros écart n’est jamais compensé', () => {
  const t = byId(computeTrophies(P, { a: 10, b: 9 }, new Map([['a', { accused: 10 }], ['b', { accused: 2 }]])));
  assert.equal(t.roi.playerId, 'a');
  assert.equal(t.accuse.playerId, 'a'); // Bob est trop loin (2 contre 10)
});

test('trophées : égalités départagées par le nombre de trophées, puis par ordre alphabétique', () => {
  const t = byId(computeTrophies(P, { a: 3, b: 3 }, new Map([['a', { rebel: 2 }], ['b', { rebel: 2 }]])));
  assert.equal(t.roi.playerId, 'a');
  assert.equal(t.rebelle.playerId, 'b');
  assert.deepEqual(sipsRanking(P, { a: 3, b: 3, c: 1 }).map((r) => r.rank), [1, 1, 3, 4]);
});

test('trophées : un seul joueur', () => {
  const solo = [P[0]];
  const t = computeTrophies(solo, { a: 2 }, new Map([['a', { accused: 3 }]]));
  assert.deepEqual(t.map((x) => x.id), ['roi', 'accuse']);
  assert.ok(t.every((x) => x.playerId === 'a'));
  assert.deepEqual(computeTrophies([], {}, new Map()), []);
});

test('récap de la partie : stats de la soirée gardées d’un jeu à l’autre, joueurs partis masqués', async () => {
  const { game, players, tick } = await makeGame('qui-de-nous', ['A', 'B', 'C']);
  game.start();
  for (const p of players) game.vote(p.id, players[0].id);
  game.reveal();
  tick(10000);
  game.end();
  game.chooseGame();
  game.pickGame('tu-preferes');
  game.start();
  assert.equal(game.publicState().recap, null); // seulement en fin de partie
  game.end(); // manche coupée avant la révélation : rien n'est compté
  const r = game.publicState().recap;
  assert.ok(r);
  assert.deepEqual(r.games, ['qui-de-nous']);
  assert.equal(byId(r.trophies).accuse.playerId, players[0].id);
  assert.equal(r.ranking[0].playerId, players[0].id);
  game.removePlayer(players[0].id);
  assert.ok(!game.recap().players.some((p) => p.id === players[0].id));
  assert.ok(!game.recap().trophies.some((t) => t.playerId === players[0].id));
});
