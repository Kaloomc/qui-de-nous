// Enchaînement du Loup-Garou dans une vraie partie (horloge simulée) : événements périmés, double clic, pause,
// votes interdits, vue du fantôme. Les règles pures sont dans loup.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './gameStore.js';
import { LOUP_TIMING } from './games/loup.js';

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
const T = LOUP_TIMING;

function setup(roles) {
  const clock = new FakeClock();
  const game = new Game('TEST', 'loup', { clock });
  game.loupTiming = { narrate: false, absentMaxMs: T.absentMinMs };
  const ps = roles.map((_, i) => {
    const { player } = game.upsertPlayer({ name: `J${i}` });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  assert.equal(game.start(), null);
  const eng = game.roundData.eng;
  eng.order = ps.map((p) => p.id);
  eng.roles = Object.fromEntries(ps.map((p, i) => [p.id, roles[i]]));
  const d = () => game.roundData;
  const act = (i, action, phaseId = d().phaseId) => game.action(ps[i].id, { ...action, phaseId });
  const toNight = () => {
    for (let i = 0; i < ps.length; i++) act(i, { type: 'ack' });
    clock.tick(T.sleepMs);
  };
  return { game, clock, ps, eng, d, act, toNight };
}
const SIX = ['loup', 'voyante', 'villageois', 'villageois', 'villageois', 'villageois'];

test('événement périmé et double clic : la phase terminée est refusée, une action de nuit ne compte qu’une fois', () => {
  const { ps, d, act, toNight } = setup(SIX);
  toNight();
  assert.equal(d().phase, 'voyante');
  const old = d().phaseId;
  assert.equal(act(1, { type: 'night', target: ps[0].id }), null);
  assert.equal(act(1, { type: 'night', target: ps[2].id }), 'Déjà fait.', 'double clic');
  assert.equal(d().intel[ps[1].id].seen.length, 1, 'une seule révélation');
});

test('événement périmé : une action d’une phase déjà passée est ignorée', () => {
  const { clock, ps, d, act, toNight } = setup(SIX);
  toNight();
  const old = d().phaseId;
  act(1, { type: 'night', target: ps[0].id });
  clock.tick(T.readBeatMs);
  assert.equal(d().phase, 'loups');
  assert.match(act(0, { type: 'wolfVote', target: ps[2].id }, old), /Trop tard/);
});

test('pause : les minuteurs de phase se figent et reprennent là où ils étaient', () => {
  const { game, clock, ps, d, act, toNight } = setup(SIX);
  toNight();
  act(1, { type: 'night', target: ps[0].id });
  clock.tick(T.readBeatMs - 100);
  game.pause();
  clock.tick(10 * 60_000);
  assert.equal(d().phase, 'voyante', 'rien n’avance pendant la pause');
  game.resume();
  clock.tick(150);
  assert.equal(d().phase, 'loups');
});

test('sans action, une nuit n’est jamais bloquée (garde-fou invisible), le Chasseur sans tir ne tue personne', () => {
  const { clock, d, toNight, eng } = setup(['loup', 'chasseur', 'villageois', 'villageois', 'villageois', 'villageois']);
  toNight();
  clock.tick(T.nightSafetyMs + 1);
  assert.equal(d().phase, 'loups');
  clock.tick(T.nightSafetyMs + 1);
  assert.ok(['announce', 'debate'].includes(d().stage), d().stage);
  assert.equal(eng.winner, null);
});

test('vote : un mort, l’Idiot (déjà épargné) et un vote pour soi-même sont refusés', () => {
  const { clock, ps, d, act, eng, toNight } = setup(['loup', 'idiot', 'villageois', 'villageois', 'villageois', 'villageois']);
  eng.dead[ps[5].id] = { cause: 'loups', night: 1, role: 'villageois' };
  eng.idiotOut[ps[1].id] = true;
  toNight();
  clock.tick(T.nightSafetyMs * 2 + T.announceBeatMs * 4);
  for (let i = 0; i < 40 && d().stage !== 'debate'; i++) clock.tick(1000);
  assert.equal(d().stage, 'debate');
  act(0, { type: 'ready' });
  for (const i of [1, 2, 3, 4]) act(i, { type: 'ready' });
  assert.equal(d().stage, 'vote');
  assert.ok(act(5, { type: 'vote', target: ps[0].id }), 'un mort ne vote pas');
  assert.ok(act(1, { type: 'vote', target: ps[0].id }), 'l’Idiot ne vote plus');
  assert.ok(act(2, { type: 'vote', target: ps[2].id }), 'pas de vote pour soi');
  assert.ok(act(2, { type: 'vote', target: ps[5].id }), 'pas de vote pour un mort');
  assert.equal(act(2, { type: 'vote', target: ps[0].id }), null);
});

test('fantôme : voit tous les rôles sur son téléphone seulement (ni la TV ni les autres)', () => {
  const { game, ps, eng, d, toNight } = setup(SIX);
  toNight();
  eng.dead[ps[2].id] = { cause: 'loups', night: 1, role: 'villageois' };
  const ghost = game.publicState({ playerId: ps[2].id }).round.me;
  assert.equal(ghost.alive, false);
  assert.equal(ghost.allRoles.length, SIX.length);
  assert.ok(ghost.allRoles.some((r) => r.role === 'loup'));
  for (const viewer of [{ host: true }, { playerId: ps[3].id }, { playerId: ps[0].id }]) {
    const json = JSON.stringify(game.publicState(viewer));
    assert.ok(!json.includes('"allRoles":['), 'pas de liste des rôles hors du fantôme');
    if (viewer.host) assert.ok(!/"role":"(loup|voyante)"/.test(JSON.stringify(game.publicState(viewer).round.circle)), 'aucun rôle vivant sur la TV');
  }
  assert.ok(d().eng);
});
