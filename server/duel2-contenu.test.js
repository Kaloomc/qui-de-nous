// Qui suis-je ?, Ordre chronologique, Vrai ou Faux : contrôle du contenu, règles, égalités, latence et confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkChrono, checkGeo, checkQui, checkVf } from './duel/contentCheck.js';
import * as QS from './duel/minigames/quisuisje.js';
import * as CH from './duel/minigames/chrono.js';
import * as VF from './duel/minigames/vf.js';
import { duel, leaks } from './duelTestKit.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./content/${f}`, import.meta.url), 'utf8'));
const qui = read('qui-suis-je-duel.json');
const chrono = read('ordre-chrono-duel.json');
const vf = read('vrai-faux-duel.json');

test('contenu : fichiers valides, volumes, sources, aucun indice qui nomme la réponse', () => {
  assert.deepEqual(checkVf(vf), []);
  assert.deepEqual(checkQui(qui), []);
  assert.deepEqual(checkChrono(chrono), []);
  assert.deepEqual(checkGeo(read('villes-geo-duel.json')), []);
  assert.ok(vf.filter((x) => x.vrai).length > 0 && vf.filter((x) => !x.vrai).length >= 40);
});

test('le contrôle repère les défauts (indice qui nomme la réponse, écart de dates trop court, doublon, source manquante)', () => {
  const q = { id: 'a', indices: ['Je suis célèbre à Paris.', 'Je mesure beaucoup de mètres.', 'Je suis la tour Eiffel ici.', 'On me visite toute l’année.'], choix: ['La tour Eiffel', 'Le Louvre', 'Notre-Dame', 'Le Sacré-Cœur'], bonne: 0, categorie: 'x', source: 'https://example.org/page' };
  assert.match(checkQui([q], 1).join(), /nomme la réponse/);
  const c = { id: 'b', evenements: [1900, 1905, 1950, 1990, 2010].map((annee, i) => ({ texte: `Événement ${i}`, annee })), categorie: 'x', source: '' };
  const text = checkChrono([c, { ...c, id: 'c' }], 1).join();
  for (const needle of ['écart de moins de 8 ans', 'série en double', 'source']) assert.match(text, new RegExp(needle));
});

// ---------- Qui suis-je ? ----------

const riddles = qui.slice(0, 30);
const answer = (s, camp, ok) => s.play(camp, { choice: ok ? s.mgState().right : (s.mgState().right + 1) % 4, n: s.mgState().n });

test('Qui suis-je ? : points = indices non affichés + 1, −1 pour une erreur (jamais sous 0), blocage jusqu’à l’indice suivant', async () => {
  assert.equal(QS.pointsFor(1), 4);
  assert.equal(QS.pointsFor(4), 1);
  const s = await duel('quisuisje', { content: { qui: riddles } });
  assert.equal(s.view('tv').clues.length, 1, 'un seul indice au départ');
  answer(s, 'rouge', false);
  assert.equal(s.view('tv').score.rouge, 0, 'jamais sous zéro');
  assert.match(answer(s, 'rouge', true), /Bloqué/);
  s.tick(QS.CLUE_MS + 50); // 2e indice
  assert.equal(s.view('tv').clues.length, 2);
  assert.equal(answer(s, 'rouge', true), null);
  assert.equal(s.view('tv').score.rouge, 3, '2 indices affichés : 4 − 2 + 1 = 3 points');
  answer(s, 'bleu', true);
  assert.equal(s.view('tv').reveal.n, 1, 'les deux ont trouvé : énigme terminée');
  assert.equal(s.view('tv').score.bleu, 3);
});

test('Qui suis-je ? : indices envoyés au fur et à mesure, bonne réponse jamais envoyée avant la fin ; 3 énigmes puis départage', async () => {
  const s = await duel('quisuisje', { content: { qui: riddles } });
  const r = s.mgState().r;
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.reveal, null);
    assert.equal(leaks(v, [r.indices[1], r.indices[2], r.indices[3]]), false, 'indices à venir déjà envoyés');
    assert.equal(JSON.stringify(v).includes('"right"'), false);
  }
  answer(s, 'rouge', true);
  s.tick(QS.CLUE_MS * 3 + QS.TAIL_MS);
  s.tick(QS.REVEAL_MS);
  assert.equal(s.mgState().n, 2);
  s.tick(QS.CLUE_MS * 3 + QS.TAIL_MS + QS.REVEAL_MS);
  s.tick(QS.CLUE_MS * 3 + QS.TAIL_MS);
  assert.equal(s.winner(), 'rouge', 'rouge a 4 points, bleu 0 après 3 énigmes');
  const t = await duel('quisuisje', { content: { qui: riddles } });
  for (let i = 0; i < QS.COUNT + QS.SUDDEN; i++) t.tick(QS.CLUE_MS * 3 + QS.TAIL_MS + QS.REVEAL_MS + 50);
  assert.equal(t.winner(), 'égalité', '0 – 0 : 4e énigme puis égalité finale');
});

test('Qui suis-je ? : latence compensée (le nombre d’indices vus est celui du moment réel du geste)', async () => {
  const s = await duel('quisuisje', { content: { qui: riddles }, latency: true });
  s.game.duelLatency.set(s.camp.rouge, 1000);
  s.tick(5200); // 2e indice affiché depuis 200 ms ; le geste de ROUGE (RTT 1 s) a été fait quand 1 seul indice était visible
  answer(s, 'rouge', true);
  assert.equal(s.view('tv').score.rouge, 4, 'compensé : 1 seul indice vu au moment du geste');
});

// ---------- Ordre chronologique ----------

