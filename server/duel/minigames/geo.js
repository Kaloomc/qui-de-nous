// Géo-duel : 3 villes annoncées une par une ; chaque duelliste pose une épingle sur la carte du monde (15 s par ville). La somme des trois
// distances (Haversine) la plus petite gagne ; une épingle non posée à temps vaut la distance maximale. À moins de 10 km d'écart : égalité.
// Confidentialité : la TV et l'adversaire ne voient aucune épingle ni la position exacte avant la fin de la ville ; la ville annoncée, elle, est publique.
import { loadJson } from '../../games/load.js';
import { MAX_KM, haversine } from '../../../shared/geo.js';

const CITIES = loadJson('../content/villes-geo-duel.json');
export const COUNT = 3;
export const PLACE_MS = 15000;
export const BEAT_MS = 900;
export const REVEAL_MS = 3800;
export const TIE_KM = 10;
export const MIN_CITIES = 10;
export const cities = () => CITIES;

const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180;

function nextCity(s, ctx) {
  s.n += 1;
  s.city = ctx.draw('duel-geo', s.list);
  s.pins = {};
  s.phase = 'place';
  s.deadline = ctx.now() + PLACE_MS;
  s.shown = null;
  const token = ++s.token;
  ctx.later(PLACE_MS, () => s.token === token && s.phase === 'place' && reveal(s, ctx, token));
}

/** Fin d'une ville : distances calculées côté serveur, puis la carte montre les deux épingles et la vraie position. */
function reveal(s, ctx, token) {
  if (s.token !== token || s.phase !== 'place') return;
  const truth = { lat: s.city.lat, lon: s.city.lon };
  const km = {};
  for (const camp of ['rouge', 'bleu']) {
    km[camp] = s.pins[camp] ? haversine(s.pins[camp], truth) : MAX_KM;
    s.total[camp] += km[camp];
  }
  s.shown = { city: s.city.nom, truth, pins: { ...s.pins }, km: { rouge: Math.round(km.rouge), bleu: Math.round(km.bleu) } };
  s.history.push(s.shown);
  s.phase = 'reveal';
  s.token += 1;
  if (s.n >= COUNT) {
    const gap = s.total.rouge - s.total.bleu;
    s.done = { winner: Math.abs(gap) < TIE_KM ? 'égalité' : gap < 0 ? 'rouge' : 'bleu' };
    return;
  }
  const next = s.token;
  ctx.later(REVEAL_MS, () => s.token === next && nextCity(s, ctx));
}

const details = (s) => ({ total: { rouge: Math.round(s.total.rouge), bleu: Math.round(s.total.bleu) }, history: s.history });
const winnerOf = (s) => (Math.abs(s.total.rouge - s.total.bleu) < TIE_KM ? 'égalité' : s.total.rouge < s.total.bleu ? 'rouge' : 'bleu');

export default {
  id: 'geo',
  name: 'Géo-duel',
  icon: 'geo',
  category: 'connaissances',
  maxMs: COUNT * (PLACE_MS + REVEAL_MS) + 4000,
  minContent: MIN_CITIES,
  available: (game) => (game.duelContent?.geo ?? CITIES).length >= MIN_CITIES,
  prepare: (ctx) => ({ list: ctx.content.geo ?? CITIES, n: 0, city: null, pins: {}, phase: 'place', deadline: null, total: { rouge: 0, bleu: 0 }, history: [], shown: null, token: 0, done: null }),
  begin: (s, ctx) => nextCity(s, ctx),
  action(s, camp, data, ctx) {
    if (s.done || s.phase !== 'place') return 'Pas maintenant.';
    if (data.n !== undefined && data.n !== s.n) return 'Trop tard : ville suivante.';
    if (!valid(data.pin)) return 'Épingle invalide.';
    s.pins[camp] = { lat: data.pin.lat, lon: data.pin.lon }; // l'épingle peut être déplacée jusqu'à la fin des 15 s
    return null;
  },
  result: (s) => (s.done ? { winner: s.done.winner, details: details(s) } : null),
  resolve: (s) => ({ winner: winnerOf(s), details: details(s) }),
  view(s, who) {
    const view = {
      n: s.n,
      count: COUNT,
      city: s.city ? { nom: s.city.nom, pays: s.city.pays } : null,
      phase: s.phase,
      deadline: s.phase === 'place' ? s.deadline : null,
      // Seul le nombre d'épingles posées est connu de tous (pas leur position) avant la fin de la ville.
      placed: { rouge: !!s.pins.rouge, bleu: !!s.pins.bleu },
      shown: s.phase === 'reveal' ? s.shown : null,
      totals: s.history.length ? { rouge: Math.round(s.total.rouge), bleu: Math.round(s.total.bleu) } : null,
    };
    if (who.kind === 'duelist') view.mine = s.pins[who.side] ?? null;
    return view;
  },
};
