// Noir Boire Mangue dans une vraie partie (horloge simulée) : étapes et minuteurs, avancement dès que tout le monde a voté, événements
// périmés, double clics, pause, changement de jeu, déconnexions, gorgées, censure. La confidentialité (sockets réels) : nbm-leak.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { NBM_TIMING } from './games/nbm.js';
import { TIMING } from './timing.js';
import { readFileSync } from 'node:fs';

const T = NBM_TIMING;
const PHRASES = Array.from({ length: 12 }, (_, i) => ({ niveau: 'chill', texte: `Phrase ${i} : ___ !` }));
const DECK = Array.from({ length: 150 }, (_, i) => `carte ${i}`);

async function setup(n = 5, settings) {
  const ctx = await makeGame('nbm', Array.from({ length: n }, (_, i) => `J${i}`), settings);
  ctx.game.nbmDeck = DECK;
  ctx.game.contentPool = () => ({ key: 'nbm-test', list: PHRASES });
  assert.equal(ctx.game.start(), null);
  const d = () => ctx.game.roundData;
  const byId = (id) => ctx.players.find((p) => p.id === id);
  const act = (p, action, phaseId = d().phaseId) => ctx.game.action(p.id, { ...action, phaseId });
  const toWrite = () => ctx.tick(T.announceMs);
  const allWrite = (text = (p) => `réponse de ${p.name}`) => {
    for (const p of ctx.players) assert.equal(act(p, { type: 'answer', text: text(p) }), null);
  };
  const toRate = () => {
    toWrite();
    allWrite();
    ctx.tick(T.writeBeatMs);
    assert.equal(d().step, 'rate');
  };
  /** Tout le monde (sauf l'auteur) note la réponse affichée. */
  const rateAll = (rating = 'drole') => {
    const author = d().order[d().index];
    for (const p of ctx.players) if (p.id !== author) assert.equal(act(p, { type: 'rate', rating }), null);
  };
  /** Joue toutes les réponses : chacune est notée par tous, puis on laisse passer les temps. */
  const rateEverything = (rating = () => 'drole') => {
    while (d().step === 'rate') {
      const author = d().order[d().index];
      for (const p of ctx.players) if (p.id !== author) act(p, { type: 'rate', rating: rating(p, author) });
      ctx.tick(T.showMinMs + T.miniMs);
    }
  };
  return { ...ctx, d, act, byId, toWrite, allWrite, toRate, rateAll, rateEverything };
}

test('manche complète : phrase 3 s, écriture (dès que tout le monde a envoyé), réponses une par une, révélation', async () => {
  const s = await setup(5);
  const { game, d } = s;
  assert.equal(d().step, 'announce');
  assert.equal(game.phase, 'question');
  assert.equal(game.publicState({ host: true }).round.sentence, game.question.texte);
  s.tick(T.announceMs - 1);
  assert.equal(d().step, 'announce');
  s.tick(1);
  assert.equal(d().step, 'write');
  const phases = [d().phaseId];
  // Écriture : on n'avance qu'une fois que tout le monde a envoyé.
  for (const p of s.players.slice(0, 4)) s.act(p, { type: 'answer', text: 'bla' });
  s.tick(T.writeBeatMs + 10);
  assert.equal(d().step, 'write', 'un joueur n’a pas encore écrit');
  s.act(s.players[4], { type: 'answer', text: 'bla' });
  s.tick(T.writeBeatMs);
  assert.equal(d().step, 'rate');
  assert.equal(d().order.length, 5);
  for (let i = 0; i < 5; i++) {
    phases.push(d().phaseId);
    assert.equal(d().step, 'rate');
    s.rateAll();
    s.tick(T.showMinMs + T.miniMs);
  }
  assert.equal(game.phase, 'revealing');
  assert.equal(new Set(phases).size, phases.length, 'identifiants de phase uniques');
  s.tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  assert.equal(game.results.board.length, 5);
});

