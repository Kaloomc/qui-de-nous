// Règles pures du Savant : réponses, rotation, tirage du Savant, gorgées et points, plafond, simulateur de bots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './rules/savant.js';
import { runGame } from './rules/savantSim.js';
import { seeded } from './rules/loupSim.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const total = (map) => Object.values(map).reduce((a, b) => a + b, 0);

test('réponse : texte brut de 60 caractères, espaces nettoyés, vide refusé, HTML jamais interprété', () => {
  assert.equal(S.cleanAnswer('  des   pigeons  ').text, 'des pigeons');
  assert.equal(S.cleanAnswer('x'.repeat(200)).text.length, S.MAX_ANSWER);
  for (const bad of ['', '   ', '​‮', null, 42, undefined]) assert.ok(S.cleanAnswer(bad).error, String(bad));
  const html = '<b>gras</b> & <script>x</script>';
  assert.equal(S.cleanAnswer(html).text, html, 'le texte reste littéral (React l’échappe à l’affichage)');
  assert.equal(S.cleanAnswer('a‮b\nc\td').text, 'a b c d', 'inversion de sens et retours supprimés');
  assert.equal(S.normalizeAnswer('  Éléphant !! '), S.normalizeAnswer('elephant'));
  assert.notEqual(S.normalizeAnswer('chat'), S.normalizeAnswer('chien'));
});

test('nombre de manches : 5 / 8 / 10 / une par joueur (10 au plus) / sans fin', () => {
  assert.equal(S.roundsFor(5, 12), 5);
  assert.equal(S.roundsFor('players', 6), 6);
  assert.equal(S.roundsFor('players', 30), 10);
  assert.equal(S.roundsFor(0, 6), 0);
  assert.equal(S.roundsFor('n’importe quoi', 4), 4, 'valeur inconnue : réglage par défaut');
});

test('rotation : chacun cherche une fois avant que quelqu’un repasse, jamais le même deux fois de suite', () => {
  const rng = seeded(1);
  const all = ids(5);
  const rot = S.newRotation(all, rng);
  let previous = Array.from({ length: 5 }, () => S.nextSeeker(rot, all, all, rng));
  assert.deepEqual([...previous].sort(), [...all].sort(), 'un tour complet : tout le monde une fois');
  for (let cycle = 0; cycle < 20; cycle++) {
    const turn = Array.from({ length: 5 }, () => S.nextSeeker(rot, all, all, rng));
    assert.equal(new Set(turn).size, 5);
    assert.notEqual(turn[0], previous.at(-1), 'le dernier Chercheur ne repasse pas tout de suite');
    previous = turn;
  }
});

test('rotation : les arrivants sont ajoutés à la fin, les absents gardent leur tour, les partis sont oubliés', () => {
  const rng = seeded(2);
  let all = ids(4);
  const rot = S.newRotation(all, rng);
  const first = S.nextSeeker(rot, all, all, rng);
  all = [...all, 'nouveau'];
  const rest = Array.from({ length: 4 }, () => S.nextSeeker(rot, all, all, rng));
  assert.equal(rest.at(-1), 'nouveau', 'le nouveau cherche à la fin du tour');
  assert.ok(!rest.includes(first));

  const r2 = S.newRotation(ids(4), seeded(3));
  const absent = r2.order[0];
  const present = ids(4).filter((id) => id !== absent);
  assert.notEqual(S.nextSeeker(r2, ids(4), present, seeded(3)), absent);
  assert.ok(!r2.done.has(absent), 'l’absent garde son tour');
  S.nextSeeker(r2, present, present, seeded(3));
  assert.ok(!r2.order.includes(absent), 'un joueur parti est retiré de l’ordre');
  assert.equal(S.nextSeeker(S.newRotation([], seeded(1)), [], [], seeded(1)), null);
});

