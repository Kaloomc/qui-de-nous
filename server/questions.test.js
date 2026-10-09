import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES } from './modes.js';

test('questions « Qui de nous ? » : 50+ uniques', () => {
  const texts = MODES['qui-de-nous'].questions.map((q) => q.text);
  assert.ok(texts.length >= 50);
  assert.equal(new Set(texts).size, texts.length);
});

test('dilemmes « Tu préfères ? » : 80 à 100, bien formés et uniques', () => {
  const qs = MODES['tu-preferes'].questions;
  assert.ok(qs.length >= 80 && qs.length <= 100, `${qs.length} dilemmes`);
  for (const q of qs) {
    assert.ok(typeof q.a === 'string' && q.a.trim(), JSON.stringify(q));
    assert.ok(typeof q.b === 'string' && q.b.trim(), JSON.stringify(q));
    assert.notEqual(q.a, q.b);
  }
  assert.equal(new Set(qs.map((q) => `${q.a}|${q.b}`)).size, qs.length);
});
