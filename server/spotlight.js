// Tirage équitable « sous les projecteurs » à l'échelle de la soirée.
// Pour chaque rôle (cible de « Qui me connaît », Chercheur ou Savant du Savant, Imposteur, premier porteur de la Patate,
// victime de la Roue…), chaque joueur a un compteur : combien de fois il a déjà été désigné. On tire toujours parmi les
// candidats qui ont le plus petit compteur, au hasard entre ex æquo (jamais dans l'ordre de la liste des joueurs).
// Le registre appartient à la partie (le lobby), pas à un jeu : il survit au changement de jeu, à « Rejouer » et aux
// reconnexions ; une nouvelle partie (nouveau code) repart de zéro. Le Loup-Garou ne s'en sert pas (rôles tirés au hasard).

export const SPOTLIGHT_ROLES = {
  connaitCible: 'qui-me-connait:cible',
  savantChercheur: 'savant:chercheur',
  savantSavant: 'savant:savant',
  imposteur: 'imposteur:imposteur',
  patatePorteur: 'patate:premier-porteur',
  roueCible: 'roue:cible',
  duelDuelist: 'duel:duelliste',
};

export class Spotlight {
  constructor() {
    /** rôle → Map(joueur → nombre de fois désigné) */
    this.counts = new Map();
  }

  #roleMap(role) {
    let map = this.counts.get(role);
    if (!map) this.counts.set(role, (map = new Map()));
    return map;
  }

  /**
   * Un joueur qui arrive en cours de soirée démarre au minimum actuel du groupe (`peerIds`, les joueurs déjà là) :
   * à zéro, il serait désigné à chaque tirage jusqu'à rattraper les autres.
   */
  join(playerId, peerIds) {
    for (const map of this.counts.values()) {
      if (map.has(playerId)) continue;
      const known = peerIds.filter((id) => id !== playerId && map.has(id)).map((id) => map.get(id));
      map.set(playerId, known.length ? Math.min(...known) : 0);
    }
  }

  /** Joueur retiré de la partie : on ne garde pas son compteur (s'il revient, c'est un nouvel arrivant). */
  remove(playerId) {
    for (const map of this.counts.values()) map.delete(playerId);
  }

  /** Nombre de fois où ce joueur a été désigné, tous rôles confondus. */
  total(playerId) {
    let n = 0;
    for (const map of this.counts.values()) n += map.get(playerId) ?? 0;
    return n;
  }

  count(role, playerId) {
    return this.counts.get(role)?.get(playerId) ?? 0;
  }

  /**
   * Désigne un joueur parmi `candidateIds` pour ce rôle : le plus petit compteur, au hasard entre ex æquo.
   * `avoid` : un joueur à écarter s'il reste un autre ex æquo (le dernier désigné, par exemple).
   * Un candidat que le registre ne connaît pas encore démarre au minimum de ceux qu'il connaît (comme un arrivant).
   * Renvoie null sans candidat.
   */
  pick(role, candidateIds, { avoid = null, rng = Math.random } = {}) {
    const ids = [...new Set(candidateIds)];
    if (!ids.length) return null;
    const map = this.#roleMap(role);
    const unknown = ids.filter((id) => !map.has(id));
    if (unknown.length) {
      const known = ids.filter((id) => map.has(id)).map((id) => map.get(id));
      const base = known.length ? Math.min(...known) : 0;
      for (const id of unknown) map.set(id, base);
    }
    const min = Math.min(...ids.map((id) => map.get(id)));
    let pool = ids.filter((id) => map.get(id) === min);
    // Ex æquo sur ce rôle : celui qui a été le moins sous les projecteurs, tous rôles confondus (puis le hasard).
    if (pool.length > 1) {
      const totals = pool.map((id) => this.total(id));
      const least = Math.min(...totals);
      pool = pool.filter((_, i) => totals[i] === least);
    }
    if (pool.length > 1 && avoid != null) pool = pool.filter((id) => id !== avoid);
    const id = pool[Math.floor(rng() * pool.length)];
    map.set(id, min + 1);
    return id;
  }

  /** Désignation annulée (manche rejouée sans que le joueur ait pu jouer) : il ne doit pas y perdre son tour. */
  refund(role, playerId) {
    const map = this.counts.get(role);
    if (map?.get(playerId) > 0) map.set(playerId, map.get(playerId) - 1);
  }

  /** Photo des compteurs pour un rôle (tests, rapport de répartition). */
  snapshot(role) {
    return Object.fromEntries(this.counts.get(role) ?? []);
  }
}
