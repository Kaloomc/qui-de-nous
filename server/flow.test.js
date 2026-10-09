import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, TIMING } from './gameStore.js';
import { MODES } from './modes.js';

/** Horloge simulée : les minuteurs ne s'exécutent que quand on avance le temps avec tick(). */
class FakeClock {
  t = 1_000_000;
  timers = new Map();
  seq = 0;
  now() {
    return this.t;
  }
  setTimeout(fn, ms) {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(id) {
    this.timers.delete(id);
  }
  tick(ms) {
    const end = this.t + ms;
    for (;;) {
      let next = null;
      for (const [id, timer] of this.timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

const QDN_REVEAL = MODES['qui-de-nous'].revealMs;

function setup({ players = 3, settings = {}, mode = 'qui-de-nous' } = {}) {
  const clock = new FakeClock();
  let changes = 0;
  const game = new Game('TEST', mode, { clock, onChange: () => (changes += 1) });
  const ps = [];
  for (let i = 0; i < players; i++) {
    const { player } = game.upsertPlayer({ name: `J${i}` });
    game.connectPlayer(player, `socket-${i}`);
    ps.push(player);
  }
  game.setSettings({ auto: true, ...settings });
  assert.equal(game.start(), null);
  return { game, clock, ps, changes: () => changes };
}

const voteAll = (game, ps, target = ps[0].id) => ps.forEach((p) => game.vote(p.id, target));

test('mode auto : tous les connectés ont voté → révélation, puis résultats synchronisés', () => {
  const { game, clock, ps } = setup();
  voteAll(game, ps.slice(0, 2));
  clock.tick(10_000);
  assert.equal(game.phase, 'question', 'un joueur n’a pas voté');

  game.vote(ps[2].id, ps[0].id);
  assert.equal(game.phase, 'question', 'petit délai avant de révéler');
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.publicState(false).results, null, 'téléphones : pas de spoiler');
  assert.ok(game.publicState(true).results, 'TV : résultats pour animer');

  clock.tick(QDN_REVEAL);
  assert.equal(game.phase, 'results');
  assert.ok(game.publicState(false).results);
});

test('mode auto : question suivante après le temps réglé', () => {
  const { game, clock, ps } = setup({ settings: { resultsMs: 5000 } });
  voteAll(game, ps);
  clock.tick(TIMING.autoRevealDelayMs + QDN_REVEAL);
  assert.equal(game.phase, 'results');
  assert.ok(game.publicState().nextTimer);
  clock.tick(4999);
  assert.equal(game.phase, 'results');
  clock.tick(1);
  assert.equal(game.phase, 'question');
  assert.equal(game.round, 2);
});

test('mode manuel : rien d’automatique', () => {
  const { game, clock, ps } = setup({ settings: { auto: false } });
  voteAll(game, ps);
  clock.tick(60_000);
  assert.equal(game.phase, 'question');
  game.reveal(1);
  clock.tick(60_000);
  assert.equal(game.phase, 'results');
  assert.equal(game.round, 1);
});

test('déconnexion pendant le vote : attendu pendant le délai de grâce, puis ignoré', () => {
  const { game, clock, ps } = setup();
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[1].id);
  game.disconnectPlayer(ps[2], 'socket-2');
  clock.tick(TIMING.disconnectGraceMs - 100);
  assert.equal(game.phase, 'question', 'encore dans le délai de grâce');
  clock.tick(100 + TIMING.autoRevealDelayMs + 10);
  assert.equal(game.phase, 'revealing');
  assert.deepEqual(game.results.nonVoterIds, [ps[2].id], 'le déconnecté compte comme non-votant');
});

test('reconnexion pendant le vote : il peut voter et la révélation l’attend', () => {
  const { game, clock, ps } = setup();
  game.disconnectPlayer(ps[2], 'socket-2');
  clock.tick(1000);
  game.connectPlayer(ps[2], 'socket-2b');
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[1].id);
  clock.tick(30_000);
  assert.equal(game.phase, 'question');
  assert.equal(game.vote(ps[2].id, ps[1].id), null);
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
});

test('un joueur qui arrive juste après le dernier vote annule la révélation prévue', () => {
  const { game, clock, ps } = setup();
  voteAll(game, ps);
  clock.tick(TIMING.autoRevealDelayMs / 2);
  const { player } = game.upsertPlayer({ name: 'Retard' });
  game.connectPlayer(player, 'socket-late');
  clock.tick(10_000);
  assert.equal(game.phase, 'question');
  game.vote(player.id, ps[0].id);
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
});

test('changer son vote ne déclenche rien de plus et compte une seule fois', () => {
  const { game, clock, ps } = setup();
  voteAll(game, ps, ps[0].id);
  game.vote(ps[2].id, ps[1].id);
  game.vote(ps[2].id, ps[0].id);
  game.vote(ps[2].id, ps[1].id);
  assert.equal(game.publicState().votedIds.length, 3);
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.results.counts[ps[1].id], 1);
  assert.equal(game.results.counts[ps[0].id], 2);
});

test('moins de 2 joueurs connectés : aucun déclenchement automatique', () => {
  const { game, clock, ps } = setup({ settings: { voteMs: 15000 } });
  game.disconnectPlayer(ps[1], 'socket-1');
  game.disconnectPlayer(ps[2], 'socket-2');
  game.vote(ps[0].id, ps[0].id);
  clock.tick(60_000);
  assert.equal(game.phase, 'question', 'ni auto-révélation ni fin de minuteur');
  assert.equal(game.publicState().waitingForPlayers, true);

  game.connectPlayer(ps[1], 'socket-1b');
  game.vote(ps[1].id, ps[0].id);
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
});

test('pause : gèle le minuteur de vote et la question suivante', () => {
  const { game, clock, ps } = setup({ settings: { voteMs: 15000, resultsMs: 10000 } });
  clock.tick(5000);
  game.pause();
  voteAll(game, ps);
  clock.tick(120_000);
  assert.equal(game.phase, 'question', 'en pause : ni révélation auto ni fin de minuteur');
  assert.deepEqual(game.publicState().voteTimer, { remainingMs: 10000, totalMs: 15000, paused: true });

  game.resume();
  clock.tick(TIMING.autoRevealDelayMs + QDN_REVEAL);
  assert.equal(game.phase, 'results');
  clock.tick(3000);
  game.pause();
  clock.tick(60_000);
  assert.equal(game.phase, 'results');
  game.resume();
  clock.tick(6999);
  assert.equal(game.phase, 'results');
  clock.tick(1);
  assert.equal(game.phase, 'question');
});

test('doublons : clic hôte et minuteur au même moment → une seule révélation, une seule question suivante', () => {
  const { game, clock, ps } = setup({ settings: { resultsMs: 5000 } });
  voteAll(game, ps);
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
  const results = game.results;
  assert.equal(game.reveal(1), null, 'clic « Révéler » en retard : ignoré sans erreur');
  assert.equal(game.results, results);

  clock.tick(QDN_REVEAL + 5000);
  assert.equal(game.round, 2);
  assert.equal(game.nextQuestion(1), null, 'clic « Question suivante » en retard : ignoré');
  assert.equal(game.round, 2);
  assert.equal(game.phase, 'question');

  game.setSettings({ auto: false });
  game.reveal(2);
  game.reveal(2);
  clock.tick(QDN_REVEAL);
  game.nextQuestion(2);
  game.nextQuestion(2);
  assert.equal(game.round, 3);
});

test('minuteur de vote à zéro : révélation avec les votes reçus, les non-votants boivent', () => {
  const { game, clock, ps } = setup({ settings: { auto: false, voteMs: 30000 } });
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[1].id);
  clock.tick(29_999);
  assert.equal(game.phase, 'question');
  clock.tick(1);
  assert.equal(game.phase, 'revealing');
  assert.deepEqual(game.results.nonVoterIds, [ps[2].id]);
  assert.ok(game.results.wrongVoterIds.includes(ps[2].id));
});