test('secours : écriture à 30 s ; ceux qui n’ont rien écrit n’ont pas de carte', async () => {
  const s = await setup(5);
  const { d, game } = s;
  s.toWrite();
  for (const p of s.players.slice(0, 3)) s.act(p, { type: 'answer', text: `texte ${p.name}` });
  s.tick(T.writeMs - 1);
  assert.equal(d().step, 'write');
  s.tick(1);
  assert.equal(d().step, 'rate');
  assert.equal(d().order.length, 3, 'deux joueurs n’ont rien écrit : pas de carte vide');
  assert.deepEqual([...d().order].sort(), s.players.slice(0, 3).map((p) => p.id).sort());
  assert.equal(game.publicState({ host: true }).round.current.of, 3);
});

test('la réponse suivante arrive dès que tous ont voté, après 3 s minimum d’affichage et 1,5 s de mini-résultat', async () => {
  const s = await setup(5);
  const { d } = s;
  s.toRate();
  const first = d().index;
  s.tick(500);
  s.rateAll(); // tous ont voté à 0,5 s
  s.tick(T.showMinMs - 500 - 1);
  assert.equal(d().step, 'rate', 'la réponse reste affichée au moins 3 s');
  s.tick(1);
  assert.equal(d().step, 'mini', 'puis le mini-résultat');
  assert.ok(s.game.publicState({ host: true }).round.mini, 'jauge Nul / Meh / Drôle / Golden');
  s.tick(T.miniMs - 1);
  assert.equal(d().step, 'mini');
  s.tick(1);
  assert.equal(d().step, 'rate');
  assert.equal(d().index, first + 1);
});

test('secours : au bout de 15 s on passe à la suite même si quelqu’un n’a pas voté ; un votant absent compte pour 0', async () => {
  const s = await setup(5);
  const { d, game } = s;
  s.toRate();
  const author = d().order[0];
  const [a, b, c] = s.players.filter((p) => p.id !== author);
  s.act(a, { type: 'rate', rating: 'golden' });
  s.act(b, { type: 'rate', rating: 'meh' });
  s.tick(T.showMaxMs - 1);
  assert.equal(d().step, 'rate');
  s.tick(1);
  assert.equal(d().step, 'mini');
  assert.equal(c && d().ratings[author]?.[c.id], undefined);
  assert.equal(s.act(c, { type: 'rate', rating: 'drole' }), 'Ce n’est pas le moment de noter.', 'une note en retard est refusée');
  s.tick(T.miniMs);
  s.rateEverything();
  s.tick(game.rules.revealMs);
  const row = game.results.board.find((r) => r.authorId === author);
  assert.equal(row.points >= 5, true, 'Golden 4 + Meh 1 ; le votant absent n’a rien ajouté');
});

test('l’auteur ne note pas sa réponse (C’est ta réponse !), le Golden est unique par manche, les doubles clics ne comptent qu’une fois', async () => {
  const s = await setup(5);
  const { d, game } = s;
  s.toRate();
  const author = d().order[0];
  const me = s.byId(author);
  assert.equal(game.publicState({ playerId: author }).round.me.isAuthor, true);
  assert.equal(game.publicState({ playerId: s.players.find((p) => p.id !== author).id }).round.me.isAuthor, false);
  assert.match(s.act(me, { type: 'rate', rating: 'golden' }), /propre réponse/);
  const [v] = s.players.filter((p) => p.id !== author);
  assert.equal(s.act(v, { type: 'rate', rating: 'golden' }), null);
  assert.equal(s.act(v, { type: 'rate', rating: 'golden' }), null, 'double clic ignoré');
  assert.equal(s.act(v, { type: 'rate', rating: 'nul' }), null, 'on ne change pas de note');
  assert.equal(d().ratings[author][v.id], 'golden');
  assert.equal(game.publicState({ playerId: v.id }).round.me.goldenUsed, true, 'le bouton se grise avec « Golden utilisé »');
  assert.match(s.act(v, { type: 'rate', rating: 'inconnue' }), /Note/);
  // Réponse suivante : le Golden de v est épuisé pour toute la manche.
  s.rateAll();
  s.tick(T.showMinMs + T.miniMs);
  const next = d().order[d().index];
  if (next !== v.id) assert.match(s.act(v, { type: 'rate', rating: 'golden' }), /Golden/);
  assert.equal(s.act(v, { type: 'rate', rating: 'drole' }), next === v.id ? 'On ne note pas sa propre réponse.' : null);
});

