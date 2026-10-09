import { readFileSync } from 'node:fs';
import { computePreferesResults, computeResults } from './rules.js';

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));

// Chaque mode fournit ses questions, la validation d'un vote et le calcul des résultats.
// Le reste (lobby, joueurs, reconnexion, déroulement des tours) est commun.
export const MODES = {
  'qui-de-nous': {
    // Accepte aussi l'ancien format (simple chaîne de caractères).
    questions: load('./questions.json').map((q) => (typeof q === 'string' ? { text: q } : q)),
    isValidVote: (game, choice) => game.players.has(choice),
    computeResults: (playerIds, votes) => computeResults(playerIds, votes),
  },
  'tu-preferes': {
    questions: load('./questionsPreferes.json'),
    isValidVote: (_game, choice) => choice === 'a' || choice === 'b',
    computeResults: (playerIds, votes) => computePreferesResults(playerIds, votes, { onTie: 'nobody' }),
  },
};

export const DEFAULT_MODE = 'qui-de-nous';

export const isMode = (mode) => typeof mode === 'string' && Object.hasOwn(MODES, mode);
