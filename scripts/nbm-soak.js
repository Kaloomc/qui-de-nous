// Simulateur de parties de Noir Boire Mangue côté serveur : N parties complètes (3 à 30 joueurs), horloge simulée, bots variés.
//   node scripts/nbm-soak.js            300 parties        node scripts/nbm-soak.js 50
import { playOne } from '../server/rules/nbmSim.js';

const GAMES = Number(process.argv[2]) || 300;
let stuck = 0;
let leaks = 0;
let sipMax = 0;
let rounds = 0;
const t0 = Date.now();
for (let seed = 1; seed <= GAMES; seed++) {
  const r = playOne(seed);
  if (!r.done) {
    stuck += 1;
    console.log(`partie ${seed} (${r.n} joueurs) bloquée : ${r.where}`);
  }
  if (r.timersLeft) leaks += 1;
  sipMax = Math.max(sipMax, r.sipMax);
  rounds += r.rounds;
}
console.log(`${GAMES} parties, ${rounds} manches, en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`bloquées : ${stuck} · minuteurs restants : ${leaks} partie(s) · gorgées reçues max par manche : ${sipMax}`);
process.exit(stuck || leaks || sipMax > 4 ? 1 : 0);
