// Noir Boire Mangue — règles pures : notes, Golden unique, classement et égalités, gorgées et plafond, mains de cartes, simulateur de bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as N from './rules/nbm.js';
import { playOne } from './rules/nbmSim.js';
import { seeded } from './rules/loupSim.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const total = (map) => Object.values(map).reduce((a, b) => a + b, 0);

test('réponse : texte brut de 60 caractères, jamais de HTML interprété, vide refusé', () => {
  assert.equal(N.cleanAnswer('  un   pigeon  ').text, 'un pigeon');
  assert.equal(N.cleanAnswer('x'.repeat(200)).text.length, N.MAX_ANSWER);
  assert.ok(N.cleanAnswer('   ').error);
  assert.equal(N.cleanAnswer('<img src=x onerror=alert(1)>').text, '<img src=x onerror=alert(1)>', 'littéral : React l’échappe à l’affichage');
});

test('phrase : un seul trou, la réponse s’insère à sa place', () => {
  assert.equal(N.blanksIn('Mon secret : ___ !'), 1);
  assert.equal(N.blanksIn('rien'), 0);
  assert.deepEqual(N.fillSentence('Mon secret : ___ !', 'un canard'), { before: 'Mon secret : ', answer: 'un canard', after: ' !' });
});

test('notes : Nul 0, Meh 1, Drôle 2, Golden 4 points', () => {
  assert.deepEqual(N.RATINGS, { nul: 0, meh: 1, drole: 2, golden: 4 });
  const answers = { a: 'x', b: 'y' };
  const ratings = { a: { c: 'nul', d: 'meh', e: 'drole', f: 'golden' }, b: { c: 'golden', d: 'golden' } };
  const r = N.resolveRound({ answers, ratings });
  assert.equal(r.points.a, 0 + 1 + 2 + 4);
  assert.equal(r.points.b, 8);
  assert.equal(N.tally(ratings, 'a').golden, 1);
});

test('Golden : un seul par joueur et par manche ; on ne note pas sa propre réponse ; le premier choix compte', () => {
  let st = { ratings: {}, goldenUsed: {} };
  const go = (voterId, authorId, rating) => {
    const out = N.rate(st, { voterId, authorId, rating });
    if (!out.error) st = { ratings: out.ratings, goldenUsed: out.goldenUsed };
    return out;
  };
  assert.equal(go('v', 'a', 'golden').error, undefined);
  assert.match(go('v', 'b', 'golden').error, /Golden/, 'deuxième Golden refusé');
  assert.equal(go('v', 'b', 'drole').error, undefined, 'les autres notes restent possibles');
  assert.match(go('a', 'a', 'meh').error, /propre réponse/);
  assert.match(go('v', 'c', 'enorme').error, /inconnue/);
  assert.equal(go('v', 'a', 'nul').already, true, 'double clic : le premier choix compte');
  assert.equal(st.ratings.a.v, 'golden');
  assert.equal(go('w', 'a', 'golden').error, undefined, 'un autre joueur a son propre Golden');
});

test('classement : égalités au même rang (1, 1, 3), gagnant seul en tête, dernier, rien si tout le monde est à égalité', () => {
  const answers = { a: 'a', b: 'b', c: 'c', d: 'd' };
  const mk = (pa, pb, pc, pd) => ({
    a: { x: ['nul', 'meh', 'drole', 'golden'][pa] },
    b: { x: ['nul', 'meh', 'drole', 'golden'][pb] },
    c: { x: ['nul', 'meh', 'drole', 'golden'][pc] },
    d: { x: ['nul', 'meh', 'drole', 'golden'][pd] },
  });
  const tie = N.resolveRound({ answers, ratings: mk(3, 3, 1, 0) });
  assert.deepEqual(tie.board.map((r) => r.rank), [1, 1, 3, 4]);
  assert.deepEqual([...tie.winners].sort(), ['a', 'b'], 'les ex æquo gagnent tous');
  assert.deepEqual(tie.losers, ['d']);
  assert.deepEqual(tie.credits, { a: 2, b: 2 });
  assert.deepEqual(tie.direct, { d: 2 });
  const lastTie = N.resolveRound({ answers, ratings: mk(3, 2, 0, 0) });
  assert.deepEqual([...lastTie.losers].sort(), ['c', 'd'], 'les ex æquo derniers boivent tous');
  const allSame = N.resolveRound({ answers, ratings: mk(2, 2, 2, 2) });
  assert.deepEqual(allSame.losers, [], 'tout le monde à égalité : personne n’est dernier');
  assert.equal(allSame.winners.length, 4, 'et tous gagnent');
  const zero = N.resolveRound({ answers, ratings: mk(0, 0, 0, 0) });
  assert.deepEqual([zero.winners, zero.losers], [[], []], 'personne n’a marqué : ni gagnant ni dernier');
  assert.equal(zero.best, null);
});

