// Outils communs aux tests des mini-jeux du mode Duel : une partie à 5 joueurs arrivée au début du duel, avec horloge factice.
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { DUEL_TIMING } from './games/duel.js';

/** `id` : le seul mini-jeu actif ; `latency` : active la table de latences ; `content` : contenu injecté ; `players` : nombre de joueurs. */
export async function duel(id, { content, latency, players = 5, minigames } = {}) {
  const ctx = await makeGame('duel', Array.from({ length: players }, (_, i) => `J${i}`));
  if (minigames) ctx.game.duelMinigames = minigames;
  ctx.game.duelOptions = { king: false, cote: 'standard', games: [id] };
  if (content) ctx.game.duelContent = content;
  if (latency) ctx.game.duelLatency = new Map();
  assert.equal(ctx.game.start(), null);
  const d = () => ctx.game.roundData;
  const T = DUEL_TIMING;
  ctx.tick(T.duelistsMs);
  ctx.tick(T.gameMs);
  ctx.tick(T.betsMs);
  ctx.tick(T.betsRevealMs);
  for (const pid of [d().red, d().blue]) ctx.game.action(pid, { type: 'ready' });
  ctx.tick(T.readyBeatMs);
  assert.equal(d().step, 'intro');
  ctx.tick(T.introMs);
  assert.equal(d().step, 'play');
  const camp = { rouge: d().red, blue: d().blue, bleu: d().blue };
  const play = (c, data) => ctx.game.action(camp[c], { type: 'play', data });
  const view = (who) => ctx.game.publicState(who === 'tv' ? { host: true } : { playerId: who }).round.play;
  const bettor = d().bettors[0];
  return { ...ctx, d, T, camp, play, view, bettor, ids: [d().red, d().blue], winner: () => ctx.game.results?.winner, mgState: () => d().mg };
}

export const leaks = (value, words) => words.some((w) => JSON.stringify(value).includes(w));
