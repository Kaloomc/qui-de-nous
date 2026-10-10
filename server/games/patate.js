import { allowedTargets, explode, fuseDuration, passBomb, randomPass, sipsPatate, startPatate } from '../rules/patate.js';

/** Un porteur qui ne passe pas la bombe dans ce délai la voit partir au hasard. */
export const IDLE_MS = 6000;

const data = (game) => game.roundData;
const candidates = (game) => game.connectedPlayers().map((p) => p.id);

function setRound(game, round) {
  const d = data(game);
  const changed = round.holderId !== d.holderId;
  Object.assign(d, round);
  if (changed) armIdle(game);
}

function armIdle(game) {
  game.schedulePausable('g:idle', IDLE_MS, () => {
    if (game.phase !== 'question') return;
    setRound(game, randomPass(data(game), candidates(game), game.clock.now()));
    if (!game.timers['g:idle'] && !game.pausedTimers['g:idle']) armIdle(game);
  });
}

export default {
  id: 'patate',
  drawQuestion: () => null,
  startRound(game) {
    const ids = candidates(game);
    const fuseMs = fuseDuration();
    Object.assign(game.roundData, startPatate(ids.length ? ids : [...game.players.keys()]), { fuseMs });
    // La mèche est cachée : seul le serveur sait quand ça explose.
    game.schedulePausable('g:boom', fuseMs, () => game.reveal(game.round));
    armIdle(game);
  },
  acceptsVotes: () => false,
  isValidVote: () => false,
  handleAction(game, playerId, action) {
    if (action.type !== 'pass') return 'Action inconnue.';
    if (game.phase !== 'question') return 'La bombe a déjà explosé.';
    const { round, error } = passBomb(data(game), playerId, action.targetId, candidates(game), game.clock.now());
    if (error) return error;
    setRound(game, round);
    return null;
  },
  // Le porteur se déconnecte ou quitte la partie : la bombe repart tout de suite.
  onPresenceChange(game) {
    if (game.phase !== 'question') return;
    const holder = game.players.get(data(game).holderId);
    if (!holder || holder.sockets.size === 0) setRound(game, randomPass(data(game), candidates(game), game.clock.now()));
  },
  computeResults: (_playerIds, _votes, game) => explode(data(game)),
  sipsOf: sipsPatate,
  updateStats(stats, results) {
    if (stats[results.loserId]) stats[results.loserId].bombs = (stats[results.loserId].bombs ?? 0) + 1;
  },
  publicRound(game, viewer) {
    const d = data(game);
    const boom = game.timerState('g:boom');
    // On donne le temps écoulé (pour accélérer les battements), jamais le temps restant.
    const remaining = boom ? (boom.paused ? boom.remainingMs : boom.endsAt - game.clock.now()) : 0;
    const round = {
      holderId: d.holderId,
      previousHolderId: d.passes?.at(-1)?.from ?? null,
      passCount: d.passes?.length ?? 0,
      elapsedMs: game.phase === 'question' ? Math.max(0, d.fuseMs - remaining) : null,
      allowedIds: game.phase === 'question' ? allowedTargets(d.holderId, candidates(game), d.passes ?? []) : [],
    };
    if (viewer.playerId && viewer.playerId === d.holderId && game.phase === 'question') round.idleTimer = game.timerState('g:idle');
    return round;
  },
  // Durée de l'explosion sur la TV.
  revealMs: 2600,
};