test('événements périmés : une note ou une réponse d’une étape passée est refusée, rien ne bouge', async () => {
  const s = await setup(5);
  const { d } = s;
  assert.equal(s.act(s.players[0], { type: 'answer', text: 'trop tôt' }), 'Ce n’est pas le moment d’écrire.');
  s.toWrite();
  const stale = d().phaseId;
  s.allWrite();
  s.tick(T.writeBeatMs);
  assert.match(s.act(s.players[0], { type: 'answer', text: 'en retard' }, stale), /Trop tard/);
  assert.equal(d().answers[s.players[0].id], `réponse de ${s.players[0].name}`);
  const phase = d().phaseId;
  const author = d().order[0];
  const v = s.players.find((p) => p.id !== author);
  assert.match(s.act(v, { type: 'rate', rating: 'meh' }, stale), /Trop tard/);
  assert.equal(d().ratings[author]?.[v.id], undefined);
  s.tick(500);
  assert.equal(d().phaseId, phase, 'pas de saut d’étape en doublon');
  // Action d'une autre manche (roundId périmé).
  assert.equal(s.game.action(v.id, { type: 'rate', rating: 'meh' }, 999), 'Cette manche est terminée.');
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
  assert.equal(d().step, 'write');
  game.resume();
  s.tick(T.writeBeatMs + 5);
  assert.equal(d().step, 'rate');
  s.rateAll();
  game.pause();
  s.tick(60_000);
  assert.equal(d().step, 'rate', 'la pause gèle aussi le temps d’affichage minimum');
  game.resume();
  s.tick(T.showMinMs + 5);
  assert.equal(d().step, 'mini');
});

test('changement de jeu en pleine manche : aucun minuteur de Noir Boire Mangue ne se déclenche ensuite', async () => {
  for (const stop of ['announce', 'write', 'rate', 'mini']) {
    const s = await setup(5);
    const { game, d } = s;
    if (stop !== 'announce') s.toWrite();
    if (stop === 'rate' || stop === 'mini') {
      s.allWrite();
      s.tick(T.writeBeatMs);
    }
    if (stop === 'mini') {
      s.rateAll();
      s.tick(T.showMinMs);
    }
    assert.equal(d().step, stop);
    game.end();
    assert.equal(game.chooseGame(), null);
    assert.equal(game.pickGame('qui-de-nous'), null);
    assert.equal(Object.keys(game.timers).length, 0, `minuteurs restants (${stop})`);
    s.tick(10 * 60_000);
    assert.equal(game.phase, 'lobby');
    assert.equal(game.mode, 'qui-de-nous');
  }
});

test('déconnexion et reconnexion à chaque étape : le joueur retrouve sa vue privée (main, réponse, note), la manche n’attend pas indéfiniment', async () => {
  const s = await setup(5);
  const { game, d } = s;
  const p = s.players[1];
  const view = () => game.publicState({ playerId: p.id }).round.me;
  const hand = [...d().hands[p.id]];
  s.toWrite();
  assert.deepEqual(view().hand, hand, 'la main est envoyée pendant l’écriture');
  s.act(p, { type: 'answer', text: 'ma réponse' });
  game.disconnectPlayer(p, [...p.sockets][0]);
  assert.equal(d().answers[p.id], 'ma réponse', 'sa réponse déjà envoyée reste');
  game.connectPlayer(p, 'retour');
  assert.equal(view().myAnswer, 'ma réponse');
  assert.deepEqual(view().hand, hand);
  for (const q of s.players) if (q.id !== p.id) s.act(q, { type: 'answer', text: `texte ${q.name}` });
  s.tick(T.writeBeatMs);
  assert.equal(d().step, 'rate');
  const author = d().order[0];
  const voter = p.id === author ? s.players[2] : p;
  s.act(voter, { type: 'rate', rating: 'drole' });
  game.disconnectPlayer(voter, [...voter.sockets][0]);
  game.connectPlayer(voter, 'retour2');
  assert.equal(game.publicState({ playerId: voter.id }).round.me.myRating, 'drole', 'sa note déjà donnée reste');
  // Un joueur parti pour de bon n'empêche pas d'avancer : à la fin du délai de grâce, on n'attend plus que les présents.
  const gone = s.players.find((q) => q.id !== author && q.id !== voter.id);
  game.disconnectPlayer(gone, [...gone.sockets][0]);
  for (const q of s.players) if (q.id !== author && q.id !== gone.id && q.sockets.size) s.act(q, { type: 'rate', rating: 'meh' });
  s.tick(TIMING.disconnectGraceMs - 100);
  assert.equal(d().step, 'rate', 'un joueur qui recharge sa page est encore attendu pendant le délai de grâce');
  s.tick(200);
  assert.notEqual(d().step, 'rate', 'passé ce délai, on avance sans lui');
});

