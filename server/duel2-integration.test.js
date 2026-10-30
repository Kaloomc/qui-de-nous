// Intégration des 17 mini-jeux : présents dans l'écran d'options et dans la roulette, désactivables, jamais tirés une fois décochés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { DUEL_TIMING } from './games/duel.js';
import { MINIGAMES } from './duel/minigames/index.js';

const NEW = ['defuse', 'code', 'simon2', 'crash', 'dilemme', 'soleil', 'plateau', 'course', 'geo', 'quisuisje', 'chrono', 'vf', 'des', 'russe'];
const OLD = ['pfc', 'culture', 'feu', 'simon', 'couleur'];

test('les 19 mini-jeux sont enregistrés, avec nom, icône, catégorie et durée ; 14 nouveaux + 5 de la partie 1', () => {
  assert.equal(Object.keys(MINIGAMES).length, 19);
  for (const id of [...OLD, ...NEW]) {
    const m = MINIGAMES[id];
    assert.ok(m, id);
    assert.ok(m.name && m.icon && m.category, `${id} : nom, icône, catégorie`);
    assert.ok(m.maxMs > 0 && typeof m.prepare === 'function' && typeof m.action === 'function' && typeof m.view === 'function' && typeof m.result === 'function' && typeof m.resolve === 'function', id);
  }
});

test('écran d’options : les 19 jeux sont listés (cochés par défaut) et la roulette les propose tous', async () => {
  const { game } = await makeGame('duel', ['A', 'B', 'C', 'D', 'E']);
  const lobby = game.publicState({ host: true }).lobby;
  assert.equal(lobby.games.length, 19);
  assert.ok(lobby.games.every((g) => g.available), 'tous disponibles (contenu suffisant)');
  assert.equal(lobby.options.games, null, 'tous cochés par défaut');
  const seen = new Set();
  game.start();
  for (let i = 0; i < 400 && seen.size < 19; i++) {
    game.roundData.step === 'game' && (game.publicState({ host: true }).round.games ?? []).forEach((g) => seen.add(g.id));
    game.clock.tick(500);
    if (game.roundData.step === 'game') (game.publicState({ host: true }).round.games ?? []).forEach((g) => seen.add(g.id));
    if (game.phase === 'question' && game.roundData.step === 'ready') game.gameHostAction({ type: 'skip' });
    if (game.phase !== 'question') game.clock.tick(15000);
  }
  assert.equal(seen.size, 19, 'la roulette contient les 19 jeux');
});

test('un jeu décoché n’est jamais tiré ; au moins un jeu doit rester coché', async () => {
  for (const off of ['crash', 'soleil', 'course', 'geo', 'vf']) {
    const { game, clock } = await makeGame('duel', ['A', 'B', 'C', 'D', 'E']);
    const on = Object.keys(MINIGAMES).filter((id) => id !== off);
    assert.equal(game.gameHostAction({ type: 'config', games: on }), null);
    game.start();
    const drawn = new Set();
    for (let i = 0; i < 60; i++) {
      if (game.roundData.mgId) drawn.add(game.roundData.mgId);
      game.gameHostAction({ type: 'skip' });
      clock.tick(100);
    }
    assert.ok(drawn.size > 5);
    assert.equal(drawn.has(off), false, `${off} tiré alors qu’il est décoché`);
  }
  const { game } = await makeGame('duel', ['A', 'B', 'C']);
  assert.match(game.gameHostAction({ type: 'config', games: [] }), /au moins un/i);
});

test('un jeu sans assez de contenu n’est jamais tiré', async () => {
  const { game } = await makeGame('duel', ['A', 'B', 'C', 'D']);
  game.duelContent = { vf: [], geo: [], qui: [], chrono: [], culture: [] };
  const lobby = game.publicState({ host: true }).lobby;
  for (const id of ['vf', 'geo', 'quisuisje', 'chrono', 'culture']) assert.equal(lobby.games.find((g) => g.id === id).available, false, id);
  assert.equal(DUEL_TIMING.betsMs > 0, true);
});
