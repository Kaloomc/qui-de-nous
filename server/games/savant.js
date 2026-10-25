// Le Savant côté serveur : une manche du moteur commun = une manche du jeu (phase `question`), découpée en étapes :
// annonce → écriture → lecture → choix, puis la révélation, les gorgées et la manche suivante gérées par le moteur commun.
// Toutes les étapes ont un identifiant unique (`phaseId`, jamais réutilisé) et un minuteur `g:phase` : ils sont annulés au même
// endroit que ceux des autres jeux (nextQuestion / reveal / reset), et chacun vérifie son `phaseId` avant d'agir.
// Confidentialité : l'identité du Savant et la vraie réponse ne quittent le serveur, avant la révélation, que vers le téléphone du
// Savant (`me.truth`) ; la TV et les autres téléphones ne reçoivent que des compteurs et des réponses déjà écrites.
import * as S from '../rules/savant.js';
import { SPOTLIGHT_ROLES } from '../spotlight.js';
import { REVEAL_MS } from '../../shared/savantReveal.js';
import { TIMING } from '../timing.js';
import { go, shuffle, soon } from './steps.js';
import { loadJson } from './load.js';

const FACTS = loadJson('../content/facts-savant.json');

// Valeurs fixes, sans écran de réglages : comme les autres jeux, le Savant se lance directement.
// Chaque étape avance dès que tout le monde a agi ; les durées « …Ms » ci-dessous sont les minuteurs de secours.
export const SAVANT_TIMING = {
  announceMs: 3000, // « Au tour de … de chercher ! »
  writeMs: 30000, // écriture : secours pour les retardataires (on passe à la lecture dès que tout le monde a envoyé)
  writeBeatMs: 800, // pause après le dernier envoi
  readMinMs: 6000, // lecture des réponses, au moins ce temps (lire et réagir)
  readTailMs: 3500, // temps de lecture après la dernière carte
  chooseMs: 20000, // choix du Chercheur et vote des autres : secours (révélation dès que tout le monde a voté)
  voteBeatMs: 1500, // pause après le dernier vote avant la révélation
  allocMs: 8000, // fenêtre de distribution des gorgées
};

const data = (game) => game.roundData;
const timing = (game) => ({ ...SAVANT_TIMING, ...game.savantTiming });
const facts = (game) => game.savantFacts ?? FACTS;
const present = (game, id) => !!game.players.get(id)?.sockets.size;

/** Mémoire du jeu en cours (dernier Savant, nombre de manches) : repart de zéro à chaque nouvelle session de jeu. Le tirage des rôles, lui, est celui de la soirée. */
function run(game) {
  if (game.savantRun?.session !== game.session) game.savantRun = { session: game.session, last: null, total: null };
  return game.savantRun;
}

// ---------- Étapes (voir games/steps.js) ----------

/** Début d'une manche (ou rejouée après la disparition du Chercheur). */
function begin(game, restarted = false) {
  const d = data(game);
  const r = run(game);
  const here = game.connectedPlayers().map((p) => p.id);
  // Une manche par joueur, 10 au plus (valeur fixe).
  if (r.total == null) r.total = S.roundsFor(S.DEFAULT_ROUNDS, here.length);
  Object.assign(d, { seq: d.seq ?? 0, restarted, answers: {}, hidden: {}, cards: null, allocations: {}, seekerId: null, savantId: null, writers: [] });
  if (here.length < S.MIN_PLAYERS) {
    // Pas assez de joueurs connectés : la manche attend (onPresenceChange la relance dès qu'ils sont là).
    d.step = 'waiting';
    d.phaseId = `${game.roundId}:w`;
    return;
  }
  const seekerId = game.spotlight.pick(SPOTLIGHT_ROLES.savantChercheur, here);
  const savantId = game.spotlight.pick(SPOTLIGHT_ROLES.savantSavant, here.filter((id) => id !== seekerId), { avoid: r.last });
  r.last = savantId;
  Object.assign(d, { seekerId, savantId, writers: here.filter((id) => id !== seekerId) });
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
  const waiting = d.writers.filter((id) => present(game, id) && d.answers[id] == null);
  if (!waiting.length) soon(game, timing(game).writeBeatMs);
}

/** Fin de l'écriture : les réponses sont mélangées ; celui qui a séché est marqué ainsi, sauf le Savant (sa vraie réponse est reprise). */
function endWrite(game) {
  const d = data(game);
  const truth = game.question.reponse;
  d.cards = shuffle(d.writers).map((id) => ({ id, text: d.answers[id] ?? (id === d.savantId ? truth : null) }));
  const n = d.cards.length;
  d.readStepMs = Math.min(700, Math.floor(6000 / Math.max(n, 1)));
  const t = timing(game);
  go(game, 'read', Math.max(t.readMinMs, n * d.readStepMs + t.readTailMs), () => startChoice(game));
}

