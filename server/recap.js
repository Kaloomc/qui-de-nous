// Récap de fin de soirée : statistiques de la soirée (tous jeux confondus) et trophées. Fonctions pures, testées.

const inc = (stats, id, key, n = 1) => {
  const s = stats.get(id) ?? {};
  s[key] = (s[key] ?? 0) + n;
  stats.set(id, s);
};

/**
 * Note ce qui s'est passé pendant une manche, dans les statistiques de la soirée (Map id → compteurs).
 * Appelé une fois par manche, avec les résultats définitifs.
 */
export function recordRound(stats, mode, results, playerIds) {
  const present = new Set(playerIds);
  const add = (id, key, n = 1) => present.has(id) && inc(stats, id, key, n);
  if (!results) return;
  switch (mode) {
    case 'qui-de-nous':
      for (const [id, n] of Object.entries(results.counts ?? {})) if (n > 0) add(id, 'accused', n);
      break;
    case 'tu-preferes':
      if (results.tie) break;
      for (const [id, choice] of Object.entries(results.choices ?? {})) add(id, choice === results.majority ? 'sheep' : 'rebel');
      break;
    case 'imposteur':
      if (!results.present) break;
      if (!results.unmasked) add(results.imposterId, 'fooled');
      for (const id of results.votersForImposter ?? []) add(id, 'found');
      break;
    case 'feu':
      for (const { id, ms } of results.ranking ?? []) {
        if (!present.has(id) || !(ms >= 0)) continue;
        const s = stats.get(id) ?? {};
        s.bestMs = s.bestMs == null ? ms : Math.min(s.bestMs, ms);
        stats.set(id, s);
      }
      break;
    case 'estimation':
      for (const id of results.closestIds ?? []) add(id, 'closest');
      break;
    case 'qui-me-connait':
      if (results.answer) for (const id of results.correctIds ?? []) add(id, 'correct');
      break;
    case 'patate':
      if (results.loserId) add(results.loserId, 'bombs');
      break;
    case 'roue':
      if (results.targetId) add(results.targetId, 'picked');
      break;
    default:
  }
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Trophées possibles, dans l'ordre de révélation. `min` = valeur minimale pour que le trophée ait du sens,
 * `lower` = plus petit vaut mieux, `strict` = jamais donné à un autre que le vrai premier.
 */
export const TROPHIES = [
  { id: 'roi', emoji: '👑', title: 'Le roi des gorgées', key: 'sips', min: 1, strict: true, label: (n) => plural(n, 'gorgée') },
  { id: 'accuse', emoji: '👉', title: 'Le plus accusé', key: 'accused', min: 2, label: (n) => `${plural(n, 'vote')} reçu${n > 1 ? 's' : ''}` },
  { id: 'menteur', emoji: '🎭', title: 'Le meilleur menteur', key: 'fooled', min: 1, label: (n) => (n > 1 ? `${n} fois imposteur sans être démasqué` : 'imposteur sans être démasqué') },
  { id: 'detective', emoji: '🔍', title: 'Le meilleur détective', key: 'found', min: 1, label: (n) => `${plural(n, 'imposteur')} démasqué${n > 1 ? 's' : ''}` },
  { id: 'rapide', emoji: '⚡', title: 'Le plus rapide', key: 'bestMs', min: 0, lower: true, label: (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s au « FEU »` },
  { id: 'mouton', emoji: '🐑', title: 'Le plus mouton', key: 'sheep', min: 2, label: (n) => `${n} fois avec la majorité` },
  { id: 'rebelle', emoji: '🤘', title: 'Le plus rebelle', key: 'rebel', min: 2, label: (n) => `${n} fois contre tout le monde` },
  { id: 'precis', emoji: '🎯', title: 'Le plus précis', key: 'closest', min: 2, label: (n) => `${plural(n, 'estimation')} au plus près` },
  { id: 'pote', emoji: '🤝', title: 'Le meilleur pote', key: 'correct', min: 2, label: (n) => `${plural(n, 'bonne réponse')} sur les autres` },
  { id: 'maudit', emoji: '💣', title: 'Les mains brûlantes', key: 'bombs', min: 1, label: (n) => `${plural(n, 'bombe')} en pleine figure` },
  { id: 'chouchou', emoji: '🎡', title: 'Le chouchou de la roue', key: 'picked', min: 2, label: (n) => `désigné ${n} fois` },
];

/** Un autre que le premier peut recevoir le trophée s'il n'en a pas encore et qu'il est au moins à moitié aussi bon. */
const closeEnough = (trophy, value, best) => (trophy.lower ? value <= best * 1.5 : value * 2 >= best);

/**
 * Trophées de la soirée. players : [{ id, name }] (joueurs encore là), sips : { id: total }, stats : Map ou objet id → compteurs.
 * Un trophée n'apparaît que si ses données existent (jeu joué, valeur significative). Pour éviter qu'un seul joueur
 * rafle tout, on préfère, parmi les candidats assez proches du meilleur, celui qui a le moins de trophées.
 */
export function computeTrophies(players, sips, stats) {
  const get = (id) => (stats instanceof Map ? stats.get(id) : stats?.[id]) ?? {};
  const valueOf = (trophy, id) => (trophy.key === 'sips' ? sips[id] ?? 0 : get(id)[trophy.key]);
  const won = new Map();
  const trophies = [];
  for (const trophy of TROPHIES) {
    const candidates = players
      .map((p) => ({ player: p, value: valueOf(trophy, p.id) }))
      .filter((c) => typeof c.value === 'number' && c.value >= trophy.min);
    if (candidates.length === 0) continue;
    const better = (a, b) => (trophy.lower ? a.value - b.value : b.value - a.value);
    candidates.sort((a, b) => better(a, b) || a.player.name.localeCompare(b.player.name));
    const best = candidates[0].value;
    const pool = candidates.filter((c) => (trophy.strict ? c.value === best : closeEnough(trophy, c.value, best)));
    pool.sort((a, b) => (won.get(a.player.id) ?? 0) - (won.get(b.player.id) ?? 0) || better(a, b) || a.player.name.localeCompare(b.player.name));
    const winner = pool[0];
    won.set(winner.player.id, (won.get(winner.player.id) ?? 0) + 1);
    trophies.push({ id: trophy.id, emoji: trophy.emoji, title: trophy.title, playerId: winner.player.id, value: winner.value, label: trophy.label(winner.value) });
  }
  return trophies;
}

/** Classement des gorgées : décroissant, ex æquo au même rang. */
export function sipsRanking(players, sips) {
  const rows = players
    .map((p) => ({ playerId: p.id, name: p.name, sips: sips[p.id] ?? 0 }))
    .sort((a, b) => b.sips - a.sips || a.name.localeCompare(b.name));
  return rows.map(({ playerId, sips: n }) => ({ playerId, sips: n, rank: 1 + rows.filter((r) => r.sips > n).length }));
}
