// Mode Duel : règles pures (tirage, roi, cote, gorgées) et moteur (étapes, paris, annulations, reprise) avec une horloge factice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from './rules/duel.js';
import { makeGame } from './testClock.js';
import { Spotlight } from './spotlight.js';
import { DUEL_TIMING } from './games/duel.js';

const ROLE = 'duel:duelliste';
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
const count = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());

// ---------- Règles pures ----------

test('tirage : jamais le même joueur deux duels de suite (4 joueurs ou plus), jamais la même paire, camps aléatoires', () => {
  for (const n of [4, 5, 8, 30]) {
    const sp = new Spotlight();
    const here = ids(n);
    let last = null;
    const camps = { rouge: 0, bleu: 0 };
    for (let i = 0; i < 300; i++) {
      const duel = D.pickDuelists({ spotlight: sp, role: ROLE, here, last });
      assert.notEqual(duel.rouge, duel.bleu);
      if (last) {
        assert.ok(!last.pair.includes(duel.rouge) && !last.pair.includes(duel.bleu), `${n} joueurs : un joueur du duel précédent`);
      }
      camps[here.indexOf(duel.rouge) < n / 2 ? 'rouge' : 'bleu'] += 1;
      last = { pair: [duel.rouge, duel.bleu], challenger: null };
    }
  }
});

test('tirage : à 3 joueurs, la paire change toujours', () => {
  const sp = new Spotlight();
  let last = null;
  for (let i = 0; i < 200; i++) {
    const duel = D.pickDuelists({ spotlight: sp, role: ROLE, here: ids(3), last });
    if (last) assert.notDeepEqual([duel.rouge, duel.bleu].sort(), [...last.pair].sort());
    last = { pair: [duel.rouge, duel.bleu], challenger: null };
  }
});

test('tirage équitable : sur 600 duels à 6 joueurs, chacun se bat à peu près autant, la couleur est équilibrée', () => {
  const sp = new Spotlight();
  const here = ids(6);
  const fights = [];
  const reds = [];
  let last = null;
  for (let i = 0; i < 600; i++) {
    const duel = D.pickDuelists({ spotlight: sp, role: ROLE, here, last });
    fights.push(duel.rouge, duel.bleu);
    reds.push(duel.rouge);
    last = { pair: [duel.rouge, duel.bleu], challenger: null };
  }
  for (const n of count(fights).values()) assert.ok(Math.abs(n - 200) <= 10, `combats ${n}`);
  for (const n of count(reds).values()) assert.ok(n > 60 && n < 140, `rouge ${n}`);
  assert.equal(count(fights).size, 6, 'tout le monde est tiré');
});

test('roi de la colline : le roi reste dans son camp, le challenger change et n’est jamais le précédent (4+)', () => {
  const sp = new Spotlight();
  const here = ids(5);
  const king = { id: 'p2', camp: 'bleu', streak: 2 };
  let last = null;
  for (let i = 0; i < 100; i++) {
    const duel = D.pickDuelists({ spotlight: sp, role: ROLE, here, king, last });
    assert.equal(duel.kingId, 'p2');
    assert.equal(duel.bleu, 'p2');
    const challenger = duel.rouge;
    assert.notEqual(challenger, last?.challenger);
    last = { pair: [duel.rouge, duel.bleu], challenger };
  }
  assert.equal(D.pickDuelists({ spotlight: sp, role: ROLE, here: ['a', 'b'] }), null, 'moins de 3 joueurs');
  const gone = D.pickDuelists({ spotlight: sp, role: ROLE, here, king: { id: 'parti', camp: 'rouge', streak: 1 } });
  assert.equal(gone.kingId, null, 'un roi absent ne compte pas');
});

test('mini-jeu : jamais deux fois le même, sauf s’il n’y en a qu’un ; seulement les jeux actifs', () => {
  let last = null;
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const id = D.pickMinigame(['a', 'b', 'c'], last);
    assert.notEqual(id, last);
    seen.add(id);
    last = id;
  }
  assert.equal(seen.size, 3);
  assert.equal(D.pickMinigame(['a'], 'a'), 'a');
  assert.deepEqual(D.activeGames({ games: ['b', 'zzz'] }, ['a', 'b', 'c']), ['b']);
  assert.deepEqual(D.activeGames({ games: null }, ['a', 'b']), ['a', 'b']);
});

