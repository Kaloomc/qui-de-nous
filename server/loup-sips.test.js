// Gorgées du Loup-Garou dans une vraie partie (horloge simulée) : dans le flux, privées, différées au Tribunal.
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

/** Partie à rôles imposés (dans l'ordre des joueurs) : { names: 'loup', … } par index. */
function setup(roles) {
  const clock = new FakeClock();
  const game = new Game('TEST', 'loup', { clock });
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
  const act = (i, action) => assert.equal(game.action(ps[i].id, { ...action, phaseId: d().phaseId }), null, JSON.stringify(action));
  const T = LOUP_TIMING;
  const sips = (i) => game.partySips.get(ps[i].id) ?? 0;
  return { game, clock, ps, eng, d, act, T, sips };
}

test('gorgées dans le flux et privées : mort, tir du Chasseur (double), Sorcière et Distributeur sans source, Ivrogne en secret', () => {
  const { game, clock, ps, eng, d, act, T, sips } = setup(['loup', 'voyante', 'sorciere', 'chasseur', 'ivrogne', 'distributeur', 'villageois', 'villageois']);
  const tvItems = [];
  const watch = () => {
    const a = game.publicState({ host: true }).round.announce;
    if (a) tvItems.push(...a.items);
  };
  for (const p of ps) act(ps.indexOf(p), { type: 'ack' });
  clock.tick(T.sleepMs);
  assert.equal(d().phase, 'voyante');
  act(1, { type: 'night', target: ps[0].id });
  clock.tick(T.nightMs);
  assert.equal(d().phase, 'loups');
  act(0, { type: 'wolfVote', target: ps[3].id });
  clock.tick(T.nightMs);
  assert.equal(d().phase, 'sorciere');
  act(2, { type: 'night', gorgee: ps[7].id });
  clock.tick(T.nightMs);
  assert.equal(d().phase, 'distributeur');
  act(5, { type: 'night', targets: [ps[6].id, ps[7].id] });
  clock.tick(T.nightMs);
  assert.equal(d().phase, 'ivrogne');
  assert.equal(sips(4), 1, 'l’Ivrogne boit dès sa phase, en privé');
  clock.tick(T.nightMs);
  // Aube : le Chasseur meurt (1 gorgée) puis tire.
  assert.equal(d().stage, 'announce');
  watch();
  assert.equal(sips(3), 1);
  clock.tick(T.announceMs);
  assert.equal(d().stage, 'hunter');
  act(3, { type: 'shoot', target: ps[6].id });
  watch();
  assert.equal(sips(6), 2, 'la cible du Chasseur boit double');
  assert.equal(sips(7), 0, 'la gorgée sans source n’est pas encore annoncée');
  clock.tick(T.announceMs);
  watch();
  assert.equal(sips(7), 1, 'une seule gorgée pour la Sorcière et le Distributeur réunis');
  assert.equal(sips(6), 2, 'pas de gorgée sans source pour quelqu’un mort entre-temps');
  assert.equal(sips(4), 1, 'l’Ivrogne n’a bu qu’une fois');
  // Ce que voit la TV : jamais l'Ivrogne, jamais la source des gorgées.
  const gorgees = tvItems.filter((i) => i.type === 'gorgees');
  assert.equal(gorgees.length, 1);
  assert.deepEqual(gorgees[0].ids, [ps[7].id]);
  assert.ok(!JSON.stringify(tvItems).includes(ps[4].id), 'l’Ivrogne n’apparaît pas sur la TV');
  assert.ok(!JSON.stringify(tvItems).includes('sorciere'));
  assert.ok(game.phase === 'question');
});

test('Tribunal : le camp perdant boit 3, les crédits sont répartis ou tirés au hasard, tout passe par le compteur de la soirée', () => {
  const { game, clock, ps, d, act, T, sips } = setup(['loup', 'voyante', 'chasseur', 'villageois', 'villageois', 'villageois']);
  for (let i = 0; i < ps.length; i++) act(i, { type: 'ack' });
  clock.tick(T.sleepMs);
  act(1, { type: 'night', target: ps[0].id }); // la Voyante démasque le loup : 1 crédit
  clock.tick(T.nightMs);
  act(0, { type: 'wolfVote', target: ps[5].id });
  clock.tick(T.nightMs);
  assert.equal(d().stage, 'announce');
  assert.equal(sips(5), 1);
  clock.tick(T.announceMs);
  assert.equal(d().stage, 'debate');
  clock.tick(T.debateMs);
  assert.equal(d().stage, 'vote');
  for (const i of [1, 2, 3, 4]) act(i, { type: 'vote', target: ps[0].id });
  act(0, { type: 'vote', target: ps[1].id });
  clock.tick(T.voteMs);
  assert.equal(sips(0), 1, 'le loup éliminé boit comme tout mort');
  clock.tick(T.announceMs);
  clock.tick(10000);
  assert.equal(game.phase, 'results');
  assert.ok(game.pending, 'le Tribunal attend la répartition');
  assert.equal(game.results.winner, 'village');
  act2(game, ps[1], { type: 'allocate', allocation: { [ps[2].id]: 1 } });
  assert.equal(game.pending, false, 'tous les distributeurs ont répondu : le Tribunal se règle tout de suite');
  assert.equal(sips(0), 1 + 3, 'camp perdant : 3 en plus');
  assert.equal(sips(2), 1, 'gorgée distribuée par la Voyante');
  assert.equal(game.sips.get(ps[0].id), 4);
});

