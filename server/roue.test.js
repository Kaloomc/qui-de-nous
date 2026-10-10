import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRoueAction, drawRoue, isRoueComplete, isValidDefi, LEVELS, sipsRoue, TYPES, voteLosers, WHAT_SEGMENTS } from './rules/roue.js';
import { loadJson } from './games/load.js';
import { makeGame } from './testClock.js';

const DEFIS = loadJson('../content/defis-roue.json');
const ids = ['a', 'b', 'c', 'd'];
const defi = (type, n = 2) => ({ texte: 'x', type, n, niveau: 'chill' });
const draw = (type, n) => ({ ...drawRoue(ids, [defi(type, n)], () => 0), defi: defi(type, n) });
const act = (results, pid, action) => {
  const out = applyRoueAction(results, pid, action, ids);
  assert.equal(out.error, undefined, out.error);
  return out.results;
};

test('défis : 60 à 80, bien formés, uniques, les 3 niveaux et tous les types présents', () => {
  assert.ok(DEFIS.length >= 60 && DEFIS.length <= 80, `${DEFIS.length} défis`);
  for (const d of DEFIS) assert.ok(isValidDefi(d), JSON.stringify(d));
  assert.equal(new Set(DEFIS.map((d) => d.texte)).size, DEFIS.length);
  for (const level of LEVELS) assert.ok(DEFIS.some((d) => d.niveau === level), level);
  for (const type of Object.keys(TYPES)) assert.ok(DEFIS.some((d) => d.type === type), type);
});

test('tirage valide : un joueur présent, le défi tiré est bien sous l’aiguille de la 2e roue', () => {
  for (let i = 0; i < 200; i++) {
    const r = drawRoue(ids, DEFIS, Math.random, 'a');
    assert.ok(ids.includes(r.targetId));
    assert.notEqual(r.targetId, 'a', 'jamais deux fois de suite le même');
    assert.equal(r.whoSegments[r.whoIndex], r.targetId);
    assert.ok(DEFIS.includes(r.defi));
    assert.deepEqual(r.whatSegments[r.whatIndex], { type: r.defi.type, n: r.defi.n });
    assert.ok(r.whatSegments.length <= WHAT_SEGMENTS && r.whatSegments.length >= 2);
  }
  assert.equal(drawRoue(['solo'], DEFIS, Math.random, 'solo').targetId, 'solo', 'seul joueur : c’est lui');
});

test('boire / groupe / échange', () => {
  const r = draw('boire', 3);
  assert.deepEqual(sipsRoue(r), { [r.targetId]: 3 });
  assert.deepEqual(sipsRoue(draw('groupe', 1)), { a: 1, b: 1, c: 1, d: 1 });
  assert.deepEqual(sipsRoue(draw('echange', 0)), {});
  assert.equal(isRoueComplete(draw('boire'), ids), true);
});

test('duo : le joueur désigne quelqu’un qui boit avec lui, seul s’il ne choisit pas', () => {
  const r = draw('duo', 2);
  const other = ids.find((id) => id !== r.targetId);
  assert.deepEqual(sipsRoue(r), { [r.targetId]: 2 });
  assert.match(applyRoueAction(r, other, { targetId: r.targetId }, ids).error, /pas à toi/);
  assert.equal(applyRoueAction(r, r.targetId, { targetId: r.targetId }, ids).error, 'Choix invalide.');
  const done = act(r, r.targetId, { targetId: other });
  assert.equal(isRoueComplete(done, ids), true);
  assert.deepEqual(sipsRoue(done), { [r.targetId]: 2, [other]: 2 });
});

test('distribuer : une gorgée par toucher, le reste revient au distributeur', () => {
  let r = draw('distribuer', 3);
  const [x, y] = ids.filter((id) => id !== r.targetId);
  r = act(r, r.targetId, { targetId: x });
  assert.deepEqual(sipsRoue(r), { [x]: 1, [r.targetId]: 2 });
  r = act(act(r, r.targetId, { targetId: x }), r.targetId, { targetId: y });
  assert.equal(isRoueComplete(r, ids), true);
  assert.deepEqual(sipsRoue(r), { [x]: 2, [y]: 1 });
  assert.match(applyRoueAction(r, r.targetId, { targetId: y }, ids).error, /déjà distribué/);
});

test('tous ceux qui… : chacun avoue, terminé quand tous les connectés ont répondu', () => {
  let r = draw('tous', 2);
  r = act(act(r, 'a', { yes: true }), 'b', { yes: false });
  assert.equal(isRoueComplete(r, ids), false);
  assert.equal(isRoueComplete(r, ['a', 'b']), true);
  assert.deepEqual(sipsRoue(r), { a: 2 });
});

test('vote : le plus désigné boit, égalité = tous les ex æquo', () => {
  let r = draw('vote', 2);
  assert.equal(applyRoueAction(r, 'a', { targetId: 'a' }, ids).error, 'Choix invalide.', 'pas pour soi');
  r = act(act(act(r, 'a', { targetId: 'b' }), 'c', { targetId: 'b' }), 'b', { targetId: 'c' });
  assert.deepEqual(voteLosers(r.responses), ['b']);
  r = act(r, 'd', { targetId: 'c' });
  assert.deepEqual(sipsRoue(r), { b: 2, c: 2 });
});

test('gage : fait = rien, refusé ou sans réponse = il boit', () => {
  const r = draw('gage', 3);
  assert.deepEqual(sipsRoue(r), { [r.targetId]: 3 });
  assert.deepEqual(sipsRoue(act(r, r.targetId, { done: true })), {});
  assert.deepEqual(sipsRoue(act(r, r.targetId, { done: false })), { [r.targetId]: 3 });
});

test('déroulé avec le moteur : lancer la roue, suspense, défi interactif, verdict', async () => {
  const { game, players, tick } = await makeGame('roue', ['A', 'B', 'C']);
  game.start();
  assert.equal(game.votingOpen, false);
  assert.equal(game.gameHostAction({ type: 'spin' }), null);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.publicState({ playerId: players[0].id }).results, null, 'pas de spoiler sur les téléphones');
  game.results = { ...game.results, defi: defi('vote', 2) };
  tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  assert.equal(game.action(players[0].id, { targetId: players[1].id }), null);
  assert.equal(game.action(players[2].id, { targetId: players[1].id }), null);
  assert.equal(game.pending, true);
  assert.equal(game.action(players[1].id, { targetId: players[0].id }), null);
  assert.equal(game.pending, false, 'tout le monde a voté : verdict');
  assert.equal(game.publicState().sips[players[1].id], 2);
});

test('mode auto : la roue se lance toute seule, défi sans réponse résolu au bout du temps', async () => {
  const { game, tick } = await makeGame('roue', ['A', 'B'], { auto: true });
  game.start();
  tick(3000);
  assert.equal(game.phase, 'revealing');
  game.results = { ...game.results, defi: defi('gage', 2) };
  tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  tick(30000);
  assert.equal(game.pending, false);
  assert.equal(game.publicState().sips[game.results.targetId], 2);
});
