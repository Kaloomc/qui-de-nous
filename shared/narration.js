// Narrateur du Loup-Garou : clips générés une fois par scripts/narration.js (ElevenLabs), servis depuis client/public/narration/.
// Partagé par le script de génération, la TV et les tests : un événement + un numéro de variante → un nom de fichier.

export const NARRATION_DIR = '/narration';

/** Nom de fichier de la variante n (0, 1, …) d'un événement : « intro-1.mp3 », « wake_voyante-2.mp3 »… */
export const narrationFile = (id, n) => `${id}-${n + 1}.mp3`;

/** Événements que le narrateur de la TV peut demander (les clips « wake_ », « sleep_ » et « role_ » s'y ajoutent, un par phase ou par rôle). */
export const NARRATION_EVENTS = [
  'intro', 'deal', 'sleep', 'dawn', 'no_victim', 'victim_one', 'victim_many', 'grief', 'hunter_fire', 'hunter_hit', 'gorgee',
  'debate_start', 'timer_30', 'timer_10', 'vote_start', 'vote_result', 'tie', 'novote', 'idiot',
  'win_village', 'win_loups', 'win_amoureux', 'win_nul', 'tribunal',
];