test('Savant : jamais deux manches de suite le même, priorité à ceux qui l’ont été le moins', () => {
  const rng = seeded(4);
  const counts = {};
  let last = null;
  const all = ids(6);
  for (let i = 0; i < 60; i++) {
    const id = S.pickSavant(counts, last, all, rng);
    assert.notEqual(id, last);
    last = id;
  }
  const values = Object.values(counts);
  assert.ok(Math.max(...values) - Math.min(...values) <= 1, `répartition équilibrée : ${values}`);
  assert.equal(S.pickSavant({ a: 3, b: 3, c: 0 }, 'a', ['a', 'b', 'c'], seeded(5)), 'c', 'celui qui ne l’a jamais été passe avant');
  assert.equal(S.pickSavant({}, 'a', ['a'], seeded(5)), 'a', 'un seul candidat : on le prend');
  assert.equal(S.pickSavant({}, null, [], seeded(5)), null);
});

const W = ['sa', 'b1', 'b2', 'b3', 'b4']; // Savant + 4 Bluffeurs ; le Chercheur est « se »

test('Chercheur juste : Bluffeurs 1 gorgée, Chercheur distribue 2, Savant ne boit pas, points', () => {
  const r = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { se: 'sa', b1: 'sa', b2: 'b1', b3: 'b1', b4: 'sa', sa: 'b2' } });
  assert.equal(r.found, true);
  assert.deepEqual(r.direct, { b1: 1, b2: 1, b3: 1, b4: 1 });
  assert.equal(r.credits.se, 2);
  assert.equal(r.credits.b1, 2, 'b1 : a voté pour le vrai Savant (1) + trompeur du jour, 2 votes (1)');
  assert.equal(r.credits.b4, 1, 'b4 a voté pour le vrai Savant : distribue 1');
  assert.equal(r.credits.sa, undefined);
  assert.deepEqual(r.trompeurs, ['b1']);
  assert.equal(r.points.se, 2, 'Chercheur qui trouve : +2');
  assert.equal(r.points.sa, undefined, 'Savant trouvé : pas de points');
  assert.equal(r.points.b1, 2 + 1, 'b1 : 2 spectateurs trompés (+2) et vote juste (+1)');
  assert.equal(r.points.b4, 1, 'spectateur juste : +1');
  assert.equal(r.points.b2, 1, 'a trompé un spectateur (le Savant) : +1');
});

test('Chercheur faux : il boit 2, le Bluffeur désigné distribue 2, le Savant boit 1 et gagne 2 points', () => {
  const r = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { se: 'b3', b1: 'sa', b2: 'sa', b3: 'b4', b4: 'b3', sa: 'b3' } });
  assert.equal(r.found, false);
  assert.deepEqual(r.direct, { se: 2, sa: 1 });
  assert.deepEqual(r.trompeurs, ['b3'], 'b3 a reçu le plus de votes de spectateurs (2)');
  assert.equal(r.credits.b3, 2 + 1, 'désigné à tort (2) + trompeur (1)');
  assert.equal(r.credits.b1, 1);
  assert.equal(r.credits.b2, 1);
  assert.equal(r.points.sa, 2, 'Savant non trouvé : +2');
  assert.equal(r.points.b3, 2 + 2, 'désigné à tort (+2) et 2 spectateurs trompés (+2)');
});

test('Chercheur qui ne choisit pas : il boit comme s’il s’était trompé, aucun Bluffeur récompensé', () => {
  const r = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { b1: 'sa' } });
  assert.equal(r.choice, null);
  assert.equal(r.found, false);
  assert.deepEqual(r.direct, { se: 2, sa: 1 });
  assert.deepEqual(r.credits, { b1: 1 }, 'seul le spectateur juste distribue ; personne n’est récompensé d’avoir été désigné');
  assert.equal(r.points.sa, 2);
  assert.equal(r.points.se, undefined);
});

test('égalités de votes de spectateurs : tous les ex æquo sont « trompeurs » ; aucun vote : personne', () => {
  const tie = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { se: 'sa', b1: 'b3', b2: 'b4', b3: 'b4', b4: 'b3', sa: 'b1' } });
  assert.deepEqual([...tie.trompeurs].sort(), ['b3', 'b4']);
  assert.equal(tie.credits.b3, 1);
  assert.equal(tie.credits.b4, 1);
  const none = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { se: 'sa' } });
  assert.deepEqual(none.trompeurs, []);
});

