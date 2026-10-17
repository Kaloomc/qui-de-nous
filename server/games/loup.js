// Loup-Garou côté serveur : une partie entière = une « manche » du moteur commun (phase `question`).
// Les phases (distribution, nuit, aube, débat, vote…) sont gérées ici avec des minuteurs `g:phase` :
// ils sont tous annulés au même endroit (Game.reset / nextQuestion / reveal) et chacun vérifie son `phaseId`.
// Confidentialité : publicRound() ne renvoie à chaque écran que ce qu'il a le droit de voir ; la TV ne reçoit jamais
// de rôle vivant. Les phases de nuit ont toutes la même durée, jouées même si le rôle est mort (rien ne fuit).
import * as L from '../rules/loup.js';
import { recommendedComposition, validateComposition } from '../rules/loup.js';

export const LOUP_TIMING = {
  dealMs: 20000,
  sleepMs: 4000,
  nightMs: 12000,
  announceMs: 6500,
  hunterMs: 15000,
  debateMs: 150000,
  voteMs: 30000,
  vote2Ms: 20000,
  endMs: 8000,
  tribunalMs: 25000,
};
/** Taille fixe (en caractères) de la vue privée : tous les joueurs reçoivent le même volume de données. */
const ME_SIZE = 2048;

const data = (game) => game.roundData;
const timing = (game) => ({ ...LOUP_TIMING, ...game.loupTiming });
const roleOfPhase = (phase) => Object.keys(L.ROLES).find((r) => L.ROLES[r].phase === phase);

/** Même gestion que les autres jeux : le nom d'un joueur et sa photo, figés au début (un joueur retiré reste dans le cercle). */
function snapshot(game, ids) {
  return Object.fromEntries(ids.map((id) => {
    const p = game.players.get(id);
    return [id, { name: p?.name ?? '?', photoUrl: p ? game.photoUrl(p) : null }];
  }));
}

// ---------- Phases ----------

/** Passe à une nouvelle phase : identifiant unique, minuteur annulable ; `next` ne s'exécute que si la phase est toujours la courante. */
function go(game, stage, ms, next, extra = {}) {
  const d = data(game);
  d.seq += 1;
  Object.assign(d, { stage, phaseId: `${game.roundId}:${d.seq}`, ...extra });
  const id = d.phaseId;
  game.cancel('g:phase');
  if (ms > 0) game.schedulePausable('g:phase', ms, () => data(game).phaseId === id && next());
  else d.timerless = true;
}

/** Fin de partie : l'écran de victoire puis le Tribunal des gorgées (moteur commun : reveal → results en attente). */
function over(game) {
  const d = data(game);
  game.cancel('g:phase');
  d.stage = 'over';
  game.reveal(game.roundId);
  return d;
}

function startDeal(game) {
  const t = timing(game);
  go(game, 'deal', t.dealMs, () => startNight(game), { acked: {} });
}

function startNight(game) {
  const d = data(game);
  L.startNight(d.eng);
  d.phases = L.nightPhases(d.eng);
  d.index = -1;
  d.wolfVotes = {};
  d.done = {};
  go(game, 'sleep', timing(game).sleepMs, () => nextNightPhase(game), { phase: null });
}

function nextNightPhase(game) {
  const d = data(game);
  d.index += 1;
  if (d.index >= d.phases.length) return startDawn(game);
  const phase = d.phases[d.index];
  d.done = {};
  const role = roleOfPhase(phase);
  // Ivrogne : sa gorgée est donnée dès que sa phase commence (privée, jamais annoncée).
  if (phase === 'ivrogne') {
    const id = L.actorOf(d.eng, 'ivrogne');
    if (id) game.drink(id, 1);
  }
  go(game, 'night', timing(game).nightMs, () => endNightPhase(game), { phase, phaseRole: role });
}

function endNightPhase(game) {
  const d = data(game);
  if (d.phase === 'loups') L.nightAct(d.eng, 'loups', null, { victim: L.tallyWolves(d.wolfVotes) });
  nextNightPhase(game);
}

