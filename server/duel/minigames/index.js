// Registre des mini-jeux du mode Duel. Un mini-jeu est un module { id, name, icon, category, maxMs, minContent, prepare, … } :
//   prepare(ctx) → état            : prépare la manche (ctx.seed / ctx.rng : graine commune aux deux duellistes)
//   begin(état, ctx)               : (facultatif) le duel démarre ; ctx.later(ms, fn) pose un minuteur annulé avec le duel
//   action(état, camp, data, ctx)  : un duelliste agit ; renvoie un message d'erreur ou null
//   result(état, ctx) → null | { winner: 'rouge'|'bleu'|'égalité', details }   : le duel est-il terminé ?
//   resolve(état, ctx) → { winner, details }   : résultat forcé à la fin du temps (jamais null)
//   view(état, qui, ctx)           : ce que voit { kind: 'tv' } | { kind: 'duelist', side } | { kind: 'bettor' } ; aucun secret d'un
//                                    duelliste ne doit sortir de la vue de ce duelliste avant la fin de la manche.
// Le moteur (server/games/duel.js) gère les étapes, les minuteurs, les « prêts », les paris et les gorgées.
export const MINIGAMES = {};
