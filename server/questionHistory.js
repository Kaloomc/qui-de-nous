// Anti-répétition des questions, d'une manche à l'autre et d'une partie à l'autre.
//  - Chaque groupe (une partie, puis ses « Rejouer » et « Changer de jeu ») garde, par jeu, les questions déjà posées :
//    on n'y revient qu'une fois toute la liste posée, et on remélange alors sans reprendre tout de suite les dernières.
//  - Un historique global léger (les dernières questions tirées par jeu, toutes parties confondues) évite qu'une
//    nouvelle partie démarrée juste après une autre retombe sur les mêmes questions.
// Tout vit en mémoire : un redémarrage du serveur repart de zéro.

/** Nombre de questions retenues par jeu dans l'historique global. */
export const GLOBAL_RECENT_SIZE = 100;

/** jeu → clés des dernières questions tirées, de la plus ancienne à la plus récente. */
const globalRecent = new Map();

const keys = new WeakMap();
/** Identifiant stable d'une question (objet ou chaîne), quel que soit le fichier d'origine. */
export function keyOf(item) {
  if (item === null || typeof item !== 'object') return String(item);
  let key = keys.get(item);
  if (key === undefined) keys.set(item, (key = JSON.stringify(item)));
  return key;
}

export const globalHistory = (gameId) => [...(globalRecent.get(gameId) ?? [])];

/** Vide l'historique global (tests). */
export const resetGlobalHistory = () => globalRecent.clear();

function rememberGlobally(gameId, key) {
  const list = globalRecent.get(gameId) ?? [];
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1);
  list.push(key);
  if (list.length > GLOBAL_RECENT_SIZE) list.splice(0, list.length - GLOBAL_RECENT_SIZE);
  globalRecent.set(gameId, list);
}

/** Historique d'un groupe de joueurs, à garder d'une partie à l'autre tant que le groupe reste le même. */
export class QuestionHistory {
  constructor(rng = Math.random) {
    this.rng = rng;
    /** jeu → { seen : questions posées pendant le tour de liste en cours, recent : derniers tirages du groupe } */
    this.byGame = new Map();
  }

  /** Tire une question de `list` pour le jeu `gameId` (null si la liste est vide). */
  draw(gameId, list) {
    if (!list?.length) return null;
    let h = this.byGame.get(gameId);
    if (!h) this.byGame.set(gameId, (h = { seen: new Set(), recent: [] }));

    let candidates = list.filter((q) => !h.seen.has(keyOf(q)));
    if (candidates.length === 0) {
      // Toute la liste a été posée à ce groupe : nouveau tour, sans reprendre en premier les dernières posées.
      h.seen.clear();
      const n = Math.floor(list.length / 2);
      const avoid = new Set(n > 0 ? h.recent.slice(-n) : []);
      candidates = list.filter((q) => !avoid.has(keyOf(q)));
    }

    // Parmi les candidates, d'abord celles qu'aucune partie n'a tirées récemment ; sinon, les plus anciennes.
    const age = new Map((globalRecent.get(gameId) ?? []).map((key, i) => [key, i]));
    let pool = candidates.filter((q) => !age.has(keyOf(q)));
    if (pool.length === 0) {
      pool = [...candidates].sort((a, b) => age.get(keyOf(a)) - age.get(keyOf(b))).slice(0, Math.ceil(candidates.length / 2));
    }

    const item = pool[Math.floor(this.rng() * pool.length)];
    const key = keyOf(item);
    h.seen.add(key);
    h.recent.push(key);
    if (h.recent.length > list.length) h.recent.shift();
    rememberGlobally(gameId, key);
    return item;
  }
}
