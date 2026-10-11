import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partyGames } from './games/index.js';
import { buildProgram, eligibleGames, pickNextBlock, RHYTHMS, TRANSITION_MS } from './party.js';
import { makeGame } from './testClock.js';

const GAMES = partyGames();
const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));
const MIN = 60 * 1000;

test('programme : seuls les jeux dont le minimum de joueurs est atteint', () => {
  const two = buildProgram(GAMES, 2, { length: 12 });
  assert.ok(two.length === 12);
  for (const block of two) assert.ok(byId[block.mode].minToStart <= 2, `${block.mode} demande plus de 2 joueurs`);
  assert.ok(!two.some((b) => ['imposteur', 'patate', 'qui-me-connait'].includes(b.mode)));
  assert.deepEqual(buildProgram(GAMES, 1), []);
  // Avec assez de monde, tous les jeux finissent par passer.
  const six = buildProgram(GAMES, 6, { length: 16 });
  assert.equal(new Set(six.map((b) => b.mode)).size, GAMES.filter((g) => g.playable).length);
});

test('programme : les rythmes alternent, jamais deux fois le même jeu de suite, 3 à 5 manches (2 à 3 pour l’Imposteur)', () => {
  for (let n = 0; n < 20; n++) {
    const program = buildProgram(GAMES, 6, { length: 9 });
    program.forEach((block, i) => {
      const [min, max] = byId[block.mode].partyRounds ?? [3, 5];
      assert.ok(block.rounds >= min && block.rounds <= max);
      if (i === 0) return;
      const prev = program[i - 1];
      assert.notEqual(block.mode, prev.mode);
      const expected = RHYTHMS[(RHYTHMS.indexOf(byId[prev.mode].rhythm) + 1) % RHYTHMS.length];
      assert.equal(byId[block.mode].rhythm, expected);
    });
  }
});

test('programme : jeux cochés uniquement, un seul jeu coché se répète', () => {
  const program = buildProgram(GAMES, 5, { included: ['roue', 'tu-preferes'], length: 6 });
  assert.deepEqual([...new Set(program.map((b) => b.mode))].sort(), ['roue', 'tu-preferes']);
  assert.deepEqual(buildProgram(GAMES, 5, { included: ['roue'], length: 3 }).map((b) => b.mode), ['roue', 'roue', 'roue']);
  assert.deepEqual(eligibleGames(GAMES, 5, []), []);
  assert.equal(pickNextBlock([], []), null);
});

// ---------- Moteur ----------

const choiceFor = (game, players) => (game.mode === 'tu-preferes' ? 'a' : players[0].id);
// À « Tu préfères ? », le premier joueur est seul dans son camp : quelqu'un boit à chaque manche.
const voteAll = (game, players) => {
  for (const p of players) if (!game.isLate(p.id)) game.vote(p.id, p === players[0] && game.mode === 'tu-preferes' ? 'b' : choiceFor(game, players));
};

/** Joue une manche de vote jusqu'aux résultats, puis laisse passer le minuteur des résultats. */
function playRound(game, players, tick) {
  assert.equal(game.phase, 'question');
  voteAll(game, players);
  tick(1200 + game.rules.revealMs + 1);
  assert.equal(game.phase, 'results');
  tick(game.settings.resultsMs);
}

async function startParty(names = ['A', 'B', 'C'], options = {}) {
  const t = await makeGame(null, names);
  const error = t.game.startParty({ durationMs: 30 * MIN, games: ['qui-de-nous', 'tu-preferes'], ...options });
  assert.equal(error, null);
  return t;
}

test('mode soirée : transition, manches en auto, puis passage tout seul au jeu suivant', async () => {
  const { game, players, tick } = await startParty();
  assert.equal(game.settings.auto, true);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.party.step, 'transition');
  const first = game.mode;
  const rounds = game.party.block.rounds;
  tick(TRANSITION_MS);
  assert.equal(game.phase, 'question');
  for (let i = 1; i <= rounds; i++) {
    assert.equal(game.round, i);
    playRound(game, players, tick);
  }
  assert.equal(game.phase, 'lobby');
  assert.equal(game.party.step, 'transition');
  assert.notEqual(game.mode, first);
  tick(TRANSITION_MS);
  assert.equal(game.phase, 'question');
  assert.equal(game.round, 1);
});

test('mode soirée : les gorgées de la soirée suivent d’un jeu à l’autre', async () => {
  const { game, players, tick } = await startParty();
  tick(TRANSITION_MS);
  const rounds = game.party.block.rounds;
  for (let i = 0; i < rounds; i++) playRound(game, players, tick);
  const before = game.publicState().sips;
  assert.ok(Object.values(before).reduce((a, b) => a + b, 0) > 0);
  assert.equal(game.party.step, 'transition');
  assert.deepEqual(game.publicState().gameSips, {});
  assert.deepEqual(game.publicState().sips, before);
});

