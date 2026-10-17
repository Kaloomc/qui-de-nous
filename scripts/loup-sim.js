// Joue N parties complètes de Loup-Garou avec des bots (moteur de règles seul) et vérifie les invariants.
// Usage : node scripts/loup-sim.js [parties=500]
import { runGame, seeded } from '../server/rules/loupSim.js';

const games = Number(process.argv[2]) || 500;
const wins = {};
let rounds = 0;
for (let seed = 1; seed <= games; seed++) {
  const { state, rounds: r } = runGame(seeded(seed));
  wins[state.winner] = (wins[state.winner] ?? 0) + 1;
  rounds += r;
}
console.log(`${games} parties sans erreur, ${(rounds / games).toFixed(1)} tours en moyenne ; victoires :`, wins);
