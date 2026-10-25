// Noir Boire Mangue côté serveur : une manche du moteur commun = une manche du jeu (phase `question`), découpée en étapes :
// phrase (3 s) → écriture → pour chaque réponse : notes puis mini-résultat → (révélation, gorgées, manche suivante : moteur commun).
// Toutes les étapes ont un identifiant unique (`phaseId`, jamais réutilisé, voir steps.js) et un minuteur `g:phase`, annulé au même
// endroit que ceux des autres jeux.
// Confidentialité : aucun message avant la fin de la manche ne relie une réponse à son auteur, ni pour la TV ni pour les autres
// téléphones. La TV reçoit le texte de la réponse en cours et des compteurs ; seul l'auteur sait que c'est la sienne.
import * as N from '../rules/nbm.js';
import { go, shuffle, soon } from './steps.js';
import { TIMING } from '../timing.js';
import { loadJson } from './load.js';

const PHRASES = loadJson('../content/phrases-nbm.json');
const ADULT_PHRASES = loadJson('../content/phrases-nbm-18plus.json');
const CARDS = loadJson('../content/cartes-nbm.json');
const ADULT_CARDS = loadJson('../content/cartes-nbm-18plus.json');

export const NBM_TIMING = {
  announceMs: 3000, // la phrase en très gros
  writeMs: 30000, // écriture : secours pour les retardataires (on passe aux réponses dès que tout le monde a envoyé)
  writeBeatMs: 800, // pause après le dernier envoi
  showMinMs: 3000, // une réponse reste affichée au moins ce temps (lire et rigoler)
  showMaxMs: 15000, // secours : on passe à la suite même si quelqu'un n'a pas noté
  miniMs: 1500, // mini-résultat animé après le dernier vote
  allocMs: 8000, // fenêtre de distribution des gorgées du gagnant
};

const data = (game) => game.roundData;
const timing = (game) => ({ ...NBM_TIMING, ...game.nbmTiming });
const present = (game, id) => !!game.players.get(id)?.sockets.size;

/** Mémoire du jeu en cours (nombre de manches, réponse la plus drôle) : repart de zéro à chaque nouvelle session de jeu. */
function run(game) {
  if (game.nbmRun?.session !== game.session) game.nbmRun = { session: game.session, total: null, best: null };
  return game.nbmRun;
}

/** Paquet de cartes : celui du mode 18+ quand il est actif, jamais l'autre. L'historique des cartes vues vit avec la soirée. */
function deckOf(game) {
  const adult = game.adult.active && ADULT_CARDS.length > 0;
  const key = adult ? 'nbm:18+' : 'nbm';
  const seen = ((game.nbmSeen ??= new Map()).get(key) ?? (game.nbmSeen.set(key, new Set()), game.nbmSeen.get(key)));
  return { deck: game.nbmDeck ?? (adult ? ADULT_CARDS : CARDS), seen };
}

// ---------- Étapes ----------

/** Début d'une manche : mains distribuées, phrase affichée. Pas assez de joueurs connectés : la manche attend. */
function begin(game) {
  const d = data(game);
  const r = run(game);
  const here = game.connectedPlayers().map((p) => p.id);
  Object.assign(d, { seq: d.seq ?? 0, answers: {}, ratings: {}, goldenUsed: {}, censored: {}, order: null, index: -1, players: [], hands: {} });
  if (here.length < N.MIN_PLAYERS) {
    d.step = 'waiting';
    d.phaseId = `${game.roundId}:w`;
    return;
  }
  if (r.total == null) r.total = N.roundsFor(here.length);
  const { deck, seen } = deckOf(game);
  d.players = here;
  d.hands = N.dealHands(here, deck, seen, Math.random, N.phraseForme(game.question));
  go(game, 'announce', timing(game).announceMs, () => startWrite(game));
}

function startWrite(game) {
  go(game, 'write', timing(game).writeMs, () => endWrite(game));
  writeProgress(game);
}

/** L'écriture se termine dès que tous les joueurs présents ont envoyé leur réponse. */
function writeProgress(game) {
  const d = data(game);
  if (d.step !== 'write') return;
  const waiting = d.players.filter((id) => present(game, id) && d.answers[id] == null);
  if (!waiting.length) soon(game, timing(game).writeBeatMs);
}

/** Les réponses passent une par une, dans un ordre aléatoire ; ceux qui n'ont rien écrit n'ont pas de carte. */
function endWrite(game) {
  const d = data(game);
  d.order = shuffle(d.players.filter((id) => d.answers[id] != null));
  if (!d.order.length) return finish(game);
  showAnswer(game, 0);
}

const authorOf = (d) => d.order?.[d.index] ?? null;