test('mode soirée : pause et reprise gèlent la transition et le temps de la soirée', async () => {
  const { game, tick } = await startParty();
  tick(2000);
  game.pause();
  const left = game.partyState().clock.remainingMs;
  tick(60000);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.partyState().clock.remainingMs, left);
  assert.equal(game.partyState().transitionTimer.paused, true);
  game.resume();
  tick(TRANSITION_MS - 2000);
  assert.equal(game.phase, 'question');
});

test('mode soirée : la fin du temps attend la fin de la manche, puis termine proprement', async () => {
  const { game, players, tick } = await startParty(['A', 'B', 'C'], { games: ['qui-de-nous'] });
  tick(TRANSITION_MS);
  // Personne ne vote : le minuteur de vote (forcé à 30 s en soirée) fait avancer les manches.
  tick(30 * MIN - TRANSITION_MS - 15000);
  while (game.phase !== 'question') tick(500);
  voteAll(game, players.slice(1)); // manche en cours au moment où le temps s'écoule
  while (!game.partyTimeUp) tick(500);
  assert.notEqual(game.phase, 'ended');
  tick(60000);
  assert.equal(game.phase, 'ended');
  assert.equal(game.party.step, 'over');
  assert.equal(game.settings.auto, false);
  assert.equal(game.settings.voteMs, 0);
});

test('mode soirée : « Terminer la soirée » pendant une manche attend sa fin, un 2e appui termine tout de suite', async () => {
  const { game, players, tick } = await startParty();
  tick(TRANSITION_MS);
  game.endParty();
  assert.equal(game.phase, 'question');
  assert.equal(game.party.ending, true);
  playRound(game, players, tick);
  assert.equal(game.phase, 'ended');

  const again = await startParty();
  again.tick(TRANSITION_MS);
  again.game.endParty();
  again.game.endParty();
  assert.equal(again.game.phase, 'ended');
});

test('mode soirée : « Jeu suivant » pendant une manche attend la fin de la manche', async () => {
  const { game, players, tick } = await startParty();
  tick(TRANSITION_MS);
  const first = game.mode;
  game.skipPartyGame();
  assert.equal(game.phase, 'question');
  playRound(game, players, tick);
  assert.equal(game.phase, 'lobby');
  assert.notEqual(game.mode, first);
});

test('mode soirée : un retardataire attend la manche suivante sans casser celle en cours', async () => {
  const { game, players, tick } = await startParty();
  tick(TRANSITION_MS);
  const { player: late } = game.upsertPlayer({ name: 'Zoé' });
  game.connectPlayer(late, 'late');
  assert.ok(game.publicState().party.lateIds.includes(late.id));
  assert.equal(game.vote(late.id, choiceFor(game, players)), 'Tu joues dès la prochaine manche.');
  voteAll(game, players);
  tick(1200 + game.rules.revealMs + 1);
  assert.equal(game.phase, 'results');
  assert.ok(!game.results.participantIds.includes(late.id));
  tick(game.settings.resultsMs);
  assert.equal(game.isLate(late.id), false);
  if (game.phase === 'question') assert.equal(game.vote(late.id, choiceFor(game, players)), null);
});

test('mode soirée : refusé sans assez de joueurs, et le moteur bloque les changements de jeu pendant la soirée', async () => {
  const { game } = await makeGame(null, ['A']);
  assert.match(game.startParty({ durationMs: 0 }), /Pas assez de joueurs/);
  assert.match(game.startParty({ durationMs: 123 }), /Durée invalide/);
  const t = await startParty();
  assert.ok(t.game.pickGame('roue'));
  assert.ok(t.game.chooseGame());
  assert.equal(t.game.setSettings({ auto: false }), 'Réglage invalide.');
  assert.equal(t.game.settings.auto, true);
});

test('mode soirée : sans assez de joueurs connectés, la soirée attend puis repart à leur retour', async () => {
  const { game, players, tick } = await startParty();
  game.disconnectPlayer(players[1], 's1');
  game.disconnectPlayer(players[2], 's2');
  game.skipPartyGame();
  assert.equal(game.party.step, 'waiting');
  tick(20000);
  assert.equal(game.party.step, 'waiting');
  game.connectPlayer(players[1], 's1b');
  tick(5000);
  assert.equal(game.party.step, 'transition');
  assert.ok(game.publicState({ host: true }).party.transitionTimer);
});
