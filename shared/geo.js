// Géographie du Géo-duel : distance à vol d'oiseau (formule de Haversine) et conversion carte ↔ coordonnées.
import { LAT_MAX, MAP_W } from './worldmap.js';

export const EARTH_KM = 6371;
/** Distance maximale : la moitié de la circonférence terrestre (épingle non posée à temps). */
export const MAX_KM = Math.PI * EARTH_KM;

const rad = (d) => (d * Math.PI) / 180;

/** Distance en km entre deux points (lat, lon en degrés). */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const K = MAP_W / 360; // unités de carte par degré (projection équirectangulaire, de LAT_MAX vers le sud)
/** Point de la carte → coordonnées ; et l'inverse. */
export const toLatLon = (x, y) => ({ lon: x / K - 180, lat: LAT_MAX - y / K });
export const toXY = ({ lat, lon }) => ({ x: (lon + 180) * K, y: (LAT_MAX - lat) * K });
