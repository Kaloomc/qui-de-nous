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

test('Estimation : le plus proche parti pendant le suspense ne casse pas les statistiques', () => {
  assert.doesNotThrow(() => GAMES.estimation.updateStats({}, { closestIds: ['parti'] }));
});
