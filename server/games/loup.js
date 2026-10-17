// Loup-Garou côté serveur : une partie entière = une « manche » du moteur commun (phase `question`).
// Les phases (distribution, nuit, aube, débat, vote…) avancent dès que les joueurs ont agi ou sont d'accord : aucun
// compte à rebours affiché. Seuls des garde-fous invisibles (`g:phase`, longs) évitent qu'un joueur absent bloque la partie ;
// `g:soon` déclenche la suite juste après la dernière action. Tous sont annulés au même endroit (Game.reset / nextQuestion /
// reveal) et chacun vérifie son `phaseId`.
// Confidentialité : publicRound() ne renvoie à chaque écran que ce qu'il a le droit de voir ; la TV ne reçoit jamais
// de rôle vivant. Un rôle absent de la composition ou dont le joueur est mort (donc révélé) est sauté ; un rôle vivant mais absent ou sans pouvoir se joue avec un délai aléatoire proche de celui d'un
// joueur qui joue : on ne peut pas deviner qu'un rôle est mort à la vitesse à laquelle la nuit avance.
import * as L from '../rules/loup.js';
import { gateMs, textMs } from '../narrationTiming.js';
import { recommendedComposition, validateComposition } from '../rules/loup.js';

export const LOUP_TIMING = {
  // Les durées qui suivent démarrent APRÈS la voix : une phase attend l'accusé « phrase terminée » de la TV (voir go()).
  sleepMs: 1200, // pause après « le village s'endort »
  announceBeatMs: 1500, // pause après la voix d'une annonce (roulement de tambour, photo, rôle)
  doneBeatMs: 1500, // pause après la dernière action d'une phase de nuit
  readBeatMs: 4000, // idem pour la Voyante et l'Ours : le temps de lire ce qu'ils viennent d'apprendre
  voteBeatMs: 1500, // pause après le dernier vote
  absentMinMs: 3500, // rôle vivant mais absent ou sans pouvoir : durée simulée (tirée au hasard entre les deux)
  absentMaxMs: 8000,
  // Garde-fous invisibles : un joueur qui ne fait rien ne bloque jamais la partie.
  dealSafetyMs: 120000,
  nightSafetyMs: 60000,
  hunterSafetyMs: 15000, // le Chasseur a 15 s (invisibles) : sans tir, personne ne meurt
  debateSafetyMs: 300000,
  voteSafetyMs: 120000,
  tribunalMs: 30000,
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

/**
 * Passe à une nouvelle phase : identifiant unique, `next` ne s'exécute que si la phase est toujours la courante.
 * `clips` : phrases du narrateur à dire en entrant dans la phase ([{ id, after }], publiées à la TV dans `round.narration`).
 * La phase reste « en narration » jusqu'à l'accusé de la TV (`narrated`), ou jusqu'à la durée des clips + 2 s si l'accusé
 * n'arrive pas ; ensuite seulement démarrent `ms` (garde-fou ou pause avant la suite) et les actions de nuit.
 * `soon()` avance plus tôt quand tout le monde a agi.
 */
function go(game, stage, ms, next, extra = {}, clips = []) {
  const d = data(game);
  d.seq += 1;
  const id = `${game.roundId}:${d.seq}`;
  const spoken = timing(game).narrate !== false && clips.length > 0;
  const narration = spoken ? { phaseId: id, clips: clips.map((c) => ({ id: c.id, after: c.after ?? 0, ms: textMs(c.id) })) } : null;
  Object.assign(d, { stage, phaseId: id, advance: next, soonFor: null, soonWait: null, narration, narrating: spoken, ...extra });
  game.cancel('g:phase');
  game.cancel('g:soon');
  game.cancel('g:gate');
  let opened = false;
  d.open = () => {
    if (opened || data(game).phaseId !== id) return;
    opened = true;
    d.narrating = false;
    game.cancel('g:gate');
    game.schedulePausable('g:phase', ms, () => data(game).phaseId === id && next());
    if (d.soonWait != null) soon(game, d.soonWait);
  };
  if (spoken) game.schedulePausable('g:gate', gateMs(clips), d.open);
  else d.open();
}

/** Termine la phase courante dans `ms` (une seule fois par phase) : tout le monde a agi, ou le rôle est absent. */
function soon(game, ms) {
  const d = data(game);
  if (d.soonFor === d.phaseId) return;
  if (d.narrating) {
    d.soonWait ??= ms; // la voix passe d'abord
    return;
  }
  d.soonFor = d.phaseId;
  const id = d.phaseId;
  const next = d.advance;
  game.schedulePausable('g:soon', ms, () => data(game).phaseId === id && next());
}

const between = (game, min, max) => min + Math.random() * (max - min);
const present = (game, id) => !!game.players.get(id)?.sockets.size;

/** Fin de partie : l'écran de victoire puis le Tribunal des gorgées (moteur commun : reveal → results en attente). */
function over(game) {
  const d = data(game);
  game.cancel('g:phase');
  d.stage = 'over';
  d.narration = { phaseId: `${game.roundId}:win`, clips: [{ id: `win_${d.eng.winner}`, after: 0, ms: textMs(`win_${d.eng.winner}`) }] };
  game.reveal(game.roundId);
  return d;
}

function startDeal(game) {
  go(game, 'deal', timing(game).dealSafetyMs, () => startNight(game), { acked: {} }, [{ id: 'intro' }, { id: 'deal' }]);
}

function startNight(game) {
  const d = data(game);
  L.startNight(d.eng);
  d.phases = L.nightPhases(d.eng);
  d.index = -1;
  d.wolfVotes = {};
  d.done = {};
  d.lastNight = null;
  go(game, 'sleep', timing(game).sleepMs, () => nextNightPhase(game), { phase: null }, [{ id: 'sleep' }]);
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
  // Qui peut agir dans cette phase ? Un rôle vivant mais absent ou sans pouvoir restant se joue quand même, avec un délai crédible.
  const e = d.eng;
  let actors = [];
  if (phase === 'loups') actors = L.livingIds(e).filter((id) => L.isWolf(e, id));
  else if (phase !== 'ivrogne') {
    const a = L.actorOf(e, role);
    const spent = (phase === 'distributeur' && e.distributeurUsed) || (phase === 'ours' && e.oursUses <= 0);
    if (a && !spent) actors = [a];
  }
  d.able = actors.filter((id) => present(game, id));
  const t = timing(game);
  // La phase précédente se rendort, puis celle-ci se réveille (rien n'est dit pour un rôle sauté).
  const clips = [...(d.lastNight ? [{ id: `sleep_${d.lastNight}` }] : []), { id: `wake_${phase}` }];
  d.lastNight = phase;
  go(game, 'night', t.nightSafetyMs, () => endNightPhase(game), { phase, phaseRole: role }, clips);
  if (!d.able.length) soon(game, between(game, t.absentMinMs, t.absentMaxMs));
}

/** Une action de nuit vient d'être faite : si tous ceux qui pouvaient agir ont fini, la phase se termine bientôt. */
function nightProgress(game) {
  const d = data(game);
  const t = timing(game);
  const finished = d.phase === 'loups' ? d.able.every((id) => d.wolfVotes[id]) : d.able.every((id) => d.done[id]);
  if (finished) soon(game, d.phase === 'voyante' || d.phase === 'ours' ? t.readBeatMs : t.doneBeatMs);
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
function announce(game, status, after, quiet = false, dawn = false) {
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
    const deaths = items.filter((it) => it.type === 'death').length;
    const clips = itemClips(items[i], { first: i === 0 && dawn, firstDeath: items.findIndex((it) => it.type === 'death') === i, deaths, lastNight: d.lastNight });
    if (i === 0 && dawn) d.lastNight = null;
    go(game, 'announce', timing(game).announceBeatMs, () => (i + 1 < items.length ? step(i + 1) : next()), { announce: { items: items.slice(0, i + 1), i, deaths } }, clips);
  };
  step(0);
}

/** Phrases du narrateur pour une annonce : jamais de prénom, le rôle est dit quand il apparaît à l'écran (après le roulement de tambour). */
export function itemClips(item, { first, firstDeath, deaths, lastNight }) {
  const clips = [];
  if (first) clips.push(...(lastNight ? [{ id: `sleep_${lastNight}` }] : []), { id: 'dawn' });
  if (item.type === 'none') clips.push({ id: 'no_victim' });
  else if (item.type === 'novote') clips.push({ id: 'novote' });
  else if (item.type === 'gorgees') clips.push({ id: 'gorgee' });
  else if (item.type === 'idiot') clips.push({ id: 'idiot' });
  else if (item.type === 'death') {
    if (item.cause === 'chagrin') clips.push({ id: 'grief' });
    else if (item.cause === 'chasseur') clips.push({ id: 'hunter_hit' });
    else if (item.cause === 'vote') clips.push({ id: 'vote_result' });
    else if (item.cause === 'nuit' && firstDeath) clips.push({ id: deaths > 1 ? 'victim_many' : 'victim_one' });
    if (item.role) clips.push({ id: `role_${item.role}`, after: 3600 });
  }
  return clips;
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
  announce(game, status, () => startDebate(game), true, true);
}

function startHunter(game, after) {
  const d = data(game);
  const hunter = d.eng.awaitingHunter;
  go(game, 'hunter', timing(game).hunterSafetyMs, () => resolveHunter(game, hunter, null, after), { hunter, after }, [{ id: 'hunter_fire' }]);
}

function resolveHunter(game, hunter, target, after) {
  const d = data(game);
  const res = L.hunterShoot(d.eng, hunter, target);
  if (!res.ok) return;
  d.stage = 'hunter-done';
  announce(game, res.status, after);
}

function startDebate(game) {
  go(game, 'debate', timing(game).debateSafetyMs, () => startVote(game, null), { votes: {}, debate: true, ready: {} }, [{ id: 'debate_start' }]);
  debateProgress(game);
}

/** Le débat se termine dès que tous les vivants présents sont d'accord pour voter. */
function debateProgress(game) {
  const d = data(game);
  const need = L.livingIds(d.eng).filter((id) => present(game, id));
  if (d.stage === 'debate' && need.length > 0 && need.every((id) => d.ready[id])) startVote(game, null);
}

function startVote(game, only) {
  const d = data(game);
  d.votes = {};
  d.only = only;
  go(game, 'vote', timing(game).voteSafetyMs, () => endVote(game, only), { voting: true }, [{ id: only ? 'tie' : 'vote_start' }]);
  voteProgress(game);
}

/** Le vote se termine bientôt quand tous les votants présents ont voté (ou si personne ne peut voter). */
function voteProgress(game) {
  const d = data(game);
  if (d.stage !== 'vote') return;
  const need = L.eligibleVoters(d.eng).filter((id) => present(game, id));
  if (need.every((id) => d.votes[id])) soon(game, timing(game).voteBeatMs);
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
    last: !alive && e.options.dernieresParoles && e.dead[playerId]?.cause !== 'retire' ? (d.last[playerId] ? 'done' : 'pending') : null,
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
    if (!actor || d.narrating) return { kind: 'sleep' };
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
  if (d.stage === 'debate') return alive ? { kind: 'debate', ready: !!d.ready[playerId] } : { kind: 'bet', options: living, mine: e.ghostBets[playerId] ?? null };
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

  /** Composition affichée dans le lobby de la TV : réglée par l'hôte, ou conseillée pour le nombre de joueurs connectés. */
  publicLobby(game) {
    const n = game.connectedCount();
    const custom = !!game.loupConfig?.counts;
    const counts = game.loupConfig?.counts ?? recommendedComposition(n);
    const { errors, warnings } = validateComposition(counts, n);
    return { players: n, counts, custom, recommended: recommendedComposition(n), errors, warnings, options: { dernieresParoles: false, potionGorgee: true, rolesMaison: true, ...game.loupConfig?.options } };
  },

  startRound(game) {
    const ids = game.connectedPlayers().map((p) => p.id);
    // Composition réglée par l'hôte si elle correspond aux joueurs, sinon la composition conseillée (mode soirée, arrivées tardives).
    const custom = game.loupConfig?.counts;
    const counts = custom && validateComposition(custom, ids.length).errors.length === 0 ? custom : recommendedComposition(ids.length);
    const eng = L.createGame(ids, counts, { options: game.loupConfig?.options });
    Object.assign(game.roundData, { eng, seq: 0, mark: 0, intel: {}, last: {}, votes: {}, wolfVotes: {}, done: {}, names: snapshot(game, eng.order), stage: 'deal', phaseId: null, announce: null });
    startDeal(game);
  },

  /** Actions de l'hôte : « config » avant le lancement, « skipDebate » pendant le débat. */
  hostAction(game, action) {
    if (action.type === 'config') {
      if (game.phase !== 'lobby') return 'La composition se règle avant le lancement.';
      // « Composition recommandée » : on repart du conseil pour le nombre de joueurs (qui suit ensuite les arrivées).
      if (action.counts === null) {
        game.loupConfig = { counts: null, options: game.loupConfig?.options };
        return null;
      }
      // Sans `counts`, on ne change que les options (la composition réglée, ou conseillée, reste telle quelle).
      const prev = game.loupConfig ?? {};
      const o = action.options ?? prev.options ?? {};
      game.loupConfig = {
        counts: action.counts === undefined ? prev.counts ?? null : action.counts,
        options: { dernieresParoles: !!o.dernieresParoles, potionGorgee: o.potionGorgee !== false, rolesMaison: o.rolesMaison !== false },
      };
      return null;
    }
    const d = data(game);
    if (game.phase !== 'question') return 'Aucune partie en cours.';
    // Dernières paroles : l'hôte peut masquer (ou ré-afficher) une phrase.
    if (action.type === 'hideLast') {
      const entry = d.last?.[action.id];
      if (!entry) return 'Phrase inconnue.';
      entry.hidden = !entry.hidden;
      return null;
    }
    // Accusé de la TV : la phrase de cette phase est terminée, la phase peut démarrer.
    if (action.type === 'narrated') {
      if (d.narrating && action.phaseId === d.phaseId) d.open();
      return null;
    }
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
      if (e.order.every((id) => d.acked[id] || !present(game, id))) startNight(game);
      return null;
    }
    if (d.stage === 'night' && d.narrating && (action.type === 'wolfVote' || action.type === 'night')) return 'Pas encore.';
    if (d.stage === 'night' && action.type === 'wolfVote') {
      if (d.phase !== 'loups' || !alive || role !== 'loup') return 'Pas maintenant.';
      if (!L.isAlive(e, action.target) || L.isWolf(e, action.target)) return 'Cible invalide.';
      d.wolfVotes[playerId] = action.target;
      nightProgress(game);
      return null;
    }
    if (d.stage === 'night' && action.type === 'night') {
      if (!alive || role !== roleOfPhase(d.phase) || L.actorOf(e, role) !== playerId) return 'Ce n’est pas ton tour.';
      if (d.done[playerId]) return 'Déjà fait.';
      const ok = nightAction(d, role, playerId, action);
      if (ok !== null) return ok;
      d.done[playerId] = true;
      nightProgress(game);
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
      voteProgress(game);
      return null;
    }
    // Dernières paroles (option) : une phrase de 80 caractères, texte brut, que le mort peut aussi passer. Jamais bloquant.
    if (action.type === 'last') {
      if (alive || !e.options.dernieresParoles || e.dead[playerId]?.cause === 'retire') return 'Pas de dernières paroles pour toi.';
      if (d.last[playerId]) return 'Déjà dit.';
      const text = typeof action.text === 'string' ? action.text.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      d.last[playerId] = { text, hidden: false };
      return null;
    }
    // Débat : « on peut voter » (un tap, on peut se rétracter) ; quand tous les vivants présents sont d'accord, on vote.
    if (d.stage === 'debate' && action.type === 'ready') {
      if (!alive) return 'Les fantômes ne décident pas.';
      d.ready[playerId] = !d.ready[playerId];
      debateProgress(game);
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
    if (d.eng.winner && d.stage !== 'over') return over(game);
    // Quelqu'un part ou revient : on revérifie si tout le monde est prêt, sans attendre un absent.
    debateProgress(game);
    if (d.stage === 'vote') voteProgress(game);
    if (d.stage === 'night') {
      d.able = d.able.filter((id) => present(game, id));
      nightProgress(game);
      if (!d.able.length) soon(game, between(game, timing(game).absentMinMs, timing(game).absentMaxMs));
    }
  },

  computeResults(_ids, _votes, game) {
    const e = data(game).eng;
    const d = data(game);
    d.credits = L.tribunalCredits(e);
    d.allocations = {};
    return { winner: e.winner, nights: e.night, seerFound: Object.keys(e.seen).length, roles: Object.fromEntries(e.order.map((id) => [id, e.roles[id]])), lovers: e.lovers, credits: d.credits, dead: e.dead };
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
      // Débat : combien de vivants sont d'accord pour voter (public : rien de secret).
      ready: d.stage === 'debate' ? { n: L.livingIds(e).filter((id) => d.ready?.[id]).length, of: L.livingIds(e).filter((id) => present(game, id)).length } : null,
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
      // Phrases à dire à la TV (publiques : le rôle d'un mort et la phase de nuit sont déjà affichés) ; jamais envoyé aux téléphones.
      narration: viewer.playerId ? null : d.narration ?? null,
      announce: d.stage === 'announce' ? d.announce : null,
      votedIds: d.stage === 'vote' ? Object.keys(d.votes) : [],
      tie: d.tie ?? null,
      voteResult: d.stage === 'announce' || d.stage === 'hunter' ? d.voteResult ?? null : null,
      hunter: d.stage === 'hunter' ? d.hunter : null,
      winner: e.winner,
      dernieresParoles: !!e.options.dernieresParoles,
      // Phrases non vides ; une phrase masquée par l'hôte reste dans la liste (pour pouvoir la ré-afficher) mais sans son texte.
      lastWords: Object.entries(d.last).filter(([, w]) => w.text).map(([id, w]) => ({ id, text: w.hidden ? null : w.text, hidden: w.hidden })),
    };
    if (game.phase === 'results') round.credits = d.credits ?? {};
    if (viewer.playerId) round.me = privateView(game, d, viewer.playerId);
    return round;
  },
};