test('votes invalides ignorés : pour soi, pour le Chercheur, pour un inconnu, du Chercheur pour lui-même', () => {
  const r = S.resolveRound({ seekerId: 'se', savantId: 'sa', writers: W, votes: { se: 'se', b1: 'b1', b2: 'se', b3: 'inconnu', ghost: 'sa' } });
  assert.deepEqual(r.spectatorVotes, {});
  assert.equal(r.choice, null);
  assert.deepEqual(r.voteCounts, {});
});

test('distribution : le choix du joueur, sinon le hasard (jamais de blocage), personne ne se désigne', () => {
  const players = ids(6);
  const credits = { p0: 2, p1: 1 };
  const chosen = S.settleSips({ direct: {}, credits, allocations: { p0: { p3: 2 }, p1: { p4: 1 } }, ids: players, rng: seeded(1) });
  assert.deepEqual(chosen.sips, { p3: 2, p4: 1 });
  assert.deepEqual(chosen.given, { p0: { p3: 2 }, p1: { p4: 1 } });
  const random = S.settleSips({ direct: {}, credits, allocations: {}, ids: players, rng: seeded(2) });
  assert.equal(total(random.sips), 3, 'tout le crédit est distribué');
  for (let s = 1; s < 30; s++) {
    const o = S.settleSips({ direct: {}, credits: { p0: 5 }, allocations: { p0: { p0: 3 } }, ids: players, rng: seeded(s) });
    assert.equal(o.sips.p0 ?? 0, 0, 'personne ne se désigne');
    assert.equal(total(o.sips), 5);
  }
  const partial = S.settleSips({ direct: {}, credits: { p0: 3 }, allocations: { p0: { p2: 1 } }, ids: players, rng: seeded(3) });
  assert.ok(partial.sips.p2 >= 1);
  assert.equal(total(partial.sips), 3, 'le reste est tiré au hasard');
  const over = S.settleSips({ direct: {}, credits: { p0: 1 }, allocations: { p0: { p2: 9 } }, ids: players, rng: seeded(3) });
  assert.deepEqual(over.sips, { p2: 1 }, 'on ne donne pas plus que son crédit');
});

test('plafond de 6 gorgées par joueur et par manche ; joueur parti : son crédit et ses gorgées disparaissent', () => {
  const capped = S.settleSips({ direct: { a: 2 }, credits: { b: 4, c: 4 }, allocations: { b: { a: 4 }, c: { a: 4 } }, ids: ['a', 'b', 'c', 'd'], rng: seeded(1) });
  assert.equal(capped.sips.a, S.SIP_CAP);
  const gone = S.settleSips({ direct: { x: 2, a: 1 }, credits: { x: 2, a: 1 }, allocations: {}, ids: ['a', 'b'], rng: seeded(1) });
  assert.equal(gone.sips.x, undefined, 'plus dans la partie : rien à boire');
  assert.equal(gone.given.x, undefined);
  assert.equal(gone.sips.b, 1, 'le crédit de a (1) va au seul autre joueur');
  assert.equal(gone.sips.a, 1, 'ses gorgées directes restent');
});

test('simulateur : 300 parties de 4 à 30 joueurs (inactifs, votes invalides), aucune exception ni invariant violé', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const res = runGame(seeded(seed), { chaos: seed % 3 === 0 ? 0.6 : seed % 3 === 1 ? 0.25 : 0 });
    assert.ok(res.savants.length > 0, `partie ${seed} sans manche jouée`);
  }
});

test('simulateur : sans absent, chaque tour de rotation donne la parole à tout le monde', () => {
  for (const n of [4, 7, 12, 30]) {
    const res = runGame(seeded(n), { n, rounds: n * 3, chaos: 0 });
    for (let cycle = 0; cycle < 3; cycle++) assert.equal(new Set(res.seekers.slice(cycle * n, (cycle + 1) * n)).size, n, `n=${n}`);
  }
});
