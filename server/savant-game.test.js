// Le Savant dans une vraie partie (horloge simulée) : étapes et minuteurs, événements périmés, pause, changement de jeu,
// déconnexions, gorgées, réglages. La confidentialité (sockets réels) est dans savant-leak.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { SAVANT_TIMING } from './games/savant.js';
import { TIMING } from './timing.js';

const T = SAVANT_TIMING;
const names = (n) => Array.from({ length: n }, (_, i) => `J${i}`);
const FACT = (i) => ({ id: `t${i}`, question: `Question ${i} : ___ ?`, reponse: `VRAIE-${i}`, explication: `Explication ${i}.`, categorie: 'insolite', source: 'https://example.org' });

async function setup(n = 6, settings) {
  const ctx = await makeGame('savant', names(n), settings);
  ctx.game.savantFacts = Array.from({ length: 12 }, (_, i) => FACT(i));
  assert.equal(ctx.game.start(), null);
  const d = () => ctx.game.roundData;
  const act = (player, action, phaseId = d().phaseId) => ctx.game.action(player.id, { ...action, phaseId });
  const byId = (id) => ctx.players.find((p) => p.id === id);
  const writers = () => d().writers.map(byId);
  const toWrite = () => ctx.tick(T.announceMs);
  const allWrite = (text = (p) => `réponse de ${p.name}`) => {
    for (const p of writers()) assert.equal(act(p, { type: 'answer', text: text(p) }), null);
  };
  const toChoice = () => {
    toWrite();
    allWrite();
    ctx.tick(T.writeBeatMs);
    assert.equal(d().step, 'read');
    ctx.tick(Math.max(T.readMinMs, d().cards.length * d().readStepMs + T.readTailMs));
    assert.equal(d().step, 'choice');
  };
  const voteAll = (target = d().savantId) => {
    // Tout le monde désigne `target` ; la cible elle-même (qui ne peut pas voter pour soi) désigne un autre Écrivain.
    for (const p of [byId(d().seekerId), ...writers()]) {
      const choice = p.id === target ? d().writers.find((id) => id !== target) : target;
      assert.equal(ctx.game.vote(p.id, choice, ctx.game.roundId), null);
    }
  };
  return { ...ctx, d, act, byId, writers, toWrite, allWrite, toChoice, voteAll };
}

test('manche complète : annonce, écriture (dès que tout le monde a envoyé), lecture, choix (dès que tout le monde a voté), révélation', async () => {
  const s = await setup(6);
  const { game, d } = s;
  assert.equal(d().step, 'announce');
  assert.equal(game.phase, 'question');
  assert.equal(d().writers.length, 5, 'tous sauf le Chercheur');
  assert.ok(d().writers.includes(d().savantId));
  assert.ok(!d().writers.includes(d().seekerId));
  s.tick(T.announceMs - 1);
  assert.equal(d().step, 'announce');
  s.tick(1);
  assert.equal(d().step, 'write');
  const phases = [d().phaseId];
  // Écriture : on n'avance qu'une fois que tout le monde a envoyé.
  for (const p of s.writers().slice(0, 4)) s.act(p, { type: 'answer', text: 'bla' });
  s.tick(T.writeBeatMs + 10);
  assert.equal(d().step, 'write', 'un joueur n’a pas encore écrit');
  s.act(s.writers()[4], { type: 'answer', text: 'bla' });
  s.tick(T.writeBeatMs);
  assert.equal(d().step, 'read');
  phases.push(d().phaseId);
  assert.equal(d().cards.length, 5);
  s.tick(Math.max(T.readMinMs, 5 * d().readStepMs + T.readTailMs) - 1);
  assert.equal(d().step, 'read', 'la lecture dure au moins 8 s');
  s.tick(1);
  assert.equal(d().step, 'choice');
  phases.push(d().phaseId);
  s.voteAll();
  s.tick(T.voteBeatMs);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.results.found, true);
  assert.equal(new Set(phases).size, phases.length, 'identifiants de phase uniques');
});