test('options : valeurs inconnues ignorées, au moins un mini-jeu', () => {
  const all = ['a', 'b', 'c'];
  assert.deepEqual(D.cleanOptions({ king: true, cote: 'hardcore' }, D.DEFAULT_OPTIONS, all).options, { king: true, cote: 'hardcore', games: null });
  assert.equal(D.cleanOptions({ cote: 'nimporte' }, D.DEFAULT_OPTIONS, all).options.cote, 'standard');
  assert.ok(D.cleanOptions({ games: [] }, D.DEFAULT_OPTIONS, all).error);
  assert.ok(D.cleanOptions({ games: ['zzz'] }, D.DEFAULT_OPTIONS, all).error);
  assert.deepEqual(D.cleanOptions({ games: ['a', 'a', 'zzz'] }, D.DEFAULT_OPTIONS, all).options.games, ['a']);
});

test('gorgées du perdant : Standard 1 + ⌈B/2⌉ (plafond 8), Hardcore B (1 au moins, plafond 15)', () => {
  const standard = { 0: 1, 1: 2, 2: 2, 6: 4, 14: 8, 30: 8 };
  for (const [B, n] of Object.entries(standard)) assert.equal(D.loserSips(Number(B), 'standard'), n, `Standard B=${B}`);
  const hardcore = { 0: 1, 1: 1, 2: 2, 6: 6, 14: 14, 30: 15 };
  for (const [B, n] of Object.entries(hardcore)) assert.equal(D.loserSips(Number(B), 'hardcore'), n, `Hardcore B=${B}`);
});

const bettors = ['b1', 'b2', 'b3', 'b4', 'b5'];
const settle = (extra) => D.settleDuel({ winner: 'rouge', red: 'R', blue: 'B', bettors, bets: {}, ...extra });

test('gorgées d’un duel : parieurs sur le perdant 1, non-parieurs 1, vainqueur 0, perdant selon la cote', () => {
  const r = settle({ bets: { b1: 'rouge', b2: 'rouge', b3: 'bleu' } });
  assert.equal(r.B, 2);
  assert.deepEqual(r.sips, { B: 2, b3: 1, b4: 1, b5: 1 }, 'perdant 1 + ⌈2/2⌉ = 2 ; b3 a perdu son pari ; b4 et b5 n’ont pas parié');
  assert.equal(r.sips.R, undefined);
  assert.equal(r.sips.b1, undefined);
  assert.equal(settle({ bets: {}, cote: 'standard' }).sips.B, 1, 'aucun parieur : 1 gorgée');
  assert.equal(settle({ bets: { b1: 'rouge' }, cote: 'standard' }).sips.B, 2, 'un seul parieur');
  assert.equal(settle({ bets: { b1: 'rouge' }, cote: 'hardcore' }).sips.B, 1);
  assert.equal(settle({ bets: { b1: 'rouge', b2: 'rouge', b3: 'rouge', b4: 'rouge', b5: 'rouge' }, cote: 'hardcore' }).sips.B, 5);
  const crowd = Array.from({ length: 30 }, (_, i) => `x${i}`);
  const big = D.settleDuel({ winner: 'bleu', red: 'R', blue: 'B', bettors: crowd, bets: Object.fromEntries(crowd.map((id) => [id, 'bleu'])) });
  assert.equal(big.sips.R, 8, 'plafond Standard');
  assert.equal(D.settleDuel({ winner: 'bleu', red: 'R', blue: 'B', bettors: crowd, bets: Object.fromEntries(crowd.map((id) => [id, 'bleu'])), cote: 'hardcore' }).sips.R, 15);
});

