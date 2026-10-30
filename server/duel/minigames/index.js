// Registre des mini-jeux du mode Duel. Un mini-jeu est un module { id, name, icon, category, maxMs, minContent, prepare, … } :
//   available(game)                : (facultatif) false si le contenu manque : le mini-jeu n'est alors jamais tiré
//   prepare(ctx) → état            : prépare la manche (ctx.seed / ctx.rng : graine commune aux deux duellistes)
//   begin(état, ctx)               : (facultatif) le duel démarre ; ctx.later(ms, fn) pose un minuteur annulé avec le duel
//   action(état, camp, data, ctx)  : un duelliste agit ; renvoie un message d'erreur ou null
//   host(état, action, ctx)        : (facultatif) signal de la TV (voix lancée…)
//   result(état, ctx) → null | { winner: 'rouge'|'bleu'|'égalité', details }   : le duel est-il terminé ?
//   resolve(état, ctx) → { winner, details }   : résultat forcé à la fin du temps (jamais null)
//   view(état, qui, ctx)           : ce que voit { kind: 'tv' } | { kind: 'duelist', side } | { kind: 'bettor' } ; aucun secret d'un
//                                    duelliste ne doit sortir de la vue de ce duelliste avant la fin de la manche.
// ctx : seed, rng, red, blue, now(), later(ms, fn), latency(id) (aller-retour en ms), draw(clé, liste), content, voice.
// Le moteur (server/games/duel.js) gère les étapes, les minuteurs, les « prêts », les paris et les gorgées.
import code from './code.js';
import chrono from './chrono.js';
import couleur from './couleur.js';
import course from './course.js';
import crash from './crash.js';
import culture from './culture.js';
import defuse from './defuse.js';
import dilemme from './dilemme.js';
import feu from './feu.js';
import geo from './geo.js';
import pfc from './pfc.js';
import plateau from './plateau.js';
import quisuisje from './quisuisje.js';
import simon from './simon.js';
import soleil from './soleil.js';
import vf from './vf.js';
import simon2 from './simon2.js';

export const MINIGAMES = Object.fromEntries([pfc, culture, feu, simon, couleur, defuse, code, simon2, crash, dilemme, soleil, plateau, course, geo, quisuisje, chrono, vf].map((m) => [m.id, m]));
