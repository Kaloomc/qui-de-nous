import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePreferesResults } from './rules.js';

const ids = ['a1', 'a2', 'a3', 'b1', 'b2'];
const votes = (entries) => new Map(Object.entries(entries));

test('majorité nette : la minorité boit', () => {
  const r = computePreferesResults(ids, votes({ a1: 'a', a2: 'a', a3: 'a', b1: 'b', b2: 'b' }));
  assert.equal(r.majority, 'a');
  assert.equal(r.tie, false);
  assert.deepEqual(r.counts, { a: 3, b: 2 });
  assert.deepEqual(r.drinkerIds, ['b1', 'b2']);
});

test('égalité : personne ne boit par défaut', () => {
  const r = computePreferesResults(['a1', 'a2', 'b1', 'b2'], votes({ a1: 'a', a2: 'a', b1: 'b', b2: 'b' }));
  assert.equal(r.tie, true);
  assert.equal(r.majority, null);
  assert.deepEqual(r.drinkerIds, []);
});

test('égalité : option « tout le monde boit »', () => {
  const r = computePreferesResults(['a1', 'b1'], votes({ a1: 'a', b1: 'b' }), { onTie: 'everyone' });
  assert.deepEqual(r.drinkerIds, ['a1', 'b1']);
});

test('les non-votants boivent, même en cas d’égalité', () => {
  const r = computePreferesResults(ids, votes({ a1: 'a', b1: 'b' }));
  assert.equal(r.tie, true);
  assert.deepEqual(r.nonVoterIds, ['a2', 'a3', 'b2']);
  assert.deepEqual(r.drinkerIds, ['a2', 'a3', 'b2']);
});

test('un seul joueur d’un côté : lui seul boit', () => {
  const r = computePreferesResults(ids, votes({ a1: 'b', a2: 'b', a3: 'b', b1: 'b', b2: 'a' }));
  assert.equal(r.majority, 'b');
  assert.deepEqual(r.drinkerIds, ['b2']);
});

test('tous du même côté : personne ne boit', () => {
  const r = computePreferesResults(ids, votes({ a1: 'a', a2: 'a', a3: 'a', b1: 'a', b2: 'a' }));
  assert.equal(r.majority, 'a');
  assert.deepEqual(r.drinkerIds, []);
});

test('votes invalides ou de joueurs partis ignorés', () => {
  const r = computePreferesResults(['a1', 'b1'], votes({ a1: 'a', b1: 'c', parti: 'b' }));
  assert.deepEqual(r.counts, { a: 1, b: 0 });
  assert.deepEqual(r.choices, { a1: 'a' });
  assert.deepEqual(r.drinkerIds, ['b1']);
});
