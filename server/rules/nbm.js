// Règles du jeu de phrases à trou « Noir Boire Mangue » (nom : NBM_NAME dans shared/games.js). Fonctions pures, testées.
// Une manche : une phrase à trou, chacun la complète sur son téléphone (réponse libre ou carte toute prête), puis les réponses
// passent une par une, sans nom d'auteur, et tout le monde les note (sauf son auteur). Le total désigne le gagnant de la manche.
import { cleanAnswer, MAX_ANSWER, normalizeAnswer, settleSips } from './savant.js';

export { cleanAnswer, MAX_ANSWER, normalizeAnswer };

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 30;
export const MAX_ROUNDS = 8;
export const HAND_SIZE = 5;
export const BLANK = '___';

/** Notes : points de chaque bouton. Golden : un seul par joueur et par manche. */
export const RATINGS = { nul: 0, meh: 1, drole: 2, golden: 4 };
export const RATING_NAMES = Object.keys(RATINGS);
export const WIN_CREDIT = 2; // gorgées que le gagnant distribue
export const LAST_SIPS = 2; // gorgées que le dernier boit
export const SIP_CAP = 4; // gorgées reçues au maximum par joueur et par manche

/** Une manche par joueur, 8 au plus. */
export const roundsFor = (playerCount) => Math.min(MAX_ROUNDS, Math.max(1, playerCount));

/** Une phrase est valide si elle contient exactement un trou. */
export const blanksIn = (text) => (String(text).match(/___/g) ?? []).length;