test('au chrono : l’écriture se termine sans tout le monde ; le Savant muet garde sa vraie réponse, les autres « sèchent »', async () => {
  const s = await setup(6);
  const { d, game } = s;
  s.toWrite();
  const quiet = s.writers().find((p) => p.id !== d().savantId);
  for (const p of s.writers()) if (p.id !== d().savantId && p.id !== quiet.id) s.act(p, { type: 'answer', text: `texte ${p.name}` });
  s.tick(T.writeMs - 1);
  assert.equal(d().step, 'write');
  s.tick(1);
  assert.equal(d().step, 'read');
  const card = (id) => d().cards.find((c) => c.id === id);
  assert.equal(card(d().savantId).text, game.question.reponse, 'le Savant qui n’a rien écrit : sa vraie réponse est affichée à son nom');
  assert.equal(card(quiet.id).text, null, 'a séché');
  assert.equal(new Set(d().cards.map((c) => c.id)).size, 5);
});

test('un seul changement de phase à la fois ; le temps d’écriture est réglable ; événements périmés et doubles envois', async () => {
  const s = await setup(5);
  const { d, game } = s;
  assert.equal(s.act(s.writers()[0], { type: 'answer', text: 'trop tôt' }), 'Ce n’est pas le moment d’écrire.');
  s.toWrite();
  const stale = d().phaseId;
  const p = s.writers()[0];
  assert.equal(s.act(p, { type: 'answer', text: '  ' }), 'Écris une réponse.');
  assert.equal(s.act(p, { type: 'answer', text: 'un' }), null);
  assert.equal(s.act(p, { type: 'answer', text: 'deux' }), null, 'double clic / renvoi : la dernière réponse compte');
  assert.equal(d().answers[p.id], 'deux');
  assert.equal(game.publicState({ host: true }).round.written.n, 1, 'compté une seule fois');
  assert.equal(s.act(game.players.get(d().seekerId), { type: 'answer', text: 'le chercheur n’écrit pas' }), 'Tu ne réponds pas dans cette manche.');
  s.allWrite();
  s.tick(T.writeBeatMs);
  assert.equal(d().step, 'read');
  assert.match(s.act(p, { type: 'answer', text: 'en retard' }, stale), /Trop tard/);
  assert.equal(d().answers[p.id], `réponse de ${p.name}`, 'la réponse d’une étape passée est refusée, rien n’a bougé');
  // Pas de saut d'étape en doublon : un 2e passage au vote par le temps ne rejoue rien.
  const phase = d().phaseId;
  s.tick(500);
  assert.equal(d().phaseId, phase);
});

test('aucun écran de réglages : valeurs fixes (une manche par joueur, 10 au plus ; secours de 30 s à l’écriture et de 20 s au vote ; lecture de 6 s minimum)', async () => {
  const ctx = await makeGame('savant', names(5));
  ctx.game.savantFacts = [FACT(1), FACT(2)];
  assert.equal(ctx.game.publicState({ host: true }).lobby, null, 'rien à régler dans le lobby');
  assert.equal(ctx.game.gameHostAction({ type: 'config', rounds: 5, writeMs: 15000 }), 'Action inconnue.', 'plus de réglage côté serveur');
  assert.equal(ctx.game.start(), null);
  ctx.tick(T.announceMs);
  assert.equal(ctx.game.publicState({ host: true }).round.timer.totalMs, 30000, 'secours de 30 s pour écrire');
  assert.equal(T.chooseMs, 20000, 'secours de 20 s pour choisir et voter');
  assert.ok(T.readMinMs >= 6000);
  assert.equal(ctx.game.publicState({ host: true }).round.total, 5, 'une manche par joueur');
  const big = await makeGame('savant', names(18));
  big.game.savantFacts = [FACT(1), FACT(2)];
  big.game.start();
  assert.equal(big.game.publicState({ host: true }).round.total, 10, 'plafonné à 10');
});