test('roi qui chute : + ses victoires consécutives, sans dépasser le plafond ; séries de 1 à 5', () => {
  for (let streak = 1; streak <= 5; streak++) {
    const r = D.settleDuel({ winner: 'rouge', red: 'C', blue: 'K', bettors: bettors, bets: { b1: 'rouge', b2: 'rouge' }, kingId: 'K', kingStreak: streak });
    assert.equal(r.sips.K, Math.min(8, 2 + streak), `série ${streak}`);
    const h = D.settleDuel({ winner: 'rouge', red: 'C', blue: 'K', bettors: bettors, bets: { b1: 'rouge', b2: 'rouge' }, kingId: 'K', kingStreak: streak, cote: 'hardcore' });
    assert.equal(h.sips.K, Math.min(15, 2 + streak));
  }
  const capped = D.settleDuel({ winner: 'rouge', red: 'C', blue: 'K', bettors: bettors, bets: Object.fromEntries(bettors.map((id) => [id, 'rouge'])), kingId: 'K', kingStreak: 5 });
  assert.equal(capped.sips.K, 8, '1 + 3 + 5 plafonné à 8');
  const wins = D.settleDuel({ winner: 'bleu', red: 'C', blue: 'K', bettors, bets: {}, kingId: 'K', kingStreak: 4 });
  assert.equal(wins.sips.K, undefined, 'le roi qui gagne ne boit pas');
});

test('égalité : les deux duellistes boivent 1, les parieurs sont épargnés', () => {
  const r = settle({ winner: 'égalité', bets: { b1: 'rouge', b2: 'bleu' } });
  assert.deepEqual(r.sips, { R: 1, B: 1 });
});

test('cote en direct : pourcentages entiers, 50 / 50 sans pari', () => {
  assert.deepEqual(D.oddsPct({}, bettors), { rouge: 50, bleu: 50, n: 0 });
  assert.deepEqual(D.oddsPct({ b1: 'rouge', b2: 'rouge', b3: 'bleu' }, bettors), { rouge: 67, bleu: 33, n: 3 });
});

test('roi de la colline : couronne, série, chute, retraite à 5 victoires, égalité', () => {
  const base = { red: 'A', blue: 'B', kingMode: true };
  assert.equal(D.nextKing({ ...base, king: null, winner: 'rouge' }).king.id, 'A', 'le vainqueur est couronné');
  assert.deepEqual(D.nextKing({ ...base, king: null, winner: 'bleu' }).king, { id: 'B', camp: 'bleu', streak: 1 });
  assert.equal(D.nextKing({ ...base, king: { id: 'A', camp: 'rouge', streak: 2 }, winner: 'rouge' }).king.streak, 3);
  const fall = D.nextKing({ ...base, king: { id: 'A', camp: 'rouge', streak: 2 }, winner: 'bleu' });
  assert.ok(fall.fell);
  assert.equal(fall.king.id, 'B');
  const retire = D.nextKing({ ...base, king: { id: 'A', camp: 'rouge', streak: 4 }, winner: 'rouge' });
  assert.ok(retire.retired);
  assert.equal(retire.king, null);
  assert.equal(D.nextKing({ ...base, king: { id: 'A', camp: 'rouge', streak: 3 }, winner: 'égalité' }).king, null);
  assert.equal(D.nextKing({ ...base, kingMode: false, king: null, winner: 'rouge' }).king, null);
});

// ---------- Moteur ----------

const FAKE = {
  id: 'fake',
  name: 'Faux jeu',
  icon: 'flame',
  category: 'test',
  maxMs: 8000,
  minContent: 0,
  prepare: (ctx) => ({ secret: ctx.rng(), winner: null, taps: [] }),
  action(state, camp, data) {
    if (data.win) state.winner = camp;
    return null;
  },
  result: (state) => (state.winner ? { winner: state.winner, details: { fake: true } } : null),
  resolve: () => ({ winner: 'égalité', details: { timeout: true } }),
  view: (state, who) => ({ done: !!state.winner, kind: who.kind }),
};
const FAKE2 = { ...FAKE, id: 'fake2', name: 'Autre jeu' };