test('ceux qui n’ont rien écrit ne gagnent ni ne finissent derniers ; une réponse censurée vaut 0 et ne punit pas son auteur', () => {
  const answers = { a: 'a', b: 'b', c: 'c' }; // d et e n'ont rien écrit
  const ratings = { a: { d: 'golden', e: 'golden' }, b: { d: 'meh' }, c: { d: 'nul' } };
  const r = N.resolveRound({ answers, ratings, order: ['a', 'b', 'c'] });
  assert.deepEqual(r.winners, ['a']);
  assert.deepEqual(r.losers, ['c']);
  assert.ok(!('d' in r.points) && !('e' in r.points));
  const censored = N.resolveRound({ answers, ratings, order: ['a', 'b', 'c'], censored: { a: true, c: true } });
  assert.equal(censored.points.a, 0, 'réponse censurée : 0 point');
  assert.deepEqual(censored.winners, ['b'], 'la censurée ne gagne pas');
  assert.deepEqual(censored.losers, [], 'et son auteur n’est pas puni : seule b reste en lice, pas de dernier');
});

test('gorgées : le gagnant distribue 2 (au choix, sinon au hasard), le dernier boit 2, plafond de 4 par joueur', () => {
  const all = ids(6);
  const base = N.settleRoundSips({ direct: { p5: 2 }, credits: { p0: 2 }, allocations: { p0: { p1: 2 } }, ids: all, rng: seeded(1) });
  assert.equal(base.sips.p1, 2);
  assert.equal(base.sips.p5, 2);
  assert.equal(total(base.sips), 4);
  const random = N.settleRoundSips({ direct: {}, credits: { p0: 2 }, allocations: {}, ids: all, rng: seeded(2) });
  assert.equal(total(random.sips), 2, 'sans choix : 2 gorgées tirées au hasard');
  assert.ok(!('p0' in random.sips), 'jamais à soi-même');
  // Plafond : le dernier (2) reçoit encore 2 + 2 de deux gagnants ex æquo → 4 au plus.
  const capped = N.settleRoundSips({ direct: { p5: 2 }, credits: { p0: 2, p1: 2 }, allocations: { p0: { p5: 2 }, p1: { p5: 2 } }, ids: all, rng: seeded(3) });
  assert.equal(capped.sips.p5, N.SIP_CAP);
  assert.equal(N.SIP_CAP, 4);
});

test('mains : 5 cartes distinctes par joueur, pas de carte revue d’une manche à l’autre tant que le paquet le permet', () => {
  const deck = Array.from({ length: 120 }, (_, i) => `c${i}`);
  const seen = new Set();
  const players = ids(10);
  const rng = seeded(5);
  const rounds = [];
  for (let r = 0; r < 2; r++) {
    const hands = N.dealHands(players, deck, seen, rng);
    for (const hand of Object.values(hands)) {
      assert.equal(hand.length, N.HAND_SIZE);
      assert.equal(new Set(hand).size, N.HAND_SIZE, 'aucune carte en double dans une main');
    }
    const all = Object.values(hands).flat();
    assert.equal(new Set(all).size, all.length, 'ni entre les joueurs de la manche tant que le paquet suffit');
    rounds.push(new Set(all));
  }
  for (const c of rounds[1]) assert.ok(!rounds[0].has(c), 'une carte vue à la manche précédente ne revient pas');
  // Paquet court (30 joueurs, 150 cartes en 18+) : toujours des mains complètes et sans doublon dans la main.
  const small = Array.from({ length: 60 }, (_, i) => `s${i}`);
  const hands = N.dealHands(ids(30), small, new Set(), rng);
  for (const hand of Object.values(hands)) assert.equal(new Set(hand).size, 5);
  const tiny = N.dealHands(ids(3), ['a', 'b', 'c', 'd', 'e'], new Set(), rng);
  for (const hand of Object.values(tiny)) assert.deepEqual([...hand].sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('manches : une par joueur, 8 au plus', () => {
  assert.equal(N.roundsFor(3), 3);
  assert.equal(N.roundsFor(8), 8);
  assert.equal(N.roundsFor(30), 8);
});

test('simulateur de bots : 300 parties (3 à 30 joueurs) sans blocage ni exception, plafond et confidentialité respectés', () => {
  let rounds = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const r = playOne(seed);
    assert.equal(r.done, true, `partie ${seed} bloquée : ${r.where}`);
    assert.equal(r.timersLeft, 0, `partie ${seed} : minuteurs restants`);
    assert.ok(r.sipMax <= N.SIP_CAP, `partie ${seed} : ${r.sipMax} gorgées`);
    rounds += r.rounds;
  }
  assert.ok(rounds > 600, `${rounds} manches jouées`);
});
