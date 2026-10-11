import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { applyLastChance, checkClue, computeImposteur, NO_CLUE, lastChanceOptions, setupImposteur, sipsImposteur, speakingTurns } from './rules/imposteur.js';

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
  assert.equal(game.gameHostAction({ type: 'reveal' }), null, 'bouton Révéler de la TV');
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
  tick(30000 * 6);
  assert.equal(game.roundData.step, 'voting', 'le joueur déconnecté est sauté');
});

test('indice écrit : nettoyé, un ou deux mots, 20 caractères max', () => {
  assert.deepEqual(checkClue('  série   télé ', 'Netflix'), { clue: 'série télé' });
  assert.ok(checkClue('', 'Netflix').error, 'vide');
  assert.ok(checkClue('   ', 'Netflix').error, 'que des espaces');
  assert.ok(checkClue(42, 'Netflix').error, 'pas du texte');
  assert.ok(checkClue('un deux trois', 'Netflix').error, 'trois mots');
  assert.ok(checkClue('anticonstitutionnellement', 'Netflix').error, 'trop long');
  assert.deepEqual(checkClue('<b>chill</b>', 'Netflix'), { clue: '<b>chill</b>' }, 'texte brut, jamais interprété');
});

test('indice écrit : refusé s’il est (ou contient) son mot secret, majuscules et accents compris', () => {
  assert.ok(checkClue('netflix', 'Netflix').error);
  assert.ok(checkClue('NETFLIX!', 'Netflix').error);
  assert.ok(checkClue('netflixeur', 'Netflix').error);
  assert.ok(checkClue('fete', 'Fête').error);
  assert.ok(checkClue('Uber eats', 'Uber Eats').error);
  assert.ok(checkClue('uber', 'Uber Eats').error, 'un mot important du secret');
  assert.deepEqual(checkClue('livraison', 'Uber Eats'), { clue: 'livraison' });
  assert.deepEqual(checkClue('YouTube', 'Netflix'), { clue: 'YouTube' }, 'le mot des autres n’est pas interdit');
});

/** Lance une manche d'Imposteur et démarre les indices. */
async function speakingGame(settings) {
  const g = await makeGame('imposteur', ['A', 'B', 'C', 'D'], settings);
  g.game.start();
  g.game.gameHostAction({ type: 'startSpeaking' });
  const speaker = () => g.game.publicState({ host: true }).round.speakerId;
  const wordOf = (id) => g.game.roundData.words[id];
  return { ...g, speaker, wordOf };
}

test('indice écrit : accepté, diffusé à l’envoi seulement, puis joueur suivant', async () => {
  const { game, players, speaker, wordOf } = await speakingGame();
  const first = speaker();
  const other = players.find((p) => p.id !== first);
  assert.equal(game.action(other.id, { type: 'clue', text: 'hop' }), 'Ce n’est pas ton tour.');
  assert.deepEqual(game.publicState({ host: true }).round.clues, [], 'rien avant l’envoi');
  assert.ok(game.action(first, { type: 'clue', text: '' }), 'indice vide refusé');
  assert.ok(game.action(first, { type: 'clue', text: wordOf(first) }), 'son propre mot refusé');
  assert.equal(speaker(), first, 'un refus ne fait pas passer le tour');
  assert.equal(game.action(first, { type: 'clue', text: ' zzz ' }), null);
  const view = game.publicState({ host: true });
  assert.deepEqual(view.round.clues, [{ playerId: first, lap: 1, text: 'zzz' }]);
  assert.notEqual(view.round.speakerId, first, 'joueur suivant');
  assert.equal('imposterId' in view.round, false, 'jamais qui est l’imposteur');
});

test('indice écrit : temps écoulé = « — » ; en manuel l’hôte passe, en auto ça enchaîne', async () => {
  const manual = await speakingGame();
  const first = manual.speaker();
  manual.tick(60000);
  assert.equal(manual.speaker(), first, 'manuel : on attend le « Suivant » de l’hôte');
  manual.game.gameHostAction({ type: 'nextTurn' });
  assert.deepEqual(manual.game.publicState().round.clues, [{ playerId: first, lap: 1, text: NO_CLUE }]);

  const auto = await speakingGame({ auto: true });
  const a1 = auto.speaker();
  auto.tick(25000);
  assert.notEqual(auto.speaker(), a1);
  assert.equal(auto.game.publicState().round.clues[0].text, NO_CLUE);
});

test('indice écrit : 2 tours puis le vote ; déconnexion pendant son tour = passé, reconnexion = état courant', async () => {
  const { game, players, tick, speaker } = await speakingGame();
  const first = speaker();
  const p = players.find((x) => x.id === first);
  game.disconnectPlayer(p, `s${players.indexOf(p)}`);
  tick(1000);
  assert.equal(speaker(), first, 'un rechargement de page ne fait pas perdre son tour');
  tick(5000);
  assert.notEqual(speaker(), first, 'déconnecté trop longtemps : passé');
  game.connectPlayer(p, 'again');
  assert.equal(game.publicState({ playerId: first }).round.clues[0].text, NO_CLUE);
  assert.ok(game.publicState({ playerId: first }).round.myWord, 'il retrouve son mot');
  for (let i = 0; i < 20 && game.roundData.step === 'speaking'; i++) game.action(speaker(), { type: 'clue', text: `indice${i}` });
  assert.equal(game.roundData.step, 'voting');
  const clues = game.publicState().round.clues;
  assert.equal(clues.length, 8, '2 indices par joueur');
  assert.equal(clues.filter((c) => c.lap === 2).length, 4);
});
