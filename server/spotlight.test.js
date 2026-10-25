// Tirage équitable à l'échelle de la soirée (server/spotlight.js) : règles pures, simulation de soirée et branchement dans les vrais jeux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTLIGHT_ROLES, Spotlight } from './spotlight.js';
import { EVENING, runEvening, spread, table } from './rules/spotlightSim.js';
import { seeded } from './rules/loupSim.js';
import { makeGame } from './testClock.js';

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const ROLE = 'test';

test('on tire toujours parmi les plus petits compteurs : un joueur ne repasse que quand tous les autres sont passés', () => {
  const spot = new Spotlight();
  const all = ids(7);
  const rng = seeded(1);
  for (let cycle = 0; cycle < 5; cycle++) {
    const turn = Array.from({ length: 7 }, () => spot.pick(ROLE, all, { rng }));
    assert.equal(new Set(turn).size, 7, `cycle ${cycle} : tout le monde exactement une fois`);
  }
});

test('le tirage ne suit jamais l’ordre de la liste : égalités tirées au hasard, quel que soit l’ordre des candidats', () => {
  const first = {};
  const orders = new Set();
  for (let seed = 1; seed <= 600; seed++) {
    const rng = seeded(seed);
    const all = ids(6);
    const spot = new Spotlight();
    const order = Array.from({ length: 6 }, () => spot.pick(ROLE, all, { rng }));
    orders.add(order.join());
    first[order[0]] = (first[order[0]] ?? 0) + 1;
  }
  assert.ok(orders.size > 100, `beaucoup d’ordres de passage différents (${orders.size})`);
  for (const id of ids(6)) assert.ok(first[id] > 60 && first[id] < 140, `${id} ouvre la danse ${first[id]} fois sur 600`);
  // Même graine, liste inversée : le résultat est lui aussi équitable (aucune dépendance à la position).
  const a = new Spotlight();
  const b = new Spotlight();
  const fwd = Array.from({ length: 6 }, () => a.pick(ROLE, ids(6), { rng: seeded(9) }));
  const rev = Array.from({ length: 6 }, () => b.pick(ROLE, ids(6).reverse(), { rng: seeded(9) }));
  assert.equal(new Set(fwd).size >= 1 && new Set(rev).size >= 1, true);
});

test('un arrivant démarre au minimum du groupe (pas à zéro) ; un absent est ignoré et garde son compteur', () => {
  const spot = new Spotlight();
  const rng = seeded(3);
  const group = ids(4);
  for (let i = 0; i < 12; i++) spot.pick(ROLE, group, { rng }); // chacun 3 fois
  spot.join('neuf', group);
  assert.equal(spot.count(ROLE, 'neuf'), 3, 'démarre au minimum du groupe');
  const next = Array.from({ length: 5 }, () => spot.pick(ROLE, [...group, 'neuf'], { rng }));
  assert.equal(new Set(next).size, 5, 'le nouveau passe une seule fois par tour, comme les autres');

  // p0 s'absente pendant 4 tirages : ignoré, compteur conservé, rattrape à son retour.
  const present = group.filter((id) => id !== 'p0');
  const before = spot.count(ROLE, 'p0');
  for (let i = 0; i < 6; i++) assert.notEqual(spot.pick(ROLE, present, { rng }), 'p0');
  assert.equal(spot.count(ROLE, 'p0'), before);
  assert.equal(spot.pick(ROLE, group, { rng }), 'p0', 'à son retour il passe en premier (le seul en retard)');
});

test('exclusions de règles : le candidat écarté ne bloque rien ; « avoid » ne joue qu’entre ex æquo ; refund rend le tour', () => {
  const spot = new Spotlight();
  assert.equal(spot.pick(ROLE, []), null);
  assert.equal(spot.pick(ROLE, ['seul'], { avoid: 'seul' }), 'seul', 'un seul candidat : on le prend');
  for (let i = 0; i < 40; i++) assert.notEqual(new Spotlight().pick('autre', ['a', 'b'], { avoid: 'a', rng: seeded(i) }), 'a', 'à égalité, pas le dernier');
  const lagging = new Spotlight();
  lagging.pick('autre', ['a', 'b'], { rng: () => 0 });
  lagging.pick('autre', ['a', 'b'], { rng: () => 0 });
  lagging.pick('autre', ['b'], { rng: () => 0 });
  assert.equal(lagging.pick('autre', ['a', 'b'], { avoid: 'a' }), 'a', 'seul au minimum : « avoid » ne l’empêche pas de passer');
  const s2 = new Spotlight();
  s2.pick(ROLE, ['a', 'b', 'c'], { rng: () => 0 });
  const picked = s2.pick(ROLE, ['a', 'b', 'c'], { rng: () => 0 });
  s2.refund(ROLE, picked);
  assert.equal(s2.count(ROLE, picked), 0);
  s2.refund(ROLE, picked);
  assert.equal(s2.count(ROLE, picked), 0, 'jamais en dessous de zéro');
  s2.remove('a');
  assert.equal(s2.count(ROLE, 'a'), 0);
});

