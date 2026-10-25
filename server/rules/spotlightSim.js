// Simulation d'une soirée complète du point de vue du tirage équitable (server/spotlight.js) : N joueurs, 10 jeux de 3 manches,
// avec des arrivées, des départs (déconnexion ou retrait) et des retours. Sert au test et à `node scripts/fairness-report.js`.
import { SPOTLIGHT_ROLES, Spotlight } from '../spotlight.js';

const R = SPOTLIGHT_ROLES;
/** Jeux de la soirée et rôles qu'ils tirent, dans l'ordre. */
export const EVENING = ['qui-me-connait', 'savant', 'patate', 'imposteur', 'roue', 'qui-me-connait', 'savant', 'patate', 'imposteur', 'roue'];

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {object} o
 * @param {number} o.players joueurs au départ
 * @param {boolean} o.churn arrivées, départs et retours entre les jeux
 * @param {number} o.rounds manches par jeu
 * @returns {{ spot: Spotlight, ever: string[], steady: string[], designated: Record<string, Record<string, number>>, sinceArrival: Record<string, Record<string, number>> }}
 */
export function runEvening(rng, { players = 20, churn = false, rounds = 3, games = EVENING } = {}) {
  const spot = new Spotlight();
  let nextId = 0;
  const newId = () => `j${nextId++}`;
  let present = Array.from({ length: players }, newId);
  const ever = [...present];
  const absent = [];
  const designated = {}; // rôle → joueur → fois désigné
  const sinceArrival = {};
  const stayed = new Set(present); // joueurs présents à chaque tirage
  const note = (role, id) => {
    designated[role] ??= {};
    designated[role][id] = (designated[role][id] ?? 0) + 1;
  };
  const last = {};

  games.forEach((game, g) => {
    if (churn) {
      if (g === 2) {
        // Deux arrivants : ils démarrent au minimum du groupe.
        for (let i = 0; i < 2; i++) {
          const id = newId();
          spot.join(id, present);
          present.push(id);
          ever.push(id);
        }
      }
      if (g === 4) for (const id of present.splice(3, 2)) (absent.push(id), stayed.delete(id));
      if (g === 6) present.push(...absent.splice(0)); // retour des absents, compteurs conservés
      if (g === 8) {
        const [gone] = present.splice(1, 1); // un joueur retiré pour de bon
        spot.remove(gone);
        stayed.delete(gone);
      }
    }
    for (const id of present) if (!ever.includes(id)) ever.push(id);
    for (let r = 0; r < rounds; r++) {
      const here = shuffle(present, rng); // l'ordre de la liste ne compte pas
      const draw = (role, candidates, opts = {}) => {
        const id = spot.pick(role, candidates, { rng, ...opts });
        note(role, id);
        return id;
      };
      if (game === 'qui-me-connait') draw(R.connaitCible, here);
      if (game === 'patate') draw(R.patatePorteur, here);
      if (game === 'imposteur') draw(R.imposteur, here);
      if (game === 'roue') last[game] = draw(R.roueCible, here, { avoid: last[game] });
      if (game === 'savant') {
        const seeker = draw(R.savantChercheur, here);
        last.savant = draw(R.savantSavant, here.filter((id) => id !== seeker), { avoid: last.savant });
      }
    }
  });
  return { spot, ever, steady: [...stayed], designated, sinceArrival, present };
}

/** Écart max entre les joueurs de `ids` pour un rôle (0 s'il n'y a rien). */
export function spread(designated, role, ids) {
  const values = ids.map((id) => designated[role]?.[id] ?? 0);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

/** Tableau Markdown de la répartition : une ligne par joueur, une colonne par rôle. */
export function table(result) {
  const roles = Object.values(R).filter((role) => result.designated[role]);
  const head = ['Joueur', ...roles.map((r) => r.replace(':', ' · ')), 'Total'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const id of result.ever) {
    const counts = roles.map((role) => result.designated[role][id] ?? 0);
    lines.push(`| ${id}${result.present.includes(id) ? '' : ' (parti)'} | ${counts.join(' | ')} | ${counts.reduce((a, b) => a + b, 0)} |`);
  }
  return lines.join('\n');
}