function showAnswer(game, index) {
  const t = timing(game);
  go(game, 'rate', t.showMaxMs, () => closeAnswer(game), { index, minUntil: game.clock.now() + t.showMinMs });
  rateProgress(game);
}

/** Les notes de l'étape : voteurs attendus = joueurs de la manche, présents (ou de retour sous peu), sauf l'auteur de la réponse. */
const voters = (game) => {
  const d = data(game);
  return game.expectedVoters().filter((p) => d.players.includes(p.id) && p.id !== authorOf(d));
};

/**
 * On passe à la suite dès que tous les votants ont noté, mais pas avant la fin du temps d'affichage minimum.
 * Un votant déconnecté reste attendu pendant le délai de grâce (rechargement de page) : on revérifie à la fin de ce délai.
 */
function rateProgress(game) {
  const d = data(game);
  if (d.step !== 'rate') return;
  const author = authorOf(d);
  const waiting = voters(game).filter((p) => d.ratings[author]?.[p.id] === undefined);
  game.cancel('g:grace');
  if (!waiting.length) return soon(game, Math.max(0, d.minUntil - game.clock.now()));
  if (waiting.every((p) => p.sockets.size === 0 && p.disconnectedAt != null)) {
    const until = Math.min(...waiting.map((p) => p.disconnectedAt + TIMING.disconnectGraceMs)) - game.clock.now();
    game.schedule('g:grace', Math.max(0, until) + 1, () => rateProgress(game));
  }
}

function closeAnswer(game) {
  go(game, 'mini', timing(game).miniMs, () => nextAnswer(game));
}

function nextAnswer(game) {
  const d = data(game);
  if (d.index + 1 < d.order.length) showAnswer(game, d.index + 1);
  else finish(game);
}

function finish(game) {
  data(game).step = 'done';
  game.cancel('g:phase');
  game.cancel('g:soon');
  game.reveal(game.roundId);
}

// ---------- Vues ----------

/** Le texte de la réponse en cours, sans son auteur. */
function currentView(d) {
  const author = authorOf(d);
  if (author == null) return null;
  const censored = !!d.censored[author];
  return { index: d.index + 1, of: d.order.length, text: censored ? null : d.answers[author], censored };
}

function myView(game, d, id) {
  const inside = d.players?.includes(id);
  const author = authorOf(d);
  return {
    role: inside ? 'player' : 'out',
    hand: inside && d.step === 'write' ? d.hands[id] ?? [] : null,
    myAnswer: d.answers?.[id] ?? null,
    isAuthor: ['rate', 'mini'].includes(d.step) && id === author,
    myRating: ['rate', 'mini'].includes(d.step) && author ? d.ratings[author]?.[id] ?? null : null,
    goldenUsed: !!d.goldenUsed?.[id],
  };
}

// ---------- Règles du moteur commun ----------

