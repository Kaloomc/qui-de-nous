import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSequence, computeFeu, FEU, MAX_WORDS, MIN_REACTION_MS, MIN_WORDS, sipsFeu } from './rules/feu.js';
import { loadJson } from './games/load.js';
import { makeGame } from './testClock.js';

const WORDS = loadJson('../content/words-feu.json');
const seq = { words: ['FLEUR', 'PEU', FEU, 'BLEU'], feuIndex: 2 };
const FEU_AT = 10000;

test('mots : beaucoup de pièges qui ressemblent à « feu », des neutres, jamais « FEU » lui-même', () => {
  assert.ok(WORDS.pieges.length >= 30 && WORDS.neutres.length >= 15);
  for (const w of ['PEU', 'BLEU', 'JEU', 'FOU', 'FOOT', 'FEUILLE', 'FLEUR', 'FLEUVE', 'FEUTRE', 'FOULE', 'FÈVE']) assert.ok(WORDS.pieges.includes(w), w);
  // Homophones de « feu » interdits : impossible de les distinguer à l'oreille.
  for (const w of [FEU, 'FEUX', 'FEUE']) assert.ok(![...WORDS.pieges, ...WORDS.neutres].includes(w), w);
  // Un seul mot court par entrée (une syllabe à l'oral) : pas d'espace, pas de mots à rallonge.
  for (const w of [...WORDS.pieges, ...WORDS.neutres]) assert.ok(!/\s/.test(w) && w.length <= 7, w);
});

test('séquences : 4 à 10 mots, un seul FEU jamais en premier, pas toujours en dernier, pas de mot répété d’affilée', () => {
  let notLast = 0;
  for (let i = 0; i < 500; i++) {
    const s = buildSequence(WORDS);
    assert.ok(s.words.length >= MIN_WORDS && s.words.length <= MAX_WORDS);
    assert.equal(s.words.filter((w) => w === FEU).length, 1);
    assert.equal(s.words[s.feuIndex], FEU);
    assert.ok(s.feuIndex >= 1);
    if (s.feuIndex < s.words.length - 1) notLast += 1;
    for (let j = 1; j < s.words.length; j++) assert.notEqual(s.words[j], s.words[j - 1]);
    for (const g of s.gaps) assert.ok(g >= 800 && g <= 2500);
  }
  assert.ok(notLast > 100, 'FEU souvent ailleurs qu’en dernier');
});

test('le dernier à taper après FEU boit ; classement par horodatage de réception', () => {
  const taps = { a: { at: FEU_AT + 400, index: 2 }, b: { at: FEU_AT + 250, index: 2 }, c: { at: FEU_AT + 900, index: 3 } };
  const r = computeFeu(['a', 'b', 'c'], taps, seq, FEU_AT);
  assert.deepEqual(r.ranking, [{ id: 'b', ms: 250 }, { id: 'a', ms: 400 }, { id: 'c', ms: 900 }]);
  assert.deepEqual(r.lastIds, ['c']);
  assert.deepEqual(sipsFeu(r), { c: 1 });
});

test('faux départ : taper sur un mauvais mot (ou anticiper) fait boire', () => {
  const taps = { a: { at: FEU_AT - 500, index: 1 }, b: { at: FEU_AT + 300, index: 2 }, c: { at: FEU_AT + MIN_REACTION_MS - 10, index: 2 }, d: { at: FEU_AT + 600, index: 2 } };
  const r = computeFeu(['a', 'b', 'c', 'd'], taps, seq, FEU_AT);
  assert.deepEqual(r.falseStarts, [{ id: 'a', word: 'PEU' }, { id: 'c', word: FEU }]);
  assert.deepEqual(sipsFeu(r), { a: 1, c: 1, d: 1 });
});

