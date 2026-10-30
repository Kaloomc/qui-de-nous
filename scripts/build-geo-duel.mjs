// Construit le contenu du Géo-duel à partir de Natural Earth (domaine public, https://www.naturalearthdata.com) :
//   server/content/villes-geo-duel.json  : villes (nom français, coordonnées lues dans le jeu de données, source)
//   shared/worldmap.js                   : fond de carte du monde simplifié (SVG, projection équirectangulaire 1000 × 500)
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

// Fond de carte : contours de terres, 1 décimale.
const X = (lon) => Math.round(((lon + 180) * 1000) / 36) / 10;
const Y = (lat) => Math.round(((90 - lat) * 5000) / 180) / 10;
const ring = (pts) => `M${pts.map(([lon, lat]) => `${X(lon)} ${Y(lat)}`).join('L')}Z`;
let d = '';
for (const f of read('ne_110m_land.geojson').features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (const r of poly) d += ring(r);
}
fs.writeFileSync(
  path.join(here, '../shared/worldmap.js'),
  `// Fond de carte du Géo-duel : contours des terres, Natural Earth 1:110m (domaine public, https://www.naturalearthdata.com), projection équirectangulaire.\n// Généré par scripts/build-geo-duel.mjs : ne pas modifier à la main.\nexport const MAP_W = 1000;\nexport const MAP_H = 500;\nexport const WORLD_PATH = '${d}';\n`,
);
console.log(`${out.length} lieux, carte de ${d.length} caractères.`);
const counts = {};
for (const p of out) counts[p.continent] = (counts[p.continent] ?? 0) + 1;
console.log(counts);