/** Action de nuit d'un rôle (une seule par phase). Renvoie un message d'erreur, ou null si c'est pris en compte. */
function nightAction(d, role, playerId, a) {
  const e = d.eng;
  const intel = (d.intel[playerId] ??= { seen: [], bear: [] });
  if (role === 'voyante') {
    const found = L.seerReveal(e, playerId, a.target);
    if (!found) return 'Cible invalide.';
    intel.seen.push({ id: a.target, role: found });
    return null;
  }
  if (role === 'ours') {
    const yes = L.bearSniff(e, playerId, a.target);
    if (yes === null) return 'Impossible.';
    intel.bear.push({ id: a.target, yes });
    return null;
  }
  const payload = { cupidon: { pair: a.pair }, salvateur: { target: a.target }, sorciere: { save: !!a.save, kill: a.kill, gorgee: a.gorgee }, distributeur: { targets: a.targets } }[role];
  const res = payload ? L.nightAct(e, role, playerId, payload) : { ok: false, error: 'Rien à faire.' };
  return res.ok ? null : res.error;
}

/** Annonce les nouveaux événements un par un (mort, chagrin, gorgées…), puis enchaîne. `quiet` : « aucune victime » si rien. */
function announce(game, status, after, quiet = false) {
  const d = data(game);
  const e = d.eng;
  const fresh = e.events.slice(d.mark);
  d.mark = e.events.length;
  // Les gorgées n'ajoutent aucune étape : celles du vote s'affichent avec la mort (ou l'Idiot) qu'elles suivent,
  // celles de la Sorcière / du Distributeur forment un seul message en fin d'aube.
  const items = [];
  const drinks = [];
  let drinkers = [];
  const sips = [];
  for (const ev of fresh) {
    if (ev.type === 'voteSips') drinkers.push(ev.id);
    else if (ev.type === 'gorgee') sips.push(ev);
    else {
      const item = publicEvent(ev);
      if (ev.type === 'death') {
        item.drinkers = drinkers;
        drinks.push([{ id: ev.id, n: ev.sips }, ...drinkers.map((id) => ({ id, n: 1 }))]);
        drinkers = [];
      } else if (ev.type === 'idiot') {
        item.drinkers = ev.voters;
        drinks.push(ev.voters.map((id) => ({ id, n: 1 })));
      } else drinks.push([]);
      items.push(item);
    }
  }
  if (sips.length) {
    items.push({ type: 'gorgees', ids: sips.map((ev) => ev.id) });
    drinks.push(sips.map((ev) => ({ id: ev.id, n: 1 })));
  }
  if (!items.length && quiet) {
    items.push({ type: 'none' });
    drinks.push([]);
  }
  const next = () => {
    if (status === 'hunter' && e.awaitingHunter) return startHunter(game, after);
    if (e.winner) return over(game);
    after();
  };
  if (!items.length) return next();
  const step = (i) => {
    for (const { id, n } of drinks[i]) game.drink(id, n);
    go(game, 'announce', timing(game).announceMs, () => (i + 1 < items.length ? step(i + 1) : next()), { announce: { items: items.slice(0, i + 1), i, deaths: items.filter((it) => it.type === 'death').length } });
  };
  step(0);
}

/** Version publique d'un événement : la cause d'une mort de nuit (loups ou poison) n'est jamais révélée. */
function publicEvent(ev) {
  if (ev.type === 'death') return { type: 'death', id: ev.id, role: ev.role, cause: ev.cause === 'loups' || ev.cause === 'poison' ? 'nuit' : ev.cause };
  if (ev.type === 'idiot') return { type: 'idiot', id: ev.id, role: ev.role };
  return { type: ev.type };
}

function startDawn(game) {
  const d = data(game);
  const status = L.dawn(d.eng);
  announce(game, status, () => startDebate(game), true);
}

function startHunter(game, after) {
  const d = data(game);
  const hunter = d.eng.awaitingHunter;
  go(game, 'hunter', timing(game).hunterMs, () => resolveHunter(game, hunter, null, after), { hunter, after });
}