function startChoice(game) {
  go(game, 'choice', timing(game).chooseMs, () => game.reveal(game.roundId));
  choiceProgress(game);
}

/** Le vote se termine bientôt quand tous les joueurs présents de la manche ont voté. */
function choiceProgress(game) {
  const d = data(game);
  if (d.step !== 'choice') return;
  const expected = game.expectedVoters().filter((p) => inRound(d, p.id));
  if (expected.length > 0 && expected.every((p) => game.votes.has(p.id))) soon(game, timing(game).voteBeatMs);
}

const inRound = (d, id) => id === d.seekerId || !!d.writers?.includes(id);

/** Le Chercheur a disparu : la manche est annulée et rejouée avec un autre fait et un autre Chercheur. */
function restartRound(game) {
  if (game.phase !== 'question') return;
  for (const name of Object.keys(game.timers)) if (name.startsWith('g:')) game.cancel(name);
  for (const name of Object.keys(game.pausedTimers)) if (name.startsWith('g:')) delete game.pausedTimers[name];
  game.roundSeq += 1;
  game.roundId = game.roundSeq;
  game.votes = new Map();
  // Le Chercheur a disparu : ni lui ni le Savant tiré n'ont joué, ils gardent leur tour.
  game.spotlight.refund(SPOTLIGHT_ROLES.savantChercheur, data(game).seekerId);
  game.spotlight.refund(SPOTLIGHT_ROLES.savantSavant, data(game).savantId);
  game.question = game.drawQuestion();
  const seq = data(game).seq ?? 0;
  game.roundData = { seq };
  begin(game, true);
}

// ---------- Vues ----------

/** Cartes visibles par tous : une réponse masquée par l'hôte n'a plus de texte ; « a séché » = pas de texte et pas masquée. */
function publicCards(d) {
  return d.cards?.map((c) => ({ id: c.id, text: d.hidden[c.id] ? null : c.text, censored: !!d.hidden[c.id] })) ?? null;
}

function myView(game, d, id) {
  const inside = inRound(d, id);
  const isSavant = id === d.savantId && ['write', 'read', 'choice'].includes(d.step);
  return {
    role: !inside ? 'out' : id === d.seekerId ? 'seeker' : 'writer',
    // Seul le Savant reçoit la vraie réponse (et seulement à partir de l'écriture).
    truth: isSavant ? game.question.reponse : null,
    myAnswer: d.answers?.[id] ?? null,
    vote: game.votes.get(id) ?? null,
  };
}

// ---------- Règles du moteur commun ----------

