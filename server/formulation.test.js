// Moteur de formulation (shared/formulation.js) : accords aux trois genres, forme neutre obligatoire, aucun champ résiduel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deName, groupGender, hasAgreement, render, stripFields, validate } from '../shared/formulation.js';

const lea = { name: 'Léa', gender: 'f' };
const hugo = { name: 'Hugo', gender: 'm' };
const sam = { name: 'Sam', gender: 'n' };
const T = 'Que fait {cible} quand {m=il|f=elle|n=$cible} arrive ?';

test('accords : masculin, féminin et neutre (« Je préfère ne pas dire »)', () => {
  assert.equal(render(T, { cible: hugo }), 'Que fait Hugo quand il arrive ?');
  assert.equal(render(T, { cible: lea }), 'Que fait Léa quand elle arrive ?');
  assert.equal(render(T, { cible: sam }), 'Que fait Sam quand Sam arrive ?');
  assert.equal(render('{m=Le plus voté|f=La plus votée|n=En tête des votes} : {cible}', { cible: lea }), 'La plus votée : Léa');
  assert.equal(render('Tu es {m=démasqué|f=démasquée|n=démasqué·e}', { cible: { name: 'x', gender: undefined } }), 'Tu es démasqué·e', 'sans genre connu : forme neutre');
});

test('variables : prénom, élision, sujet explicite, sujets multiples', () => {
  assert.equal(render('Le plat préféré {de_cible} ?', { cible: lea }), 'Le plat préféré de Léa ?');
  assert.equal(render('Le plat préféré {de_cible} ?', { cible: { name: 'Alice', gender: 'f' } }), 'Le plat préféré d’Alice ?');
  assert.equal(deName('Hugo'), 'd’Hugo');
  assert.equal(deName('Bob'), 'de Bob');
  assert.equal(render('{autre:m=Il|f=Elle|n=Cette personne} a battu {cible}', { cible: hugo, autre: lea }), 'Elle a battu Hugo');
  assert.equal(render('Bravo {cible}', {}), 'Bravo quelqu’un', 'sans sujet : jamais de champ visible');
});

test('pluriel : genre du groupe, neutre dès qu’il y a un mélange ou un « ne préfère pas dire »', () => {
  assert.equal(groupGender([lea, lea]), 'f');
  assert.equal(groupGender([hugo, hugo]), 'm');
  assert.equal(groupGender([lea, hugo]), 'n');
  assert.equal(groupGender([lea, sam]), 'n');
  assert.equal(groupGender([]), 'n');
});

test('validation : forme neutre obligatoire, variables connues, aucune accolade isolée', () => {
  assert.deepEqual(validate(T), []);
  assert.deepEqual(validate('Texte sans rien'), []);
  assert.ok(validate('{m=il|f=elle}').some((p) => /neutre/.test(p)), 'sans forme neutre : refusé');
  assert.ok(validate('{m=il|n=lui}').some((p) => /forme f/.test(p)));
  assert.ok(validate('{m=il|f=elle|n=}').some((p) => /vide/.test(p)));
  assert.ok(validate('{nom}').some((p) => /variable inconnue/.test(p)));
  assert.ok(validate('{x:m=a|f=b|n=c}').some((p) => /variable inconnue x/.test(p)));
  assert.ok(validate('{m=a|f=b|n=c|m=d}').length > 0, 'forme en double');
  assert.ok(validate('oups { reste').length > 0);
  assert.ok(validate('{M=il}').length > 0);
  assert.equal(hasAgreement(T), true);
  assert.equal(hasAgreement('{cible} seul'), false);
});

test('aucun champ ne reste affiché, même sur un texte cassé', () => {
  for (const bad of ['{m=il|f=elle}', '{inconnu}', '{', '}', 'a {b} c', '{{cible}}', '{cible', '{m=a|n=b|f=c|z=d}']) {
    const out = render(bad, { cible: lea });
    assert.ok(!/[{}]/.test(out), `${bad} → « ${out} »`);
  }
  assert.equal(stripFields('Oui {x} non'), 'Oui non');
  assert.equal(stripFields('Aucun champ ?'), 'Aucun champ ?', 'la typographie française (espace avant ?) est conservée');
});
