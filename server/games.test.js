import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GAME, GAME_CATALOG } from '../shared/games.js';
import { GAMES, GAME_RULES, isPlayable } from './games/index.js';
import { Game } from './gameStore.js';

test('catalogue : ids uniques et fiche complète pour chaque jeu', () => {
  const ids = GAME_CATALOG.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GAME_CATALOG) {
    for (const key of ['id', 'name', 'icon', 'tagline', 'rule']) assert.ok(typeof g[key] === 'string' && g[key], `${g.id}.${key}`);
    assert.ok(g.players.min >= 2 && g.players.max >= g.players.min, `${g.id}.players`);
    assert.equal(typeof g.available, 'boolean');
  }
  assert.ok(isPlayable(DEFAULT_GAME));
});

test('jeux disponibles : ils ont tous leurs règles, et toute règle correspond à un jeu disponible', () => {
  const available = GAME_CATALOG.filter((g) => g.available).map((g) => g.id);
  assert.deepEqual(available.sort(), Object.keys(GAME_RULES).sort());
  for (const id of available) {
    const rules = GAMES[id];
    assert.ok(isPlayable(id));
    assert.ok(rules.questions.length > 0);
    for (const fn of ['isValidVote', 'computeResults', 'sipsOf']) assert.equal(typeof rules[fn], 'function', `${id}.${fn}`);
    assert.ok(rules.revealMs > 0);
  }
});

test('jeux « Bientôt » : visibles dans le catalogue mais pas lançables', () => {
  const soon = GAME_CATALOG.filter((g) => !g.available);
  assert.ok(soon.length >= 2);
  const game = new Game('SOON');
  for (const g of soon) {
    assert.equal(isPlayable(g.id), false);
    assert.equal(game.pickGame(g.id), 'Ce jeu arrive bientôt !');
    assert.equal(new Game('X', g.id).phase, 'picking', 'création directe refusée');
  }
  assert.equal(game.pickGame('n-importe-quoi'), 'Jeu inconnu.');
  assert.equal(game.pickGame('__proto__'), 'Jeu inconnu.');
  assert.equal(game.phase, 'picking');
  assert.equal(game.mode, null);
});

test('déroulé : grille → choix → lobby, impossible de lancer sans jeu', () => {
  const game = new Game('PICK');
  assert.equal(game.phase, 'picking');
  for (const name of ['A', 'B']) game.upsertPlayer({ name });
  assert.equal(game.start(), 'Choisis d’abord un jeu.');
  assert.equal(game.publicState().mode, null);
  assert.equal(game.pickGame('tu-preferes'), null);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.pickGame('qui-de-nous'), null, 'on peut encore changer d’avis dans le lobby');
  assert.equal(game.mode, 'qui-de-nous');
  assert.equal(game.start(), null);
  assert.equal(game.chooseGame(), 'Termine la partie avant de changer de jeu.');
  assert.equal(game.pickGame('tu-preferes'), 'Termine la partie avant de changer de jeu.');
});

test('changer de jeu en fin de partie garde les joueurs et les réglages, remet le reste à zéro', () => {
  const game = new Game('SWAP', 'qui-de-nous');
  const players = ['A', 'B', 'C'].map((name) => game.upsertPlayer({ name }).player);
  game.setSettings({ auto: true, resultsMs: 5000 });
  game.start();
  players.forEach((p) => game.vote(p.id, players[0].id));
  game.reveal(1);
  game.finishReveal();
  assert.ok(game.sips.size > 0);
  game.end();

  assert.equal(game.chooseGame(), null);
  assert.equal(game.phase, 'picking');
  assert.equal(game.players.size, 3, 'personne n’a à rescanner');
  assert.equal(game.settings.auto, true);
  assert.equal(game.round, 0);
  assert.equal(game.sips.size, 0);

  assert.equal(game.pickGame('tu-preferes'), null);
  assert.equal(game.start(), null);
  assert.ok(game.publicState().round.a, 'question du nouveau jeu');
});