function resolveHunter(game, hunter, target, after) {
  const d = data(game);
  const res = L.hunterShoot(d.eng, hunter, target);
  if (!res.ok) return;
  d.stage = 'hunter-done';
  announce(game, res.status, after);
}

function startDebate(game) {
  go(game, 'debate', timing(game).debateMs, () => startVote(game, null), { votes: {}, debate: true });
}

function startVote(game, only) {
  const d = data(game);
  d.votes = {};
  d.only = only;
  go(game, 'vote', only ? timing(game).vote2Ms : timing(game).voteMs, () => endVote(game, only), { voting: true });
}

function endVote(game, only) {
  const d = data(game);
  const e = d.eng;
  let r = L.voteCounts(e, d.votes, only);
  d.voteResult = { counts: r.counts, votes: r.valid };
  if (r.top.length > 1 && !only) {
    d.tie = r.top;
    return startVote(game, r.top);
  }
  d.tie = null;
  if (r.top.length === 1) {
    const status = L.eliminate(e, r.top[0], r.valid);
    // Résultat du vote affiché avant l'élimination (les votes ne sont secrets que jusqu'ici).
    return announce(game, status, () => startNight(game));
  }
  L.clearGhostBets(e);
  e.events.push({ type: 'novote' });
  announce(game, 'done', () => startNight(game));
}

// ---------- Vues ----------

function pad(me) {
  const size = JSON.stringify(me).length;
  return size < ME_SIZE ? { ...me, pad: 'x'.repeat(ME_SIZE - size - 12) } : me;
}

function privateView(game, d, playerId) {
  const e = d.eng;
  if (!(playerId in e.roles)) return pad({ spectator: true });
  const role = e.roles[playerId];
  const alive = L.isAlive(e, playerId);
  const wolves = e.order.filter((id) => L.isWolf(e, id));
  const me = {
    spectator: false,
    role,
    alive,
    partners: role === 'loup' ? wolves.filter((id) => id !== playerId) : [],
    lover: e.lovers?.includes(playerId) ? e.lovers.find((id) => id !== playerId) : null,
    intel: d.intel[playerId] ?? { seen: [], bear: [] },
    allRoles: alive ? null : e.order.map((id) => ({ id, role: e.roles[id], alive: L.isAlive(e, id) })),
    screen: screenOf(game, d, playerId, role, alive),
  };
  return pad(me);
}

function screenOf(game, d, playerId, role, alive) {
  const e = d.eng;
  const living = L.livingIds(e);
  if (d.stage === 'deal') return { kind: d.acked[playerId] ? 'waiting' : 'role' };
  if (d.stage === 'night') {
    const actor = d.phase === 'loups' ? alive && role === 'loup' : alive && role === roleOfPhase(d.phase) && L.actorOf(e, role) === playerId;
    if (!actor) return { kind: 'sleep' };
    if (d.phase === 'ivrogne') return { kind: 'drink' };
    if (d.phase === 'loups') return { kind: 'act', phase: 'loups', options: living.filter((id) => !L.isWolf(e, id)), wolfVotes: d.wolfVotes, mine: d.wolfVotes[playerId] ?? null };
    if (d.done[playerId]) return { kind: 'done' };
    const screen = { kind: 'act', phase: d.phase, options: living };
    if (d.phase === 'salvateur') screen.last = e.salvateurLast;
    if (d.phase === 'ours') screen.uses = e.oursUses;
    if (d.phase === 'sorciere') Object.assign(screen, { victim: L.effectiveVictim(e), life: e.witch.life, death: e.witch.death, gorgee: !!e.options.potionGorgee, lastGorgee: e.witch.lastGorgee });
    if (d.phase === 'distributeur') screen.used = e.distributeurUsed;
    return screen;
  }
  if (d.stage === 'hunter') return e.awaitingHunter === playerId ? { kind: 'shoot', options: living.filter((id) => id !== playerId) } : { kind: 'watch' };
  if (d.stage === 'debate') return alive ? { kind: 'debate' } : { kind: 'bet', options: living, mine: e.ghostBets[playerId] ?? null };
  if (d.stage === 'vote') {
    if (!alive) return { kind: 'bet', options: living, mine: e.ghostBets[playerId] ?? null };
    if (e.idiotOut[playerId]) return { kind: 'novote' };
    return { kind: 'vote', options: (d.only ?? living).filter((id) => id !== playerId), mine: d.votes[playerId] ?? null };
  }
  return { kind: 'watch' };
}

