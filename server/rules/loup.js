// Loup-Garou : règles pures (aucun minuteur, aucun réseau), testées dans server/loup.test.js.
// L'état est un objet JSON simple, modifié en place. Le serveur (server/games/loup.js) l'enchaîne avec les phases.
//
// Morts : file d'attente `queue`, traitée une par une dans l'ordre (mort, chagrin, tir du Chasseur…).
// Si un Chasseur meurt, on s'arrête (`awaitingHunter`) jusqu'à `hunterShoot()`, puis la file reprend.
// Gorgées : chaque événement porte ses `sips` ; le serveur les passe à la fonction centralisée du compteur.

export const ROLES = {
  villageois: { name: 'Villageois', camp: 'village', unique: false },
  loup: { name: 'Loup-garou', camp: 'loups', unique: false, phase: 'loups' },
  voyante: { name: 'Voyante', camp: 'village', unique: true, phase: 'voyante', info: true },
  sorciere: { name: 'Sorcière', camp: 'village', unique: true, phase: 'sorciere' },
  chasseur: { name: 'Chasseur', camp: 'village', unique: true },
  cupidon: { name: 'Cupidon', camp: 'village', unique: true, phase: 'cupidon' },
  salvateur: { name: 'Salvateur', camp: 'village', unique: true, phase: 'salvateur' },
  ours: { name: 'Ours', camp: 'village', unique: true, phase: 'ours', info: true },
  idiot: { name: 'Idiot du village', camp: 'village', unique: true },
  ancien: { name: 'Ancien', camp: 'village', unique: true },
  ivrogne: { name: 'Ivrogne', camp: 'village', unique: true, phase: 'ivrogne', house: true },
  distributeur: { name: 'Distributeur', camp: 'village', unique: true, phase: 'distributeur', house: true },
};
export const ROLE_IDS = Object.keys(ROLES);
export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 30;
/** Ordre des phases de nuit (la nuit 1 commence par Cupidon). */
export const NIGHT_ORDER = ['cupidon', 'salvateur', 'voyante', 'ours', 'loups', 'sorciere', 'distributeur', 'ivrogne'];
export const OURS_USES = 3;
export const TRIBUNAL_CAP = 8;

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const isWolf = (s, id) => s.roles[id] === 'loup';
export const isAlive = (s, id) => id in s.roles && !(id in s.dead);
export const livingIds = (s) => s.order.filter((id) => isAlive(s, id));
export const campOf = (s, id) => ROLES[s.roles[id]].camp;

// ---------- Composition ----------

/** Composition conseillée pour n joueurs : { role: nombre }. */
export function recommendedComposition(n) {
  const c = {};
  const add = (...roles) => roles.forEach((r) => (c[r] = 1));
  let wolves = 1;
  if (n >= 8) wolves = 2;
  if (n >= 10) wolves = 3;
  if (n >= 13) wolves = 4;
  if (n >= 17) wolves = 5;
  if (n >= 21) wolves = n > 26 ? 7 : 6;
  c.loup = wolves;
  add('voyante', 'chasseur');
  if (n >= 8) add('sorciere');
  if (n >= 10) add('cupidon', 'ours');
  if (n >= 13) add('salvateur', 'idiot', 'ancien');
  if (n >= 17) add('ivrogne', 'distributeur');
  const used = Object.values(c).reduce((a, b) => a + b, 0);
  c.villageois = Math.max(0, n - used);
  return c;
}