test('pause : les minuteurs de l’étape se figent et reprennent là où ils étaient', async () => {
  const s = await setup(5);
  const { game, d } = s;
  s.tick(T.announceMs - 500);
  game.pause();
  s.tick(10 * 60_000);
  assert.equal(d().step, 'announce');
  game.resume();
  s.tick(499);
  assert.equal(d().step, 'announce');
  s.tick(2);
  assert.equal(d().step, 'write');
  s.allWrite();
  game.pause();
  s.tick(60_000);
  assert.equal(d().step, 'write', 'la pause gèle aussi la pause de fin d’écriture');
  game.resume();
  s.tick(T.writeBeatMs + 5);
  assert.equal(d().step, 'read');
});

test('changement de jeu en pleine manche : aucun minuteur du Savant ne se déclenche ensuite', async () => {
  for (const stop of ['announce', 'write', 'read', 'choice']) {
    const s = await setup(5);
    const { game, d } = s;
    if (stop !== 'announce') s.toWrite();
    if (stop === 'read' || stop === 'choice') {
      s.allWrite();
      s.tick(T.writeBeatMs);
    }
    if (stop === 'choice') s.tick(60_000);
    assert.equal(d().step, stop === 'choice' ? 'choice' : stop);
    game.end();
    assert.equal(game.chooseGame(), null);
    assert.equal(game.pickGame('qui-de-nous'), null);
    assert.equal(Object.keys(game.timers).length, 0, `minuteurs restants (${stop})`);
    s.tick(10 * 60_000);
    assert.equal(game.phase, 'lobby');
    assert.equal(game.mode, 'qui-de-nous');
  }
});

test('Chercheur qui ne choisit pas : révélation au chrono, il boit, aucun Bluffeur récompensé', async () => {
  const s = await setup(6);
  const { game, d } = s;
  s.toChoice();
  const seeker = d().seekerId;
  const savant = d().savantId;
  const spectators = s.writers().filter((p) => p.id !== savant);
  game.vote(spectators[0].id, savant, game.roundId); // un spectateur trouve le Savant
  s.tick(T.chooseMs - 1);
  assert.equal(game.phase, 'question');
  s.tick(1);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.results.choice, null);
  assert.equal(game.results.found, false);
  s.tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  assert.ok(game.pending, 'le spectateur juste a 1 gorgée à distribuer');
  s.tick(T.allocMs);
  assert.equal(game.phase, 'results');
  assert.equal(game.pending, false);
  assert.ok(game.sips.get(seeker) >= 2, 'le Chercheur boit');
  assert.ok(game.sips.get(savant) >= 1, 'le Savant boit');
  const given = [...game.sips.entries()].reduce((a, [, n]) => a + n, 0);
  assert.equal(given, 2 + 1 + 1, 'Chercheur 2 + Savant 1 + 1 gorgée tirée au hasard');
});

test('Chercheur juste : Bluffeurs 1 gorgée, distribution au choix des joueurs pendant 8 s, plafond respecté', async () => {
  const s = await setup(6);
  const { game, d, byId } = s;
  s.toChoice();
  const seeker = d().seekerId;
  const savant = d().savantId;
  s.voteAll();
  s.tick(T.voteBeatMs);
  assert.equal(game.phase, 'revealing');
  s.tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  assert.ok(game.pending);
  // Le Chercheur distribue ses 2 gorgées au Savant (de son choix) ; les autres laissent faire le hasard.
  assert.equal(game.action(seeker, { type: 'allocate', allocation: { [savant]: 2 } }), null);
  assert.equal(game.action(savant, { type: 'allocate', allocation: {} }), 'Tu n’as rien à distribuer.');
  s.tick(T.allocMs);
  assert.equal(game.pending, false);
  const bluffers = d().writers.filter((id) => id !== savant);
  for (const id of bluffers) assert.ok((game.sips.get(id) ?? 0) >= 1, `${byId(id).name} (Bluffeur) boit`);
  assert.ok(game.sips.get(savant) >= 2);
  for (const n of game.sips.values()) assert.ok(n <= 6);
});

