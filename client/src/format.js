// Accords de genre dans les textes de l'interface (moteur commun : shared/formulation.js).
// fmt('Tu es {m=le plus voté|f=la plus votée|n=en tête des votes}', joueur) → texte accordé au joueur ; sans genre connu : forme neutre.
import { groupSubject, render } from '../../shared/formulation.js';

/** Texte accordé au genre de `subject` ({ name, gender }) ; `extra` : autres variables ({ autre: joueur }). */
export const fmt = (text, subject, extra = {}) => render(text, { cible: subject, ...extra });

/** Texte accordé au genre d'un groupe de joueurs (pluriel) : 'f' si toutes, 'm' si tous, sinon neutre. */
export const fmtGroup = (text, players) => render(text, { cible: groupSubject(players) });