async function setup(n = 5, extra = {}) {
  const ctx = await makeGame('duel', ids(n).map((_, i) => `J${i}`));
  ctx.game.duelMinigames = extra.games ?? { fake: FAKE, fake2: FAKE2 };
  if (extra.options) ctx.game.duelOptions = { ...D.DEFAULT_OPTIONS, ...extra.options };
  const d = () => ctx.game.roundData;
  const T = DUEL_TIMING;
  const byId = Object.fromEntries(ctx.players.map((p) => [p.id, p]));
  const toBets = () => {
    ctx.tick(T.duelistsMs);
    ctx.tick(T.gameMs);
  };
  const toPlay = () => {
    toBets();
    ctx.tick(T.betsMs);
    ctx.tick(T.betsRevealMs);
    for (const id of [d().red, d().blue]) assert.equal(ctx.game.action(id, { type: 'ready' }), null);
    ctx.tick(T.readyBeatMs);
  ctx.tick(T.introMs);
  };
  return { ...ctx, d, T, byId, toBets, toPlay, step: () => d().step };
}

test('lancement : 3 joueurs connectés au moins, jamais plus de 30, au moins un mini-jeu', async () => {
  const s = await setup(2);
  assert.match(s.game.start(), /au moins 3/);
  const t = await setup(3);
  assert.equal(t.game.start(), null);
  const none = await setup(4, { games: {} });
  assert.match(none.game.start(), /mini-jeu/);
  const big = await setup(31);
  assert.match(big.game.start(), /30/);
});

test('un duel complet : duellistes → mini-jeu → paris → révélation → prêts → duel → verdict, gorgées appliquées, duel suivant en auto', async () => {
  const s = await setup(5);
  const { game } = s;
  assert.equal(game.start(), null);
  assert.ok(game.settings.auto, 'enchaînement automatique activé au lancement');
  assert.equal(s.step(), 'duelists');
  const { red, blue } = s.d();
  assert.ok(red && blue && red !== blue);
  const first = game.roundId;
  s.tick(s.T.duelistsMs);
  assert.equal(s.step(), 'game');
  s.tick(s.T.gameMs);
  assert.equal(s.step(), 'bets');
  const bettors = s.d().bettors;
  assert.equal(bettors.length, 3);
  assert.ok(!bettors.includes(red) && !bettors.includes(blue));
  assert.ok(game.vote(bettors[0], 'rouge', first) === null);
  assert.ok(game.vote(bettors[0], 'bleu', first) === null, 'pari modifiable jusqu’à la révélation');
  assert.match(game.vote(red, 'rouge', first), /invalide/, 'un duelliste ne parie pas');
  game.vote(bettors[1], 'bleu', first);
  assert.equal(game.publicState({ host: true }).votedIds.length, 0, 'aucun nom dans les paris en cours');
  assert.deepEqual(game.publicState({ host: true }).round.betCount, { n: 2, of: 3 });
  assert.equal(game.publicState({ host: true }).round.bets, null);
  game.vote(bettors[2], 'bleu', first);
  s.tick(s.T.betsBeatMs);
  assert.equal(s.step(), 'betsReveal');
  assert.match(game.vote(bettors[0], 'rouge', first), /fermé/, 'plus de pari après la révélation');
  assert.deepEqual(game.publicState({ host: true }).round.odds, { rouge: 0, bleu: 100, n: 3 });
  s.tick(s.T.betsRevealMs);
  assert.equal(s.step(), 'ready');
  game.action(red, { type: 'ready' });
  assert.equal(s.step(), 'ready', 'un seul prêt : on attend l’autre');
  game.action(blue, { type: 'ready' });
  s.tick(s.T.readyBeatMs);
  s.tick(s.T.introMs);
  assert.equal(s.step(), 'play');
  assert.match(game.action(bettors[0], { type: 'play', data: { win: true } }), /ne te bats pas/);
  assert.equal(game.action(blue, { type: 'play', data: { win: true } }), null);
  assert.equal(game.phase, 'revealing');
  assert.equal(game.results.winner, 'bleu');
  s.tick(s.T.resultMs);
  assert.equal(game.phase, 'results');
  assert.equal(game.sips.get(red), 1 + Math.ceil(3 / 2), 'perdant : 3 parieurs sur le vainqueur');
  assert.equal(game.sips.get(bettors[0]) ?? 0, 0, 'a parié bleu (modifié) : juste');
  assert.equal(game.sips.get(blue) ?? 0, 0);
  s.tick(game.settings.resultsMs);
  assert.equal(game.phase, 'question', 'duel suivant tout seul');
  assert.equal(game.round, 2);
  assert.notEqual(game.roundId, first);
  assert.ok(!(s.d().red === red && s.d().blue === blue) && ![s.d().red, s.d().blue].some((id) => [red, blue].includes(id)), 'jamais les mêmes joueurs deux duels de suite');
});

