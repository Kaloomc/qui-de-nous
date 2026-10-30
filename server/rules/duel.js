// Règles pures du mode Duel (aucune dépendance au serveur ni au navigateur, tout est testé).
// Deux duellistes (ROUGE et BLEU), tous les autres parient en secret sur le vainqueur, un mini-jeu départage.

export const CAMPS = ['rouge', 'bleu'];
export const MIN_PLAYERS = 3; // 2 duellistes + 1 parieur
export const MAX_PLAYERS = 30;
export const KING_MAX_WINS = 5;
export const otherCamp = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');

export const COTES = { standard: 'Standard', hardcore: 'Hardcore' };
export const DEFAULT_OPTIONS = { king: false, cote: 'standard', games: null }; // games : null = tous

/** Options reçues de l'écran de l'hôte : valeurs inconnues ignorées, au moins un mini-jeu actif (`all` : ids existants). */
export function cleanOptions(patch, current, all) {
  const next = { ...current };
  if (typeof patch?.king === 'boolean') next.king = patch.king;
  if (Object.hasOwn(COTES, patch?.cote)) next.cote = patch.cote;
  if (Array.isArray(patch?.games)) {
    const ids = [...new Set(patch.games.filter((id) => all.includes(id)))];
    if (ids.length === 0) return { error: 'Garde au moins un mini-jeu.' };
    next.games = ids.length === all.length ? null : ids;
  }
  return { options: next };
}

export const activeGames = (options, all) => (options.games ? all.filter((id) => options.games.includes(id)) : [...all]);

// ---------- Choix des duellistes et du mini-jeu ----------

const samePair = (pair, a, b) => !!pair && ((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a));

/**
 * Tire les deux duellistes parmi les joueurs connectés `here` (le registre de projecteurs `spotlight` : plus petits compteurs
 * d'abord, au hasard entre ex æquo, jamais dans l'ordre de la liste).
 * - Roi de la colline : le roi reste, un challenger est tiré parmi les autres (jamais le dernier challenger s'il y a 4 joueurs ou plus).
 * - Sinon : jamais un joueur du duel précédent (sauf à 3 joueurs), jamais la même paire deux fois de suite.
 * Renvoie { rouge, bleu, kingId } ou null (moins de 3 joueurs).
 */
export function pickDuelists({ spotlight, role, here, king = null, last = null, rng = Math.random }) {
  if (here.length < MIN_PLAYERS) return null;
  const roomy = here.length >= 4;
  const draw = (pool, avoid) => spotlight.pick(role, pool, { avoid, rng });
  let a;
  let b;
  if (king && here.includes(king.id)) {
    a = king.id;
    const rest = here.filter((id) => id !== a);
    const pool = roomy ? rest.filter((id) => id !== last?.challenger) : rest;
    b = draw(pool.length ? pool : rest, last?.challenger ?? null);
  } else {
    const fresh = roomy && last ? here.filter((id) => !last.pair.includes(id)) : here;
    for (let tries = 0; tries < 12; tries++) {
      a = draw(fresh, last?.pair?.[0] ?? null);
      b = draw(fresh.filter((id) => id !== a), last?.pair?.[1] ?? null);
      if (!samePair(last?.pair, a, b) || tries === 11) break;
      spotlight.refund(role, a);
      spotlight.refund(role, b);
    }
  }
  const redFirst = rng() < 0.5;
  const camps = king && a === king.id ? { [a]: king.camp, [b]: otherCamp(king.camp) } : { [a]: redFirst ? 'rouge' : 'bleu', [b]: redFirst ? 'bleu' : 'rouge' };
  const ids = Object.fromEntries(Object.entries(camps).map(([id, camp]) => [camp, id]));
  return { rouge: ids.rouge, bleu: ids.bleu, kingId: king && a === king.id ? a : null };
}

/** Mini-jeu : un des jeux actifs, jamais le même deux fois de suite (sauf s'il n'y en a qu'un). */
export function pickMinigame(active, last, rng = Math.random) {
  const pool = active.length > 1 ? active.filter((id) => id !== last) : active;
  return pool[Math.floor(rng() * pool.length)];
}

// ---------- Emojis et confettis des parieurs ----------

