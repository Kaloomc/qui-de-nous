import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResults } from './rules.js';

const ids = ['a', 'b', 'c', 'd'];

test('le plus voté et ceux qui n’ont pas voté pour lui', () => {
  const r = computeResults(ids, new Map([['a', 'b'], ['b', 'c'], ['c', 'b'], ['d', 'b']]));
  assert.deepEqual(r.topIds, ['b']);
  assert.equal(r.topCount, 3);
  assert.deepEqual(r.wrongVoterIds, ['b']);
  assert.deepEqual(r.nonVoterIds, []);
});

test('égalité : voter pour un des ex æquo protège', () => {
  const r = computeResults(ids, new Map([['a', 'b'], ['b', 'c'], ['c', 'b'], ['d', 'c']]));
  assert.deepEqual(r.topIds, ['b', 'c']);
  assert.deepEqual(r.wrongVoterIds, []);
});

test('non-votant boit, vote pour soi autorisé', () => {
  const r = computeResults(ids, new Map([['a', 'a'], ['b', 'a'], ['c', 'd']]));
  assert.deepEqual(r.topIds, ['a']);
  assert.deepEqual(r.nonVoterIds, ['d']);
  assert.deepEqual(r.wrongVoterIds, ['c', 'd']);
});

test('votes pour un joueur parti ignorés, aucun vote = personne en tête', () => {
  const r = computeResults(ids, new Map([['a', 'zz']]));
  assert.deepEqual(r.topIds, []);
  assert.equal(r.totalVotes, 0);
  assert.deepEqual(r.wrongVoterIds, ids);
});