test('non-parieurs et mauvais paris : 1 gorgée chacun ; égalité par temps écoulé : seuls les duellistes boivent 1', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  const [a, b, c] = s.d().bettors;
  s.game.vote(a, 'rouge');
  s.game.vote(b, 'bleu');
  s.tick(s.T.betsMs); // c n'a pas parié
  s.tick(s.T.betsRevealMs);
  s.toPlay.length;
  for (const id of [s.d().red, s.d().blue]) s.game.action(id, { type: 'ready' });
  s.tick(s.T.readyBeatMs);
  s.tick(s.T.introMs);
  s.tick(FAKE.maxMs + s.T.playPadMs); // personne ne joue : résolution forcée → égalité
  assert.equal(s.game.results.winner, 'égalité');
  s.tick(s.T.resultMs);
  assert.equal(s.game.sips.get(s.d().red), 1);
  assert.equal(s.game.sips.get(s.d().blue), 1);
  for (const id of [a, b, c]) assert.equal(s.game.sips.get(id) ?? 0, 0, 'parieurs épargnés en cas d’égalité');
});

test('duelliste déconnecté : attente 10 s puis duel annulé (aucune gorgée), un nouveau duel est tiré ; reconnecté à temps, rien ne change', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  const [a] = s.d().bettors;
  s.game.vote(a, 'rouge');
  const { red } = s.d();
  const first = s.game.roundId;
  const player = s.byId[red];
  s.game.disconnectPlayer(player, `s${s.players.indexOf(player)}`);
  s.tick(5000);
  s.game.connectPlayer(player, 'again');
  s.tick(8000);
  assert.equal(s.game.roundId, first, 'revenu à temps : même duel');
  s.game.disconnectPlayer(player, 'again');
  s.tick(DUEL_TIMING.graceMs - 1);
  assert.equal(s.game.roundId, first);
  s.tick(2);
  assert.notEqual(s.game.roundId, first, 'duel annulé après 10 s');
  assert.equal(s.step(), 'notice');
  assert.equal(s.d().notice.kind, 'gone');
  assert.deepEqual(s.d().notice.ids, [red]);
  assert.equal(s.game.votes.size, 0, 'les paris du duel annulé sont effacés');
  assert.equal(s.game.round, 1, 'même numéro : ce n’est pas un nouveau duel compté');
  assert.equal([...s.game.sips.values()].reduce((x, y) => x + y, 0), 0, 'aucune gorgée');
  assert.notEqual(s.d().red, red);
  assert.notEqual(s.d().blue, red);
});

test('un duelliste qui n’est pas prêt en 5 s : duel annulé ; les deux prêts : le duel part', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  s.tick(s.T.betsMs);
  s.tick(s.T.betsRevealMs);
  assert.equal(s.step(), 'ready');
  const { red } = s.d();
  s.game.action(red, { type: 'ready' });
  s.tick(s.T.readyMs);
  assert.equal(s.d().notice.kind, 'notReady');
  assert.equal(s.d().notice.ids.length, 1);
  assert.notEqual(s.d().notice.ids[0], red);
  assert.equal(s.step(), 'notice');
});