export const EMOJIS = ['🔥', '😱', '😂', '👏', '💀', '🍿', '😈', '🙌'];
export const CHEER_GAP_MS = 1000; // un envoi par seconde et par joueur
export const FEED_MAX = 40; // éléments gardés pour la TV

/** Un envoi des parieurs (emoji de la liste fixe ou confettis). Renvoie l'élément à afficher ou { error }. */
export function cleanCheer(action) {
  if (action?.kind === 'confetti') return { kind: 'confetti' };
  if (action?.kind === 'emoji' && EMOJIS.includes(action.emoji)) return { kind: 'emoji', emoji: action.emoji };
  return { error: 'Envoi invalide.' };
}

// ---------- Cote et gorgées ----------

export const SIP_CAP = { standard: 8, hardcore: 15 };

/**
 * Gorgées du perdant, selon B = nombre de parieurs qui avaient misé sur le vainqueur (donc contre lui).
 * Standard : 1 + ⌈B/2⌉, plafond 8. Hardcore : B (au moins 1), plafond 15.
 */
export function loserSips(B, cote = 'standard') {
  return cote === 'hardcore' ? Math.min(SIP_CAP.hardcore, Math.max(1, B)) : Math.min(SIP_CAP.standard, 1 + Math.ceil(B / 2));
}

/** Part des paris sur chaque camp, en % entiers (50 / 50 sans pari). */
export function oddsPct(bets, bettors) {
  const on = (camp) => bettors.filter((id) => bets[id] === camp).length;
  const n = on('rouge') + on('bleu');
  if (!n) return { rouge: 50, bleu: 50, n: 0 };
  const rouge = Math.round((100 * on('rouge')) / n);
  return { rouge, bleu: 100 - rouge, n };
}

/**
 * Fin d'un duel : gorgées de chacun.
 *  winner : 'rouge' | 'bleu' | 'égalité' ; bets : parieur → camp ; bettors : tous ceux qui pouvaient parier ;
 *  kingId, kingStreak : le roi qui défendait son titre et ses victoires consécutives avant ce duel.
 * Égalité : les deux duellistes boivent 1, les parieurs sont épargnés. Sinon : le perdant selon la cote (le roi qui chute
 * ajoute ses victoires, sans dépasser le plafond), chaque parieur sur le perdant boit 1, comme celui qui n'a pas parié ; le vainqueur ne boit pas.
 */
export function settleDuel({ winner, red, blue, bets = {}, bettors = [], cote = 'standard', kingId = null, kingStreak = 0 }) {
  const sips = {};
  if (winner === 'égalité') return { sips: { [red]: 1, [blue]: 1 }, B: 0, loserId: null, winnerId: null, wrong: [], right: [], silent: [] };
  const winnerId = winner === 'rouge' ? red : blue;
  const loserId = winner === 'rouge' ? blue : red;
  const B = bettors.filter((id) => bets[id] === winner).length;
  sips[loserId] = loserSips(B, cote);
  if (kingId === loserId) sips[loserId] = Math.min(SIP_CAP[cote] ?? SIP_CAP.standard, sips[loserId] + kingStreak);
  const right = bettors.filter((id) => bets[id] === winner);
  const wrong = bettors.filter((id) => bets[id] && bets[id] !== winner);
  const silent = bettors.filter((id) => !bets[id]);
  for (const id of [...wrong, ...silent]) sips[id] = 1;
  return { sips, B, loserId, winnerId, right, wrong, silent };
}

/** Roi de la colline après un duel : le roi qui gagne enchaîne (5 victoires puis il part), celui qui perd ou fait égalité tombe, le vainqueur d'un duel normal est couronné. */
export function nextKing({ king, winner, red, blue, kingMode }) {
  if (!kingMode) return { king: null, retired: false, fell: false };
  if (winner === 'égalité') return { king: null, retired: false, fell: !!king };
  const winnerId = winner === 'rouge' ? red : blue;
  if (king && king.id === winnerId) {
    const streak = king.streak + 1;
    return streak >= KING_MAX_WINS ? { king: null, retired: true, fell: false, streak } : { king: { ...king, streak }, retired: false, fell: false, streak };
  }
  return { king: { id: winnerId, camp: winner, streak: 1 }, retired: false, fell: !!king, streak: 1 };
}

/** Petit générateur à graine (mulberry32) : les deux duellistes jouent exactement la même séquence. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