export default {
  id: 'nbm',
  questions: PHRASES,
  // Mode 18+ seulement (voir Game.contentPool).
  adultQuestions: ADULT_PHRASES,
  // Les notes passent par des actions de jeu, pas par le vote commun.
  acceptsVotes: () => false,
  isValidVote: () => false,
  // Pas de révélation tant que toutes les réponses n'ont pas été notées.
  canReveal: (game) => data(game).step === 'done',

  canStart(game) {
    if (game.connectedCount() < N.MIN_PLAYERS) return `Il faut au moins ${N.MIN_PLAYERS} joueurs connectés.`;
    return null;
  },

  isLastRound(game) {
    const total = game.nbmRun?.session === game.session ? game.nbmRun.total : null;
    if (total > 0 && game.round >= total) return true;
    return game.settings.maxRounds > 0 && game.round >= game.settings.maxRounds;
  },

  startRound(game) {
    game.roundData.seq = 0;
    begin(game);
  },

  hostAction(game, action) {
    // L'hôte masque la réponse affichée d'un tap : « censurée », 0 point, et son auteur n'est pas puni.
    if (action.type === 'censor') {
      const d = data(game);
      if (!['rate', 'mini'].includes(d.step)) return 'Pas de réponse à masquer maintenant.';
      d.censored[authorOf(d)] = true;
      if (d.step === 'rate') soon(game, 400);
      return null;
    }
    return 'Action inconnue.';
  },

  handleAction(game, playerId, action) {
    const d = data(game);
    // Distribution des gorgées du gagnant (fenêtre de 8 s) : chacun répartit son crédit.
    if (game.phase === 'results' && game.pending) {
      if (action.type !== 'allocate') return 'Action inconnue.';
      const credit = game.results.credits[playerId] ?? 0;
      if (!credit) return 'Tu n’as rien à distribuer.';
      const alloc = {};
      for (const [target, n] of Object.entries(action.allocation ?? {})) if (game.players.has(target) && target !== playerId && Number.isInteger(n) && n > 0) alloc[target] = n;
      d.allocations[playerId] = alloc;
      const holders = Object.keys(game.results.credits).filter((id) => present(game, id));
      if (holders.every((id) => d.allocations[id])) game.finalize();
      return null;
    }
    if (game.phase !== 'question') return 'Pas maintenant.';
    if (action.phaseId !== undefined && action.phaseId !== d.phaseId) return 'Trop tard : cette étape est terminée.';
    if (!d.players?.includes(playerId)) return 'Tu joues dès la prochaine manche.';
    if (action.type === 'answer') {
      if (d.step !== 'write') return 'Ce n’est pas le moment d’écrire.';
      const { text, error } = N.cleanAnswer(action.text);
      if (error) return error;
      d.answers[playerId] = text;
      writeProgress(game);
      return null;
    }
    if (action.type === 'rate') {
      if (d.step !== 'rate') return 'Ce n’est pas le moment de noter.';
      const out = N.rate(d, { voterId: playerId, authorId: authorOf(d), rating: action.rating });
      if (out.error) return out.error;
      d.ratings = out.ratings;
      d.goldenUsed = out.goldenUsed;
      rateProgress(game);
      return null;
    }
    return 'Action inconnue.';
  },

  /** Quelqu'un part ou revient : on revérifie ce qu'on attend, sans jamais bloquer la manche. */
  onPresenceChange(game) {
    const d = game.roundData;
    if (game.phase !== 'question' || !d?.step) return;
    if (d.step === 'waiting') {
      if (game.connectedPlayers().length >= N.MIN_PLAYERS) begin(game);
      return;
    }
    if (d.step === 'write') writeProgress(game);
    if (d.step === 'rate') rateProgress(game);
  },

  computeResults(_ids, _votes, game) {
    const d = data(game);
    const order = d.order ?? [];
    const res = N.resolveRound({ answers: d.answers, ratings: d.ratings, censored: d.censored, order });
    return { sentence: game.question.texte, ...res, ids: [...game.players.keys()] };
  },

  /** Le gagnant distribue 2 gorgées : fenêtre de 8 s ; sans choix, elles sont tirées au hasard (jamais de blocage). */
  afterReveal(game) {
    const holders = Object.keys(game.results.credits).filter((id) => present(game, id));
    if (!holders.length) return false;
    data(game).allocations = {};
    game.schedulePausable('pending', timing(game).allocMs, () => game.finalize());
    return true;
  },

  resolvePending(game) {
    const res = game.results;
    const ids = res.ids.filter((id) => game.players.has(id));
    game.results = { ...res, settled: N.settleRoundSips({ direct: res.direct, credits: res.credits, allocations: data(game).allocations, ids }) };
  },

  sipsOf: (results) => (results.settled ?? N.settleRoundSips({ direct: results.direct, credits: results.credits, ids: results.ids })).sips,

  updateStats(stats, results, game) {
    for (const row of results.board) {
      const s = stats[row.authorId];
      if (!s) continue;
      s.points = (s.points ?? 0) + row.points;
      s.golden = (s.golden ?? 0) + row.golden;
    }
    for (const id of results.winners) if (stats[id]) stats[id].wins = (stats[id].wins ?? 0) + 1;
    // La réponse la plus drôle de la partie (la première en cas d'égalité).
    const r = run(game);
    if (results.best && (!r.best || results.best.points > r.best.points)) {
      r.best = { text: results.best.text, sentence: results.sentence, authorId: results.best.authorId, points: results.best.points, round: game.round };
    }
  },

  publicRound(game, viewer) {
    const d = data(game);
    if (!d.step) return {};
    const t = timing(game);
    const round = {
      step: d.step,
      phaseId: d.phaseId,
      sentence: game.question?.texte ?? null,
      total: game.nbmRun?.session === game.session ? game.nbmRun.total : null,
      best: game.phase === 'ended' && game.nbmRun?.session === game.session ? game.nbmRun.best : null,
      timer: game.timerState('g:phase'),
      written: d.step === 'write' ? { n: d.players.filter((id) => d.answers[id] != null).length, of: d.players.length } : null,
      current: ['rate', 'mini'].includes(d.step) ? currentView(d) : null,
      showMinMs: t.showMinMs,
    };
    if (d.step === 'rate') {
      const author = authorOf(d);
      const who = d.players.filter((id) => id !== author);
      round.rated = { n: who.filter((id) => d.ratings[author]?.[id] !== undefined).length, of: who.length };
    }
    if (d.step === 'mini') round.mini = N.tally(d.ratings, authorOf(d));
    if (viewer.playerId) round.me = myView(game, d, viewer.playerId);
    return round;
  },

  // Les 3 meilleures réponses de la manche sont annoncées : « Attention… » puis le podium.
  revealMs: 4500,
};
