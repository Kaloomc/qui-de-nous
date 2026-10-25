// La Roue : défis qui ciblent un genre (filtrage des cibles, défi sauté, joueurs « ne préfère pas dire » épargnés, gorgées).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRoueAction, drawRoue, groupsFor, isEligible, isRoueComplete, isValidDefi, isConcerned, settleGendered, sipsRoue } from './rules/roue.js';
import { makeGame } from './testClock.js';

const cast = [
  ...['H1', 'H2', 'H3'].map((id) => ({ id, gender: 'm' })),
  ...['F1', 'F2', 'F3', 'F4'].map((id) => ({ id, gender: 'f' })),
  ...['N1', 'N2'].map((id) => ({ id, gender: 'n' })),
];
const ids = cast.map((p) => p.id);
const defi = (type, genre, n = 2, vers) => ({ texte: 'x', type, genre, n, niveau: 'chill', ...(vers ? { vers } : {}) });
const draw = (d) => drawRoue(ids, [d], () => 0, null, d, null, cast);
const act = (results, pid, action) => {
  const out = applyRoueAction(results, pid, action, ids);
  assert.equal(out.error, undefined, out.error);
  return out.results;
};
const total = (sips) => Object.values(sips).reduce((a, b) => a + b, 0);

test('format : un défi de genre a un genre valide, un genre qui reçoit différent quand il en faut un ; les autres défis n’ont pas de genre', () => {
  assert.ok(isValidDefi(defi('genre-boit', 'femme', 2)));
  assert.ok(isValidDefi(defi('genre-dernier', 'homme', 1)));
  assert.ok(isValidDefi(defi('genre-distribue', 'homme', 2, 'femme')));
  assert.ok(!isValidDefi(defi('genre-boit', undefined, 2)), 'sans genre');
  assert.ok(!isValidDefi(defi('genre-boit', 'autre', 2)));
  assert.ok(!isValidDefi(defi('genre-distribue', 'homme', 2)), 'sans genre qui reçoit');
  assert.ok(!isValidDefi(defi('genre-choisit', 'homme', 2, 'homme')), 'ne se désigne pas dans son propre genre');
  assert.ok(!isValidDefi({ texte: 'x', type: 'boire', n: 1, niveau: 'chill', genre: 'femme' }), 'un défi ordinaire n’a pas de genre');
});

test('cibles : seulement le genre visé ; les « ne préfère pas dire » ne sont jamais visés, ni comme acteurs ni comme receveurs', () => {
  const g = groupsFor(defi('genre-distribue', 'homme', 2, 'femme'), cast);
  assert.deepEqual(g.actors, ['H1', 'H2', 'H3']);
  assert.deepEqual(g.receivers, ['F1', 'F2', 'F3', 'F4']);
  for (const d of [defi('genre-boit', 'femme'), defi('genre-distribue', 'femme', 2, 'homme'), defi('genre-choisit', 'homme', 2, 'femme'), defi('genre-dernier', 'homme')]) {
    const r = draw(d);
    for (const id of ['N1', 'N2']) {
      assert.equal(isConcerned(r, id), false, `${id} épargné (${d.type})`);
      assert.ok(!r.groups.actors.includes(id) && !r.groups.receivers.includes(id));
      assert.match(applyRoueAction(r, id, { targetId: 'F1', yes: true }, ids).error, /ne te concerne pas/);
    }
  }
  assert.equal(isConcerned(draw(defi('genre-boit', 'femme')), 'H1'), false, 'les hommes ne sont pas concernés par « toutes les femmes boivent »');
  assert.equal(isConcerned(draw(defi('genre-boit', 'femme')), 'F1'), true);
});

test('défi sauté : un genre qui compte moins de 2 joueurs ne donne jamais de défi (ni comme acteur ni comme receveur)', () => {
  const oneWoman = [...cast.filter((p) => p.gender !== 'f'), { id: 'F1', gender: 'f' }];
  assert.equal(isEligible(defi('genre-boit', 'femme'), oneWoman), false);
  assert.equal(isEligible(defi('genre-boit', 'homme'), oneWoman), true);
  assert.equal(isEligible(defi('genre-distribue', 'homme', 2, 'femme'), oneWoman), false, 'une seule receveuse : sauté');
  assert.equal(isEligible(defi('genre-choisit', 'femme', 2, 'homme'), oneWoman), false, 'une seule actrice : sauté');
  assert.equal(isEligible(defi('genre-boit', 'femme'), cast.filter((p) => p.gender !== 'f')), false, 'aucune femme');
  assert.equal(isEligible({ texte: 'x', type: 'boire', n: 1, niveau: 'chill' }, []), true, 'les défis ordinaires restent toujours possibles');
});

