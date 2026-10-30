// Le mode Duel côté serveur : une manche du moteur commun = un duel, découpé en étapes
// (duellistes → mini-jeu → paris → révélation des paris → prêts → duel), puis résultat et gorgées gérés par le moteur commun.
// Chaque étape a un identifiant unique (`phaseId`, jamais réutilisé) et un minuteur `g:phase` ; tous les minuteurs du mode
// portent un nom `g:…`, annulés au même endroit que ceux des autres jeux (nextQuestion / reveal / reset → teardownGame).
// Confidentialité : un mini-jeu ne fournit que des vues par rôle (TV, duelliste, parieur) ; les paris restent secrets jusqu'à
// la révélation, le compteur « X / N ont parié » ne donne aucun nom.
import * as D from '../rules/duel.js';
import { seededRng } from '../rules/duel.js';
import { SPOTLIGHT_ROLES } from '../spotlight.js';
import { TIMING } from '../timing.js';
import { MINIGAMES } from '../duel/minigames/index.js';
import { INTROS } from '../duel/intros.js';
import { go, soon } from './steps.js';

export const DUEL_TIMING = {
  duelistsMs: 6500, // roulette des duellistes (5 à 7 s)
  gameMs: 4000, // roulette des mini-jeux
  betsMs: 15000, // paris : 15 s au plus
  betsBeatMs: 1500, // pause après le dernier pari
  betsRevealMs: 5500, // paris dévoilés, cote en direct
  readyMs: 5000, // « Prêt »
  readyBeatMs: 700, // pause quand les deux sont prêts
  introMs: 4500, // carte d'intro du mini-jeu (règle, puis 3-2-1) : fait partie de la préparation
  noticeMs: 2800, // bannière « duel annulé », seule à l'écran
  graceMs: 10000, // duelliste déconnecté : attente avant d'annuler
  playPadMs: 4000, // marge au-delà de la durée du mini-jeu
  resultMs: 4500, // suspense avant le verdict
};

const data = (game) => game.roundData;
const timing = (game) => ({ ...DUEL_TIMING, ...game.duelTiming });
const minigames = (game) => game.duelMinigames ?? MINIGAMES;
const present = (game, id) => !!game.players.get(id)?.sockets.size;
const options = (game) => game.duelOptions ?? D.DEFAULT_OPTIONS;
const duelists = (d) => [d.red, d.blue].filter(Boolean);

/** Mémoire du mode (roi, dernier duel, dernier mini-jeu) : repart de zéro à chaque nouvelle session de jeu. */
function run(game) {
  if (game.duelRun?.session !== game.session) game.duelRun = { session: game.session, king: null, last: null, lastGame: null };
  return game.duelRun;
}

/** Mini-jeux jouables : ceux qui ont assez de contenu (`available`), et que l'hôte n'a pas décochés. */
const playableIds = (game) => Object.keys(minigames(game)).filter((id) => minigames(game)[id].available?.(game) !== false);
const activeIds = (game) => D.activeGames(options(game), playableIds(game));

// ---------- Étapes ----------