test('la fin du duel tombe pendant l’attente d’un duelliste absent : le résultat reste valable', async () => {
  const s = await setup(5);
  s.game.start();
  s.toPlay();
  const { red, blue } = s.d();
  s.game.disconnectPlayer(s.byId[blue], `s${s.players.indexOf(s.byId[blue])}`);
  s.tick(2000);
  s.game.action(red, { type: 'play', data: { win: true } });
  assert.equal(s.game.phase, 'revealing');
  s.tick(DUEL_TIMING.graceMs);
  assert.equal(s.game.phase, 'results');
  assert.equal(s.game.round, 1);
  assert.equal(s.game.results.winner, 'rouge', 'jamais annulé après le résultat');
});

test('joueur retiré par l’hôte : duel annulé tout de suite s’il se battait, intact sinon', async () => {
  const s = await setup(6);
  s.game.start();
  s.toBets();
  const first = s.game.roundId;
  s.game.removePlayer(s.d().bettors[0]);
  assert.equal(s.game.roundId, first, 'un parieur parti ne change rien');
  s.game.removePlayer(s.d().blue);
  assert.notEqual(s.game.roundId, first);
  assert.equal(s.d().notice.kind, 'removed');
});

test('arrivée en plein duel : parieur seulement au duel suivant ; avant l’ouverture des paris, elle peut parier', async () => {
  const s = await setup(5);
  s.game.start();
  s.tick(s.T.duelistsMs);
  s.tick(s.T.gameMs);
  assert.equal(s.step(), 'bets');
  const { player } = s.game.upsertPlayer({ name: 'Retardataire' });
  s.game.connectPlayer(player, 'late');
  assert.match(s.game.vote(player.id, 'rouge'), /invalide/, 'arrivé après l’ouverture des paris');
  assert.equal(s.game.publicState({ playerId: player.id }).round.me.role, 'out');
  assert.equal(s.d().bettors.length, 3);
  const early = await setup(5);
  early.game.start();
  const { player: p2 } = early.game.upsertPlayer({ name: 'Tôt' });
  early.game.connectPlayer(p2, 'early');
  early.toBets();
  assert.ok(early.d().bettors.includes(p2.id), 'arrivé pendant les roulettes : il peut parier');
});

test('moins de 3 joueurs connectés : le mode se met en pause avec un message, puis reprend tout seul', async () => {
  const s = await setup(4);
  s.game.start();
  s.toBets();
  const first = s.game.roundId;
  s.game.disconnectPlayer(s.players[0], 's0');
  s.game.disconnectPlayer(s.players[1], 's1');
  assert.equal(s.step(), 'waiting');
  assert.equal(s.d().notice.kind, 'pause');
  assert.notEqual(s.game.roundId, first);
  assert.equal(s.game.timers['g:phase'], undefined, 'aucun minuteur d’étape pendant l’attente');
  s.tick(60000);
  assert.equal(s.step(), 'waiting');
  s.game.connectPlayer(s.players[0], 'back');
  assert.equal(s.step(), 'duelists');
  assert.equal(s.d().notice.kind, 'resume');
});

test('pause de l’hôte : tous les minuteurs du duel sont gelés et reprennent là où ils étaient', async () => {
  const s = await setup(5);
  s.game.start();
  s.tick(3000);
  s.game.pause();
  s.tick(60000);
  assert.equal(s.step(), 'duelists');
  s.game.resume();
  s.tick(DUEL_TIMING.duelistsMs - 3000 - 1);
  assert.equal(s.step(), 'duelists');
  s.tick(2);
  assert.equal(s.step(), 'game');
});

test('« Passer ce duel » : duel annulé sans gorgée, un autre est tiré ; changement de jeu : tous les minuteurs sont annulés', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  const first = s.game.roundId;
  assert.equal(s.game.gameHostAction({ type: 'skip' }), null);
  assert.notEqual(s.game.roundId, first);
  assert.equal(s.d().notice.kind, 'skipped');
  s.game.gameHostAction({ type: 'skip' }, first); // clic en retard sur le duel précédent : ignoré
  assert.equal(s.d().notice.kind, 'skipped');
  s.game.end();
  assert.deepEqual(Object.keys(s.game.timers), []);
  assert.equal(s.game.chooseGame(), null);
  assert.deepEqual(Object.keys(s.game.timers), []);
  assert.deepEqual(Object.keys(s.game.pausedTimers), []);
  s.tick(120000);
  assert.equal(s.game.phase, 'picking');
});

