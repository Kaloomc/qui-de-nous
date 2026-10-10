import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLastChance, computeImposteur, lastChanceOptions, setupImposteur, sipsImposteur, speakingTurns } from './rules/imposteur.js';

const pair = { mot: 'Netflix', proche: 'Prime Video' };
const ids = ['imp', 'b', 'c', 'd'];
const votes = (entries) => new Map(Object.entries(entries));
const seq = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('distribution : un seul imposteur avec le mot proche, ordre de parole complet', () => {
  const s = setupImposteur(ids, pair, seq(0.1, 0.5, 0.9, 0.3));
  const imposters = Object.entries(s.words).filter(([, w]) => w === pair.proche);
  assert.equal(imposters.length, 1);
  assert.equal(imposters[0][0], s.imposterId);
  assert.deepEqual([...s.order].sort(), [...ids].sort());
  assert.equal(speakingTurns(['a', 'b', 'c']).length, 6);
});

test('démasqué : l’imposteur boit, ceux qui l’ont désigné non, les autres oui', () => {
  const r = computeImposteur(ids, votes({ b: 'imp', c: 'imp', d: 'b', imp: 'c' }), 'imp', pair);
  assert.equal(r.unmasked, true);
  assert.deepEqual(r.votersForImposter, ['b', 'c']);
  assert.deepEqual(sipsImposteur(r), { d: 1, imp: 1 });
});

test('non démasqué : tout le groupe sauf l’imposteur boit', () => {
  const r = computeImposteur(ids, votes({ b: 'c', c: 'b', d: 'c', imp: 'c' }), 'imp', pair);
  assert.equal(r.unmasked, false);
  assert.deepEqual(sipsImposteur(r), { b: 1, c: 1, d: 1 });
});

test('égalité en tête : l’imposteur n’est pas démasqué', () => {
  const r = computeImposteur(ids, votes({ b: 'imp', c: 'd', d: 'imp', imp: 'd' }), 'imp', pair);
  assert.deepEqual(r.topIds.sort(), ['d', 'imp']);
  assert.equal(r.unmasked, false);
  assert.deepEqual(sipsImposteur(r), { b: 1, c: 1, d: 1 });
});

test('dernière chance : s’il trouve le mot, ceux qui l’ont démasqué boivent à sa place', () => {
  const r = computeImposteur(ids, votes({ b: 'imp', c: 'imp', d: 'imp' }), 'imp', pair);
  assert.deepEqual(sipsImposteur(applyLastChance(r, 'Netflix')), { b: 1, c: 1, d: 1 });
  assert.deepEqual(sipsImposteur(applyLastChance(r, 'Disney+')), { imp: 1 });
});

test('dernière chance : 4 propositions dont le bon mot, sans le mot de l’imposteur', () => {
  const others = [{ mot: 'TikTok' }, { mot: 'Spotify' }, { mot: 'Netflix' }, { mot: 'Prime Video' }, { mot: 'Snapchat' }, { mot: 'Uber' }];
  const options = lastChanceOptions(pair, others, seq(0.2, 0.7, 0.4));
  assert.equal(options.length, 4);
  assert.ok(options.includes('Netflix'));
  assert.ok(!options.includes('Prime Video'));
  assert.equal(new Set(options).size, 4);
});

test('voter pour soi ne compte pas ; imposteur parti = personne ne boit', () => {
  const r = computeImposteur(ids, votes({ imp: 'imp', b: 'imp' }), 'imp', pair);
  assert.equal(r.counts.imp, 1);
  const gone = computeImposteur(['b', 'c', 'd'], votes({ b: 'c' }), 'imp', pair);
  assert.equal(gone.present, false);
  assert.deepEqual(sipsImposteur(gone), {});
});