// ---------- Règles du moteur commun ----------

export default {
  id: 'loup',
  drawQuestion: () => null,
  acceptsVotes: () => false,
  isValidVote: () => false,
  revealMs: 8000,

  /** Composition valide pour les joueurs connectés, sinon le lancement est refusé avec le motif. */
  canStart(game) {
    const n = game.connectedCount();
    const counts = game.loupConfig?.counts ?? recommendedComposition(n);
    const { errors } = validateComposition(counts, n);
    return errors[0] ?? null;
  },

  startRound(game) {
    const ids = game.connectedPlayers().map((p) => p.id);
    const counts = game.loupConfig?.counts ?? recommendedComposition(ids.length);
    const eng = L.createGame(ids, counts, { options: game.loupConfig?.options });
    Object.assign(game.roundData, { eng, seq: 0, mark: 0, intel: {}, votes: {}, wolfVotes: {}, done: {}, names: snapshot(game, eng.order), stage: 'deal', phaseId: null, announce: null });
    startDeal(game);
  },

  /** Actions de l'hôte : « config » avant le lancement, « skipDebate » pendant le débat. */
  hostAction(game, action) {
    if (action.type === 'config') {
      if (game.phase !== 'lobby') return 'La composition se règle avant le lancement.';
      game.loupConfig = { counts: action.counts, options: { dernieresParoles: !!action.options?.dernieresParoles, potionGorgee: action.options?.potionGorgee !== false, rolesMaison: action.options?.rolesMaison !== false } };
      return null;
    }
    const d = data(game);
    if (game.phase !== 'question') return 'Aucune partie en cours.';
    if (action.type === 'skipDebate' && d.stage === 'debate') {
      startVote(game, null);
      return null;
    }
    return 'Action inconnue.';
  },

  handleAction(game, playerId, action) {
    const d = data(game);
    // Tribunal : répartition des crédits de gorgées.
    if (game.phase === 'results' && game.pending) {
      if (action.type !== 'allocate') return 'Action inconnue.';
      const credits = d.credits?.[playerId] ?? 0;
      if (!credits) return 'Tu n’as rien à distribuer.';
      const alloc = {};
      for (const [target, n] of Object.entries(action.allocation ?? {})) if (target in d.eng.roles && target !== playerId && Number.isInteger(n) && n > 0) alloc[target] = n;
      d.allocations[playerId] = alloc;
      if (Object.keys(d.credits).every((id) => d.allocations[id])) game.finalize();
      return null;
    }
    if (game.phase !== 'question' || !d.eng) return 'Pas maintenant.';
    if (action.phaseId !== undefined && action.phaseId !== d.phaseId) return 'Trop tard : cette phase est terminée.';
    const e = d.eng;
    if (!(playerId in e.roles)) return 'Tu regardes cette partie en spectateur.';
    const alive = L.isAlive(e, playerId);
    const role = e.roles[playerId];

    if (action.type === 'ack' && d.stage === 'deal') {
      d.acked[playerId] = true;
      if (e.order.every((id) => d.acked[id] || !game.players.get(id)?.sockets.size)) startNight(game);
      return null;
    }
    if (d.stage === 'night' && action.type === 'wolfVote') {
      if (d.phase !== 'loups' || !alive || role !== 'loup') return 'Pas maintenant.';
      if (!L.isAlive(e, action.target) || L.isWolf(e, action.target)) return 'Cible invalide.';
      d.wolfVotes[playerId] = action.target;
      return null;
    }
    if (d.stage === 'night' && action.type === 'night') {
      if (!alive || role !== roleOfPhase(d.phase) || L.actorOf(e, role) !== playerId) return 'Ce n’est pas ton tour.';
      if (d.done[playerId]) return 'Déjà fait.';
      const ok = nightAction(d, role, playerId, action);
      if (ok !== null) return ok;
      d.done[playerId] = true;
      return null;
    }
    if (d.stage === 'hunter' && action.type === 'shoot') {
      if (e.awaitingHunter !== playerId) return 'Ce n’est pas ton tir.';
      resolveHunter(game, playerId, action.target ?? null, d.after);
      return null;
    }
    if (d.stage === 'vote' && action.type === 'vote') {
      if (!alive || e.idiotOut[playerId]) return 'Tu ne votes pas.';
      if (!L.isAlive(e, action.target) || action.target === playerId || (d.only && !d.only.includes(action.target))) return 'Choix invalide.';
      d.votes[playerId] = action.target;
      return null;
    }
    if ((d.stage === 'debate' || d.stage === 'vote') && action.type === 'bet') return L.ghostBet(e, playerId, action.target) ? null : 'Pari invalide.';
    if (action.type === 'campBet') return L.ghostCampBet(e, playerId, action.camp) ? null : 'Pari invalide.';
    return 'Action inconnue.';
  },

  /** Joueur retiré par l'hôte : mort sans rôle révélé, la partie continue. */
  onPresenceChange(game) {
    const d = game.roundData;
    if (game.phase !== 'question' || !d?.eng) return;
    for (const id of d.eng.order) if (!game.players.has(id) && L.isAlive(d.eng, id)) L.withdraw(d.eng, id);
    if (d.eng.winner && d.stage !== 'over') over(game);
  },

  computeResults(_ids, _votes, game) {
    const e = data(game).eng;
    const d = data(game);
    d.credits = L.tribunalCredits(e);
    d.allocations = {};
    return { winner: e.winner, roles: Object.fromEntries(e.order.map((id) => [id, e.roles[id]])), lovers: e.lovers, credits: d.credits, dead: e.dead };
  },

  afterReveal(game) {
    game.schedule('pending', timing(game).tribunalMs, () => game.finalize());
    return true;
  },

  resolvePending(game) {
    const d = data(game);
    const out = L.settleTribunal(d.eng, d.allocations, Math.random);
    game.results = { ...game.results, tribunal: out };
  },

  sipsOf: (results) => results.tribunal?.sips ?? {},

  publicRound(game, viewer) {
    const d = data(game);
    const e = d.eng;
    if (!e) return {};
    const dead = (id) => !L.isAlive(e, id);
    const withdrawn = (id) => e.dead[id]?.cause === 'retire';
    const round = {
      stage: d.stage,
      phaseId: d.phaseId,
      phase: d.stage === 'night' ? d.phase : null,
      night: e.night,
      timer: game.timerState('g:phase'),
      circle: e.order.map((id) => ({
        id,
        name: d.names[id].name,
        photoUrl: d.names[id].photoUrl,
        alive: !dead(id),
        // Le rôle d'un mort est public ; celui d'un joueur retiré reste caché jusqu'à la fin.
        role: dead(id) && (!withdrawn(id) || d.stage === 'over') ? e.roles[id] : null,
        idiotOut: !!e.idiotOut[id],
        connected: !!game.players.get(id)?.sockets.size,
      })),
      announce: d.stage === 'announce' ? d.announce : null,
      votedIds: d.stage === 'vote' ? Object.keys(d.votes) : [],
      tie: d.tie ?? null,
      voteResult: d.stage === 'announce' || d.stage === 'hunter' ? d.voteResult ?? null : null,
      hunter: d.stage === 'hunter' ? d.hunter : null,
      winner: e.winner,
      dernieresParoles: !!e.options.dernieresParoles,
    };
    if (game.phase === 'results') round.credits = d.credits ?? {};
    if (viewer.playerId) round.me = privateView(game, d, viewer.playerId);
    return round;
  },
};