/** Début d'un duel (ou duel retiré après une annulation). `notice` : pourquoi le précédent a été annulé. */
function begin(game, notice = null) {
  const d = data(game);
  Object.assign(d, { seq: d.seq ?? 0, notice, red: null, blue: null, kingId: null, mgId: null, mgSeed: null, bettors: null, ready: {}, mg: null, outcome: null, step: null, laterSeq: 0, emojis: { sent: 0, seq: 0, queue: [] } });
  const r = run(game);
  const here = game.connectedPlayers().map((p) => p.id);
  const active = activeIds(game);
  if (here.length < D.MIN_PLAYERS || !active.length) {
    // Pas assez de joueurs connectés : le duel attend (onPresenceChange le relance dès qu'ils sont là).
    d.step = 'waiting';
    d.phaseId = `${game.roundId}:w`;
    return;
  }
  if (r.king && !here.includes(r.king.id)) r.king = null; // le roi est parti : couronne perdue
  const king = options(game).king ? r.king : null;
  const pick = D.pickDuelists({ spotlight: game.spotlight, role: SPOTLIGHT_ROLES.duelDuelist, here, king, last: r.last });
  const mgId = D.pickMinigame(active, r.lastGame);
  r.lastGame = mgId;
  r.last = { pair: [pick.rouge, pick.bleu], challenger: pick.kingId ? (pick.kingId === pick.rouge ? pick.bleu : pick.rouge) : null };
  Object.assign(d, { red: pick.rouge, blue: pick.bleu, kingId: pick.kingId, mgId, mgSeed: Math.floor(Math.random() * 2 ** 31) });
  // Après une annulation, la bannière s'affiche seule quelques secondes avant la roulette du duel suivant.
  if (notice && !['resume', 'pause'].includes(notice.kind)) go(game, 'notice', timing(game).noticeMs, () => startDuelists(game));
  else startDuelists(game);
}

function startDuelists(game) {
  go(game, 'duelists', timing(game).duelistsMs, () => startGameRoulette(game));
}

function startGameRoulette(game) {
  go(game, 'game', timing(game).gameMs, () => startBets(game));
}

/** Parieurs : les joueurs connectés qui ne se battent pas, à l'ouverture des paris (un arrivant plus tard attend le duel suivant). */
function startBets(game) {
  const d = data(game);
  d.bettors = game.connectedPlayers().map((p) => p.id).filter((id) => !duelists(d).includes(id));
  go(game, 'bets', timing(game).betsMs, () => startBetsReveal(game));
  betsProgress(game);
}

function betsProgress(game) {
  const d = data(game);
  if (d.step !== 'bets') return;
  const waiting = d.bettors.filter((id) => present(game, id) && !game.votes.has(id));
  if (d.bettors.length && !waiting.length) soon(game, timing(game).betsBeatMs);
}

function startBetsReveal(game) {
  go(game, 'betsReveal', timing(game).betsRevealMs, () => startReady(game));
}

const bothReady = (d) => !!d.ready[d.red] && !!d.ready[d.blue];

/** Mesure de latence des deux duellistes (plusieurs allers-retours, médiane), pendant que chacun se prépare. */
async function probeLatency(game, ids) {
  if (!game.pingPlayer) return;
  game.duelLatency ??= new Map();
  await Promise.all(
    ids.map(async (id) => {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const rtt = await game.pingPlayer(id);
        if (rtt != null) samples.push(Math.min(rtt, 1500));
      }
      samples.sort((a, b) => a - b);
      if (samples.length) game.duelLatency.set(id, samples[Math.floor(samples.length / 2)]);
    }),
  );
}

function startReady(game) {
  const d = data(game);
  d.ready = {};
  probeLatency(game, duelists(d));
  go(game, 'ready', timing(game).readyMs, () => (bothReady(data(game)) ? startIntro(game) : cancelDuel(game, { kind: 'notReady', ids: duelists(data(game)).filter((id) => !data(game).ready[id]) })));
}

/** Contexte donné au mini-jeu : graine commune, horloge, minuteurs annulés avec le duel, mesure de latence. */
function contextFor(game, d, playId) {
  return {
    seed: d.mgSeed,
    rng: seededRng(d.mgSeed),
    red: d.red,
    blue: d.blue,
    now: () => game.clock.now(),
    /** Aller-retour réseau (médiane de plusieurs mesures) d'un joueur, en ms : sert à compenser les temps de réaction. */
    latency: (id) => game.duelLatency?.get(id) ?? 0,
    draw: (key, list) => game.history.draw(key, list),
    content: game.duelContent ?? {},
    get voice() {
      return !!game.duelVoice; // dit par la TV à tout moment (Duel du Feu)
    },
    /** Minuteur du mini-jeu : annulé avec le duel ; `fn` ne s'exécute que si le duel et l'étape sont toujours les mêmes. */
    later(ms, fn) {
      d.laterSeq += 1;
      game.schedulePausable(`g:mg${d.laterSeq}`, ms, () => {
        if (data(game) !== d || d.phaseId !== playId) return;
        fn();
        checkResult(game);
      });
    },
  };
}

