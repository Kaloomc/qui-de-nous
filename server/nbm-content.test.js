// Contenu de Noir Boire Mangue : place du trou, « texte : ___ », formes, mains compatibles (règles dans scripts/check-nbm.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, TARGET, analysePhrases, analyseCards, checkHands, holePosition, isColonForm, badNeighbour } from '../scripts/check-nbm.js';
import { dealHands, compatible, MIN_COMPATIBLE, fillSentence, startsSentence } from './rules/nbm.js';
import { makeGame } from './testClock.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./content/${name}`, import.meta.url), 'utf8'));
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

for (const [mode, f] of Object.entries(FILES)) {
  const phrases = read(f.phrases);
  const cards = read(f.cartes);

  test(`${mode} : phrases variées (début ≈ ${TARGET.debut} %, milieu ≈ ${TARGET.milieu} %, fin ≈ ${TARGET.fin} %), peu de « texte : ___ », une forme chacune`, () => {
    const a = analysePhrases(phrases);
    assert.deepEqual(a.problems, []);
    assert.ok(a.counts.debut > 0 && a.counts.milieu > 0 && a.counts.fin > 0);
  });

  test(`${mode} : chaque carte a une forme connue, il y a assez de cartes de chaque forme pour les phrases`, () => {
    const c = analyseCards(cards);
    assert.deepEqual(c.problems, []);
    const wanted = analysePhrases(phrases).formes;
    for (const forme of ['groupe_nominal', 'infinitif']) assert.ok(c.formes[forme] >= 3 * 12, `${forme} : ${c.formes[forme]} cartes`);
    assert.ok(wanted.groupe_nominal > 0 && wanted.infinitif > 0 && wanted.libre > 0, 'les trois formes de phrases existent');
  });

  test(`${mode} : avec le vrai contenu, toute main de 5 contient au moins ${MIN_COMPATIBLE} cartes qui vont dans la phrase (3 à 30 joueurs)`, () => {
    assert.deepEqual(checkHands(phrases, cards, seeded(7)), []);
  });
}

test('le contrôle repère une phrase mal construite : trop de « texte : ___ », tout à la fin, sans forme, « de » devant le trou', () => {
  const sameEnd = Array.from({ length: 20 }, (_, i) => ({ niveau: 'chill', forme: 'groupe_nominal', texte: `Truc numéro ${i} : ___.` }));
  const problems = analysePhrases(sameEnd).problems.join('\n');
  assert.match(problems, /trou en fin/);
  assert.match(problems, /trou en debut/);
  assert.match(problems, /« texte : ___ »/);
  assert.match(analysePhrases([{ niveau: 'chill', texte: 'Un truc ___.' }]).problems.join(), /forme manquante/);
  assert.match(analysePhrases([{ niveau: 'chill', forme: 'groupe_nominal', texte: 'On parle de ___.' }]).problems.join(), /« de » juste avant le trou/);
  assert.match(analysePhrases([{ niveau: 'chill', forme: 'infinitif', texte: 'Je refuse de ___.' }]).problems.join(), /« de » juste avant le trou/);
  assert.match(analysePhrases([{ niveau: 'chill', forme: 'libre', texte: 'Deux ___ trous ___.' }]).problems.join(), /un seul trou/);
  assert.equal(badNeighbour({ forme: 'libre', texte: 'On parle de ___' }), null);
});

test('place du trou et « texte : ___ »', () => {
  assert.equal(holePosition('___, voilà tout.'), 'debut');
  assert.equal(holePosition('« ___ », a dit mon oncle.'), 'debut');
  assert.equal(holePosition('Au bar, j’ai croisé ___ hier.'), 'milieu');
  assert.equal(holePosition('Dans mon sac, il y a ___.'), 'fin');
  assert.equal(holePosition('Il a crié « ___ ! »'), 'fin');
  assert.ok(isColonForm('Mon secret : ___.') && isColonForm('Le titre : « ___ ».') && !isColonForm('Un secret ___ : bof.'));
});

test('cartes en minuscules : majuscule seulement si le trou ouvre la phrase ou une citation', () => {
  assert.equal(fillSentence('___, voilà tout.', 'un canard').answer, 'Un canard');
  assert.equal(fillSentence('« ___ », a-t-il dit.', 'ça sent le brûlé').answer, 'Ça sent le brûlé');
  assert.equal(fillSentence('J’ai croisé ___ hier.', 'un canard').answer, 'un canard');
  assert.equal(fillSentence('Il pleut. ___ arrive.', 'un canard').answer, 'Un canard');
  assert.ok(startsSentence('') && startsSentence('« ') && startsSentence('Fini. ') && !startsSentence('Un '));
});

test('mains : la forme de la phrase décide des cartes qui vont ; une phrase libre accepte tout', () => {
  const deck = [
    ...Array.from({ length: 40 }, (_, i) => ({ texte: `nom ${i}`, forme: 'groupe_nominal' })),
    ...Array.from({ length: 40 }, (_, i) => ({ texte: `verbe ${i}`, forme: 'infinitif' })),
    ...Array.from({ length: 10 }, (_, i) => ({ texte: `citation ${i}`, forme: 'libre' })),
  ];
  const ids = Array.from({ length: 8 }, (_, i) => `p${i}`);
  for (const forme of ['groupe_nominal', 'infinitif']) {
    const hands = dealHands(ids, deck, new Set(), seeded(3), forme);
    for (const hand of Object.values(hands)) {
      assert.ok(hand.filter((t) => t.startsWith(forme === 'infinitif' ? 'verbe' : 'nom')).length >= MIN_COMPATIBLE);
      assert.equal(new Set(hand).size, 5);
    }
  }
  assert.ok(compatible('libre', 'infinitif') && compatible('infinitif', 'infinitif') && !compatible('infinitif', 'groupe_nominal') && !compatible('groupe_nominal', 'libre'));
  // Paquet pauvre en infinitifs : on donne tout ce qu'il y en a, sans planter.
  const poor = [...deck.filter((c) => c.forme === 'groupe_nominal'), { texte: 'verbe seul', forme: 'infinitif' }];
  const hands = dealHands(ids.slice(0, 3), poor, new Set(), seeded(1), 'infinitif');
  for (const hand of Object.values(hands)) assert.ok(hand.includes('verbe seul') && hand.length === 5);
});

test('partie complète avec le vrai contenu : la main de chaque joueur va avec la phrase de la manche', async () => {
  const cards = read('cartes-nbm.json');
  const byText = new Map(cards.map((c) => [c.texte, c.forme]));
  for (let i = 0; i < 40; i++) {
    const { game } = await makeGame('nbm', ['Ana', 'Ben', 'Chloé', 'Dan']);
    assert.equal(game.start(), null);
    const forme = game.question.forme;
    assert.ok(['groupe_nominal', 'infinitif', 'libre'].includes(forme), `forme de la phrase : ${forme}`);
    for (const hand of Object.values(game.roundData.hands)) {
      assert.ok(hand.filter((t) => compatible(forme, byText.get(t))).length >= MIN_COMPATIBLE, `${game.question.texte} / ${hand}`);
    }
  }
});
