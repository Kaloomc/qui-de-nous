// Faits du Savant : format, doublons, sources fiables, volume minimal (le détail des règles est dans scripts/check-facts.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFacts, CATEGORIES, FACTS_FILE, MIN_FACTS } from '../scripts/check-facts.js';

const facts = JSON.parse(readFileSync(FACTS_FILE, 'utf8'));
// Sources acceptées : encyclopédies, instituts, musées, grands médias scientifiques, articles scientifiques.
const RELIABLE = /(^|\.)(wikipedia\.org|britannica\.com|nasa\.gov|nature\.com|nih\.gov|noaa\.gov|usgs\.gov|usda\.gov|si\.edu|smithsonianmag\.com|nationalgeographic\.com|livescience\.com|scientificamerican\.com|history\.com|loc\.gov|nobelprize\.org|unesco\.org|guinnessworldrecords\.com|computerhistory\.org|clevelandclinic\.org|swissinfo\.ch|visitfinland\.com|bluetooth\.com|nhl\.com|pbs\.org|discovermagazine\.com|bgr\.com|nps\.gov|sciencedaily\.com|moma\.org|toureiffel\.paris|etymonline\.com|oscars\.org|metmuseum\.org|nbcnews\.com|npr\.org|mcgill\.ca)$/;

test('faits du Savant : au moins 150 faits valides, sans doublon, une source par fait', () => {
  assert.ok(facts.length >= MIN_FACTS, `${facts.length} faits`);
  assert.deepEqual(checkFacts(facts), []);
});

test('faits du Savant : chaque source vient d’un site fiable connu, et chaque catégorie est représentée', () => {
  for (const f of facts) assert.match(new URL(f.source).hostname, RELIABLE, `${f.id} : source ${f.source}`);
  for (const category of CATEGORIES) assert.ok(facts.some((f) => f.categorie === category), category);
});

test('le contrôle repère les erreurs : trou manquant, doublon, réponse dans la question, source invalide, réponse trop longue', () => {
  const ok = { id: 'x-1', question: 'En 1932, l’armée australienne a déclaré la guerre à des milliers d’___ qui ravageaient les champs de blé, avant de battre en retraite.', reponse: 'émeus', explication: 'Les soldats sont repartis après quelques semaines : les oiseaux, très mobiles, se dispersaient.', categorie: 'histoire', source: 'https://example.org/a' };
  const problems = (patch) => checkFacts([{ ...ok, ...patch }]).filter((p) => !/au moins|il en faut/.test(p));
  assert.deepEqual(problems({}), []);
  assert.match(problems({ question: 'Pas de trou dans cette phrase, qui est pourtant assez longue pour une anecdote complète sans fragment.' })[0], /trou/);
  assert.match(problems({ question: 'Un ___ et un ___ dans une anecdote assez longue pour passer le contrôle du nombre de mots demandé.' })[0], /un seul trou/);
  assert.match(problems({ reponse: 'un deux trois quatre cinq six' })[0], /1 à 5 mots/);
  assert.match(problems({ question: 'Les émeus de cette anecdote sont déjà cités dans la phrase, et le trou ___ est donc inutile ici.' })[0], /apparaît dans la question/);
  assert.match(problems({ source: 'pas une url' })[0], /source/);
  assert.match(problems({ source: 'http://example.org' })[0], /https/);
  assert.match(problems({ categorie: 'cuisine' })[0], /catégorie/);
  assert.match(checkFacts([ok, { ...ok, id: 'x-2' }]).join(' '), /question en double/);
  assert.match(checkFacts([ok, ok]).join(' '), /identifiant en double/);
});

test('refonte éditoriale : anecdote complète, jamais un fragment, jamais un nombre, aucune unité autour du trou', () => {
  const ok = { id: 'x-1', question: 'En 1932, l’armée australienne a déclaré la guerre à des milliers d’___ qui ravageaient les champs de blé, avant de battre en retraite.', reponse: 'émeus', explication: 'Les soldats sont repartis après quelques semaines : les oiseaux se dispersaient.', categorie: 'histoire', source: 'https://example.org/a' };
  const problems = (patch) => checkFacts([{ ...ok, ...patch }]).filter((p) => !/au moins|il en faut/.test(p));
  assert.match(problems({ question: 'Une pieuvre possède ___ cœurs.' })[0], /12 à 35 mots/, 'un fragment est refusé');
  assert.match(problems({ question: `${'mot '.repeat(40)}___ ?` })[0], /12 à 35 mots/, 'une phrase trop longue aussi');
  assert.match(problems({ reponse: '1962' })[0], /pas être un nombre/);
  assert.match(problems({ reponse: 'trois' })[0], /pas être un nombre/);
  assert.match(problems({ question: 'Au marathon de ce siècle étrange, le record du plus long match de tennis a duré onze heures et ___ minutes, répartis sur trois jours.' })[0], /unité/);
  assert.match(problems({ question: 'Le disque d’or des sondes spatiales contient des salutations dans une collection de ___ langues, enregistrées par des volontaires.' })[0], /unité/);
});
