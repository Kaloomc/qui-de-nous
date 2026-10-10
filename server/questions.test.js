import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from './games/index.js';

const NIVEAUX = ['chill', 'epice', 'hardcore'];
const normalize = (s) => s.toLowerCase().replace(/[^a-zà-ÿ0-9]+/g, ' ').trim();

function checkLevels(list) {
  for (const q of list) assert.ok(NIVEAUX.includes(q.niveau), `niveau invalide : ${JSON.stringify(q)}`);
  const share = (n) => list.filter((q) => q.niveau === n).length / list.length;
  assert.ok(share('chill') >= 0.3 && share('chill') <= 0.5, `chill ${share('chill')}`);
  assert.ok(share('epice') >= 0.3 && share('epice') <= 0.5, `épicé ${share('epice')}`);
  assert.ok(share('hardcore') >= 0.12 && share('hardcore') <= 0.28, `hardcore ${share('hardcore')}`);
}

test('questions « Qui de nous ? » : au moins 400, bien formées, uniques, niveaux répartis', () => {
  const qs = GAMES['qui-de-nous'].questions;
  assert.ok(qs.length >= 400, `${qs.length} questions`);
  for (const q of qs) {
    assert.match(q.text, /^Qui est le plus susceptible d(e |')/, q.text);
    assert.ok(q.text.endsWith(' ?'), q.text);
    assert.ok(q.text.length <= 120, `trop long pour la TV : ${q.text}`);
  }
  assert.equal(new Set(qs.map((q) => normalize(q.text))).size, qs.length, 'doublon');
  checkLevels(qs);
});

test('dilemmes « Tu préfères ? » : au moins 400, bien formés, uniques, niveaux répartis', () => {
  const qs = GAMES['tu-preferes'].questions;
  assert.ok(qs.length >= 400, `${qs.length} dilemmes`);
  for (const q of qs) {
    assert.ok(typeof q.a === 'string' && q.a.trim(), JSON.stringify(q));
    assert.ok(typeof q.b === 'string' && q.b.trim(), JSON.stringify(q));
    assert.notEqual(q.a, q.b);
    assert.ok(q.a.length <= 75 && q.b.length <= 75, `option trop longue : ${JSON.stringify(q)}`);
  }
  assert.equal(new Set(qs.map((q) => normalize(`${q.a}|${q.b}`))).size, qs.length, 'doublon');
  checkLevels(qs);
});
