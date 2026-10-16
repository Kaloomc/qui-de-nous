import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './gameStore.js';

const clock = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };

/** Partie avec des joueurs connectés (un socket chacun). */
function setup(names = ['Ana', 'Ben', 'Chloé'], mode = 'qui-de-nous') {
  const game = new Game('TEST', mode, { clock });
  const ids = names.map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player.id;
  });
  return { game, ids };
}

test('mode 18+ : actif seulement quand tous les joueurs connectés ont confirmé', () => {
  const { game, ids } = setup();
  assert.equal(game.requestAdult(), null);
  assert.equal(game.adultActive, false);
  game.answerAdult(ids[0], true);
  game.answerAdult(ids[1], true);
  assert.equal(game.adultActive, false, 'un joueur n’a pas encore répondu');
  assert.equal(game.publicState({ host: true }).adult.pending, true);
  game.answerAdult(ids[2], true);
  assert.equal(game.adultActive, true);
  assert.equal(game.publicState({ playerId: ids[0] }).adult.active, true);
});

test('mode 18+ : un « non » bloque, retirer le joueur débloque, et il n’est jamais mis dans une manche 18+', () => {
  const { game, ids } = setup();
  game.requestAdult();
  game.answerAdult(ids[0], true);
  game.answerAdult(ids[1], true);
  game.answerAdult(ids[2], false);
  assert.equal(game.adultActive, false);
  assert.deepEqual(game.publicState({ host: true }).adult.refusedIds, [ids[2]]);
  assert.match(game.start(), /18\+/, 'on ne lance pas une partie pendant la demande');
  game.removePlayer(ids[2]);
  assert.equal(game.adultActive, true);
  assert.ok(!game.players.has(ids[2]));
});

test('mode 18+ : l’hôte peut annuler la demande, puis le désactiver à tout moment', () => {
  const { game, ids } = setup(['Ana', 'Ben']);
  game.requestAdult();
  game.answerAdult(ids[0], false);
  game.cancelAdult();
  assert.equal(game.publicState({ host: true }).adult.pending, false);
  assert.equal(game.adultActive, false);

  game.requestAdult();
  ids.forEach((id) => game.answerAdult(id, true));
  assert.equal(game.adultActive, true);
  game.start();
  assert.equal(game.phase, 'question');
  game.disableAdult();
  assert.equal(game.adultActive, false);
  assert.equal(game.phase, 'lobby', 'la manche 18+ en cours est abandonnée');
  assert.equal(game.publicState({ playerId: ids[0] }).adult.active, false);
});

test('mode 18+ : un joueur qui arrive après l’activation confirme avant de voir quoi que ce soit, ou ne rejoint pas', () => {
  const { game, ids } = setup(['Ana', 'Ben']);
  game.requestAdult();
  ids.forEach((id) => game.answerAdult(id, true));
  game.start();
  const late = game.upsertPlayer({ name: 'Retard' }).player;
  game.connectPlayer(late, 'late');
  const seen = game.publicState({ playerId: late.id });
  assert.equal(seen.adult.gate, true);
  assert.equal(seen.adult.active, false, 'pas de thème 18+ avant confirmation');
  assert.equal(seen.round, null, 'aucune question 18+ avant confirmation');
  assert.ok(game.vote(late.id, ids[0]), 'il ne peut pas voter');
  assert.equal(game.adultActive, true, 'les autres restent en mode 18+');

  const other = game.upsertPlayer({ name: 'Non merci' }).player;
  game.connectPlayer(other, 'other');
  assert.deepEqual(game.answerAdult(other.id, false), { removed: true });
  assert.ok(!game.players.has(other.id));

  game.answerAdult(late.id, true);
  assert.ok(game.publicState({ playerId: late.id }).round);
});

test('mode 18+ : un joueur qui ne répond pas et se déconnecte ne bloque plus, celui qui revient garde sa confirmation', () => {
  const { game, ids } = setup();
  game.requestAdult();
  game.answerAdult(ids[0], true);
  game.answerAdult(ids[1], true);
  game.disconnectPlayer(game.players.get(ids[2]), 's2');
  assert.equal(game.adultActive, true);
  // Il revient sans avoir confirmé : écran de confirmation.
  game.connectPlayer(game.players.get(ids[2]), 's2b');
  assert.equal(game.publicState({ playerId: ids[2] }).adult.gate, true);
  // Un joueur qui avait confirmé et se reconnecte n'a rien à refaire.
  game.disconnectPlayer(game.players.get(ids[0]), 's0');
  game.connectPlayer(game.players.get(ids[0]), 's0b');
  assert.equal(game.publicState({ playerId: ids[0] }).adult.active, true);
});