test('distribution : dès que tous les distributeurs présents ont répondu, le résultat est définitif sans attendre 8 s', async () => {
  const s = await setup(5);
  const { game, d } = s;
  s.toChoice();
  s.voteAll();
  s.tick(T.voteBeatMs + game.rules.revealMs);
  assert.equal(game.phase, 'results');
  const holders = Object.keys(game.results.credits);
  assert.ok(holders.length >= 1);
  for (const id of holders) assert.equal(game.action(id, { type: 'allocate', allocation: {} }), null);
  assert.equal(game.pending, false, 'tout le monde a répondu : pas besoin d’attendre');
  assert.ok(d().seekerId);
});

test('votes : seuls le Chercheur et les Écrivains de la manche, jamais pour soi, ni pour le Chercheur, ni avant le choix', async () => {
  const s = await setup(6);
  const { game, d } = s;
  const seeker = d().seekerId;
  const writers = d().writers;
  assert.equal(game.vote(writers[0], writers[1], game.roundId), 'Le vote est fermé.', 'pas de vote avant le choix');
  s.toChoice();
  assert.equal(game.vote(writers[0], writers[0], game.roundId), 'Choix invalide.');
  assert.equal(game.vote(writers[0], seeker, game.roundId), 'Choix invalide.');
  assert.equal(game.vote(seeker, seeker, game.roundId), 'Choix invalide.');
  assert.equal(game.vote(seeker, 'inconnu', game.roundId), 'Choix invalide.');
  assert.equal(game.vote(seeker, writers[0], game.roundId), null);
  assert.equal(game.vote(seeker, writers[1], game.roundId), null, 'le vote est modifiable jusqu’à la révélation');
  assert.equal(game.votes.get(seeker), writers[1]);
  assert.equal(game.vote(writers[0], writers[1], game.roundId + 1), 'Cette manche est terminée.', 'vote d’une autre manche');
  const late = game.upsertPlayer({ name: 'Retardataire' }).player;
  game.connectPlayer(late, 'sx');
  assert.equal(game.vote(late.id, writers[0], game.roundId), 'Choix invalide.', 'arrivé en cours de manche : il joue la suivante');
});

test('Chercheur déconnecté : après le délai de grâce, la manche est rejouée avec un autre fait et un autre Chercheur', async () => {
  const s = await setup(6);
  const { game, d, byId } = s;
  s.toWrite();
  const firstSeeker = d().seekerId;
  const firstRound = game.roundId;
  const firstFact = game.question.id;
  const p = byId(firstSeeker);
  game.disconnectPlayer(p, 's' + names(6).indexOf(p.name));
  s.tick(TIMING.disconnectGraceMs - 10);
  assert.equal(game.roundId, firstRound, 'pas encore : il peut revenir');
  game.connectPlayer(p, 'retour');
  s.tick(10_000);
  assert.equal(game.roundId, firstRound, 'revenu à temps : rien ne change');
  game.disconnectPlayer(p, 'retour');
  s.tick(TIMING.disconnectGraceMs + 1);
  assert.notEqual(game.roundId, firstRound, 'nouvelle manche (identifiant jamais réutilisé)');
  assert.notEqual(d().seekerId, firstSeeker);
  assert.notEqual(game.question.id, firstFact);
  assert.equal(game.round, 1, 'le numéro de manche ne bouge pas');
  assert.equal(d().step, 'announce');
  assert.equal(game.publicState({ host: true }).round.restarted, true);
  assert.equal(game.action(byId(d().writers[0]).id, { type: 'answer', text: 'ancien', phaseId: `${firstRound}:2` }, firstRound), 'Cette manche est terminée.', 'un événement de la manche annulée est ignoré');
});

test('Chercheur retiré de la partie : la manche est rejouée tout de suite', async () => {
  const s = await setup(6);
  const { game, d } = s;
  s.toWrite();
  const round = game.roundId;
  const seeker = d().seekerId;
  game.removePlayer(seeker);
  assert.notEqual(game.roundId, round);
  assert.notEqual(d().seekerId, seeker);
  assert.ok(!d().writers.includes(seeker));
});