/** { errors (bloquent), warnings (avertissent) } pour une composition { role: nombre } et n joueurs. */
export function validateComposition(counts, n) {
  const errors = [];
  const warnings = [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (n < MIN_PLAYERS) errors.push(`Il faut au moins ${MIN_PLAYERS} joueurs.`);
  if (n > MAX_PLAYERS) errors.push(`${MAX_PLAYERS} joueurs maximum.`);
  if (total !== n) errors.push(`${total} rôles pour ${n} joueurs : il doit y en avoir autant.`);
  for (const [role, k] of Object.entries(counts)) {
    if (!ROLES[role]) errors.push(`Rôle inconnu : ${role}.`);
    else if (ROLES[role].unique && k > 1) errors.push(`${ROLES[role].name} : un seul exemplaire.`);
    if (!Number.isInteger(k) || k < 0) errors.push(`Nombre invalide pour ${role}.`);
  }
  const wolves = counts.loup ?? 0;
  if (wolves === 0) warnings.push('Aucun loup-garou : la partie finira dès la première vérification.');
  else if (wolves > n / 3) warnings.push('Beaucoup de loups (plus d’un tiers des joueurs).');
  const infos = ROLE_IDS.filter((r) => ROLES[r].info).reduce((a, r) => a + (counts[r] ?? 0), 0);
  if (infos > (n <= 12 ? 2 : 3)) warnings.push('Beaucoup de rôles d’information (Voyante, Ours).');
  return { errors, warnings };
}

// ---------- Création ----------

/** Distribue les rôles au hasard et tire l'ordre du cercle. options : { dernieresParoles, rolesMaison, potionGorgee }. */
export function createGame(playerIds, counts, { rng = Math.random, options = {} } = {}) {
  const { errors } = validateComposition(counts, playerIds.length);
  if (errors.length) throw new Error(errors[0]);
  const deck = shuffle(
    Object.entries(counts).flatMap(([role, k]) => Array(k).fill(role)),
    rng,
  );
  const order = shuffle(playerIds, rng);
  return {
    order,
    roles: Object.fromEntries(order.map((id, i) => [id, deck[i]])),
    dead: {},
    night: 0,
    lovers: null,
    witch: { life: true, death: true, lastGorgee: null },
    salvateurLast: null,
    oursUses: OURS_USES,
    ancienSurvived: false,
    distributeurUsed: false,
    idiotOut: {},
    options: { dernieresParoles: false, potionGorgee: true, rolesMaison: true, ...options },
    act: {},
    queue: [],
    hunters: [],
    awaitingHunter: null,
    pendingGorgees: [],
    events: [],
    credits: [],
    penalties: [],
    seen: {},
    ghostBets: {},
    ghostPoints: {},
    campBets: {},
    winner: null,
  };
}

/**
 * Phases de la nuit à jouer : seulement les rôles de la composition dont un joueur est encore en vie (la mort et le rôle
 * d'un joueur sont publics). Un rôle vivant sans pouvoir restant reste joué : le sauter trahirait qu'il ne peut plus agir.
 */
export function nightPhases(s) {
  const present = new Set(s.order.filter((id) => isAlive(s, id)).map((id) => s.roles[id]));
  return NIGHT_ORDER.filter((p) => {
    if (p === 'cupidon' && s.night !== 1) return false;
    if (p === 'loups') return present.has('loup');
    if (p === 'sorciere' && !present.has('sorciere')) return false;
    if (p === 'distributeur' && (!present.has('distributeur') || !s.options.rolesMaison)) return false;
    if (p === 'ivrogne' && (!present.has('ivrogne') || !s.options.rolesMaison)) return false;
    return present.has(Object.keys(ROLES).find((r) => ROLES[r].phase === p));
  });
}

export const actorOf = (s, role) => s.order.find((id) => s.roles[id] === role && isAlive(s, id)) ?? null;
export const startNight = (s) => {
  s.night += 1;
  s.act = {};
};

// ---------- Voisins, voyante, ours ----------

/** Voisins vivants les plus proches d'un joueur dans le cercle (les morts sont sautés). */
export function livingNeighbors(s, id) {
  const n = s.order.length;
  const i = s.order.indexOf(id);
  const find = (step) => {
    for (let k = 1; k < n; k++) {
      const other = s.order[(((i + step * k) % n) + n) % n];
      if (other !== id && isAlive(s, other)) return other;
    }
    return null;
  };
  return [...new Set([find(-1), find(1)].filter(Boolean))];
}

/** Voyante : le rôle de la cible. Un loup découvert pour la première fois rapporte 1 gorgée à distribuer. */
export function seerReveal(s, seerId, targetId) {
  if (!isAlive(s, seerId) || s.roles[seerId] !== 'voyante' || !isAlive(s, targetId) || targetId === seerId) return null;
  if (isWolf(s, targetId) && !s.seen[targetId]) {
    s.seen[targetId] = true;
    s.credits.push({ id: seerId, n: 1, why: 'voyante' });
  }
  return s.roles[targetId];
}

/** Ours : « elle ou l'un de ses deux voisins vivants est un loup ? » (3 utilisations). null = refusé. */
export function bearSniff(s, bearId, targetId) {
  if (!isAlive(s, bearId) || s.roles[bearId] !== 'ours' || s.oursUses <= 0 || !isAlive(s, targetId)) return null;
  s.oursUses -= 1;
  const yes = [targetId, ...livingNeighbors(s, targetId)].some((id) => isWolf(s, id));
  if (yes) s.credits.push({ id: bearId, n: 1, why: 'ours' });
  return yes;
}

// ---------- Actions de nuit ----------

/** Victime des loups telle que la Sorcière la voit : après l'Ancien (première attaque) et le Salvateur. */
export function effectiveVictim(s) {
  const v = s.act.victim;
  if (!v || !isAlive(s, v)) return null;
  if (s.roles[v] === 'ancien' && !s.ancienSurvived) return null;
  if (v === s.act.protect) return null;
  return v;
}

/** Enregistre l'action d'un rôle ; renvoie { ok, error? }. Les actions invalides ne changent rien. */
export function nightAct(s, role, actorId, p = {}) {
  const no = (error) => ({ ok: false, error });
  const alive = (id) => typeof id === 'string' && isAlive(s, id);
  if (role === 'cupidon') {
    if (s.night !== 1 || s.lovers) return no('Cupidon n’agit que la première nuit.');
    const [a, b] = p.pair ?? [];
    if (!alive(a) || !alive(b) || a === b) return no('Deux joueurs différents.');
    s.lovers = [a, b];
  } else if (role === 'salvateur') {
    if (!alive(p.target)) return no('Cible invalide.');
    if (p.target === s.salvateurLast) return no('Pas deux nuits de suite sur la même personne.');
    s.act.protect = p.target;
  } else if (role === 'loups') {
    if (p.victim != null && !alive(p.victim)) return no('Cible invalide.');
    s.act.victim = p.victim ?? null;
  } else if (role === 'sorciere') {
    const w = s.witch;
    if (p.save) {
      if (!w.life) return no('Potion de vie déjà utilisée.');
      if (!effectiveVictim(s)) return no('Personne à sauver.');
      s.act.save = true;
    }
    if (p.kill != null) {
      if (!w.death) return no('Potion de mort déjà utilisée.');
      if (!alive(p.kill) || p.kill === actorId) return no('Cible invalide.');
      s.act.kill = p.kill;
    }
    if (p.gorgee != null && s.options.potionGorgee) {
      if (!alive(p.gorgee)) return no('Cible invalide.');
      if (p.gorgee === w.lastGorgee) return no('Pas deux nuits de suite sur la même personne.');
      s.act.gorgee = p.gorgee;
    }
  } else if (role === 'distributeur') {
    if (s.distributeurUsed) return no('Déjà utilisé.');
    const targets = [...new Set(p.targets ?? [])].filter(alive).slice(0, 3);
    if (!targets.length) return no('Aucune cible.');
    s.act.distribute = targets;
  } else return no('Rôle sans action.');
  return { ok: true };
}

/** Choix des loups : le plus voté, égalité tirée au sort, aucun vote = personne. */
export function tallyWolves(votes, rng = Math.random) {
  const counts = {};
  for (const target of Object.values(votes)) if (target) counts[target] = (counts[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  return max ? pick(Object.keys(counts).filter((id) => counts[id] === max), rng) : null;
}

// ---------- Morts ----------

const addDeath = (s, id, cause, by = null, front = false) => (front ? s.queue.unshift({ id, cause, by }) : s.queue.push({ id, cause, by }));

/**
 * Traite la file des morts. S'arrête si un Chasseur doit tirer (awaitingHunter), sinon vérifie la victoire.
 * Renvoie 'hunter' ou 'done'.
 */
export function advance(s) {
  while (s.queue.length) {
    const { id, cause, by } = s.queue.shift();
    if (!isAlive(s, id)) continue;
    const role = s.roles[id];
    s.dead[id] = { cause, night: s.night };
    s.events.push({ type: 'death', id, role, cause, sips: cause === 'chasseur' ? 2 : 1 });
    if (cause === 'poison' && by) {
      if (isWolf(s, id)) s.credits.push({ id: by, n: 2, why: 'sorciere' });
      else s.penalties.push({ id: by, n: 2, why: 'sorciere' });
    }
    if (cause === 'chasseur' && by) {
      if (isWolf(s, id)) s.credits.push({ id: by, n: 2, why: 'chasseur' });
      else s.penalties.push({ id: by, n: 2, why: 'chasseur' });
    }
    const partner = s.lovers?.find((l) => l !== id);
    if (s.lovers?.includes(id) && partner && isAlive(s, partner)) addDeath(s, partner, 'chagrin', null, true);
    // Le Chasseur tire après le chagrin des amoureux : on termine d'abord la file, puis il parle.
    if (role === 'chasseur') s.hunters.push(id);
  }
  if (s.hunters.length) {
    s.awaitingHunter = s.hunters.shift();
    return 'hunter';
  }
  // Une gorgée sans source ne vise pas quelqu'un qui est mort entre-temps (tir du Chasseur…).
  s.events.push(...s.pendingGorgees.filter((e) => isAlive(s, e.id)));
  s.pendingGorgees = [];
  checkVictory(s);
  return 'done';
}

/** Le Chasseur mort tire (ou pas : targetId null). Reprend ensuite la file. */
export function hunterShoot(s, hunterId, targetId) {
  if (s.awaitingHunter !== hunterId) return { ok: false, error: 'Ce n’est pas ton tir.' };
  s.awaitingHunter = null;
  if (targetId && isAlive(s, targetId) && targetId !== hunterId) addDeath(s, targetId, 'chasseur', hunterId);
  return { ok: true, status: advance(s) };
}

// ---------- Aube ----------

/** Résout la nuit dans l'ordre : Ancien, Salvateur, Sorcière, poison, morts, chagrin, Chasseur. Renvoie 'hunter' ou 'done'. */
export function dawn(s) {
  const a = s.act;
  let victim = a.victim && isAlive(s, a.victim) ? a.victim : null;
  if (victim && s.roles[victim] === 'ancien' && !s.ancienSurvived) {
    s.ancienSurvived = true;
    s.credits.push({ id: victim, n: 2, why: 'ancien' });
    victim = null;
  } else if (victim && victim === a.protect) {
    const sal = s.order.find((id) => s.roles[id] === 'salvateur');
    if (sal) s.credits.push({ id: sal, n: 1, why: 'salvateur' });
    victim = null;
  } else if (victim && a.save && s.witch.life) {
    s.witch.life = false;
    victim = null;
  }
  if (a.protect) s.salvateurLast = a.protect;
  const witch = s.order.find((id) => s.roles[id] === 'sorciere');
  if (victim) addDeath(s, victim, 'loups');
  if (a.kill && s.witch.death && isAlive(s, a.kill)) {
    s.witch.death = false;
    addDeath(s, a.kill, 'poison', witch);
  }
  s.witch.lastGorgee = a.gorgee ?? null;
  // Gorgées sans source, annoncées à l'aube après les morts (une seule fois par personne).
  const said = new Set();
  for (const id of [a.gorgee, ...(a.distribute ?? [])]) {
    if (id && !said.has(id)) {
      said.add(id);
      s.pendingGorgees.push({ type: 'gorgee', id, sips: 1 });
    }
  }
  if (a.distribute) s.distributeurUsed = true;
  // Celui qui meurt cette nuit n'a pas besoin d'une gorgée en plus.
  s.pendingGorgees = s.pendingGorgees.filter((e) => isAlive(s, e.id) && !s.queue.some((q) => q.id === e.id));
  return advance(s);
}

// ---------- Vote du village ----------

/** Votants : vivants, sauf l'Idiot dépossédé de son vote. */
export const eligibleVoters = (s) => livingIds(s).filter((id) => !s.idiotOut[id]);

/** Dépouillement : { counts, top } ; seuls les votes valides (votant éligible, cible vivante ≠ soi) comptent. */
export function voteCounts(s, votes, only = null) {
  const voters = new Set(eligibleVoters(s));
  const counts = {};
  const valid = {};
  for (const [voter, target] of Object.entries(votes)) {
    if (!voters.has(voter) || !isAlive(s, target) || target === voter || (only && !only.includes(target))) continue;
    counts[target] = (counts[target] ?? 0) + 1;
    valid[voter] = target;
  }
  const max = Math.max(0, ...Object.values(counts));
  return { counts, valid, top: max ? Object.keys(counts).filter((id) => counts[id] === max) : [] };
}

/**
 * Applique l'élimination décidée par le vote. L'Idiot survit une fois (il perd son vote) ; sinon il meurt.
 * Les votants contre un innocent (ou l'Idiot) boivent 1. Renvoie 'hunter' ou 'done'.
 */
export function eliminate(s, id, valid) {
  const voters = Object.keys(valid).filter((v) => valid[v] === id);
  const innocent = !isWolf(s, id);
  if (s.roles[id] === 'idiot' && !s.idiotOut[id]) {
    s.idiotOut[id] = true;
    s.events.push({ type: 'idiot', id, role: 'idiot', voters, sips: 1 });
    scoreGhostBets(s, id);
    checkVictory(s);
    return 'done';
  }
  if (innocent) for (const v of voters) s.events.push({ type: 'voteSips', id: v, sips: 1 });
  scoreGhostBets(s, id);
  addDeath(s, id, 'vote');
  return advance(s);
}

// ---------- Victoire ----------

/** Pose s.winner : 'amoureux', 'village', 'loups' ou 'nul' ; null tant que la partie continue. */
export function checkVictory(s) {
  const alive = livingIds(s);
  const wolves = alive.filter((id) => isWolf(s, id)).length;
  const others = alive.length - wolves;
  const [a, b] = s.lovers ?? [];
  const mixed = a && b && isWolf(s, a) !== isWolf(s, b);
  if (alive.length === 0) s.winner = 'nul';
  else if (mixed && alive.length === 2 && alive.includes(a) && alive.includes(b)) s.winner = 'amoureux';
  else if (wolves === 0) s.winner = 'village';
  else if (wolves >= others) s.winner = 'loups';
  return s.winner;
}

// ---------- Fantômes ----------

/** Pari d'un mort sur le prochain éliminé du vote (modifiable jusqu'au vote). */
export function ghostBet(s, ghostId, targetId) {
  if (isAlive(s, ghostId) || !(ghostId in s.roles) || !isAlive(s, targetId)) return false;
  s.ghostBets[ghostId] = targetId;
  return true;
}
/** Pari bonus d'un mort : quel camp gagne (« village », « loups » ou « amoureux »). */
export function ghostCampBet(s, ghostId, camp) {
  if (isAlive(s, ghostId) || !['village', 'loups', 'amoureux'].includes(camp)) return false;
  s.campBets[ghostId] = camp;
  return true;
}
function scoreGhostBets(s, eliminatedId) {
  for (const [ghost, target] of Object.entries(s.ghostBets)) if (target === eliminatedId) s.ghostPoints[ghost] = (s.ghostPoints[ghost] ?? 0) + 1;
  s.ghostBets = {};
}
/** Un tour de vote sans élimination : les paris sont perdus. */
export const clearGhostBets = (s) => (s.ghostBets = {});

// ---------- Tribunal des gorgées ----------

/** Gorgées à répartir par joueur : { id: crédits }. */
export function tribunalCredits(s) {
  const c = {};
  for (const { id, n } of s.credits) c[id] = (c[id] ?? 0) + n;
  if (s.winner === 'amoureux' && s.lovers) {
    const cupidon = s.order.find((id) => s.roles[id] === 'cupidon');
    if (cupidon) c[cupidon] = (c[cupidon] ?? 0) + 3;
  }
  const ghosts = s.order.filter((id) => !isAlive(s, id));
  for (const id of ghosts) for (const [g, camp] of Object.entries(s.campBets)) if (g === id && camp === s.winner) s.ghostPoints[g] = (s.ghostPoints[g] ?? 0) + 2;
  s.campBets = {};
  const best = Math.max(0, ...ghosts.map((id) => s.ghostPoints[id] ?? 0));
  if (best > 0) for (const id of ghosts) if ((s.ghostPoints[id] ?? 0) === best) c[id] = (c[id] ?? 0) + 4;
  return c;
}

/**
 * Règle le Tribunal. allocations : { donneur: { cible: n } } (ce que chaque joueur a choisi) ; ce qui n'est pas réparti
 * (ou mal réparti) l'est au hasard. Renvoie { sips: { id: gorgées reçues, plafonnées à 8 }, credits }.
 */
export function settleTribunal(s, allocations = {}, rng = Math.random) {
  const credits = tribunalCredits(s);
  const raw = Object.fromEntries(s.order.map((id) => [id, 0]));
  const loserCamp = s.winner === 'village' ? 'loups' : s.winner === 'loups' ? 'village' : null;
  for (const id of s.order) {
    const loses = loserCamp ? campOf(s, id) === loserCamp : s.winner === 'amoureux' ? !s.lovers?.includes(id) : false;
    if (loses) raw[id] += 3;
  }
  for (const { id, n } of s.penalties) raw[id] += n;
  const ghosts = s.order.filter((id) => !isAlive(s, id));
  const best = Math.max(0, ...ghosts.map((id) => s.ghostPoints[id] ?? 0));
  if (best > 0) for (const id of ghosts) if ((s.ghostPoints[id] ?? 0) === 0) raw[id] += 1;
  for (const [giver, n] of Object.entries(credits)) {
    let left = n;
    for (const [target, k] of Object.entries(allocations[giver] ?? {})) {
      const give = Math.min(left, Number.isInteger(k) ? k : 0);
      if (give > 0 && target in raw && target !== giver) {
        raw[target] += give;
        left -= give;
      }
    }
    const pool = s.order.filter((id) => id !== giver);
    for (; left > 0; left--) raw[pick(pool, rng)] += 1;
  }
  const sips = Object.fromEntries(Object.entries(raw).map(([id, n]) => [id, Math.min(n, TRIBUNAL_CAP)]));
  return { sips, credits };
}

// ---------- Retrait par l'hôte ----------

/** Joueur retiré en cours de partie : mort sans rôle révélé, sans chagrin ni tir ; la victoire est revérifiée. */
export function withdraw(s, id) {
  if (!isAlive(s, id)) return false;
  s.dead[id] = { cause: 'retire', night: s.night };
  s.events.push({ type: 'death', id, role: null, cause: 'retire', sips: 0 });
  s.queue = s.queue.filter((q) => q.id !== id);
  if (s.awaitingHunter === id) s.awaitingHunter = null;
  s.hunters = s.hunters.filter((h) => h !== id);
  checkVictory(s);
  return true;
}
