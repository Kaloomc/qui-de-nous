// Construit le contenu du Géo-duel à partir de Natural Earth (domaine public, https://www.naturalearthdata.com) :
//   server/content/villes-geo-duel.json  : villes (nom français, coordonnées lues dans le jeu de données, source)
//   shared/worldmap.js                   : frontières des pays (SVG simplifié), sans l'Antarctique
// Les deux fichiers de données sources sont dans scripts/data/natural-earth/ ; aucun service externe n'est appelé à l'exécution.
// Lancer : node scripts/build-geo-duel.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, 'data/natural-earth', f), 'utf8'));
const SOURCE = 'https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_populated_places_simple.geojson';

/** Nom Natural Earth (ASCII) → nom français affiché. Capitales et grandes villes connues, sur tous les continents ; aucun lieu controversé. */
const FR = {
  Paris: 'Paris', London: 'Londres', Berlin: 'Berlin', Madrid: 'Madrid', Rome: 'Rome', Lisbon: 'Lisbonne', Brussels: 'Bruxelles', Amsterdam: 'Amsterdam',
  Vienna: 'Vienne', Bern: 'Berne', Dublin: 'Dublin', Oslo: 'Oslo', Stockholm: 'Stockholm', Helsinki: 'Helsinki', Kobenhavn: 'Copenhague', Warsaw: 'Varsovie',
  Prague: 'Prague', Budapest: 'Budapest', Athens: 'Athènes', Bucharest: 'Bucarest', Sofia: 'Sofia', Reykjavik: 'Reykjavik', Zagreb: 'Zagreb', Vilnius: 'Vilnius',
  Riga: 'Riga', Tallinn: 'Tallinn', Bratislava: 'Bratislava', Ljubljana: 'Ljubljana', Luxembourg: 'Luxembourg', Moscow: 'Moscou', Istanbul: 'Istanbul',
  Valletta: 'La Valette', Geneva: 'Genève', Belgrade: 'Belgrade',
  Cairo: 'Le Caire', Nairobi: 'Nairobi', Lagos: 'Lagos', Kinshasa: 'Kinshasa', 'Addis Ababa': 'Addis-Abeba', Dakar: 'Dakar', Casablanca: 'Casablanca',
  Rabat: 'Rabat', Algiers: 'Alger', Tunis: 'Tunis', Accra: 'Accra', Abidjan: 'Abidjan', Johannesburg: 'Johannesburg', 'Cape Town': 'Le Cap', Pretoria: 'Pretoria',
  Luanda: 'Luanda', 'Dar es Salaam': 'Dar es Salaam', Antananarivo: 'Antananarivo', Maputo: 'Maputo', Harare: 'Harare', Lusaka: 'Lusaka', Windhoek: 'Windhoek',
  Kampala: 'Kampala', Bamako: 'Bamako', Libreville: 'Libreville', Yaounde: 'Yaoundé', 'Port Louis': 'Port-Louis', Kigali: 'Kigali',
  Tokyo: 'Tokyo', Osaka: 'Osaka', Seoul: 'Séoul', Beijing: 'Pékin', Shanghai: 'Shanghai', Mumbai: 'Mumbai', 'New Delhi': 'New Delhi', Bangkok: 'Bangkok',
  Hanoi: 'Hanoï', Jakarta: 'Jakarta', Manila: 'Manille', 'Kuala Lumpur': 'Kuala Lumpur', Singapore: 'Singapour', Dhaka: 'Dhaka', Tehran: 'Téhéran',
  Riyadh: 'Riyad', Ankara: 'Ankara', Colombo: 'Colombo', Kathmandu: 'Katmandou', Ulaanbaatar: 'Oulan-Bator', Astana: 'Astana', Tashkent: 'Tachkent', Baku: 'Bakou',
  Tbilisi: 'Tbilissi', Doha: 'Doha', 'Abu Dhabi': 'Abou Dabi', Dubai: 'Dubaï', 'Phnom Penh': 'Phnom Penh', Vientiane: 'Vientiane', Bengaluru: 'Bangalore',
  Kolkata: 'Calcutta', Islamabad: 'Islamabad',
  'New York': 'New York', 'Los Angeles': 'Los Angeles', Chicago: 'Chicago', 'Washington, D.C.': 'Washington (D.C.)', Ottawa: 'Ottawa', Toronto: 'Toronto',
  Vancouver: 'Vancouver', 'Mexico City': 'Mexico', Havana: 'La Havane', Bogota: 'Bogota', Lima: 'Lima', Santiago: 'Santiago du Chili', 'Buenos Aires': 'Buenos Aires',
  'Rio de Janeiro': 'Rio de Janeiro', 'Sao Paulo': 'São Paulo', Brasilia: 'Brasilia', Caracas: 'Caracas', Quito: 'Quito', 'La Paz': 'La Paz', Montevideo: 'Montevideo',
  Asuncion: 'Asunción', 'San Francisco': 'San Francisco', Miami: 'Miami', 'Panama City': 'Panama', 'San Jose': 'San José (Costa Rica)', Kingston: 'Kingston (Jamaïque)',
  Houston: 'Houston',
  Sydney: 'Sydney', Melbourne: 'Melbourne', Canberra: 'Canberra', Auckland: 'Auckland', Wellington: 'Wellington', 'Port Moresby': 'Port Moresby', Suva: 'Suva',
};
const ENDS = [['Belgrade', 'Europe'], ['Kigali', 'Afrique'], ['Islamabad', 'Asie'], ['Houston', 'Amériques'], ['Suva', 'Océanie']];
const continentOf = (name) => {
  const keys = Object.keys(FR);
  const i = keys.indexOf(name);
  return ENDS.find(([end]) => keys.indexOf(end) >= i)[1];
};