test('soirée de 20 joueurs, 10 jeux de 3 manches : chaque joueur est désigné un nombre de fois qui ne diffère jamais de plus de 1', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = runEvening(seeded(seed), { players: 20 });
    for (const role of Object.values(SPOTLIGHT_ROLES)) {
      if (!r.designated[role]) continue;
      assert.ok(spread(r.designated, role, r.ever) <= 1, `graine ${seed}, ${role} : écart ${spread(r.designated, role, r.ever)}`);
    }
    // Tous rôles confondus aussi : personne ne cumule les projecteurs.
    const totals = r.ever.map((id) => Object.values(r.designated).reduce((n, byPlayer) => n + (byPlayer[id] ?? 0), 0));
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 2, `graine ${seed}, total par joueur : ${totals}`);
  }
});

test('avec des arrivées, des départs et des retours : les joueurs toujours là restent à ≤ 1 d’écart, les arrivants ne sont pas surchargés', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = runEvening(seeded(seed), { players: 20, churn: true });
    for (const role of Object.values(SPOTLIGHT_ROLES)) {
      if (!r.designated[role]) continue;
      assert.ok(spread(r.designated, role, r.steady) <= 1, `graine ${seed}, ${role} (joueurs toujours présents) : écart ${spread(r.designated, role, r.steady)}`);
    }
    // Les 2 arrivants (j20, j21) ont été tirés au plus une fois de plus que la moyenne des autres sur tous les rôles.
    for (const role of Object.values(SPOTLIGHT_ROLES)) {
      const max = Math.max(...r.steady.map((id) => r.designated[role]?.[id] ?? 0));
      for (const late of ['j20', 'j21']) assert.ok((r.designated[role]?.[late] ?? 0) <= max + 1, `graine ${seed}, ${role} : arrivant ${late} surchargé`);
    }
  }
});

test('petit groupe, soirée longue : écart ≤ 1 sur chaque rôle, ≤ 2 pour le Savant (qui ne peut pas être le Chercheur)', () => {
  const r = runEvening(seeded(7), { players: 5, rounds: 12 });
  for (const role of Object.values(SPOTLIGHT_ROLES)) {
    if (!r.designated[role]) continue;
    const limit = role === SPOTLIGHT_ROLES.savantSavant ? 2 : 1;
    assert.ok(spread(r.designated, role, r.ever) <= limit, `${role} : écart ${spread(r.designated, role, r.ever)}`);
  }
});

test('tableau de répartition (consigné pour le rapport)', () => {
  const r = runEvening(seeded(2024), { players: 20, churn: true });
  const text = table(r);
  assert.match(text, /\| Joueur \|/);
  assert.equal(text.split('\n').length, 2 + r.ever.length);
  assert.equal(EVENING.length, 10);
});

// ---------- Branchement dans les vrais jeux ----------

async function drive(game, tick, mode, rounds) {
  game.mode = mode;
  game.reset();
  assert.equal(game.start(), null, `${mode} démarre`);
  for (let i = 1; i < rounds; i++) {
    game.reveal();
    tick(game.rules.revealMs);
    assert.equal(game.nextQuestion(), null, `${mode} manche ${i + 1}`);
  }
}

test('les vrais jeux (Qui me connaît, Patate, Imposteur, Roue, Savant) tirent via le registre de la partie, qui survit au changement de jeu', async () => {
  const names = Array.from({ length: 12 }, (_, i) => `J${i}`);
  const { game, tick } = await makeGame('qui-me-connait', names);
  const targets = [];
  game.mode = 'qui-me-connait';
  game.reset();
  game.start();
  const seen = () => game.roundData.targetId;
  for (let i = 0; i < 12; i++) {
    targets.push(seen());
    game.reveal();
    tick(game.rules.revealMs);
    game.nextQuestion();
  }
  assert.equal(new Set(targets).size, 12, 'une cible différente à chaque manche tant que tout le monde n’est pas passé');
  const registry = game.spotlight;
  // Changer de jeu, rejouer : le même registre.
  game.mode = 'patate';
  game.reset();
  assert.equal(game.spotlight, registry, 'le registre survit au changement de jeu');
  for (const mode of ['patate', 'imposteur', 'roue']) {
    const picks = [];
    for (let i = 0; i < 12; i++) {
      game.mode = mode;
      game.reset();
      assert.equal(game.start(), null);
      picks.push({ patate: game.roundData.holderId, imposteur: game.roundData.imposterId, roue: null }[mode]);
      if (mode === 'roue') {
        game.reveal();
        tick(game.rules.revealMs);
        picks[picks.length - 1] = game.results.targetId;
      }
    }
    assert.equal(new Set(picks).size, 12, `${mode} : 12 manches, 12 joueurs différents`);
  }
  assert.equal(Object.keys(registry.snapshot(SPOTLIGHT_ROLES.connaitCible)).length, 12);
});

test('une nouvelle partie (nouveau code) repart de zéro ; un arrivant tardif démarre au minimum', async () => {
  const { game, tick } = await makeGame('qui-me-connait', ['A', 'B', 'C', 'D']);
  game.start();
  for (let i = 0; i < 8; i++) {
    game.reveal();
    tick(game.rules.revealMs);
    game.nextQuestion();
  }
  const { player } = game.upsertPlayer({ name: 'Tardif' });
  game.connectPlayer(player, 'sx');
  assert.equal(game.spotlight.count(SPOTLIGHT_ROLES.connaitCible, player.id), 2, 'min du groupe (2 passages chacun)');
  const other = await makeGame('qui-me-connait', ['A', 'B', 'C', 'D']);
  assert.equal(Object.keys(other.game.spotlight.snapshot(SPOTLIGHT_ROLES.connaitCible)).length, 0);
});