function act2(game, p, action) {
  assert.equal(game.action(p.id, action), null);
}

test('Tribunal : sans répartition, les crédits partent au hasard au bout du temps imparti', () => {
  const { game, clock, ps, d, act, T } = setup(['loup', 'voyante', 'chasseur', 'villageois', 'villageois', 'villageois']);
  for (let i = 0; i < ps.length; i++) act(i, { type: 'ack' });
  clock.tick(T.sleepMs);
  act(1, { type: 'night', target: ps[0].id });
  clock.tick(T.nightMs * 2 + T.announceMs + T.debateMs);
  assert.equal(d().stage, 'vote');
  for (const i of [1, 2, 3, 4]) act(i, { type: 'vote', target: ps[0].id });
  clock.tick(T.voteMs + T.announceMs + 30000);
  assert.equal(game.phase, 'results');
  clock.tick(T.tribunalMs + 1000);
  const total = [...game.partySips.values()].reduce((a, b) => a + b, 0);
  assert.ok(total >= 3 + 1 + 1, `les gorgées du Tribunal sont comptées (${total})`);
});

test('dernières paroles (option) : texte brut de 80 caractères, passer est permis, l’hôte peut masquer ; paris des fantômes', () => {
  const { game, clock, ps, eng, d, act, T } = setup(['loup', 'voyante', 'chasseur', 'villageois', 'villageois', 'villageois']);
  game.roundData.eng.options.dernieresParoles = true;
  for (let i = 0; i < ps.length; i++) act(i, { type: 'ack' });
  clock.tick(T.sleepMs + T.nightMs);
  act(0, { type: 'wolfVote', target: ps[5].id });
  clock.tick(T.nightMs);
  assert.equal(eng.dead[ps[5].id].cause, 'loups');
  const view = (i) => game.publicState({ playerId: ps[i].id }).round.me;
  assert.equal(view(5).last, 'pending');
  assert.equal(view(3).last, null, 'un vivant n’a pas de dernières paroles');
  assert.ok(game.action(ps[3].id, { type: 'last', text: 'coucou' }), 'refusé pour un vivant');
  const evil = `<img src=x onerror=alert(1)>\u0007${'x'.repeat(120)}`;
  assert.equal(game.action(ps[5].id, { type: 'last', text: evil }), null);
  const words = game.publicState({ host: true }).round.lastWords;
  assert.equal(words.length, 1);
  assert.ok(words[0].text.length <= 80 && !words[0].text.includes('\u0007'), 'texte nettoyé et tronqué');
  assert.ok(game.action(ps[5].id, { type: 'last', text: 'encore' }), 'une seule fois');
  assert.equal(view(5).last, 'done');
  assert.equal(game.gameHostAction({ type: 'hideLast', id: ps[5].id }), null);
  assert.equal(game.publicState({ host: true }).round.lastWords[0].text, null, 'phrase masquée par l’hôte');
  // Paris : un mort parie pendant le débat, jamais un vivant.
  clock.tick(T.announceMs);
  assert.equal(d().stage, 'debate');
  assert.equal(game.action(ps[5].id, { type: 'bet', target: ps[0].id }), null);
  assert.ok(game.action(ps[2].id, { type: 'bet', target: ps[0].id }), 'un vivant ne parie pas');
  assert.equal(game.action(ps[5].id, { type: 'campBet', camp: 'village' }), null);
  clock.tick(T.debateMs);
  for (const i of [1, 2, 3, 4]) act(i, { type: 'vote', target: ps[0].id });
  clock.tick(T.voteMs);
  assert.equal(eng.ghostPoints[ps[5].id], 1, 'pari juste = 1 point');
});
