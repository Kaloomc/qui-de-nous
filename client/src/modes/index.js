import * as quiDeNous from './quiDeNous.jsx';
import * as tuPreferes from './tuPreferes.jsx';

// Chaque mode fournit : id, label, tagline, waitingText,
// HostQuestion, HostReveal (suspense), HostResults, PlayerVote, VoteSummary et verdict(state, me).
export const MODES = {
  [quiDeNous.id]: quiDeNous,
  [tuPreferes.id]: tuPreferes,
};

export const MODE_LIST = Object.values(MODES);
export const DEFAULT_MODE = quiDeNous.id;

export const modeOf = (state) => MODES[state?.mode] ?? MODES[DEFAULT_MODE];