test('déroulé avec le moteur : mots secrets, tours de parole, vote, dernière chance', async () => {
  const { Game } = await import('./gameStore.js');
  const clock = { t: 0, timers: [], now: () => clock.t, setTimeout: (fn, ms) => clock.timers.push({ fn, at: clock.t + ms }) - 1, clearTimeout: (i) => (clock.timers[i] = null) };
  const tick = (ms) => {
    const end = clock.t + ms;
    for (;;) {
      const next = clock.timers.map((t, i) => [t, i]).filter(([t]) => t && t.at <= end).sort((a, b) => a[0].at - b[0].at)[0];
      if (!next) break;
      clock.timers[next[1]] = null;
      clock.t = next[0].at;
      next[0].fn();
    }
    clock.t = end;
  };
  const game = new Game('IMPO', 'imposteur', { clock });
  const ps = ['A', 'B', 'C', 'D'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  game.start();
  const hostView = game.publicState({ host: true });
  assert.equal(hostView.round.step, 'words');
  assert.equal(JSON.stringify(hostView).includes(game.question.mot), false, 'la TV ne voit pas les mots');
  const words = ps.map((p) => game.publicState({ playerId: p.id }).round.myWord);
  assert.equal(words.filter((w) => w === game.question.proche).length, 1, 'un seul mot proche');
  assert.equal(game.vote(ps[0].id, ps[1].id), 'Le vote est fermé.', 'pas de vote pendant les indices');

  assert.equal(game.gameHostAction({ type: 'startSpeaking' }), null);
  const turns = game.roundData.turns.length;
  assert.equal(turns, 8, '2 tours de parole');
  tick(60000);
  assert.equal(game.roundData.step, 'speaking', 'mode manuel : le chrono ne fait pas avancer');
  for (let i = 0; i < turns; i++) game.gameHostAction({ type: 'nextTurn' });
  assert.equal(game.roundData.step, 'voting');

  const imp = game.roundData.imposterId;
  for (const p of ps) game.vote(p.id, p.id === imp ? ps.find((q) => q.id !== imp).id : imp);
  assert.equal(game.vote(imp, imp), 'Choix invalide.', 'pas de vote pour soi');
  game.reveal(1);
  tick(game.rules.revealMs);
  assert.equal(game.results.unmasked, true);
  assert.equal(game.pending, true, 'dernière chance');
  const options = game.publicState({ playerId: imp }).round.options;
  assert.equal(options.length, 4);
  assert.equal(game.action(ps.find((p) => p.id !== imp).id, { type: 'guess', word: options[0] }), 'Seul l’imposteur peut tenter sa chance.');
  assert.equal(game.action(imp, { type: 'guess', word: game.question.mot }), null);
  const sips = game.publicState().sips;
  assert.equal(sips[imp], undefined, 'il a trouvé : épargné');
  assert.equal(Object.keys(sips).length, 3, 'ceux qui l’ont démasqué boivent');
});

test('mode auto : les indices démarrent et s’enchaînent tout seuls', async () => {
  const { Game } = await import('./gameStore.js');
  const clock = { t: 0, timers: [], now: () => clock.t, setTimeout: (fn, ms) => clock.timers.push({ fn, at: clock.t + ms }) - 1, clearTimeout: (i) => (clock.timers[i] = null) };
  const tick = (ms) => {
    const end = clock.t + ms;
    for (;;) {
      const next = clock.timers.map((t, i) => [t, i]).filter(([t]) => t && t.at <= end).sort((a, b) => a[0].at - b[0].at)[0];
      if (!next) break;
      clock.timers[next[1]] = null;
      clock.t = next[0].at;
      next[0].fn();
    }
    clock.t = end;
  };
  const game = new Game('AUTO', 'imposteur', { clock });
  const ps = ['A', 'B', 'C'].map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  game.setSettings({ auto: true });
  game.start();
  tick(10000);
  assert.equal(game.roundData.step, 'speaking');
  game.disconnectPlayer(ps[2], 's2');
  tick(12000 * 6);
  assert.equal(game.roundData.step, 'voting', 'le joueur déconnecté est sauté');
});
