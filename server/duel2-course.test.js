// Course d'obstacles : simulation déterministe partagée, tracés toujours franchissables (1 000), jugement côté serveur, triche et latence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../shared/runner.js';
import { duel } from './duelTestKit.js';

test('1 000 tracés : un joueur parfait les franchit tous pendant 60 s (aucun obstacle impossible)', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const track = R.makeTrack(seed * 7919);
    const events = R.perfectEvents(track);
    const res = R.simulate(track, events);
    assert.equal(res.deadAt, null, `tracé ${seed} : mort à l’image ${res.deadAt}`);
    assert.ok(res.x > 20000, 'distance parcourue');
  }
});

test('tracé : écarts suffisants, deux types d’obstacles, reproductible, vitesse croissante bornée', () => {
  const track = R.makeTrack(123);
  assert.deepEqual(track, R.makeTrack(123));
  assert.notDeepEqual(track, R.makeTrack(124));
  assert.ok(track.some((o) => o.kind === 'low') && track.some((o) => o.kind === 'high'));
  for (let i = 1; i < track.length; i++) {
    const gap = track[i].x - (track[i - 1].x + R.OBS_W);
    assert.ok(gap >= R.speedAt(track[i - 1].x) * (R.AIR_FRAMES + 22) - 1, `écart trop court en ${i}`);
  }
  assert.ok(R.speedAt(0) === R.V0 && R.speedAt(1e9) === R.V_MAX && R.speedAt(2000) > R.speedAt(1000));
});

test('physique : debout on percute un obstacle au sol, sauter l’évite ; se baisser évite l’aérien, debout non', () => {
  const low = [{ x: 400, kind: 'low' }];
  const high = [{ x: 400, kind: 'high' }];
  assert.ok(R.simulate(low, [], 600).deadAt, 'obstacle au sol percuté debout');
  assert.equal(R.simulate(R.makeTrack(1).slice(0, 0), [], 600).deadAt, null, 'aucun obstacle : rien');
  const jumpFrame = (() => {
    for (let f = 0; f < 100; f++) if (R.simulate(low, [{ f, k: 'j' }], 600).deadAt === null) return f;
    return null;
  })();
  assert.ok(jumpFrame != null, 'un saut bien placé passe');
  assert.ok(R.simulate(high, [{ f: 0, k: 'd1' }], 600).deadAt === null, 'baissé : passe sous l’obstacle aérien');
  assert.ok(R.simulate(high, [], 600).deadAt, 'debout : percuté');
  assert.ok(R.simulate(low, [{ f: 0, k: 'j' }, { f: 1, k: 'j' }], 600).deadAt, 'un saut trop tôt retombe sur l’obstacle');
});

test('déterminisme : mêmes entrées → même résultat, quel que soit l’ordre ou le découpage du calcul', () => {
  const track = R.makeTrack(77);
  const events = R.perfectEvents(track, 900);
  const a = R.simulate(track, events, 900);
  assert.deepEqual(a, R.simulate(track, [...events].reverse(), 900), 'ordre des entrées indifférent');
  assert.deepEqual(a, R.simulate(track, JSON.parse(JSON.stringify(events)), 900), 'copie sérialisée (message réseau)');
  // Les morts ne bougent pas quand on prolonge la simulation.
  const dead = R.simulate(track, [], 5000);
  assert.ok(dead.deadAt);
  for (const n of [dead.deadAt, dead.deadAt + 1, 4000]) assert.equal(R.simulate(track, [], n).deadAt, n >= dead.deadAt ? dead.deadAt : null);
});

const FRAME = R.DT_MS;
/** Joue `frames` images en envoyant les entrées de chacun au bon moment. */
function run(s, plans, frames, offsetFrames = {}) {
  for (let f = 0; f < frames && s.game.phase === 'question'; f++) {
    for (const [camp, events] of Object.entries(plans)) {
      for (const ev of events.filter((e) => e.f === f)) s.play(camp, { k: ev.k, f: ev.f + (offsetFrames[camp] ?? 0) });
    }
    s.tick(FRAME);
  }
}

test('jeu : le dernier debout gagne, le serveur rejoue lui-même la simulation', async () => {
  const s = await duel('course');
  const track = s.mgState().track;
  const plan = R.perfectEvents(track, 1200);
  run(s, { rouge: plan }, 1000);
  s.tick(500);
  assert.equal(s.winner(), 'rouge');
  assert.equal(s.game.results.details.reason, 'dead');
  assert.ok(s.game.results.details.distance.rouge >= s.game.results.details.distance.bleu);
});

test('deux morts à la même image : égalité ; entrées invalides refusées', async () => {
  const s = await duel('course');
  assert.match(s.play('rouge', { k: 'x', f: 1 }), /invalide/);
  assert.match(s.play('rouge', { k: 'j', f: 1.5 }), /invalide/);
  s.tick(3000 * 3);
  s.tick(500);
  assert.equal(s.winner(), 'égalité', 'personne ne bouge : les deux meurent au premier obstacle, même image');
});

test('triche : une entrée annoncée dans le futur ou très en retard est ramenée à l’image réelle, jamais crue', async () => {
  const s = await duel('course');
  s.tick(700);
  const now = Math.floor(700 / FRAME);
  s.play('rouge', { k: 'j', f: now + 5000 }); // futur lointain
  assert.ok(s.mgState().events.rouge.at(-1).f <= now + 1);
  s.play('bleu', { k: 'j', f: 0 }); // 0,7 s dans le passé, sans latence pour l'expliquer
  assert.ok(s.mgState().events.bleu.at(-1).f >= now - 12);
  // Un joueur qui n'envoie aucune entrée ne peut pas « survivre » : le serveur le tue.
  const t = await duel('course');
  t.tick(4000);
  assert.equal(t.game.results.details.reason, 'same-frame', 'sans entrée, mort certaine jugée par le serveur');
  assert.ok(t.game.results.details.frame > 0);
});

test('latence : une entrée partie à temps mais arrivée en retard est jugée à son image, et la mort attend les entrées en retard', async () => {
  const s = await duel('course', { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 400);
  s.game.duelLatency.set(s.camp.bleu, 0);
  const track = s.mgState().track;
  const plan = R.perfectEvents(track, 800);
  // ROUGE a 400 ms de latence : ses entrées arrivent 12 images plus tard que leur image annoncée.
  const late = Math.ceil(200 / FRAME);
  const plan2 = plan.filter((e) => e.f < 700);
  for (let f = 0; f < 720 && s.game.phase === 'question'; f++) {
    for (const ev of plan2.filter((e) => e.f === f - late)) s.play('rouge', { k: ev.k, f: ev.f });
    for (const ev of plan2.filter((e) => e.f === f)) s.play('bleu', { k: ev.k, f: ev.f });
    s.tick(FRAME);
  }
  assert.equal(s.game.phase, 'question', 'les deux survivent : ROUGE n’est pas puni pour son retard');
});

test('confidentialité : le tracé est une graine publique (même tracé pour les deux), aucune donnée secrète', async () => {
  const s = await duel('course');
  const v = s.view('tv');
  assert.equal(v.seed, s.mgState().seed);
  assert.deepEqual(Object.keys(v).sort(), ['dead', 'events', 'maxFrames', 'now', 'seed', 'startedAt']);
  assert.deepEqual(s.view(s.camp.rouge).seed, s.view(s.camp.bleu).seed);
});
