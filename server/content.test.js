import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTENT, bannedWord, findDuplicates, loadContent } from '../scripts/check-content.js';
import { isValidDefi } from './rules/roue.js';
import { FEU } from './rules/feu.js';

const NIVEAUX = ['chill', 'epice', 'hardcore'];
const text = (s) => typeof s === 'string' && s.trim().length > 0;

/** Format attendu d'une entrée, par jeu. */
const FORMATS = {
  'qui-de-nous': (q) => NIVEAUX.includes(q.niveau) && /^Qui est le plus susceptible d(e |')/.test(q.text) && q.text.endsWith(' ?'),
  'tu-preferes': (q) => NIVEAUX.includes(q.niveau) && text(q.a) && text(q.b) && q.a !== q.b,
  'qui-me-connait': (q) =>
    NIVEAUX.includes(q.niveau) &&
    text(q.question) &&
    /\{(de_)?nom\}/.test(q.question) &&
    Array.isArray(q.choix) &&
    q.choix.length === 4 &&
    q.choix.every(text) &&
    new Set(q.choix).size === 4,
  estimation: (q) => text(q.question) && typeof q.reponse === 'number' && Number.isFinite(q.reponse) && text(q.unite),
  imposteur: (p) => text(p.mot) && text(p.proche) && text(p.categorie) && p.mot !== p.proche,
  roue: isValidDefi,
  feu: (w) => text(w) && w === w.toUpperCase() && w !== FEU,
};

for (const spec of CONTENT) {
  test(`contenu ${spec.file} : JSON valide, bon format, sans doublon, au moins ${spec.target} entrées`, () => {
    assert.doesNotThrow(() => JSON.parse(readFileSync(new URL(spec.file, import.meta.url), 'utf8')));
    const list = loadContent(spec);
    assert.ok(list.length >= spec.target, `${list.length} / ${spec.target}`);
    for (const entry of list) assert.ok(FORMATS[spec.id](entry), `format invalide : ${JSON.stringify(entry)}`);
    const { exact, near } = findDuplicates(spec, list);
    const show = (pairs) => pairs.map(([i, j]) => `${JSON.stringify(list[i])} ~ ${JSON.stringify(list[j])}`).join('\n');
    assert.equal(exact.length, 0, `doublons :\n${show(exact)}`);
    assert.equal(near.length, 0, `quasi-doublons (node scripts/check-content.js) :\n${show(near)}`);
  });

  test(`contenu ${spec.file} : aucune référence de niche ni situation de bureau`, () => {
    const hits = loadContent(spec)
      .map((entry) => [bannedWord(entry), entry])
      .filter(([word]) => word);
    // Faux positif ? Ajoute le texte dans ALLOWED_WORDS (scripts/check-content.js).
    assert.equal(hits.length, 0, hits.map(([w, e]) => `[${w}] ${JSON.stringify(e)}`).join('\n'));
  });
}