test('« toutes les femmes boivent » : chacune n gorgées, personne d’autre', () => {
  const r = draw(defi('genre-boit', 'femme', 3));
  assert.deepEqual(sipsRoue(r), { F1: 3, F2: 3, F3: 3, F4: 3 });
  assert.equal(isRoueComplete(r, ids), true, 'rien à attendre : défi non interactif');
  assert.deepEqual(sipsRoue(draw(defi('genre-boit', 'homme', 1))), { H1: 1, H2: 1, H3: 1 });
});

test('« les hommes distribuent n gorgées chacun à des femmes » : choix de chacun, reste tiré au hasard parmi les femmes, total exact', () => {
  let r = draw(defi('genre-distribue', 'homme', 2, 'femme'));
  assert.match(applyRoueAction(r, 'F1', { targetId: 'F2' }, ids).error, /ne te concerne pas/, 'une receveuse ne distribue pas');
  assert.equal(applyRoueAction(r, 'H1', { targetId: 'H2' }, ids).error, 'Choix invalide.', 'on ne distribue qu’aux femmes');
  assert.equal(applyRoueAction(r, 'H1', { targetId: 'N1' }, ids).error, 'Choix invalide.', 'jamais à un « ne préfère pas dire »');
  r = act(r, 'H1', { targetId: 'F1' });
  r = act(r, 'H1', { targetId: 'F1' });
  assert.equal(applyRoueAction(r, 'H1', { targetId: 'F2' }, ids).error, 'Tout est déjà distribué.');
  r = act(r, 'H2', { targetId: 'F3' });
  assert.equal(isRoueComplete(r, ids), false, 'H2 n’a pas fini, H3 n’a rien donné');
  assert.equal(isRoueComplete(r, ['H1', 'F1']), true, 'seuls les hommes présents comptent (H1 seul a fini)');
  const settled = settleGendered(r, () => 0);
  const sips = sipsRoue(settled);
  assert.equal(total(sips), 3 * 2, 'chaque homme distribue exactement 2 gorgées');
  assert.ok(Object.keys(sips).every((id) => id.startsWith('F')), `que des femmes boivent : ${JSON.stringify(sips)}`);
  assert.ok(sips.F1 >= 2 && sips.F3 >= 1, 'ce que H1 et H2 ont choisi de donner est arrivé, plus les gorgées tirées au hasard');
});

test('« les femmes choisissent qui boit parmi les hommes » : la première à répondre décide, sans concertation ; sinon un homme au hasard', () => {
  let r = draw(defi('genre-choisit', 'femme', 3, 'homme'));
  assert.equal(applyRoueAction(r, 'F1', { targetId: 'F2' }, ids).error, 'Choix invalide.', 'on choisit parmi les hommes');
  assert.match(applyRoueAction(r, 'H1', { targetId: 'H2' }, ids).error, /ne te concerne pas/);
  r = act(r, 'F2', { targetId: 'H3' });
  assert.match(applyRoueAction(r, 'F1', { targetId: 'H1' }, ids).error, /déjà choisi/);
  assert.equal(isRoueComplete(r, ids), true);
  assert.deepEqual(sipsRoue(settleGendered(r)), { H3: 3 });
  const silent = draw(defi('genre-choisit', 'femme', 2, 'homme'));
  assert.equal(isRoueComplete(silent, ids), false);
  const out = sipsRoue(settleGendered(silent, () => 0.99));
  assert.deepEqual(Object.keys(out), ['H3'], 'sans réponse : un homme au hasard');
  assert.equal(out.H3, 2);
});

test('« le dernier à toucher son téléphone » : le dernier boit ; ceux qui n’ont pas touché boivent à sa place', () => {
  let r = draw(defi('genre-dernier', 'homme', 2));
  r = act(r, 'H2', {});
  r = act(r, 'H1', {});
  r = act(r, 'H2', {}); // double toucher : le premier compte
  assert.deepEqual(r.touches, { H2: 1, H1: 2 });
  assert.equal(isRoueComplete(r, ids), false);
  assert.deepEqual(sipsRoue(settleGendered(r)), { H3: 2 }, 'H3 n’a pas touché : il boit');
  r = act(r, 'H3', {});
  assert.equal(isRoueComplete(r, ids), true);
  assert.deepEqual(sipsRoue(settleGendered(r)), { H3: 2 }, 'tout le monde a touché : le dernier boit');
  const nobody = draw(defi('genre-dernier', 'femme', 1));
  assert.deepEqual(sipsRoue(settleGendered(nobody)), { F1: 1, F2: 1, F3: 1, F4: 1 }, 'personne n’a touché : toutes boivent');
  assert.equal(isRoueComplete(nobody, ['H1', 'N1']), true, 'aucune actrice présente : rien à attendre');
});