test('événements périmés ignorés : action ou pari d’un duel passé, étape déjà terminée', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  const old = { roundId: s.game.roundId, phaseId: s.d().phaseId, bettor: s.d().bettors[0] };
  s.game.gameHostAction({ type: 'skip' });
  assert.match(s.game.vote(old.bettor, 'rouge', old.roundId), /terminée/);
  s.tick(s.T.noticeMs + s.T.duelistsMs + s.T.gameMs + s.T.betsMs + s.T.betsRevealMs);
  assert.equal(s.step(), 'ready');
  assert.match(s.game.action(s.d().red, { type: 'ready', phaseId: old.phaseId }), /Trop tard/);
  assert.match(s.game.action(s.d().red, { type: 'play', data: { win: true } }), /Pas maintenant/);
  assert.match(s.game.action(s.d().red, { type: 'inconnue' }), /inconnue/);
});

test('roi de la colline : le vainqueur reste et garde son camp, tombe à la première défaite, part après 5 victoires', async () => {
  const s = await setup(6, { options: { king: true } });
  s.game.start();
  let king = null;
  for (let duel = 1; duel <= 7; duel++) {
    s.toPlay();
    const { red, blue } = s.d();
    if (king) {
      assert.equal(s.d().kingId, king.id);
      assert.equal(king.camp === 'rouge' ? red : blue, king.id, 'le roi garde son camp d’origine');
    } else assert.equal(s.d().kingId, null);
    const winnerCamp = king ? king.camp : 'rouge';
    s.game.action(winnerCamp === 'rouge' ? red : blue, { type: 'play', data: { win: true } });
    s.tick(s.T.resultMs);
    const wins = (king?.streak ?? 0) + 1;
    const winnerId = winnerCamp === 'rouge' ? red : blue;
    if (wins >= 5) {
      assert.ok(s.game.results.kingRetires);
      king = null;
    } else king = { id: winnerId, camp: winnerCamp, streak: wins };
    s.tick(s.game.settings.resultsMs);
    assert.equal(s.game.round, duel + 1);
    if (!king) assert.equal(s.d().kingId, null, 'après la retraite : duel normal');
  }
});

test('le roi qui perd boit ses victoires en plus (série de 2, cote Standard sans pari : 1 + 2)', async () => {
  const s = await setup(5, { options: { king: true } });
  s.game.start();
  s.toPlay();
  s.game.action(s.d().red, { type: 'play', data: { win: true } });
  s.tick(s.T.resultMs);
  s.tick(s.game.settings.resultsMs);
  s.toPlay();
  const kingId = s.d().kingId;
  const kingCamp = kingId === s.d().red ? 'rouge' : 'bleu';
  s.game.action(kingId, { type: 'play', data: { win: true } });
  s.tick(s.T.resultMs);
  s.tick(s.game.settings.resultsMs);
  s.toPlay();
  assert.equal(s.d().kingId, kingId);
  const before = s.game.sips.get(kingId) ?? 0;
  s.game.action(kingCamp === 'rouge' ? s.d().blue : s.d().red, { type: 'play', data: { win: true } });
  assert.equal(s.game.results.kingStreak, 2);
  assert.ok(s.game.results.kingFell);
  s.tick(s.T.resultMs);
  assert.equal((s.game.sips.get(kingId) ?? 0) - before, 1 + 2 + 0, 'B = 0 parieur sur le vainqueur : 1 + série 2');
});