test('Savant déconnecté : sa vraie réponse est affichée à son nom, la manche continue', async () => {
  const s = await setup(6);
  const { game, d, byId } = s;
  s.toWrite();
  const savant = byId(d().savantId);
  game.disconnectPlayer(savant, 's' + names(6).indexOf(savant.name));
  for (const p of s.writers()) if (p.id !== savant.id) s.act(p, { type: 'answer', text: `texte ${p.name}` });
  s.tick(T.writeBeatMs + 5);
  assert.equal(d().step, 'read', 'on n’attend pas un joueur déconnecté');
  assert.equal(d().cards.find((c) => c.id === savant.id).text, game.question.reponse);
});

test('moins de 4 joueurs connectés : la manche attend, puis démarre dès que le groupe est complet', async () => {
  const s = await setup(5);
  const { game, d, players } = s;
  game.disconnectPlayer(players[3], 's3');
  game.disconnectPlayer(players[4], 's4');
  s.tick(30_000);
  assert.ok(['announce', 'write', 'read', 'choice'].includes(d().step), 'une manche en cours continue sans eux');
  const fresh = await makeGame('savant', names(5));
  fresh.game.savantFacts = [FACT(1), FACT(2), FACT(3)];
  fresh.game.disconnectPlayer(fresh.players[3], 's3');
  fresh.game.disconnectPlayer(fresh.players[4], 's4');
  assert.match(fresh.game.start(), /au moins 4 joueurs connectés/);
});

test('une manche en attente repart dès que 4 joueurs sont connectés', async () => {
  const { game, players } = await makeGame('savant', names(5));
  game.savantFacts = [FACT(1), FACT(2), FACT(3)];
  assert.equal(game.start(), null);
  game.disconnectPlayer(players[0], 's0');
  game.disconnectPlayer(players[1], 's1');
  // On simule le début d'une nouvelle manche avec 3 joueurs : elle attend.
  game.roundData = { seq: 0 };
  game.rules.startRound(game);
  assert.equal(game.roundData.step, 'waiting');
  game.connectPlayer(players[0], 's0b');
  assert.equal(game.roundData.step, 'announce');
  assert.equal(game.reveal(), 'Pas encore.');
});

test('hôte : masquer une réponse la rend « censurée » pour tous, un second tap la ré-affiche', async () => {
  const s = await setup(5);
  const { game, d } = s;
  assert.equal(game.gameHostAction({ type: 'censor', id: 'x' }), 'Pas encore de réponses à masquer.');
  s.toChoice();
  const id = d().cards[0].id;
  assert.equal(game.gameHostAction({ type: 'censor', id }), null);
  const card = (view) => game.publicState(view).round.cards.find((c) => c.id === id);
  assert.deepEqual({ ...card({ host: true }) }, { id, text: null, censored: true });
  assert.equal(card({ playerId: d().writers[0] }).censored, true);
  assert.equal(game.gameHostAction({ type: 'censor', id: 'inconnu' }), 'Réponse inconnue.');
  game.gameHostAction({ type: 'censor', id });
  assert.equal(card({ host: true }).censored, false);
});

test('nombre de manches : une par joueur (10 au plus) puis « dernière manche »', async () => {
  const s = await setup(5);
  const { game } = s;
  assert.equal(game.isLastRound, false);
  game.round = 4;
  assert.equal(game.isLastRound, false);
  game.round = 5;
  assert.equal(game.isLastRound, true, 'cinq joueurs : cinq manches');
  // Le réglage commun « nombre de questions » (maxRounds) peut raccourcir la partie, jamais l'allonger.
  game.round = 3;
  game.setSettings({ maxRounds: 10 });
  assert.equal(game.isLastRound, false);
  game.setSettings({ maxRounds: 0 });
  game.round = 2;
  assert.equal(game.isLastRound, false);
});

