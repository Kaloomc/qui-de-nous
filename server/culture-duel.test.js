// Contenu de Culture G éclair : volume, format, doublons, sources ; le contrôle lui-même repère les défauts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCulture, MIN_VOLUME } from './duel/cultureCheck.js';

const list = JSON.parse(readFileSync(new URL('./content/culture-g-duel.json', import.meta.url), 'utf8'));

test('culture-g-duel.json : au moins 150 questions valides, sourcées, sans doublon', () => {
  assert.ok(list.length >= MIN_VOLUME);
  assert.deepEqual(checkCulture(list), []);
});

test('le contrôle repère volume, doublons, source manquante et mauvais index', () => {
  const q = { id: 'a', question: 'Une question assez longue ?', choix: ['a', 'b', 'c', 'd'], bonne: 1, categorie: 'x', source: 'https://example.org/page' };
  const errors = checkCulture([q, { ...q, id: 'b' }, { ...q, id: 'c', question: 'Autre question assez longue ?', source: '', bonne: 7, choix: ['a', 'a', 'c', 'd'] }]);
  const text = errors.join('\n');
  for (const needle of ['Volume insuffisant', 'question en double', 'source', 'bonne', 'choix en double']) assert.match(text, new RegExp(needle));
});

test('la bonne réponse est répartie sur les 4 positions', () => {
  const counts = [0, 0, 0, 0];
  for (const q of list) counts[q.bonne] += 1;
  for (const n of counts) assert.ok(n > list.length / 8, `répartition ${counts}`);
});