const places = read('ne_110m_populated_places_simple.geojson').features;
const byName = new Map(places.map((f) => [f.properties.nameascii, f]));
const out = [];
for (const [ne, fr] of Object.entries(FR)) {
  const f = byName.get(ne);
  if (!f) throw new Error(`absent de Natural Earth : ${ne}`);
  const { latitude, longitude } = f.properties;
  out.push({ id: `geo${String(out.length + 1).padStart(3, '0')}`, nom: fr, pays: f.properties.adm0name, lat: Math.round(latitude * 1e4) / 1e4, lon: Math.round(longitude * 1e4) / 1e4, continent: continentOf(ne), source: SOURCE });
}
fs.writeFileSync(path.join(here, '../server/content/villes-geo-duel.json'), `${JSON.stringify(out, null, 1)}\n`);

// Fond de carte : frontières des pays (Natural Earth 1:110m, domaine public), Antarctique retiré pour gagner de la place.
// Projection équirectangulaire : x de 0 à 1000 (360°), y de 0 (84° N) à 394,4 (58° S) ; 1 décimale.
const LAT_MAX = 84;
const LAT_MIN = -58;
const K = 1000 / 360;
const X = (lon) => Math.round((lon + 180) * K * 10) / 10;
const Y = (lat) => Math.round((LAT_MAX - Math.max(LAT_MIN, Math.min(LAT_MAX, lat))) * K * 10) / 10;
const MAP_H = Math.round((LAT_MAX - LAT_MIN) * K * 10) / 10;
const ring = (pts) => `M${pts.map(([lon, lat]) => `${X(lon)} ${Y(lat)}`).join('L')}Z`;
const countries = [];
for (const f of read('ne_110m_admin_0_countries.geojson').features) {
  if (f.properties.ADMIN === 'Antarctica') continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const d = polys.map((poly) => poly.map(ring).join('')).join('');
  // Point d'étiquette : centre de la boîte du plus grand polygone ; `a` : sa surface (en degrés²), pour n'étiqueter les petits pays que de près.
  let best = null;
  for (const poly of polys) {
    const outer = poly[0];
    const lons = outer.map((p) => p[0]);
    const lats = outer.map((p) => p[1]);
    const w = Math.max(...lons) - Math.min(...lons);
    const h = Math.max(...lats) - Math.min(...lats);
    if (!best || w * h > best.a) best = { a: w * h, lx: X((Math.max(...lons) + Math.min(...lons)) / 2), ly: Y((Math.max(...lats) + Math.min(...lats)) / 2) };
  }
  countries.push({ n: f.properties.NAME_FR || f.properties.NAME, d, lx: best.lx, ly: best.ly, a: Math.round(best.a) });
}
fs.writeFileSync(
  path.join(here, '../shared/worldmap.js'),
  `// Fond de carte du Géo-duel : frontières des pays, Natural Earth 1:110m (domaine public, https://www.naturalearthdata.com), sans l'Antarctique.\n// Projection équirectangulaire. Généré par scripts/build-geo-duel.mjs : ne pas modifier à la main.\nexport const MAP_W = 1000;\nexport const MAP_H = ${MAP_H};\nexport const LAT_MAX = ${LAT_MAX};\nexport const LAT_MIN = ${LAT_MIN};\n/** n : nom français ; d : tracé SVG ; lx, ly : point d'étiquette ; a : taille (degrés²). */\nexport const COUNTRIES = ${JSON.stringify(countries)};\n`,
);
console.log(`${out.length} lieux, ${countries.length} pays.`);
const counts = {};
for (const p of out) counts[p.continent] = (counts[p.continent] ?? 0) + 1;
console.log(counts);