/** Carte d'intro : règle du mini-jeu et décompte 3-2-1 avant le départ (aucun temps de jeu consommé). */
function startIntro(game) {
  go(game, 'intro', timing(game).introMs, () => startPlay(game));
}

function startPlay(game) {
  const d = data(game);
  const mg = minigames(game)[d.mgId];
  go(game, 'play', mg.maxMs + timing(game).playPadMs, () => forceResult(game));
  const ctx = contextFor(game, d, d.phaseId);
  d.ctx = ctx;
  d.mg = mg.prepare(ctx);
  mg.begin?.(d.mg, ctx);
  checkResult(game);
}

/** Après chaque action ou minuteur du mini-jeu : a-t-il un résultat ? */
function checkResult(game) {
  const d = data(game);
  if (d.step !== 'play' || d.outcome) return;
  const res = minigames(game)[d.mgId].result(d.mg, d.ctx);
  if (res) finishDuel(game, res);
}

function forceResult(game) {
  const d = data(game);
  if (d.step !== 'play' || d.outcome) return;
  finishDuel(game, minigames(game)[d.mgId].resolve(d.mg, d.ctx));
}

/** Le résultat est décidé ici, avant toute animation : la révélation ne fait que le montrer. */
function finishDuel(game, res) {
  const d = data(game);
  const winner = D.CAMPS.includes(res?.winner) ? res.winner : 'égalité';
  // `res.sips` : gorgées propres au mini-jeu par camp (ex. Dilemme en or), qui remplacent le calcul habituel.
  d.outcome = { winner, details: res?.details ?? null, sips: res?.sips ?? null };
  game.reveal(game.roundId);
}

/** Duel annulé (duelliste absent, pas prêt, passé par l'hôte, trop peu de joueurs) : ni pari perdant ni gorgée, un nouveau duel est tiré. */
function cancelDuel(game, notice) {
  if (game.phase !== 'question') return;
  for (const name of Object.keys(game.timers)) if (name.startsWith('g:')) game.cancel(name);
  for (const name of Object.keys(game.pausedTimers)) if (name.startsWith('g:')) delete game.pausedTimers[name];
  const d = data(game);
  for (const id of duelists(d)) game.spotlight.refund(SPOTLIGHT_ROLES.duelDuelist, id);
  game.roundSeq += 1;
  game.roundId = game.roundSeq;
  game.votes = new Map();
  game.roundData = { seq: d.seq ?? 0 };
  begin(game, notice);
}

// ---------- Emojis et confettis ----------

const CHEER_STEPS = ['betsReveal', 'ready', 'intro', 'play'];

/** Les parieurs encouragent leur camp, de la révélation des paris à la fin du duel : purement visuel, aucun effet sur le jeu ni les gorgées. */
function cheer(game, d, playerId, action) {
  if (!CHEER_STEPS.includes(d.step) || d.outcome) return 'Pas maintenant.';
  if (!d.bettors?.includes(playerId)) return 'Seuls les parieurs encouragent.';
  const item = D.cleanCheer(action);
  if (item.error) return item.error;
  // Spam autorisé jusqu'à CHEER_PER_SEC appuis par seconde et par joueur ; le surplus est ignoré, sans erreur.
  const want = Math.max(1, Math.min(D.CHEER_BATCH_MAX, Math.floor(Number(action.count)) || 1));
  const now = game.clock.now();
  const win = (d.emojis.win ??= {});
  if (!win[playerId] || now - win[playerId].start >= 1000) win[playerId] = { start: now, used: 0 };
  const ok = Math.min(want, D.CHEER_PER_SEC - win[playerId].used);
  if (ok <= 0) return null;
  win[playerId].used += ok;
  d.emojis.sent += ok;
  d.emojis.queue = [...(d.emojis.queue ?? []), { n: ++d.emojis.seq, ...item, camp: game.votes.get(playerId) ?? null, count: ok }].slice(-D.FEED_MAX);
  return null;
}

