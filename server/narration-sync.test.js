// Voix et phases du Loup-Garou : une phase attend la fin des phrases (accusé de la TV, sinon durée + 2 s),
// et la file audio de la TV ne coupe ni ne chevauche jamais une phrase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './gameStore.js';
import { LOUP_TIMING, itemClips } from './games/loup.js';
import { clipMs, gateMs, textMs } from './narrationTiming.js';
import { createNarrationQueue } from '../client/src/narrationQueue.js';

class FakeClock {
  t = 1_000_000;
  timers = new Map();
  seq = 0;
  now() {
    return this.t;
  }
  setTimeout(fn, ms) {
    this.timers.set(++this.seq, { at: this.t + ms, fn });
    return this.seq;
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

/** Partie avec voix (narrate actif) : loup, voyante, 4 villageois. */
function setup() {
  const clock = new FakeClock();
  const game = new Game('TEST', 'loup', { clock });
  const ps = ['loup', 'voyante', 'villageois', 'villageois', 'villageois', 'villageois'].map((_, i) => {
    const { player } = game.upsertPlayer({ name: `J${i}` });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  assert.equal(game.start(), null);
  const eng = game.roundData.eng;
  eng.order = ps.map((p) => p.id);
  eng.roles = Object.fromEntries(ps.map((p, i) => [p.id, ['loup', 'voyante', 'villageois', 'villageois', 'villageois', 'villageois'][i]]));
  const d = () => game.roundData;
  const ack = (phaseId = d().phaseId) => game.gameHostAction({ type: 'narrated', phaseId });
  const act = (i, action) => game.action(ps[i].id, { ...action, phaseId: d().phaseId });
  const tvRound = () => game.publicState({ host: true }).round;
  return { game, clock, ps, d, ack, act, tvRound };
}

test('une phase attend l’accusé de la TV : phrases publiées, accusé périmé ignoré, minuteur de phase seulement après', () => {
  const { game, clock, d, ack, tvRound } = setup();
  assert.equal(d().stage, 'deal');
  assert.deepEqual(tvRound().narration.clips.map((c) => c.id), ['intro', 'deal']);
  assert.equal(d().narrating, true);
  assert.ok(!game.timers['g:phase'], 'pas de garde-fou de phase tant que la voix parle');
  ack('0:99'); // accusé d'une autre phase : ignoré
  assert.equal(d().narrating, true);
  ack();
  assert.equal(d().narrating, false);
  assert.ok(game.timers['g:phase'], 'le garde-fou démarre après la voix');
  clock.tick(1);
});

test('sans accusé, la phase démarre au bout de la durée des clips + 2 s (jamais avant)', () => {
  const { d, clock } = setup();
  const wait = gateMs([{ id: 'intro' }, { id: 'deal' }]);
  assert.equal(wait, clipMs('intro') + clipMs('deal') + 2000);
  clock.tick(wait - 10);
  assert.equal(d().narrating, true, 'la voix peut encore parler');
  clock.tick(20);
  assert.equal(d().narrating, false);
});

test('un clip plus long que la durée de phase par défaut repousse la suite ; la pause fige aussi l’attente', () => {
  const { game, d, clock } = setup();
  const wait = gateMs([{ id: 'intro' }, { id: 'deal' }]);
  assert.ok(wait > LOUP_TIMING.sleepMs + LOUP_TIMING.announceBeatMs, 'plus long que les pauses par défaut');
  clock.tick(wait - 500);
  game.pause();
  clock.tick(60_000);
  assert.equal(d().narrating, true, 'pause : le délai de sécurité ne s’écoule pas');
  game.resume();
  clock.tick(600);
  assert.equal(d().narrating, false);
});

test('nuit : l’écran des acteurs reste endormi et l’action est refusée pendant la phrase, puis la phase démarre', () => {
  const { game, clock, ps, d, ack, act, tvRound } = setup();
  ack(); // distribution
  for (let i = 0; i < ps.length; i++) assert.equal(act(i, { type: 'ack' }), null);
  assert.equal(d().stage, 'sleep');
  assert.deepEqual(tvRound().narration.clips.map((c) => c.id), ['sleep']);
  ack();
  clock.tick(LOUP_TIMING.sleepMs);
  assert.equal(d().phase, 'voyante');
  assert.deepEqual(tvRound().narration.clips.map((c) => c.id), ['wake_voyante']);
  assert.equal(game.publicState({ playerId: ps[1].id }).round.me.screen.kind, 'sleep', 'faux écran pendant la phrase');
  assert.equal(act(1, { type: 'night', target: ps[0].id }), 'Pas encore.');
  ack();
  assert.equal(game.publicState({ playerId: ps[1].id }).round.me.screen.kind, 'act');
  assert.equal(act(1, { type: 'night', target: ps[0].id }), null);
  clock.tick(LOUP_TIMING.readBeatMs - 1);
  assert.equal(d().phase, 'voyante');
  clock.tick(2);
  assert.equal(d().phase, 'loups');
  assert.deepEqual(tvRound().narration.clips.map((c) => c.id), ['sleep_voyante', 'wake_loups'], 'la précédente se rendort, puis la suivante se réveille');
});

test('les phrases ne sont jamais envoyées aux téléphones', () => {
  const { game, ps } = setup();
  assert.equal(game.publicState({ playerId: ps[0].id }).round.narration, null);
});

test('correspondance événement ↔ phrase', () => {
  const ids = (item, o = {}) => itemClips(item, { first: false, firstDeath: true, deaths: 1, lastNight: null, ...o }).map((c) => c.id);
  assert.deepEqual(ids({ type: 'none' }), ['no_victim'], 'aucune victime seulement quand il n’y a vraiment aucune mort');
  assert.deepEqual(ids({ type: 'death', cause: 'nuit', role: 'loup' }), ['victim_one', 'role_loup']);
  assert.deepEqual(ids({ type: 'death', cause: 'nuit', role: 'loup' }, { deaths: 2 }), ['victim_many', 'role_loup']);
  assert.deepEqual(ids({ type: 'death', cause: 'nuit', role: 'loup' }, { firstDeath: false, deaths: 2 }), ['role_loup'], 'la phrase de victimes n’est dite qu’une fois');
  assert.deepEqual(ids({ type: 'death', cause: 'vote', role: 'voyante' }), ['vote_result', 'role_voyante']);
  assert.deepEqual(ids({ type: 'death', cause: 'chagrin', role: 'cupidon' }), ['grief', 'role_cupidon']);
  assert.deepEqual(ids({ type: 'death', cause: 'chasseur', role: 'loup' }), ['hunter_hit', 'role_loup']);
  assert.deepEqual(ids({ type: 'idiot', role: 'idiot' }), ['idiot']);
  assert.deepEqual(ids({ type: 'novote' }), ['novote']);
  assert.deepEqual(ids({ type: 'gorgees', ids: ['a'] }), ['gorgee']);
  assert.deepEqual(ids({ type: 'none' }, { first: true, lastNight: 'sorciere' }), ['sleep_sorciere', 'dawn', 'no_victim'], 'l’aube : le dernier rôle se rendort d’abord');
  assert.deepEqual(ids({ type: 'none' }, { first: true }), ['dawn', 'no_victim'], 'aucun rôle appelé : rien à rendormir');
  assert.ok(textMs('intro') >= 2000);
});

// ---------- File audio de la TV (faux lecteur contrôlable) ----------

function fakePlayer() {
  const log = [];
  const pending = [];
  return {
    log,
    pending,
    play(id, ms) {
      log.push(`start:${id}`);
      return new Promise((resolve) => pending.push(() => (log.push(`end:${id}`), resolve())));
    },
    pause: () => log.push('pause'),
    resume: () => log.push('resume'),
    stop: () => log.push('stop'),
  };
}
const flush = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('file audio : les phrases se jouent en séquence, sans chevauchement, l’accusé arrive après la dernière', async () => {
  const player = fakePlayer();
  const q = createNarrationQueue(player, { tickMs: 5 });
  const done = [];
  q.enqueue([{ id: 'a' }, { id: 'b' }], () => done.push('g1'));
  q.enqueue([{ id: 'c' }], () => done.push('g2')); // changement de phase pendant la lecture : attend son tour
  await flush();
  assert.deepEqual(player.log, ['start:a']);
  player.pending.shift()();
  await flush();
  assert.deepEqual(player.log, ['start:a', 'end:a', 'start:b']);
  assert.deepEqual(done, []);
  player.pending.shift()();
  await flush();
  assert.deepEqual(done, ['g1']);
  assert.deepEqual(player.log.slice(-1), ['start:c']);
  player.pending.shift()();
  await flush();
  assert.deepEqual(done, ['g1', 'g2']);
  assert.ok(q.idle);
});

test('file audio : pause pendant une phrase et dans un silence, reprise là où on en était', async () => {
  const player = fakePlayer();
  const q = createNarrationQueue(player, { tickMs: 5 });
  q.enqueue([{ id: 'a', after: 60 }]);
  await flush(20);
  q.setPaused(true);
  await flush(120);
  assert.ok(!player.log.includes('start:a'), 'le silence est figé par la pause');
  q.setPaused(false);
  await flush(100);
  assert.ok(player.log.includes('start:a'));
  q.setPaused(true);
  assert.deepEqual(player.log.slice(-1), ['pause'], 'l’audio en cours est mis en pause');
  q.setPaused(false);
  assert.deepEqual(player.log.slice(-1), ['resume']);
  player.pending.shift()();
  await flush();
  assert.ok(q.idle);
});

test('file audio : changement de jeu pendant une phrase = audio arrêté, file vidée, aucun accusé', async () => {
  const player = fakePlayer();
  const q = createNarrationQueue(player, { tickMs: 5 });
  const done = [];
  q.enqueue([{ id: 'a' }, { id: 'b' }], () => done.push('g1'));
  q.enqueue([{ id: 'c' }], () => done.push('g2'));
  await flush();
  q.reset();
  assert.ok(player.log.includes('stop'));
  player.pending.shift()(); // la phrase en cours se termine d'elle-même
  await flush();
  assert.deepEqual(done, []);
  assert.ok(!player.log.includes('start:b') && !player.log.includes('start:c'));
  assert.ok(q.idle);
  q.enqueue([{ id: 'z' }]); // la file repart proprement
  await flush();
  assert.ok(player.log.includes('start:z'));
});
