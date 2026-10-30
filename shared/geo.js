// Géographie du Géo-duel : distance à vol d'oiseau (formule de Haversine) et conversion carte ↔ coordonnées.
import { MAP_H, MAP_W } from './worldmap.js';

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

/** Point de la carte (0..1000, 0..500) → coordonnées ; et l'inverse. */
export const toLatLon = (x, y) => ({ lon: (x / MAP_W) * 360 - 180, lat: 90 - (y / MAP_H) * 180 });
export const toXY = ({ lat, lon }) => ({ x: ((lon + 180) / 360) * MAP_W, y: ((90 - lat) / 180) * MAP_H });