test('non-réponse : ceux qui ne tapent pas boivent ; un seul réflexe valide n’est pas « le dernier »', () => {
  const r = computeFeu(['a', 'b', 'c'], { a: { at: FEU_AT + 700, index: 2 } }, seq, FEU_AT);
  assert.deepEqual(r.missed, ['b', 'c']);
  assert.deepEqual(r.lastIds, []);
  assert.deepEqual(sipsFeu(r), { b: 1, c: 1 });
});

test('égalité parfaite entre tous les réflexes : personne n’est le dernier', () => {
  const taps = { a: { at: FEU_AT + 300, index: 2 }, b: { at: FEU_AT + 300, index: 2 } };
  assert.deepEqual(sipsFeu(computeFeu(['a', 'b'], taps, seq, FEU_AT)), {});
});

test('déroulé avec le moteur : mots un par un, touchers horodatés par le serveur, fin anticipée', async () => {
  const { game, players, tick } = await makeGame('feu', ['A', 'B', 'C']);
  game.start();
  assert.equal(game.action(players[0].id, { type: 'tap' }), 'Pas maintenant !', 'pas avant le départ');
  game.roundData.seq = { words: ['FLEUR', 'PEU', FEU, 'BLEU', 'FOU'], feuIndex: 2, gaps: [1000, 1000, 1000, 1000, 1000] };
  assert.equal(game.gameHostAction({ type: 'start' }), null);
  tick(1700);
  assert.equal(game.publicState({ host: true }).round.word, 'FLEUR');
  assert.equal(game.action(players[0].id, { type: 'tap' }), null, 'faux départ sur FLEUR');
  assert.equal(game.publicState({ playerId: players[0].id }).round.myTap.early, true);
  tick(2000);
  assert.equal(game.publicState({ host: true }).round.word, FEU);
  tick(300);
  game.action(players[1].id, { type: 'tap' });
  tick(200);
  game.action(players[2].id, { type: 'tap' });
  game.action(players[2].id, { type: 'tap' });
  assert.equal(game.roundData.taps[players[2].id].at - game.roundData.feuAt, 500, 'seul le premier toucher compte');
  tick(900);
  assert.equal(game.phase, 'revealing', 'tout le monde a tapé : on coupe la fin');
  tick(game.rules.revealMs);
  assert.deepEqual(game.results.ranking.map((r) => r.id), [players[1].id, players[2].id]);
  assert.deepEqual(game.publicState().roundSips, { [players[0].id]: 1, [players[2].id]: 1 });
});

test('mode auto : départ tout seul ; un joueur déconnecté ne bloque pas et n’est pas puni', async () => {
  const { game, players, tick } = await makeGame('feu', ['A', 'B', 'C'], { auto: true });
  game.start();
  game.disconnectPlayer(players[2], 's2');
  for (let t = 0; t < 80 && game.phase === 'question'; t++) tick(500);
  assert.equal(game.phase, 'revealing', 'la manche se termine toute seule');
  tick(game.rules.revealMs);
  assert.equal(game.results.missed.includes(players[2].id), false);
  assert.equal(game.results.missed.length, 2);
});

test('voix enregistrées : chaque mot (et « FEU », « PRÊTS ? ») a son fichier, listé dans le manifeste', async () => {
  const fs = await import('node:fs');
  const { VOICE_EXTRAS, voiceFile } = await import('../shared/voices.js');
  const dir = new URL('../client/public/voix/', import.meta.url);
  const { files } = JSON.parse(fs.readFileSync(new URL('manifest.json', dir), 'utf8'));
  for (const word of [...VOICE_EXTRAS, ...WORDS.pieges, ...WORDS.neutres]) {
    const file = voiceFile(word);
    assert.ok(files.includes(file) && fs.existsSync(new URL(file, dir)), `voix manquante pour ${word} : lance npm run voices`);
  }
  assert.equal(voiceFile('Feu !'), 'feu.mp3');
  assert.equal(voiceFile('ŒUF'), 'oeuf.mp3');
});
