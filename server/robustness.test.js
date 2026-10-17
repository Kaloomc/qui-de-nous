import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAX_PLAYERS } from './gameStore.js';
import { GAMES } from './games/index.js';

const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

test('photo : le vrai type du fichier est vérifié, pas seulement l’en-tête', () => {
  const game = new Game('TEST', 'qui-de-nous');
  assert.ok(game.upsertPlayer({ name: 'Faux', photo: dataUrl('image/png', 'pas une image') }).error);
  assert.ok(game.upsertPlayer({ name: 'Vrai', photo: dataUrl('image/png', [0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) }).player);
  assert.ok(game.upsertPlayer({ name: 'Jpeg', photo: dataUrl('image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 1]) }).player);
});

test('prénom nettoyé des caractères invisibles, partie plafonnée', () => {
  const game = new Game('TEST', 'qui-de-nous');
  assert.equal(game.upsertPlayer({ name: '‮Ana\u0007' }).player.name, 'Ana');
  for (let i = game.players.size; i < MAX_PLAYERS; i++) assert.ok(game.upsertPlayer({ name: `J${i}` }).player);
  assert.match(game.upsertPlayer({ name: 'De trop' }).error, /complète/);
});

test('une erreur dans un minuteur ne fait pas tomber le serveur', () => {
  const pending = [];
  const clock = { now: () => 0, setTimeout: (fn) => pending.push(fn), clearTimeout: () => {} };
  const game = new Game('TEST', 'qui-de-nous', { clock });
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    game.schedule('boom', 10, () => {
      throw new Error('panne');
    });
    assert.doesNotThrow(() => pending[0]());
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
});

test('joueur arrivé pendant les résultats : il n’apparaît pas parmi les joueurs de la manche', () => {
  const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
  const game = new Game('TEST', 'qui-de-nous', { clock });
  const ids = ['A', 'B', 'C'].map((name) => game.upsertPlayer({ name }).player.id);
  ids.forEach((id, i) => game.connectPlayer(game.players.get(id), `s${i}`));
  game.start();
  game.vote(ids[0], ids[1]);
  game.reveal();
  game.finishReveal();
  const late = game.upsertPlayer({ name: 'Retard' }).player;
  const state = game.publicState({ playerId: late.id });
  assert.deepEqual(state.roundPlayerIds, ids);
  assert.ok(!state.roundPlayerIds.includes(late.id));
});

test('Estimation : le plus proche parti pendant le suspense ne casse pas les statistiques', () => {
  assert.doesNotThrow(() => GAMES.estimation.updateStats({}, { closestIds: ['parti'] }));
});

// ---------- Changements de jeu et manches : identifiant unique, minuteurs, dernier choix ----------

const fakeClock = () => {
  const pending = [];
  let nextId = 1;
  return { pending, now: () => 0, setTimeout: (fn) => (pending.push({ fn, id: nextId }), nextId++), clearTimeout: () => {} };
};

function playing(mode = 'qui-de-nous', clock = fakeClock()) {
  const game = new Game('TEST', mode, { clock });
  const ids = ['A', 'B', 'C'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player.id;
  });
  return { game, ids, clock };
}

test('manche : identifiant unique dans toute la partie, un vote d’une manche passée est ignoré', () => {
  const { game, ids } = playing();
  game.start();
  const first = game.roundId;
  game.end();
  game.chooseGame();
  game.pickGame('qui-de-nous');
  game.start();
  assert.equal(game.round, 1, 'le numéro de manche repart à 1');
  assert.notEqual(game.roundId, first, 'mais l’identifiant, jamais');
  assert.match(game.vote(ids[0], ids[1], first), /terminée/);
  assert.equal(game.votes.size, 0);
  assert.equal(game.vote(ids[0], ids[1], game.roundId), null);
  assert.equal(game.reveal(first), null, 'clic « Révéler » d’une ancienne manche : ignoré');
  assert.equal(game.phase, 'question');
});

test('minuteur annulé ou d’un jeu quitté : il ne se déclenche jamais', () => {
  const { game, clock } = playing();
  let fired = 0;
  game.schedule('test', 1000, () => (fired += 1));
  game.cancel('test');
  clock.pending.at(-1).fn();
  game.schedule('test2', 1000, () => (fired += 1));
  game.pickGame('tu-preferes'); // changement de jeu : nouvelle session
  clock.pending.at(-1).fn();
  assert.equal(fired, 0);
});

test('changements de jeu en rafale : le dernier gagne, un jeu inconnu est refusé sans rien changer', () => {
  const { game } = playing();
  for (const mode of ['tu-preferes', 'roue', 'imposteur', 'estimation']) assert.equal(game.pickGame(mode), null);
  assert.equal(game.mode, 'estimation');
  assert.ok(game.pickGame('jeu-inconnu'));
  assert.ok(game.pickGame(undefined));
  assert.equal(game.mode, 'estimation');
});
