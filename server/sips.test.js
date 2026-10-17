import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './gameStore.js';
import { GAMES } from './games/index.js';
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
  return { game, clock, ps, revealMs: GAMES[mode].revealMs };
}

test('les gorgées s’ajoutent à la fin du suspense, pas avant (pas de spoiler)', () => {
  const { game, clock, ps, revealMs } = setup();
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[1].id);
  game.vote(ps[2].id, ps[0].id);
  game.reveal(game.roundId);
  assert.deepEqual(game.publicState(true).sips, {}, 'pendant la révélation : rien');
  assert.equal(game.publicState(true).roundSips, null);
  clock.tick(revealMs);
  assert.deepEqual(game.publicState().sips, { [ps[1].id]: 1, [ps[2].id]: 1 });
  assert.deepEqual(game.publicState().roundSips, { [ps[1].id]: 1, [ps[2].id]: 1 });
});

test('cumul sur plusieurs tours, une seule fois par tour, joueur retiré masqué, total gardé quand on rejoue', () => {
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
  assert.deepEqual(game.publicState().sips, {}, 'masqué du classement');
  assert.equal(game.partySips.get(ps[2].id), 3, 'mais son total reste compté');

  game.end();
  game.restart();
  assert.deepEqual(game.publicState().gameSips, {});
});

/** Joue une manche de « Tu préfères ? » où seul `loser` est dans la minorité. */
function playPreferes(game, clock, ps, loser) {
  game.start();
  for (const p of ps) game.vote(p.id, p === loser ? 'b' : 'a');
  game.reveal(game.roundId);
  clock.tick(GAMES['tu-preferes'].revealMs);
}

test('compteur de la soirée : persiste après « Rejouer », « Changer de jeu » et une reconnexion', () => {
  const { game, clock, ps } = setup('tu-preferes');
  game.end();
  game.restart();
  playPreferes(game, clock, ps, ps[0]);
  assert.equal(game.publicState().sips[ps[0].id], 1);

  game.end();
  assert.equal(game.restart(), null, 'Rejouer');
  assert.equal(game.publicState().sips[ps[0].id], 1, 'après Rejouer');
  assert.deepEqual(game.publicState().gameSips, {}, 'la part du jeu repart à zéro');

  playPreferes(game, clock, ps, ps[0]);
  game.end();
  game.chooseGame();
  assert.equal(game.publicState().sips[ps[0].id], 2, 'après Changer de jeu');
  game.pickGame('qui-de-nous');
  assert.equal(game.publicState().sips[ps[0].id], 2, 'dans le nouveau jeu');

  game.disconnectPlayer(ps[0], 's0');
  clock.tick(60000);
  const { player } = game.upsertPlayer({ playerId: ps[0].id, secret: ps[0].secret, name: 'A' });
  game.connectPlayer(player, 'retour');
  assert.equal(game.publicState({ playerId: ps[0].id }).sips[ps[0].id], 2, 'après reconnexion');
});

test('compteur de la soirée : +1, +2 (« boit deux fois ») et +N (défi de la Roue) via une seule fonction', () => {
  const { game, ps } = setup('qui-de-nous');
  assert.equal(game.drink(ps[0].id), 1);
  assert.equal(game.drink(ps[0].id, 2), 2);
  assert.equal(game.drink(ps[0].id, 4), 4);
  assert.equal(game.drink(ps[0].id, 0), 0, 'rien à boire');
  assert.equal(game.drink(ps[0].id, -3), 0);
  assert.equal(game.drink(ps[0].id, 1.5), 0);
  assert.equal(game.drink('inconnu', 2), 0);
  assert.equal(game.publicState().sips[ps[0].id], 7);

  // « Qui de nous ? » : le plus voté qui a mal voté boit 2 fois, en une manche.
  game.vote(ps[0].id, ps[1].id);
  game.vote(ps[1].id, ps[2].id);
  game.vote(ps[2].id, ps[1].id);
  game.reveal(game.roundId);
  game.finishReveal();
  assert.equal(game.publicState().roundSips[ps[1].id], 2);
  assert.equal(game.publicState().sips[ps[1].id], 2);
});

test('compteur de la soirée : remis à zéro par l’hôte ou par une nouvelle partie, pas avant', async () => {
  const { game, clock, ps } = setup('tu-preferes');
  game.end();
  game.restart();
  playPreferes(game, clock, ps, ps[1]);
  assert.equal(game.publicState().sips[ps[1].id], 1);
  assert.equal(game.resetPartySips(), null);
  assert.deepEqual(game.publicState().sips, {});
  assert.deepEqual(game.publicState().gameSips, {});

  const { GameStore } = await import('./gameStore.js');
  const store = new GameStore({ clock });
  const fresh = store.create('qui-de-nous');
  assert.equal(fresh.partySips.size, 0, 'nouvelle partie, nouveau QR code : compteurs à zéro');
});

test('partie terminée en plein suspense : les gorgées du dernier tour comptent pour le podium', () => {
  const { game, ps } = setup('tu-preferes');
  game.vote(ps[0].id, 'a');
  game.vote(ps[1].id, 'b');
  game.vote(ps[2].id, 'b');
  game.reveal(game.roundId);
  game.end();
  assert.deepEqual(game.publicState().sips, { [ps[0].id]: 1 });
});
