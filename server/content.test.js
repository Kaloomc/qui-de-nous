import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTENT, bannedWord, findDuplicates, loadContent } from '../scripts/check-content.js';
import { isValidDefi } from './rules/roue.js';
import { FEU } from './rules/feu.js';
import { BLANK, MAX_ANSWER, blanksIn } from './rules/nbm.js';
import { CIBLES, hasAgreement, render, validate } from '../shared/formulation.js';

const NIVEAUX = ['chill', 'epice', 'hardcore'];
const text = (s) => typeof s === 'string' && s.trim().length > 0;
/** Champ `cible` (questions réservées à un genre) : absent ou « homme » / « femme » / « tous ». */
const cibleOk = (q) => q.cible === undefined || CIBLES.includes(q.cible);

/** Format attendu d'une entrée, par jeu. */
const FORMATS = {
  // Question réservée aux femmes : « la plus susceptible » (les candidates sont toutes des femmes).
  'qui-de-nous': (q) => NIVEAUX.includes(q.niveau) && cibleOk(q) && new RegExp(`^Qui est ${q.cible === 'femme' ? 'la' : 'le'} plus susceptible d(e |['’])`).test(q.text) && q.text.endsWith(' ?'),
  'tu-preferes': (q) => NIVEAUX.includes(q.niveau) && text(q.a) && text(q.b) && q.a !== q.b,
  'qui-me-connait': (q) =>
    NIVEAUX.includes(q.niveau) &&
    cibleOk(q) &&
    text(q.question) &&
    /\{(de_)?cible\}/.test(q.question) &&
    Array.isArray(q.choix) &&
    q.choix.length === 4 &&
    q.choix.every(text) &&
    new Set(q.choix).size === 4,
  estimation: (q) => text(q.question) && typeof q.reponse === 'number' && Number.isFinite(q.reponse) && text(q.unite),
  imposteur: (p) => text(p.mot) && text(p.proche) && text(p.categorie) && p.mot !== p.proche,
  roue: isValidDefi,
  // Phrase à trou : un seul trou, une phrase ; carte de réponse : 1 à 6 mots, courte, sans trou.
  'nbm-phrases': (q) => NIVEAUX.includes(q.niveau) && text(q.texte) && blanksIn(q.texte) === 1 && q.texte.length <= 110 && !/\n/.test(q.texte),
  'nbm-cartes': (c) => text(c) && !c.includes(BLANK) && c.trim().split(/\s+/).length <= 6 && c.length <= MAX_ANSWER,
  feu: (w) => text(w) && w === w.toUpperCase() && w !== FEU,
};

for (const spec of CONTENT) {
  test(`contenu ${spec.file} : JSON valide, bon format, sans doublon, au moins ${spec.target} entrées`, () => {
    assert.doesNotThrow(() => JSON.parse(readFileSync(new URL(spec.file, import.meta.url), 'utf8')));
    const list = loadContent(spec);
    assert.ok(list.length >= spec.target, `${list.length} / ${spec.target}`);
    for (const entry of list) assert.ok(FORMATS[spec.format ?? spec.id](entry), `format invalide : ${JSON.stringify(entry)}`);
    // Le contenu 18+ est marqué comme tel, et seulement lui.
    // Les cartes de réponse sont de simples chaînes : leur mode se lit au nom du fichier.
    for (const entry of list) if (typeof entry === 'object') assert.equal(entry.adulte === true, !!spec.adult, `champ « adulte » : ${JSON.stringify(entry)}`);
    const { exact, near } = findDuplicates(spec, list);
    const show = (pairs) => pairs.map(([i, j]) => `${JSON.stringify(list[i])} ~ ${JSON.stringify(list[j])}`).join('\n');
    assert.equal(exact.length, 0, `doublons :\n${show(exact)}`);
    assert.equal(near.length, 0, `quasi-doublons (node scripts/check-content.js) :\n${show(near)}`);
  });

  if (spec.adult) {
    test(`contenu ${spec.file} : aucun doublon ni quasi-doublon avec le contenu normal du jeu`, () => {
      const normalSpec = CONTENT.find((s) => s.id === spec.format);
      const normal = loadContent(normalSpec);
      const both = [...normal, ...loadContent(spec)];
      const { exact, near } = findDuplicates(normalSpec, both);
      const crossing = [...exact, ...near].filter(([i, j]) => i < normal.length && j >= normal.length);
      assert.equal(crossing.length, 0, crossing.map(([i, j]) => `${JSON.stringify(both[i])} ~ ${JSON.stringify(both[j])}`).join('\n'));
    });
  }

  // Moteur de formulation (shared/formulation.js) : champs connus, forme neutre obligatoire pour chaque accord.
  test(`contenu ${spec.file} : champs {...} valides, forme neutre présente pour chaque accord`, () => {
    const variables = (spec.format ?? spec.id) === 'qui-me-connait' ? ['cible'] : [];
    const problems = [];
    for (const entry of loadContent(spec)) {
      const texts = typeof entry === 'string' ? [entry] : Object.values(entry).flat().filter((v) => typeof v === 'string');
      for (const t of texts) for (const p of validate(t, { variables })) problems.push(`${p} — « ${t} »`);
      // Un accord sans sujet (hors « Qui me connaît ») n'a pas de sens.
      if (!variables.length) for (const t of texts) if (hasAgreement(t)) problems.push(`accord sans sujet — « ${t} »`);
    }
    assert.deepEqual(problems, []);
  });

  // Rendu pour les trois genres : plus aucun champ, et jamais d'écriture inclusive à points ni de « (e) ».
  test(`contenu ${spec.file} : rendu correct pour homme, femme et « ne préfère pas dire »`, () => {
    const variables = (spec.format ?? spec.id) === 'qui-me-connait';
    const bad = [];
    for (const entry of loadContent(spec)) {
      const texts = typeof entry === 'string' ? [entry] : Object.values(entry).flat().filter((v) => typeof v === 'string');
      for (const t of texts) {
        for (const gender of ['m', 'f', 'n']) {
          const out = render(t, variables ? { cible: { name: 'Camille', gender } } : {});
          if (/[{}$]/.test(out) || /\p{L}·\p{L}|\(e\)|\(s\)/u.test(out)) bad.push(`${gender} : « ${out} »`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  test(`contenu ${spec.file} : aucune référence de niche ni situation de bureau`, () => {
    const hits = loadContent(spec)
      .map((entry) => [bannedWord(entry), entry])
      .filter(([word]) => word);
    // Faux positif ? Ajoute le texte dans ALLOWED_WORDS (scripts/check-content.js).
    assert.equal(hits.length, 0, hits.map(([w, e]) => `[${w}] ${JSON.stringify(e)}`).join('\n'));
  });
}