test('la manche attend des joueurs quand il en manque, puis repart', async () => {
  const s = await setup(3);
  assert.ok(s.game);
  const t = await setup(3);
  t.game.disconnectPlayer(t.players[2], [...t.players[2].sockets][0]);
  t.game.roundData = {};
  t.game.rules.startRound(t.game);
  assert.equal(t.game.roundData.step, 'waiting');
  t.game.connectPlayer(t.players[2], 'retour');
  assert.equal(t.game.roundData.step, 'announce', 'dès que 3 joueurs sont là, la manche démarre');
});

test('résultats : gagnant distribue 2 (au choix, sinon au hasard), dernier boit 2, ex æquo, plafond, joueurs sans réponse', async () => {
  const s = await setup(6);
  const { game, d } = s;
  s.toWrite();
  // Le dernier joueur n'écrit rien : il ne peut ni gagner ni être dernier.
  const silent = s.players[5];
  for (const p of s.players.slice(0, 5)) s.act(p, { type: 'answer', text: `texte ${p.name}` });
  s.tick(T.writeMs);
  assert.equal(d().step, 'rate');
  const [w, l] = s.players;
  s.rateEverything((voter, author) => (author === w.id ? 'golden' : author === l.id ? 'nul' : 'meh'));
  s.tick(game.rules.revealMs);
  assert.equal(game.phase, 'results');
  const res = game.results;
  assert.deepEqual(res.winners, [w.id]);
  assert.deepEqual(res.losers, [l.id]);
  assert.ok(!res.board.some((r) => r.authorId === silent.id));
  assert.equal(game.pending, true, 'fenêtre de distribution de 8 s');
  assert.equal(game.action(w.id, { type: 'allocate', allocation: { [s.players[2].id]: 2 } }), null);
  assert.equal(game.pending, false, 'tous les distributeurs ont répondu : verdict immédiat');
  assert.equal(game.sips.get(l.id), 2, 'le dernier boit 2');
  assert.equal(game.sips.get(s.players[2].id), 2, 'le gagnant a distribué ses 2 gorgées à son choix');
  assert.ok(!game.sips.has(silent.id));
  assert.equal(game.sips.get(w.id) ?? 0, 0);
});

test('distribution sans choix : tirée au hasard au bout de 8 s', async () => {
  const s = await setup(5);
  const { game } = s;
  s.toRate();
  s.rateEverything((voter, author) => (author === s.players[0].id ? 'golden' : 'nul'));
  s.tick(game.rules.revealMs);
  assert.equal(game.pending, true);
  s.tick(T.allocMs);
  assert.equal(game.pending, false);
  const sips = [...game.sips.values()].reduce((a, b) => a + b, 0);
  assert.equal(sips, 2 + 2 * game.results.losers.length, '2 gorgées du gagnant tirées au hasard + 2 par dernier');
});

test('censure : l’hôte masque la réponse affichée d’un tap (0 point, auteur non puni) et la suite arrive', async () => {
  const s = await setup(5);
  const { game, d } = s;
  s.toRate();
  const author = d().order[0];
  assert.equal(game.gameHostAction({ type: 'censor' }), null);
  assert.equal(game.publicState({ host: true }).round.current.censored, true);
  assert.equal(game.publicState({ host: true }).round.current.text, null, 'le texte n’est plus envoyé');
  s.tick(400 + T.miniMs + 10);
  assert.equal(d().index, 1, 'on passe à la réponse suivante');
  s.rateEverything(() => 'drole');
  s.tick(game.rules.revealMs);
  const row = game.results.board.find((r) => r.authorId === author);
  assert.equal(row.points, 0);
  assert.ok(!game.results.winners.includes(author) && !game.results.losers.includes(author));
  assert.equal(game.gameHostAction({ type: 'inconnue' }), 'Action inconnue.');
});