test('nombre de questions max : le mode auto termine la partie après la dernière', () => {
  const { game, clock, ps } = setup({ settings: { maxRounds: 10, resultsMs: 5000 } });
  for (let round = 1; round <= 10; round++) {
    assert.equal(game.round, round);
    voteAll(game, ps);
    clock.tick(TIMING.autoRevealDelayMs + QDN_REVEAL);
    assert.equal(game.publicState().isLastRound, round === 10);
    clock.tick(5000);
  }
  assert.equal(game.phase, 'ended');
});

test('« Tu préfères ? » : même mécanique automatique', () => {
  const { game, clock, ps } = setup({ mode: 'tu-preferes' });
  game.vote(ps[0].id, 'a');
  game.vote(ps[1].id, 'a');
  game.vote(ps[2].id, 'b');
  clock.tick(TIMING.autoRevealDelayMs);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.publicState(false).results, null);
  clock.tick(MODES['tu-preferes'].revealMs);
  assert.equal(game.phase, 'results');
  assert.deepEqual(game.results.drinkerIds, [ps[2].id]);
});

test('réglages : valeurs inconnues refusées, conservés quand on rejoue', () => {
  const { game } = setup({ settings: { resultsMs: 15000, voteMs: 45000, maxRounds: 20 } });
  assert.equal(game.setSettings({ resultsMs: 123 }), 'Réglage invalide.');
  assert.equal(game.setSettings({ auto: 'oui' }), 'Réglage invalide.');
  game.end();
  game.restart();
  assert.deepEqual(game.settings, { auto: true, resultsMs: 15000, voteMs: 45000, maxRounds: 20 });
  assert.equal(game.phase, 'lobby');
  assert.equal(game.paused, false);
});

test('fin de partie : plus aucun minuteur actif', () => {
  const { game, clock, ps } = setup({ settings: { voteMs: 15000 } });
  voteAll(game, ps);
  game.end();
  clock.tick(120_000);
  assert.equal(game.phase, 'ended');
  assert.equal(clock.timers.size, 0);
});
