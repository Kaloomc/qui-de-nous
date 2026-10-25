// Tableau de répartition du tirage équitable sur une soirée simulée (20 joueurs, 10 jeux de 3 manches, avec arrivées et départs).
// Usage : node scripts/fairness-report.js [graine=2024] [joueurs=20]
import { seeded } from '../server/rules/loupSim.js';
import { EVENING, runEvening, spread, table } from '../server/rules/spotlightSim.js';
import { SPOTLIGHT_ROLES } from '../server/spotlight.js';

const seed = Number(process.argv[2]) || 2024;
const players = Number(process.argv[3]) || 20;
for (const churn of [false, true]) {
  const r = runEvening(seeded(seed), { players, churn });
  console.log(`\n### Soirée de ${players} joueurs, ${EVENING.length} jeux de 3 manches${churn ? ', avec 2 arrivées, 2 départs puis retour, 1 retrait' : ', sans arrivée ni départ'} (graine ${seed})\n`);
  console.log(table(r));
  console.log('\nÉcart max entre joueurs, par rôle :');
  for (const role of Object.values(SPOTLIGHT_ROLES)) if (r.designated[role]) console.log(`- ${role} : ${spread(r.designated, role, churn ? r.steady : r.ever)}${churn ? ' (joueurs présents tout du long)' : ''}`);
}
