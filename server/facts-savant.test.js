// Faits du Savant : format, doublons, sources fiables, volume minimal (le détail des règles est dans scripts/check-facts.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFacts, CATEGORIES, FACTS_FILE, MIN_FACTS } from '../scripts/check-facts.js';

const facts = JSON.parse(readFileSync(FACTS_FILE, 'utf8'));
// Sources acceptées : encyclopédies, instituts, musées, grands médias scientifiques, articles scientifiques.
const RELIABLE = /(^|\.)(wikipedia\.org|britannica\.com|nasa\.gov|nature\.com|nih\.gov|noaa\.gov|usgs\.gov|usda\.gov|si\.edu|smithsonianmag\.com|nationalgeographic\.com|livescience\.com|scientificamerican\.com|history\.com|loc\.gov|nobelprize\.org|unesco\.org|guinnessworldrecords\.com|computerhistory\.org|clevelandclinic\.org|swissinfo\.ch|visitfinland\.com|bluetooth\.com|nhl\.com|pbs\.org|discovermagazine\.com|bgr\.com|nps\.gov|sciencedaily\.com|moma\.org)$/;

test('faits du Savant : au moins 150 faits valides, sans doublon, une source par fait', () => {
  assert.ok(facts.length >= MIN_FACTS, `${facts.length} faits`);
  assert.deepEqual(checkFacts(facts), []);
});

test('faits du Savant : chaque source vient d’un site fiable connu, et chaque catégorie est représentée', () => {
  for (const f of facts) assert.match(new URL(f.source).hostname, RELIABLE, `${f.id} : source ${f.source}`);
  for (const category of CATEGORIES) assert.ok(facts.some((f) => f.categorie === category), category);
});

test('le contrôle repère les erreurs : trou manquant, doublon, réponse dans la question, source invalide, réponse trop longue', () => {
  const ok = { id: 'x-1', question: 'Une pieuvre possède ___ cœurs.', reponse: 'trois', explication: 'Deux cœurs pour les branchies, un pour le corps.', categorie: 'animaux', source: 'https://example.org/a' };
  const problems = (patch) => checkFacts([{ ...ok, ...patch }]).filter((p) => !/au moins|il en faut/.test(p));
  assert.deepEqual(problems({}), []);
  assert.match(problems({ question: 'Pas de trou ici.' })[0], /trou/);
  assert.match(problems({ question: 'Un ___ et un ___.' })[0], /un seul trou/);
  assert.match(problems({ reponse: 'un deux trois quatre cinq six' })[0], /1 à 5 mots/);
  assert.match(problems({ question: 'Le mot trois est dans la question : ___ ?' })[0], /apparaît dans la question/);
  assert.match(problems({ source: 'pas une url' })[0], /source/);
  assert.match(problems({ source: 'http://example.org' })[0], /https/);
  assert.match(problems({ categorie: 'cuisine' })[0], /catégorie/);
  assert.match(checkFacts([ok, { ...ok, id: 'x-2' }]).join(' '), /question en double/);
  assert.match(checkFacts([ok, ok]).join(' '), /identifiant en double/);
});
