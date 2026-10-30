// Géo-duel : Haversine sur des distances connues, carte, contenu (120 lieux sourcés), règles, égalité à 10 km, confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { haversine, toLatLon, toXY, MAX_KM } from '../shared/geo.js';
import { MAP_H, MAP_W, WORLD_PATH } from '../shared/worldmap.js';
import * as GEO from './duel/minigames/geo.js';
import { duel, leaks } from './duelTestKit.js';

const cities = JSON.parse(readFileSync(new URL('./content/villes-geo-duel.json', import.meta.url), 'utf8'));
const find = (nom) => cities.find((c) => c.nom === nom);

test('Haversine : distances connues à quelques km près, symétrie, zéro, antipodes', () => {
  const near = (a, b, km, tol = 25) => assert.ok(Math.abs(haversine(a, b) - km) < tol, `${haversine(a, b)} ≠ ${km}`);
  near(find('Paris'), find('Londres'), 344);
  near(find('Paris'), find('New York'), 5837, 40);
  near(find('Sydney'), find('Tokyo'), 7823, 60);
  near({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 10008, 5);
  assert.equal(haversine(find('Rome'), find('Rome')), 0);
  assert.ok(Math.abs(haversine(find('Rome'), find('Lima')) - haversine(find('Lima'), find('Rome'))) < 1e-9);
  assert.ok(Math.abs(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - MAX_KM) < 1e-6);
});

test('carte : conversion aller-retour, fond de carte embarqué sans service externe', () => {
  for (const p of [{ lat: 48.86, lon: 2.35 }, { lat: -33.9, lon: 151.2 }, { lat: 0, lon: 0 }]) {
    const back = toLatLon(...Object.values(toXY(p)));
    assert.ok(Math.abs(back.lat - p.lat) < 1e-9 && Math.abs(back.lon - p.lon) < 1e-9);
  }
  assert.ok(WORLD_PATH.startsWith('M') && WORLD_PATH.length > 20000);
  assert.equal(MAP_W / MAP_H, 2);
  assert.equal(/https?:/.test(WORLD_PATH), false);
});

test('contenu : au moins 120 lieux connus, coordonnées valides, source, noms uniques, tous les continents', () => {
  assert.ok(cities.length >= 120, `${cities.length} lieux`);
  assert.equal(new Set(cities.map((c) => c.nom)).size, cities.length);
  assert.equal(new Set(cities.map((c) => c.id)).size, cities.length);
  const banned = /jerusal|tel aviv|taipei|pristina|hargeysa|laayoune|kiev|kyiv|hong kong|crim/i;
  for (const c of cities) {
    assert.ok(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180, c.nom);
    assert.match(c.source, /^https:\/\/\S+$/);
    assert.equal(banned.test(c.nom), false, `lieu controversé : ${c.nom}`);
  }
  assert.deepEqual([...new Set(cities.map((c) => c.continent))].sort(), ['Afrique', 'Amériques', 'Asie', 'Europe', 'Océanie']);
});

const place = (s, camp, pin) => s.play(camp, { pin, n: s.mgState().n });

test('une ville : la plus proche gagne la ville, épingle manquante = distance maximale ; 3 villes, somme la plus petite gagne', async () => {
  const s = await duel('geo', { content: { geo: cities } });
  for (let n = 1; n <= 3; n++) {
    const truth = s.mgState().city;
    place(s, 'rouge', { lat: truth.lat + 0.5, lon: truth.lon + 0.5 }); // à ~70 km
    if (n < 3) place(s, 'bleu', { lat: -truth.lat, lon: truth.lon + 90 > 180 ? truth.lon - 90 : truth.lon + 90 });
    s.tick(GEO.PLACE_MS);
    if (n < 3) s.tick(GEO.REVEAL_MS);
  }
  assert.equal(s.winner(), 'rouge');
  const h = s.game.results.details.history;
  assert.equal(h.length, 3);
  assert.equal(h[2].km.bleu, Math.round(MAX_KM), 'épingle non posée à temps : distance maximale');
  assert.ok(h[0].km.rouge < 100);
});

test('à moins de 10 km d’écart sur la somme : égalité ; personne ne pose : égalité', async () => {
  const s = await duel('geo', { content: { geo: cities } });
  for (let n = 1; n <= 3; n++) {
    const truth = s.mgState().city;
    place(s, 'rouge', { lat: truth.lat + 0.01, lon: truth.lon });
    place(s, 'bleu', { lat: truth.lat - 0.01, lon: truth.lon });
    s.tick(GEO.PLACE_MS);
    if (n < 3) s.tick(GEO.REVEAL_MS);
  }
  assert.equal(s.winner(), 'égalité');
  const t = await duel('geo', { content: { geo: cities } });
  for (let n = 1; n <= 3; n++) {
    t.tick(GEO.PLACE_MS);
    if (n < 3) t.tick(GEO.REVEAL_MS);
  }
  assert.equal(t.winner(), 'égalité');
});

test('épingle déplaçable jusqu’à la fin ; entrées invalides refusées ; ville périmée ignorée', async () => {
  const s = await duel('geo', { content: { geo: cities } });
  assert.match(place(s, 'rouge', { lat: 95, lon: 0 }), /invalide/);
  assert.match(place(s, 'rouge', { lat: 'x', lon: 0 }), /invalide/);
  place(s, 'rouge', { lat: 10, lon: 10 });
  place(s, 'rouge', { lat: 20, lon: 20 });
  assert.deepEqual(s.mgState().pins.rouge, { lat: 20, lon: 20 });
  assert.match(s.play('rouge', { pin: { lat: 1, lon: 1 }, n: 99 }), /Trop tard/);
  s.tick(GEO.PLACE_MS);
  assert.match(place(s, 'rouge', { lat: 1, lon: 1 }), /Pas maintenant/);
});

test('confidentialité : ni épingle ni position exacte avant la fin de la ville ; l’adversaire ne voit pas l’épingle', async () => {
  const s = await duel('geo', { content: { geo: cities } });
  const truth = s.mgState().city;
  place(s, 'rouge', { lat: 12.3456, lon: 65.4321 });
  for (const who of ['tv', s.bettor, s.camp.bleu]) {
    const v = s.view(who);
    assert.equal(v.shown, null);
    assert.equal(v.mine ?? null, null, 'épingle d’un autre');
    assert.equal(leaks(v, ['12.3456', '65.4321', String(truth.lat), String(truth.lon)]), false, 'position visible');
    assert.equal(v.placed.rouge, true);
    assert.equal(v.city.nom, truth.nom, 'la ville annoncée est publique');
  }
  assert.deepEqual(s.view(s.camp.rouge).mine, { lat: 12.3456, lon: 65.4321 });
  s.tick(GEO.PLACE_MS);
  assert.deepEqual(s.view('tv').shown.truth, { lat: truth.lat, lon: truth.lon });
});