test('manches : une par joueur, 8 au plus, et la partie se termine ; classement des points et réponse la plus drôle', async () => {
  const s = await setup(3);
  const { game } = s;
  assert.equal(game.publicState({ host: true }).round.total, 3);
  for (let r = 1; r <= 3; r++) {
    assert.equal(game.isLastRound, r === 3);
    s.toWrite();
    s.allWrite((p) => `réponse ${r} de ${p.name}`);
    s.tick(T.writeBeatMs);
    s.rateEverything((voter, author) => (author === s.players[r - 1].id ? 'golden' : 'meh'));
    s.tick(game.rules.revealMs);
    if (game.pending) s.tick(T.allocMs);
    assert.equal(game.phase, 'results');
    if (r < 3) assert.equal(game.nextQuestion(), null);
  }
  game.end();
  const state = game.publicState({ host: true });
  assert.ok(state.round.best, 'la réponse la plus drôle de la partie est connue à la fin');
  assert.equal(state.round.best.points, 8);
  for (const p of s.players) assert.ok(state.stats[p.id].points > 0);
  const big = await setup(14);
  assert.equal(big.game.publicState({ host: true }).round.total, 8);
});

test('mode 18+ : le paquet 18+ n’est utilisé que si le mode est actif, avec ses propres cartes', async () => {
  const s = await setup(4);
  const { game } = s;
  // Hors mode 18+ : cartes normales.
  for (const hand of Object.values(s.d().hands)) for (const c of hand) assert.ok(DECK.includes(c));
  assert.equal(game.adult.active, false);
});

const readJson = (name) => JSON.parse(readFileSync(new URL(`./content/${name}`, import.meta.url), 'utf8'));
const cartes = readJson('cartes-nbm.json').map((c) => c.texte);
const cartes18 = readJson('cartes-nbm-18plus.json').map((c) => c.texte);

test('étanchéité avec le vrai contenu : normal = jamais de carte ni de phrase 18+, 18+ = uniquement des cartes 18+', async () => {
  const names = ['Ana', 'Ben', 'Chloé', 'Dan'];
  for (let i = 0; i < 25; i++) {
    const normal = await makeGame('nbm', names);
    assert.equal(normal.game.start(), null);
    assert.notEqual(normal.game.question.adulte, true, 'phrase 18+ en mode normal');
    for (const hand of Object.values(normal.game.roundData.hands)) for (const c of hand) assert.ok(cartes.includes(c) && !cartes18.includes(c), `carte « ${c} » en mode normal`);

    const adult = await makeGame('nbm', names);
    adult.game.requestAdult();
    for (const p of adult.players) adult.game.answerAdult(p.id, true);
    assert.equal(adult.game.adult.active, true);
    assert.equal(adult.game.start(), null);
    assert.equal(adult.game.question.adulte, true, 'phrase normale en mode 18+');
    for (const hand of Object.values(adult.game.roundData.hands)) for (const c of hand) assert.ok(cartes18.includes(c) && !cartes.includes(c), `carte « ${c} » en mode 18+`);
  }
});

test('mode soirée : Noir Boire Mangue fait partie du programme, avec 2 à 3 manches', async () => {
  const { partyGames } = await import('./games/index.js');
  const me = partyGames().find((g) => g.id === 'nbm');
  assert.ok(me.playable);
  assert.equal(me.minToStart, 3);
  assert.deepEqual(me.partyRounds, [2, 3]);
  assert.notEqual(me.partyDefault, false, 'coché par défaut');
  const ctx = await makeGame('qui-de-nous', Array.from({ length: 5 }, (_, i) => `J${i}`));
  const { eligibleGames, buildProgram } = await import('./party.js');
  assert.ok(eligibleGames(partyGames(), 5).some((g) => g.id === 'nbm'));
  assert.ok(buildProgram(partyGames(), 5, { length: 12 }).some((b) => b.mode === 'nbm'));
  assert.ok(ctx.game);
});