test('mode 18+ : persiste quand on change de jeu ou qu’on rejoue', () => {
  const { game, ids } = setup();
  game.requestAdult();
  ids.forEach((id) => game.answerAdult(id, true));
  game.end();
  game.restart('tu-preferes');
  assert.equal(game.adultActive, true);
  game.chooseGame();
  game.pickGame('roue');
  assert.equal(game.adultActive, true);
});

// ---------- Étanchéité entre le mode normal et le mode 18+ ----------

const WITH_ADULT_CONTENT = ['qui-de-nous', 'tu-preferes', 'qui-me-connait', 'imposteur'];
const activate = (game, ids) => {
  game.requestAdult();
  ids.forEach((id) => game.answerAdult(id, true));
};

test('mode normal : jamais une question 18+, sur des centaines de tirages', () => {
  for (const mode of WITH_ADULT_CONTENT) {
    const { game } = setup(['Ana', 'Ben', 'Chloé'], mode);
    for (let i = 0; i < 600; i++) assert.notEqual(game.drawQuestion()?.adulte, true, `${mode} : contenu 18+ en mode normal`);
  }
  const { game } = setup(['Ana', 'Ben', 'Chloé'], 'roue');
  for (let i = 0; i < 300; i++) assert.notEqual(game.rules.computeResults([...game.players.keys()], new Map(), game).defi.adulte, true);
});

test('mode 18+ : uniquement le contenu 18+ des jeux qui en ont, le contenu normal pour les autres', () => {
  for (const mode of WITH_ADULT_CONTENT) {
    const { game, ids } = setup(['Ana', 'Ben', 'Chloé'], mode);
    activate(game, ids);
    for (let i = 0; i < 200; i++) assert.equal(game.drawQuestion()?.adulte, true, `${mode} : contenu normal en mode 18+`);
  }
  const roue = setup(['Ana', 'Ben', 'Chloé'], 'roue');
  activate(roue.game, roue.ids);
  for (let i = 0; i < 100; i++) assert.equal(roue.game.rules.computeResults(roue.ids, new Map(), roue.game).defi.adulte, true);
  const estimation = setup(['Ana', 'Ben'], 'estimation');
  activate(estimation.game, estimation.ids);
  assert.ok(estimation.game.drawQuestion().question, 'Estimation garde son contenu normal');
});

test('mode 18+ : anti-répétition propre au contenu 18+ (toute la liste avant de revoir une question)', () => {
  const { game, ids } = setup(['Ana', 'Ben', 'Chloé']);
  activate(game, ids);
  const total = game.rules.adultQuestions.length;
  const seen = new Set();
  for (let i = 0; i < total; i++) seen.add(game.drawQuestion().text);
  assert.equal(seen.size, total);
});

test('mode soirée en 18+ : les manches tirent le contenu 18+ ; retour au normal = plus aucun contenu 18+', () => {
  const { game, ids } = setup(['Ana', 'Ben', 'Chloé', 'Dan']);
  activate(game, ids);
  game.chooseGame();
  assert.equal(game.startParty({ durationMs: 0, games: ['qui-de-nous', 'tu-preferes'] }), null);
  game.partyStartBlock();
  assert.equal(game.phase, 'question');
  assert.equal(game.question.adulte, true);
  game.disableAdult();
  assert.equal(game.adultActive, false);
  game.partyStartBlock();
  assert.notEqual(game.question?.adulte, true);
});

test('thème 18+ jamais envoyé sans activation validée', () => {
  const { game, ids } = setup(['Ana', 'Ben']);
  game.requestAdult();
  game.answerAdult(ids[0], true);
  for (const viewer of [{ host: true }, { playerId: ids[0] }, { playerId: ids[1] }]) assert.equal(game.publicState(viewer).adult.active, false);
});