/** Majuscule au début d'une phrase ou d'une citation : les cartes sont écrites en minuscules pour s'insérer au milieu d'une phrase. */
export const startsSentence = (before) => /(^|[.!?…]\s+|[«"“]\s*)$/.test(String(before));
export const capitalizeFirst = (text) => (text ? text.charAt(0).toLocaleUpperCase('fr') + text.slice(1) : text);

/** Insère la réponse dans la phrase à la place du trou. Renvoie les trois morceaux (avant, réponse, après) pour la mise en forme. */
export function fillSentence(sentence, answer) {
  const i = String(sentence).indexOf(BLANK);
  if (i < 0) return { before: `${sentence} `, answer, after: '' };
  const before = sentence.slice(0, i);
  return { before, answer: startsSentence(before) ? capitalizeFirst(answer) : answer, after: sentence.slice(i + BLANK.length) };
}

// ---------- Formes ----------
// Chaque phrase dit ce qui la complète (`forme`) et chaque carte ce qu'elle est :
//  groupe_nominal : « un pigeon en costume »  (après un verbe, une préposition : « j'ai croisé ___ »)
//  infinitif      : « chanter faux au mariage »  (« je refuse de… » sans « de » avant le trou : « j'ose ___ »)
//  libre          : phrase ou exclamation entière, pour les citations « ___ »
// Une phrase « libre » (citation) accepte toutes les cartes ; les autres n'acceptent que leur propre forme.

export const FORMES = ['groupe_nominal', 'infinitif', 'libre'];
export const MIN_COMPATIBLE = 3; // cartes qui vont dans la phrase, dans chaque main de 5

export const cardText = (card) => (typeof card === 'string' ? card : card.texte);
export const cardForme = (card) => (typeof card === 'string' ? 'libre' : card.forme ?? 'libre');
export const phraseForme = (phrase) => phrase?.forme ?? 'libre';
export const compatible = (phrase, carte) => (phrase === 'libre' ? true : phrase === carte);

// ---------- Mains de cartes ----------

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Distribue une main de HAND_SIZE cartes à chaque joueur, depuis le paquet commun (cartes en texte ou `{ texte, forme }`).
 * Aucune carte en double dans une main ; autant que possible, aucune carte déjà vue dans une manche précédente
 * (`seen`, un Set de textes qui survit aux manches : il est vidé quand le paquet ne suffit plus) ni donnée à un autre joueur de la manche.
 * `forme` est celle de la phrase : chaque main contient au moins MIN_COMPATIBLE cartes qui s'y insèrent (autant que le paquet le permet).
 * Les mains sont renvoyées en texte, mélangées : rien ne distingue les cartes compatibles des autres.
 */
export function dealHands(playerIds, deck, seen, rng = Math.random, forme = 'libre') {
  const cards = deck.map((c) => ({ text: cardText(c), fits: compatible(forme, cardForme(c)) }));
  const size = Math.min(HAND_SIZE, cards.length);
  const need = playerIds.length * HAND_SIZE;
  if (cards.length - seen.size < need) seen.clear();
  let fresh = shuffle(cards.filter((c) => !seen.has(c.text)), rng);
  const hands = {};
  for (const id of playerIds) {
    const hand = [];
    const draw = (wantFit) => {
      // D'abord une carte jamais vue, puis (paquet trop court pour la forme demandée) n'importe quelle carte du paquet.
      let i = fresh.findLastIndex((c) => (wantFit ? c.fits : true) && !hand.includes(c.text));
      if (i >= 0) return fresh.splice(i, 1)[0];
      const pool = shuffle(cards.filter((c) => (wantFit ? c.fits : true) && !hand.includes(c.text)), rng);
      return pool[0] ?? null;
    };
    const wanted = Math.min(MIN_COMPATIBLE, size, cards.filter((c) => c.fits).length);
    while (hand.length < wanted) hand.push(draw(true).text);
    while (hand.length < size) hand.push(draw(false).text);
    hands[id] = shuffle(hand, rng);
    for (const card of hand) seen.add(card);
  }
  return hands;
}

// ---------- Notes ----------

/** Une note d'un votant pour une réponse. Renvoie { ratings, goldenUsed } mis à jour, ou { error }. Le premier choix compte (pas de changement). */
export function rate({ ratings, goldenUsed }, { voterId, authorId, rating }) {
  if (!Object.hasOwn(RATINGS, rating)) return { error: 'Note inconnue.' };
  if (voterId === authorId) return { error: 'On ne note pas sa propre réponse.' };
  if (ratings[authorId]?.[voterId] !== undefined) return { ratings, goldenUsed, already: true };
  if (rating === 'golden' && goldenUsed[voterId]) return { error: 'Ton Golden de la manche est déjà utilisé.' };
  return {
    ratings: { ...ratings, [authorId]: { ...(ratings[authorId] ?? {}), [voterId]: rating } },
    goldenUsed: rating === 'golden' ? { ...goldenUsed, [voterId]: true } : goldenUsed,
  };
}

/** Nombre de notes de chaque sorte reçues par une réponse (la petite jauge de la TV). */
export function tally(ratings, authorId) {
  const counts = { nul: 0, meh: 0, drole: 0, golden: 0 };
  for (const r of Object.values(ratings[authorId] ?? {})) counts[r] += 1;
  return counts;
}

// ---------- Fin de manche ----------

/**
 * Classement et gorgées d'une manche.
 *  answers : auteur → texte (réponses envoyées) ; ratings : auteur → { votant: note } ; censored : auteur → true.
 * Une réponse censurée vaut 0 point et son auteur ne peut ni gagner ni être dernier. Ceux qui n'ont rien écrit non plus.
 * Égalités : tous les ex æquo partagent le rang (1, 1, 3…) ; si tout le monde est à égalité, personne n'est dernier.
 */
export function resolveRound({ answers, ratings, censored = {}, order = Object.keys(answers) }) {
  const rows = order.map((authorId) => {
    const counts = censored[authorId] ? { nul: 0, meh: 0, drole: 0, golden: 0 } : tally(ratings, authorId);
    const points = RATING_NAMES.reduce((sum, name) => sum + counts[name] * RATINGS[name], 0);
    return { authorId, text: answers[authorId], points, golden: counts.golden, counts, censored: !!censored[authorId] };
  });
  rows.sort((a, b) => b.points - a.points || b.golden - a.golden);
  // Le rang ne dépend que des points ; les Golden ne servent qu'à ordonner l'affichage des ex æquo.
  const ranked = rows.map((row) => ({ ...row, rank: 1 + rows.filter((r) => r.points > row.points).length }));
  const eligible = ranked.filter((r) => !r.censored);
  const top = Math.max(...eligible.map((r) => r.points), 0);
  const bottom = Math.min(...eligible.map((r) => r.points), Infinity);
  const winners = top > 0 ? eligible.filter((r) => r.points === top).map((r) => r.authorId) : [];
  const losers = eligible.length > 1 && bottom < top ? eligible.filter((r) => r.points === bottom).map((r) => r.authorId) : [];
  const direct = {};
  const credits = {};
  for (const id of losers) direct[id] = (direct[id] ?? 0) + LAST_SIPS;
  for (const id of winners) credits[id] = (credits[id] ?? 0) + WIN_CREDIT;
  const points = Object.fromEntries(ranked.map((r) => [r.authorId, r.points]));
  const best = eligible.length ? [...eligible].sort((a, b) => b.points - a.points)[0] : null;
  return { board: ranked, top3: ranked.filter((r) => r.rank <= 3).slice(0, 8), winners, losers, direct, credits, points, best: best && best.points > 0 ? best : null };
}

/** Gorgées définitives : directes + distribuées (au choix du gagnant, sinon au hasard), plafond de SIP_CAP par joueur. */
export const settleRoundSips = ({ direct, credits, allocations, ids, rng }) => settleSips({ direct, credits, allocations, ids, rng, cap: SIP_CAP });