test('confidentialité des paris : seuls les noms des parieurs déjà révélés sortent, et seulement à partir de la révélation', async () => {
  const s = await setup(5);
  s.game.start();
  s.toBets();
  const [a] = s.d().bettors;
  s.game.vote(a, 'rouge');
  for (const viewer of [{ host: true }, ...s.players.map((p) => ({ playerId: p.id }))]) {
    const st = s.game.publicState(viewer);
    assert.equal(st.round.bets, null);
    assert.equal(st.round.odds, null);
    assert.deepEqual(st.votedIds, []);
    if (viewer.playerId === a) assert.equal(st.round.me.bet, 'rouge', 'chacun voit son propre pari');
    else if (viewer.playerId) assert.equal(st.round.me.bet, null);
  }
  s.tick(s.T.betsMs);
  assert.equal(s.game.publicState({ host: true }).round.bets[a], 'rouge');
});

test('emojis et confettis : parieurs seulement, de la révélation des paris à la fin du duel, 1 envoi par seconde, 40 éléments au plus, TV seulement', async () => {
  const s = await setup(8);
  const { game } = s;
  game.start();
  s.toBets();
  const [a, b] = s.d().bettors;
  game.vote(a, 'rouge');
  assert.match(game.action(a, { type: 'cheer', kind: 'emoji', emoji: '🔥' }), /Pas maintenant/, 'aucun envoi pendant les paris');
  s.tick(s.T.betsMs);
  assert.equal(s.step(), 'betsReveal');
  assert.equal(game.action(a, { type: 'cheer', kind: 'emoji', emoji: '🔥' }), null);
  assert.match(game.action(a, { type: 'cheer', kind: 'emoji', emoji: '😱' }), /seconde/, 'plus d’un envoi par seconde');
  s.tick(1001);
  assert.equal(game.action(a, { type: 'cheer', kind: 'confetti' }), null);
  assert.match(game.action(b, { type: 'cheer', kind: 'emoji', emoji: '💩' }), /invalide/, 'liste fixe');
  assert.match(game.action(b, { type: 'cheer', kind: 'emoji' }), /invalide/);
  assert.match(game.action(s.d().red, { type: 'cheer', kind: 'emoji', emoji: '🔥' }), /parieurs/, 'un duelliste n’encourage pas');
  const tv = game.publicState({ host: true }).round.cheers;
  assert.deepEqual(tv.map((c) => c.kind), ['emoji', 'confetti']);
  assert.equal(tv[0].camp, 'rouge', 'couleur du camp pour lequel le parieur a misé');
  assert.equal(tv[1].camp, 'rouge');
  assert.equal(game.publicState({ host: true }).round.cheers.length, 2);
  for (const p of s.players) assert.equal(game.publicState({ playerId: p.id }).round.cheers, null, 'rien sur les téléphones');
  const sipsBefore = JSON.stringify([...game.sips]);
  s.tick(s.T.betsRevealMs);
  for (const id of [s.d().red, s.d().blue]) game.action(id, { type: 'ready' });
  s.tick(s.T.readyBeatMs);
  s.tick(s.T.introMs);
  assert.equal(s.step(), 'play');
  for (let i = 0; i < 10; i++) {
    s.tick(1001);
    for (const id of s.d().bettors) game.action(id, { type: 'cheer', kind: 'emoji', emoji: D.EMOJIS[i % 8] });
  }
  assert.equal(game.publicState({ host: true }).round.cheers.length, D.FEED_MAX, '60 envois, 40 gardés');
  assert.equal(JSON.stringify([...game.sips]), sipsBefore, 'aucun effet sur les gorgées');
});

test('emojis : plus rien une fois le duel terminé ; le fil repart de zéro au duel suivant', async () => {
  const s = await setup(6);
  s.game.start();
  s.toPlay();
  const [a] = s.d().bettors;
  assert.equal(s.game.action(a, { type: 'cheer', kind: 'confetti' }), null);
  s.game.action(s.d().red, { type: 'play', data: { win: true } });
  assert.match(s.game.action(a, { type: 'cheer', kind: 'confetti' }), /Pas maintenant/);
  assert.equal(s.game.publicState({ host: true }).round.cheers, null);
  s.tick(s.T.resultMs);
  s.tick(s.game.settings.resultsMs);
  s.toPlay();
  assert.deepEqual(s.game.publicState({ host: true }).round.cheers, []);
});
