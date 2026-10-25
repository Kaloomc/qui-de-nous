// Questions réservées à un genre : aucun cliché de comportement ou de personnalité (voir scripts/check-genre-stereotypes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStereotypes, loadAll, loadExceptions } from '../scripts/check-genre-stereotypes.js';

test('aucune question réservée à un genre ne contient de mot-clé de cliché (hors exceptions vérifiées)', () => {
  const bad = findStereotypes(loadAll(), loadExceptions());
  assert.deepEqual(bad.map((b) => `${b.word} : ${b.text}`), []);
});

test('le contrôle repère les clichés connus et respecte la liste d’exceptions', () => {
  const clichés = [
    'Qui est la plus susceptible d’avoir un sac qui pèse plus lourd qu’une valise ?',
    'Qui est la plus susceptible de dire « je ne suis pas rancunière » ?',
    'Qui est le plus susceptible de bouder quand il perd ?',
    'Qui est le plus susceptible d’allumer le barbecue pendant deux heures ?',
    'Qui est le plus susceptible de faire du bricolage sans notice ?',
    'Qui est la plus susceptible de pleurer devant une pub ?',
  ];
  for (const text of clichés) assert.equal(findStereotypes([{ text, cible: 'homme' }]).length, 1, text);
  const [text] = clichés;
  assert.equal(findStereotypes([{ text, cible: 'femme' }], [text]).length, 0, 'exception déclarée');
  assert.equal(findStereotypes([{ text, cible: 'tous' }]).length, 0, 'une question « tous » n’est pas concernée');
});

test('les clichés ne sont pas déguisés en « tous » : les questions réservées restent peu nombreuses et équilibrées', () => {
  const reserved = loadAll().filter((e) => ['homme', 'femme'].includes(e.cible));
  assert.ok(reserved.length > 0);
  for (const file of new Set(reserved.map((e) => e.file))) {
    const list = reserved.filter((e) => e.file === file);
    const h = list.filter((e) => e.cible === 'homme').length;
    const f = list.length - h;
    assert.ok(Math.abs(h - f) <= 3, `${file} : ${h} homme / ${f} femme`);
  }
});
