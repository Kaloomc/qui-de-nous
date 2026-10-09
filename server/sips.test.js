import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './gameStore.js';
import { MODES } from './modes.js';
import { computePreferesResults, computeResults, sipsPreferes, sipsQuiDeNous } from './rules.js';

const votes = (entries) => new Map(Object.entries(entries));

test('« Qui de nous ? » : le plus voté boit, les mauvais votants aussi, le plus voté qui a mal voté boit 2 fois', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const r = computeResults(ids, votes({ a: 'b', b: 'c', c: 'b', d: 'b' }));
  assert.deepEqual(sipsQuiDeNous(r), { b: 2 });

  const r2 = computeResults(ids, votes({ a: 'b', b: 'b', c: 'a' }));
  assert.deepEqual(sipsQuiDeNous(r2), { b: 1, c: 1, d: 1 });
});

test('« Qui de nous ? » égalité : chaque ex æquo boit une gorgée', () => {
  const r = computeResults(['a', 'b', 'c', 'd'], votes({ a: 'b', b: 'c', c: 'b', d: 'c' }));
  assert.deepEqual(sipsQuiDeNous(r), { b: 1, c: 1 });
});

test('« Tu préfères ? » : une gorgée par buveur, personne si tous du même côté', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(sipsPreferes(computePreferesResults(ids, votes({ a: 'a', b: 'a', c: 'b' }))), { c: 1 });
  assert.deepEqual(sipsPreferes(computePreferesResults(ids, votes({ a: 'a', b: 'a', c: 'a' }))), {});
});

class FakeClock {
  t = 0;
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
      const next = [...this.timers].filter(([, x]) => x.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
    }
    this.t = end;
  }
}

function setup(mode = 'qui-de-nous') {
  const clock = new FakeClock();
  const game = new Game('SIPS', mode, { clock });
  const ps = ['A', 'B', 'C'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  game.start();
  return { game, clock, ps, revealMs: MODES[mode].revealMs };
}

test('les gorgées s’ajoutent à la fin du suspense, pas avant (pas de spoiler)', () => {
  const { game, clock, ps, revealMs } = setup();
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[1].id);
  game.vote(ps[2].id, ps[0].id);
  game.reveal(1);
  assert.deepEqual(game.publicState(true).sips, {}, 'pendant la révélation : rien');
  assert.equal(game.publicState(true).roundSips, null);
  clock.tick(revealMs);
  assert.deepEqual(game.publicState().sips, { [ps[1].id]: 1, [ps[2].id]: 1 });
  assert.deepEqual(game.publicState().roundSips, { [ps[1].id]: 1, [ps[2].id]: 1 });
});

test('cumul sur plusieurs tours, une seule fois par tour, joueur retiré effacé, remise à zéro quand on rejoue', () => {
  const { game, clock, ps, revealMs } = setup('tu-preferes');
  for (let round = 1; round <= 3; round++) {
    game.vote(ps[0].id, 'a');
    game.vote(ps[1].id, 'a');
    game.vote(ps[2].id, 'b');
    game.reveal(round);
    game.reveal(round);
    clock.tick(revealMs);
    game.finishReveal();
    if (round < 3) game.nextQuestion(round);
  }
  assert.deepEqual(game.publicState().sips, { [ps[2].id]: 3 });
  assert.equal(game.publicState().roundSips[ps[2].id], 1);

  game.removePlayer(ps[2].id);
  assert.deepEqual(game.publicState().sips, {});

  game.end();
  game.restart();
  assert.deepEqual(game.publicState().sips, {});
});

test('partie terminée en plein suspense : les gorgées du dernier tour comptent pour le podium', () => {
  const { game, ps } = setup('tu-preferes');
  game.vote(ps[0].id, 'a');
  game.vote(ps[1].id, 'b');
  game.vote(ps[2].id, 'b');
  game.reveal(1);
  game.end();
  assert.deepEqual(game.publicState().sips, { [ps[0].id]: 1 });
});