test('la vraie réponse n’est jamais dans l’état de la TV ni des autres, seulement pour le Savant', async () => {
  const s = await setup(6);
  const { game, d } = s;
  for (const step of ['announce', 'write', 'read', 'choice']) {
    if (step === 'write') s.toWrite();
    if (step === 'read') {
      s.allWrite();
      s.tick(T.writeBeatMs);
    }
    if (step === 'choice') s.tick(20_000);
    assert.equal(d().step, step);
    const secret = game.question.reponse;
    const explication = game.question.explication;
    assert.ok(!JSON.stringify(game.publicState({ host: true })).includes(secret), `TV (${step})`);
    assert.ok(!JSON.stringify(game.publicState({ host: true })).includes(explication), `TV explication (${step})`);
    for (const p of s.players) {
      const state = game.publicState({ playerId: p.id });
      const json = JSON.stringify(state);
      assert.ok(!json.includes(explication), `${p.name} explication (${step})`);
      if (p.id === d().savantId && step !== 'announce') assert.equal(state.round.me.truth, secret);
      else {
        assert.ok(!json.includes(secret), `${p.name} (${step})`);
        assert.equal(state.round.me.truth, null);
      }
    }
  }
});

test('récap : trophées du Savant (le plus crédible, le meilleur enquêteur, le Savant imbattable)', async () => {
  const { recordRound, computeTrophies } = await import('./recap.js');
  const stats = new Map();
  const ids = ['a', 'b', 'c', 'd'];
  // a cherche et trouve b ; puis c cherche et se trompe : d (Savant) n'est pas démasqué, b reçoit 2 votes de spectateurs.
  recordRound(stats, 'savant', { found: true, seekerId: 'a', savantId: 'b', bluffers: ['c', 'd'], voteCounts: { c: 1 } }, ids);
  recordRound(stats, 'savant', { found: false, seekerId: 'c', savantId: 'd', bluffers: ['a', 'b'], voteCounts: { a: 1, b: 2 } }, ids);
  recordRound(stats, 'savant', { found: false, seekerId: 'c', savantId: 'd', bluffers: ['a', 'b'], voteCounts: { b: 1 } }, ids);
  const trophies = Object.fromEntries(computeTrophies(ids.map((id) => ({ id, name: id })), {}, stats).map((t) => [t.id, t]));
  assert.equal(trophies.credible.playerId, 'b', 'b a trompé 3 spectateurs');
  assert.equal(trophies.enqueteur.playerId, 'a');
  assert.equal(trophies.imbattable.playerId, 'd');
});

test('mode soirée : Le Savant s’enchaîne tout seul (3 à 4 manches), le mode auto passe à la manche suivante', async () => {
  const { TRANSITION_MS } = await import('./party.js');
  const ctx = await makeGame(null, names(5));
  ctx.game.savantFacts = Array.from({ length: 12 }, (_, i) => FACT(i));
  assert.equal(ctx.game.startParty({ durationMs: 30 * 60_000, games: ['savant'] }), null);
  ctx.tick(TRANSITION_MS);
  assert.equal(ctx.game.mode, 'savant');
  assert.equal(ctx.game.phase, 'question');
  const rounds = ctx.game.party.block.rounds;
  assert.ok(rounds >= 3 && rounds <= 4);
  const seekers = new Set();
  // Personne ne joue : les chronos font avancer chaque manche, le mode auto enchaîne.
  for (let i = 0; i < rounds * 150 && ctx.game.mode === 'savant'; i++) {
    if (ctx.game.roundData.seekerId) seekers.add(ctx.game.roundData.seekerId);
    assert.equal(ctx.game.isLastRound, false, 'pas de « dernière manche » en mode soirée');
    ctx.tick(1000);
  }
  assert.ok(seekers.size >= 3, `les Chercheurs tournent (${seekers.size})`);
  assert.notEqual(ctx.game.mode === 'savant' && ctx.game.round > rounds, true, 'le bloc s’arrête après ses manches');
});