// ---------- Dans une vraie partie ----------

async function room(genders) {
  const ctx = await makeGame('roue', genders.map((_, i) => `J${i}`));
  ctx.players.forEach((p, i) => (p.gender = genders[i]));
  return ctx;
}

test('partie : le défi de genre n’est pas tiré sans assez de joueurs de ce genre, et l’est quand il y en a', async () => {
  const { game, players } = await room(['m', 'm', 'm', 'f', 'n', 'n']); // une seule femme
  const list = [defi('genre-boit', 'femme', 2), { texte: 'Bois.', type: 'boire', n: 1, niveau: 'chill' }];
  game.contentPool = () => ({ key: 'test', list });
  game.start();
  for (let i = 0; i < 20; i++) {
    game.reveal();
    assert.equal(game.results.defi.type, 'boire', 'une seule femme : le défi de genre est sauté');
    game.tick = null;
    game.phase = 'results';
    game.nextQuestion();
  }
  players[4].gender = 'f';
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    game.reveal();
    seen.add(game.results.defi.type);
    game.phase = 'results';
    game.nextQuestion();
  }
  assert.ok(seen.has('genre-boit'), 'deux femmes : le défi de genre revient');
});

test('partie : « toutes les femmes boivent » fait boire les femmes (comptées), épargne les autres', async () => {
  const { game, players, tick } = await room(['m', 'f', 'f', 'n', 'm', 'f']);
  game.contentPool = () => ({ key: 'test', list: [defi('genre-boit', 'femme', 2)] });
  game.start();
  game.reveal();
  tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  assert.equal(game.pending, false, 'non interactif : verdict tout de suite');
  assert.equal(players.find((p) => p.id === game.results.targetId).gender, 'f', 'la première roue s’arrête sur quelqu’un du genre visé');
  const women = players.filter((p) => p.gender === 'f');
  for (const p of players) assert.equal(game.sips.get(p.id) ?? 0, p.gender === 'f' ? 2 : 0, `${p.name} (${p.gender})`);
  assert.equal(women.length, 3);
  const state = game.publicState({ playerId: players[3].id });
  assert.deepEqual(state.results.groups.actors.sort(), women.map((p) => p.id).sort());
  assert.ok(!state.results.groups.actors.includes(players[3].id) && !state.results.groups.receivers.includes(players[3].id));
});

test('partie : « les hommes distribuent » : fenêtre de réponse, reste tiré au hasard à la fin, gorgées exactes', async () => {
  const { game, players, tick } = await room(['m', 'm', 'f', 'f', 'n', 'f']);
  game.contentPool = () => ({ key: 'test', list: [defi('genre-distribue', 'homme', 2, 'femme')] });
  game.start();
  game.reveal();
  tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  assert.equal(game.action(players[0].id, { targetId: players[2].id }), null);
  assert.equal(game.action(players[0].id, { targetId: players[2].id }), null);
  assert.equal(game.action(players[2].id, { targetId: players[3].id }), 'Ce défi ne te concerne pas.');
  assert.equal(game.action(players[4].id, { targetId: players[3].id }), 'Ce défi ne te concerne pas.', 'un « ne préfère pas dire » ne distribue pas');
  tick(30000);
  assert.equal(game.pending, false);
  const sips = [...game.sips.entries()];
  assert.equal(sips.reduce((n, [, k]) => n + k, 0), 4, '2 hommes × 2 gorgées');
  assert.ok(sips.every(([id]) => players.find((p) => p.id === id).gender === 'f'), 'seules des femmes ont bu');
  assert.ok(game.sips.get(players[2].id) >= 2, 'ce que H1 a donné est bien arrivé');
  assert.equal(game.sips.get(players[4].id) ?? 0, 0);
});

test('partie : « le dernier à toucher » : chacun touche, le dernier boit, fin dès que tous ont touché', async () => {
  const { game, players, tick } = await room(['f', 'f', 'f', 'm', 'm', 'n']);
  game.contentPool = () => ({ key: 'test', list: [defi('genre-dernier', 'femme', 1)] });
  game.start();
  game.reveal();
  tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  assert.equal(game.action(players[1].id, {}), null);
  assert.equal(game.action(players[0].id, {}), null);
  assert.equal(game.pending, true);
  assert.equal(game.action(players[2].id, {}), null);
  assert.equal(game.pending, false, 'tout le monde a touché : verdict immédiat');
  assert.equal(game.sips.get(players[2].id), 1, 'la dernière à toucher boit');
  assert.equal(game.sips.size, 1);
});