// ---------- Vues ----------

const campOf = (d, id) => (id === d.red ? 'rouge' : id === d.blue ? 'bleu' : null);

function betsMap(game, d) {
  return Object.fromEntries((d.bettors ?? []).filter((id) => game.votes.has(id)).map((id) => [id, game.votes.get(id)]));
}

function myView(game, d, id) {
  const camp = campOf(d, id);
  const bettor = !!d.bettors?.includes(id);
  return {
    role: camp ? 'duelist' : bettor || (d.step && d.bettors == null) ? 'bettor' : 'out',
    camp,
    bet: game.votes.get(id) ?? null,
    ready: !!d.ready?.[id],
  };
}

/** Le mini-jeu ne montre à chacun que ce qu'il a le droit de voir. */
function gameView(game, d, viewer) {
  if (!d.mg || d.step !== 'play') return null;
  const who = viewer.host ? { kind: 'tv' } : campOf(d, viewer.playerId) ? { kind: 'duelist', side: campOf(d, viewer.playerId), id: viewer.playerId } : { kind: 'bettor' };
  return minigames(game)[d.mgId].view(d.mg, who, d.ctx);
}

// ---------- Règles du moteur commun ----------

export default {
  id: 'duel',
  revealMs: DUEL_TIMING.resultMs,
  hideVoters: true,
  drawQuestion: () => null,
  // Les paris sont le vote commun : ouverts à l'étape des paris, modifiables jusqu'à la révélation, pour les parieurs seulement.
  acceptsVotes: (game) => data(game).step === 'bets',
  isValidVote: (game, choice, id) => data(game).step === 'bets' && D.CAMPS.includes(choice) && !!data(game).bettors?.includes(id),
  afterVote: (game) => betsProgress(game),
  expectedVoters: () => [], // les paris ne déclenchent jamais la révélation du moteur : le duel avance seul
  canReveal: (game) => !!data(game).outcome,

  canStart(game) {
    if (game.connectedCount() < D.MIN_PLAYERS) return `Il faut au moins ${D.MIN_PLAYERS} joueurs connectés (2 duellistes et 1 parieur).`;
    if (game.players.size > D.MAX_PLAYERS) return `Le mode Duel accepte ${D.MAX_PLAYERS} joueurs au plus.`;
    if (!activeIds(game).length) return 'Aucun mini-jeu actif.';
    return null;
  },
  isLastRound: () => false, // tourne jusqu'à ce que l'hôte arrête

  publicLobby: (game) => ({
    options: options(game),
    games: Object.values(minigames(game)).map((m) => ({ id: m.id, name: m.name, icon: m.icon, category: m.category, available: m.available?.(game) !== false })),
  }),

  /** Emojis en attente, pour la TV seulement (événement `duel:cheers`, hors de l'état : jamais vers les téléphones, donc jamais vers les duellistes). */
  drainCheers(game) {
    const d = data(game);
    const items = d.emojis?.queue ?? [];
    if (items.length) d.emojis.queue = [];
    return items;
  },
  cheer(game, playerId, payload) {
    const d = data(game);
    if (game.phase !== 'question' || !d.step) return 'Pas maintenant.';
    return cheer(game, d, playerId, payload ?? {});
  },

  startRound(game) {
    // Le mode tourne tout seul : l'enchaînement automatique est activé au lancement (l'hôte peut le couper ensuite).
    if (game.round === 1) game.settings.auto = true;
    game.roundData.seq = 0;
    begin(game);
  },

  hostAction(game, action) {
    if (action.type === 'config') {
      if (game.phase !== 'lobby') return 'Les options se règlent avant le lancement.';
      const { options: next, error } = D.cleanOptions(action, options(game), playableIds(game));
      if (error) return error;
      game.duelOptions = next;
      return null;
    }
    // La TV dit si elle a une voix (Duel du Feu) ; ses signaux (« FEU » prononcé…) vont au mini-jeu en cours.
    if (action.type === 'voice') {
      game.duelVoice = !!action.available;
      return null;
    }
    if (action.type === 'spoken') {
      const d = data(game);
      if (game.phase !== 'question' || d.step !== 'play' || d.outcome) return null;
      const mg = minigames(game)[d.mgId];
      mg.host?.(d.mg, action, d.ctx);
      checkResult(game);
      return null;
    }
    // « Passer ce duel » : annulé sans gorgée, un autre est tiré (après le verdict, c'est « Suivant »).
    if (action.type === 'skip') {
      if (game.phase !== 'question') return 'Pas de duel à passer.';
      cancelDuel(game, { kind: 'skipped' });
      return null;
    }
    return 'Action inconnue.';
  },

  handleAction(game, playerId, action) {
    const d = data(game);
    if (game.phase !== 'question' || !d.step) return 'Pas maintenant.';
    if (action.phaseId !== undefined && action.phaseId !== d.phaseId) return 'Trop tard : cette étape est terminée.';
    const camp = campOf(d, playerId);
    if (action.type === 'ready') {
      if (d.step !== 'ready') return 'Pas encore.';
      if (!camp) return 'Seuls les duellistes se préparent.';
      d.ready[playerId] = true;
      if (bothReady(d)) soon(game, timing(game).readyBeatMs);
      return null;
    }
    if (action.type === 'cheer') return cheer(game, d, playerId, action);
    if (action.type === 'play') {
      if (d.step !== 'play' || d.outcome) return 'Pas maintenant.';
      if (!camp) return 'Tu ne te bats pas.';
      const error = minigames(game)[d.mgId].action(d.mg, camp, action.data ?? {}, d.ctx);
      if (!error) checkResult(game);
      return error ?? null;
    }
    return 'Action inconnue.';
  },

  /** Quelqu'un part ou revient : on revérifie ce qu'on attend, sans jamais bloquer le mode. */
  onPresenceChange(game) {
    const d = game.roundData;
    if (game.phase !== 'question' || !d?.step) return;
    const here = game.connectedPlayers().length;
    if (d.step === 'waiting') {
      if (here >= D.MIN_PLAYERS && activeIds(game).length) begin(game, { kind: 'resume' });
      return;
    }
    // Moins de 3 joueurs connectés : le mode se met en pause, avec un message.
    if (here < D.MIN_PLAYERS) return cancelDuel(game, { kind: 'pause' });
    const removed = duelists(d).filter((id) => !game.players.has(id));
    if (removed.length) return cancelDuel(game, { kind: 'removed', ids: removed });
    // Un duelliste déconnecté : on l'attend un moment, puis le duel est annulé (sauf s'il a déjà un résultat).
    const gone = duelists(d).filter((id) => !present(game, id));
    if (!gone.length) return game.cancel('g:gone');
    if (!game.timers['g:gone'] && !game.pausedTimers['g:gone']) {
      const duelId = game.roundId;
      game.schedulePausable('g:gone', timing(game).graceMs, () => {
        const now = data(game);
        const still = duelists(now).filter((id) => !present(game, id));
        if (game.roundId === duelId && game.phase === 'question' && !now.outcome && still.length) cancelDuel(game, { kind: 'gone', ids: still });
      });
    }
  },

  computeResults(_ids, votes, game) {
    const d = data(game);
    const r = run(game);
    const cote = options(game).cote;
    const bets = Object.fromEntries([...votes].filter(([id, camp]) => d.bettors?.includes(id) && D.CAMPS.includes(camp)));
    const king = r.king && d.kingId === r.king.id ? r.king : null;
    const { winner, details } = d.outcome;
    const settled = D.settleDuel({ winner, red: d.red, blue: d.blue, bets, bettors: d.bettors ?? [], cote, kingId: king?.id ?? null, kingStreak: king?.streak ?? 0 });
    if (d.outcome.sips) settled.sips = Object.fromEntries(Object.entries(d.outcome.sips).map(([camp, n]) => [camp === 'rouge' ? d.red : d.blue, n]));
    const next = D.nextKing({ king, winner, red: d.red, blue: d.blue, kingMode: options(game).king });
    return {
      red: d.red,
      blue: d.blue,
      mgId: d.mgId,
      winner,
      winnerId: settled.winnerId,
      loserId: settled.loserId,
      details,
      cote,
      bets,
      bettors: d.bettors ?? [],
      odds: D.oddsPct(bets, d.bettors ?? []),
      B: settled.B,
      right: settled.right,
      wrong: settled.wrong,
      silent: settled.silent,
      sips: settled.sips,
      kingId: king?.id ?? null,
      kingStreak: king?.streak ?? 0,
      kingFell: next.fell,
      kingRetires: next.retired,
      kingNext: next.king,
      ids: [...game.players.keys()],
    };
  },

  sipsOf: (results) => results.sips,

  /** Fin du duel (gorgées comptées) : le roi et les statistiques de la soirée sont mis à jour, une seule fois. */
  updateStats(stats, results, game) {
    run(game).king = results.kingNext;
    for (const id of [results.red, results.blue]) if (stats[id]) stats[id].duels = (stats[id].duels ?? 0) + 1;
    if (results.winnerId && stats[results.winnerId]) stats[results.winnerId].duelWins = (stats[results.winnerId].duelWins ?? 0) + 1;
    for (const id of results.right) if (stats[id]) stats[id].betsRight = (stats[id].betsRight ?? 0) + 1;
  },

  publicRound(game, viewer) {
    const d = data(game);
    if (!d.step) return {};
    const showBets = ['betsReveal', 'ready', 'intro', 'play'].includes(d.step) || game.phase !== 'question';
    const mg = d.mgId ? minigames(game)[d.mgId] : null;
    const round = {
      step: d.step,
      phaseId: d.phaseId,
      notice: d.notice ?? null,
      startedAt: d.startedAt ?? null,
      timer: game.timerState('g:phase'),
      red: d.red,
      blue: d.blue,
      kingId: d.kingId,
      king: options(game).king ? run(game).king : null,
      cote: options(game).cote,
      mg: mg && !['waiting', 'duelists', 'notice'].includes(d.step) ? { id: mg.id, name: mg.name, icon: mg.icon, maxMs: mg.maxMs, rule: mg.rule ?? null, penaltyMs: mg.penaltyMs ?? null, intro: INTROS[mg.id] ?? null } : null,
      games: d.step === 'game' ? activeIds(game).map((id) => ({ id, name: minigames(game)[id].name, icon: minigames(game)[id].icon })) : null,
      // Compteur sans noms pendant les paris ; les paris eux-mêmes seulement une fois révélés.
      betCount: d.bettors ? { n: Object.keys(betsMap(game, d)).length, of: d.bettors.length } : null,
      bets: showBets && d.bettors ? betsMap(game, d) : null,
      odds: showBets && d.bettors ? D.oddsPct(betsMap(game, d), d.bettors) : null,
      ready: d.step === 'ready' ? { rouge: !!d.ready[d.red], bleu: !!d.ready[d.blue] } : null,
      play: gameView(game, d, viewer),
      finished: !!d.outcome,
    };
    if (viewer.playerId) round.me = myView(game, d, viewer.playerId);
    return round;
  },
};