export default {
  id: 'savant',
  // « Attention… » 1,5 s, bandeau « Le Savant était… », vraie réponse, verdict plein écran (voir client/src/games/savant.jsx, REVEAL_STAGES).
  revealMs: REVEAL_MS,
  drawQuestion: (game) => game.history.draw('savant', facts(game)),
  // Le vote (désigner le Savant) n'existe qu'à l'étape de choix, pour le Chercheur et les Écrivains de la manche.
  acceptsVotes: (game) => data(game).step === 'choice',
  isValidVote(game, choice, playerId) {
    const d = data(game);
    return d.step === 'choice' && inRound(d, playerId) && d.writers.includes(choice) && choice !== playerId;
  },
  afterVote: (game) => choiceProgress(game),
  expectedVoters: (game, players) => players.filter((p) => inRound(data(game), p.id)),
  // Pas de révélation tant qu'on n'en est pas à l'étape de choix (ni avant, ni quand la manche attend des joueurs).
  canReveal: (game) => data(game).step === 'choice',

  canStart(game) {
    if (game.connectedCount() < S.MIN_PLAYERS) return `Il faut au moins ${S.MIN_PLAYERS} joueurs connectés.`;
    if (!facts(game).length) return 'Aucun fait disponible pour ce jeu.';
    return null;
  },

  /** Dernière manche : une par joueur (10 au plus), ou le réglage commun s'il est plus court. */
  isLastRound(game) {
    const total = game.savantRun?.session === game.session ? game.savantRun.total : null;
    if (total > 0 && game.round >= total) return true;
    return game.settings.maxRounds > 0 && game.round >= game.settings.maxRounds;
  },

  startRound(game) {
    game.roundData.seq = 0;
    begin(game);
  },

  hostAction(game, action) {
    // L'hôte masque (ou ré-affiche) une réponse inappropriée : un tap, « censurée » pour la manche.
    if (action.type === 'censor') {
      const d = data(game);
      if (!d.cards) return 'Pas encore de réponses à masquer.';
      if (!d.cards.some((c) => c.id === action.id)) return 'Réponse inconnue.';
      d.hidden[action.id] = !d.hidden[action.id];
      return null;
    }
    return 'Action inconnue.';
  },

  handleAction(game, playerId, action) {
    const d = data(game);
    // Distribution des gorgées (fenêtre de 8 s) : chacun répartit son crédit.
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
    if (action.type === 'answer') {
      if (d.step !== 'write') return 'Ce n’est pas le moment d’écrire.';
      if (!d.writers.includes(playerId)) return 'Tu ne réponds pas dans cette manche.';
      const { text, error } = S.cleanAnswer(action.text);
      if (error) return error;
      d.answers[playerId] = text;
      writeProgress(game);
      return null;
    }
    return 'Action inconnue.';
  },

  /** Quelqu'un part ou revient : on revérifie ce qu'on attend, sans jamais bloquer la manche. */
  onPresenceChange(game) {
    const d = game.roundData;
    if (game.phase !== 'question' || !d?.step) return;
    if (d.step === 'waiting') {
      if (game.connectedPlayers().length >= S.MIN_PLAYERS) begin(game, d.restarted);
      return;
    }
    // Chercheur parti de la partie, ou déconnecté plus longtemps que le délai de grâce : la manche est rejouée.
    const seeker = game.players.get(d.seekerId);
    if (!seeker) return restartRound(game);
    if (seeker.sockets.size > 0) game.cancel('g:seekerGone');
    else if (!game.timers['g:seekerGone']) {
      const id = d.phaseId;
      game.schedule('g:seekerGone', TIMING.disconnectGraceMs, () => {
        if (!present(game, d.seekerId) && game.roundData === d && game.phase === 'question' && d.phaseId === id) restartRound(game);
      });
    }
    if (d.step === 'write') writeProgress(game);
    if (d.step === 'choice') choiceProgress(game);
  },

  computeResults(_ids, votes, game) {
    const d = data(game);
    const fact = game.question;
    const r = S.resolveRound({ seekerId: d.seekerId, savantId: d.savantId, writers: d.writers, votes: Object.fromEntries(votes) });
    return {
      seekerId: d.seekerId,
      savantId: d.savantId,
      question: fact.question,
      answer: fact.reponse,
      explication: fact.explication,
      categorie: fact.categorie ?? null,
      found: r.found,
      choice: r.choice,
      // Qui a voté pour qui (le choix du Chercheur à part) : pour les flèches de la révélation.
      votes: r.spectatorVotes,
      voteCounts: r.voteCounts,
      trompeurs: r.trompeurs,
      bluffers: r.bluffers,
      direct: r.direct,
      credits: r.credits,
      points: r.points,
      ids: [...game.players.keys()],
    };
  },

  /** Des gorgées à distribuer : fenêtre de 8 s, simultanée ; sans choix, elles sont tirées au hasard (jamais de blocage). */
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
    game.results = { ...res, settled: S.settleSips({ direct: res.direct, credits: res.credits, allocations: data(game).allocations, ids }) };
  },

  sipsOf: (results) => (results.settled ?? S.settleSips({ direct: results.direct, credits: results.credits, ids: results.ids })).sips,

  updateStats(stats, results) {
    for (const [id, n] of Object.entries(results.points)) if (stats[id]) stats[id].points = (stats[id].points ?? 0) + n;
    if (results.found && stats[results.seekerId]) stats[results.seekerId].found = (stats[results.seekerId].found ?? 0) + 1;
    if (!results.found && stats[results.savantId]) stats[results.savantId].unfound = (stats[results.savantId].unfound ?? 0) + 1;
    for (const [id, n] of Object.entries(results.voteCounts)) if (stats[id] && results.bluffers.includes(id)) stats[id].fooled = (stats[id].fooled ?? 0) + n;
  },

  publicRound(game, viewer) {
    const d = data(game);
    if (!d.step) return {};
    const fact = game.question;
    const round = {
      step: d.step,
      phaseId: d.phaseId,
      seekerId: d.seekerId,
      restarted: !!d.restarted,
      question: ['write', 'read', 'choice'].includes(d.step) || game.phase !== 'question' ? fact?.question ?? null : null,
      written: d.step === 'write' ? { n: d.writers.filter((id) => d.answers[id] != null).length, of: d.writers.length } : null,
      cards: publicCards(d),
      readStepMs: d.readStepMs ?? 0,
      startedAt: d.startedAt ?? null,
      voted: d.step === 'choice' ? { n: [...game.votes.keys()].filter((id) => inRound(d, id)).length, of: 1 + d.writers.length } : null,
      timer: game.timerState('g:phase'),
      writers: d.writers,
      total: game.savantRun?.session === game.session ? game.savantRun.total : null,
    };
    if (viewer.playerId) round.me = myView(game, d, viewer.playerId);
    return round;
  },
};