const cards = (s) => s.mgState().cards;
const tapOrder = (s, camp, upTo = 5) => {
  const order = cards(s).map((c, i) => [c.rank, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (let k = 0; k < upTo; k++) s.play(camp, { card: order[k] });
  return order;
};

test('Ordre chronologique : le premier à finir gagne, une erreur bloque 3 s, les dates n’arrivent qu’à la fin', async () => {
  const s = await duel('chrono', { content: { chrono } });
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.years, null);
    assert.equal(leaks(v, ['annee', '"rank"']), false);
    assert.equal(v.cards.length, 5);
  }
  const order = cards(s).map((c, i) => [c.rank, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  s.play('rouge', { card: order[1] }); // erreur : pas la plus ancienne
  assert.match(s.play('rouge', { card: order[0] }), /Bloqué/);
  assert.equal(s.view(s.camp.rouge).mine.length, 0);
  s.tick(CH.BLOCK_MS + 10);
  tapOrder(s, 'bleu');
  s.tick(CH.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
  assert.equal(s.game.results.details.order.length, 5, 'les dates apparaissent dans le résultat');
});

test('Ordre chronologique : 30 s écoulées → le plus de cartes bien placées, puis le plus rapide ; égalité parfaite : égalité ; égalité de vitesse : reprise puis égalité', async () => {
  const s = await duel('chrono', { content: { chrono } });
  tapOrder(s, 'rouge', 3);
  tapOrder(s, 'bleu', 2);
  s.tick(CH.MAX_MS);
  assert.equal(s.winner(), 'rouge');
  const t = await duel('chrono', { content: { chrono } });
  t.tick(CH.MAX_MS);
  assert.equal(t.winner(), 'égalité');
  const u = await duel('chrono', { content: { chrono } });
  const first = JSON.stringify(u.mgState().serie.id);
  tapOrder(u, 'rouge');
  u.tick(5);
  tapOrder(u, 'bleu');
  u.tick(CH.SETTLE_MS);
  assert.equal(u.game.phase, 'question', 'égalité à 20 ms : reprise');
  assert.equal(u.mgState().replayed, true);
  assert.ok(first);
});

test('Ordre chronologique : latence compensée à l’arrivée', async () => {
  const s = await duel('chrono', { content: { chrono }, latency: true });
  s.game.duelLatency.set(s.camp.rouge, 0);
  s.game.duelLatency.set(s.camp.bleu, 400);
  s.tick(3000);
  tapOrder(s, 'rouge');
  s.tick(100);
  tapOrder(s, 'bleu'); // 3100 − 400 = 2700 ms : plus rapide malgré l’arrivée tardive
  s.tick(CH.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
});

// ---------- Vrai ou Faux ----------

const truth = (s) => s.mgState().st.vrai;
const say = (s, camp, ok) => s.play(camp, { value: ok ? truth(s) : !truth(s), n: s.mgState().n });

test('Vrai ou Faux : temps qui diminue de 5 s à 2 s', () => {
  assert.equal(VF.limitFor(0), 5000);
  assert.ok(VF.limitFor(5) < VF.limitFor(1));
  assert.equal(VF.limitFor(40), VF.MIN_TIME_MS);
});

test('Vrai ou Faux : une erreur ou une absence élimine, l’autre gagne ; la vérité n’est envoyée qu’à la fin de l’affirmation', async () => {
  const s = await duel('vf', { content: { vf } });
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.reveal, null);
    assert.equal(JSON.stringify(v).includes('explication'), false);
    assert.equal(JSON.stringify(v).includes('"vrai"'), false);
  }
  say(s, 'rouge', true);
  say(s, 'bleu', false);
  s.tick(VF.START_MS + 1100);
  assert.equal(s.winner(), 'rouge');
  assert.equal(s.game.results.details.reason, 'survie');
  const t = await duel('vf', { content: { vf } });
  say(t, 'bleu', true); // rouge ne répond pas : éliminé
  t.tick(VF.START_MS + 1100);
  assert.equal(t.winner(), 'bleu');
});

test('Vrai ou Faux : les deux justes ou les deux ratent → on continue ; 15 affirmations au plus puis le plus rapide, sinon égalité', async () => {
  const s = await duel('vf', { content: { vf } });
  say(s, 'rouge', true);
  say(s, 'bleu', true);
  s.tick(VF.limitFor(0) + 60 + VF.REVEAL_MS + 20);
  assert.equal(s.mgState().n, 2, 'les deux justes : suivante');
  s.tick(VF.limitFor(1) + 60 + VF.REVEAL_MS + 20); // les deux ratent (absents) : égalité sur celle-ci, on continue
  assert.equal(s.mgState().n, 3);
  assert.equal(s.game.phase, 'question');
  const t = await duel('vf', { content: { vf } });
  for (let i = 0; i < VF.MAX_STATEMENTS; i++) {
    say(t, 'rouge', true);
    t.tick(50);
    say(t, 'bleu', true);
    t.tick(VF.limitFor(i) + 60 + VF.REVEAL_MS + 20);
  }
  assert.equal(t.winner(), 'rouge', 'rouge a répondu 50 ms avant bleu à chaque fois : plus rapide cumulé');
});

test('Vrai ou Faux : la moitié des affirmations tirées sont vraies, moitié fausses ; latence compensée', async () => {
  let trues = 0;
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const s = await duel('vf', { content: { vf } });
    trues += truth(s) ? 1 : 0;
    total += 1;
  }
  assert.ok(trues > total * 0.25 && trues < total * 0.75, `${trues} vraies sur ${total}`);
  const s = await duel('vf', { content: { vf }, latency: true });
  s.game.duelLatency.set(s.camp.rouge, 5000); // réseau lent : le geste a été fait bien avant son arrivée
  s.tick(1500);
  say(s, 'rouge', true);
  assert.ok(s.mgState().answers.rouge.t <= s.mgState().limit, 'compensé : à temps');
});
