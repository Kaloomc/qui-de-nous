import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSequence, computeFeu, drawGap, FEU, GAPS, LATENCY_MARGIN_MS, MAX_TRAPS, MIN_TRAPS, RECENT_ROUNDS, sipsFeu } from './rules/feu.js';
import { loadJson } from './games/load.js';
import { makeGame } from './testClock.js';

const WORDS = loadJson('../content/words-feu.json');
const seq = { words: ['FLEUR', 'PEU', 'BLEU', FEU], feuIndex: 3 };
const FEU_AT = 10000;
const ALL = [...WORDS.pieges, ...WORDS.neutres];

test('mots : au moins 150, sans doublon, jamais « FEU » ni ses homophones (« FEUX »)', () => {
  assert.ok(ALL.length >= 150);
  assert.equal(new Set(ALL).size, ALL.length);
  for (const w of [FEU, 'FEUX', 'FEUE']) assert.ok(!ALL.includes(w), w);
  for (const w of ['FEUILLE', 'FICHIER', 'FILLE', 'FIOLE', 'FOU', 'FLEUR', 'PEU', 'BLEU', 'JEU', 'ŒUF']) assert.ok(WORDS.pieges.includes(w), w);
  assert.ok(WORDS.pieges.length > WORDS.neutres.length);
});

test('séquence : « FEU » termine la séquence, jamais en premier, position variable, jamais deux fois la même d’affilée', () => {
  const positions = new Set();
  let previous = null;
  for (let i = 0; i < 500; i++) {
    const s = buildSequence(WORDS, Math.random, previous);
    assert.equal(s.words.at(-1), FEU);
    assert.equal(s.feuIndex, s.words.length - 1);
    assert.equal(s.words.filter((w) => w === FEU).length, 1);
    assert.ok(s.feuIndex >= MIN_TRAPS && s.feuIndex <= MAX_TRAPS);
    assert.notEqual(s.feuIndex, previous);
    assert.equal(new Set(s.words).size, s.words.length, 'jamais deux fois le même mot dans une manche');
    positions.add(s.feuIndex);
    previous = s.feuIndex;
  }
  assert.equal(positions.size, MAX_TRAPS - MIN_TRAPS + 1, 'tôt comme tard');
  // Même tirage que la manche précédente : on décale.
  assert.equal(buildSequence(WORDS, () => 0, MIN_TRAPS).feuIndex, MIN_TRAPS + 1);
});

test('pauses : dans la plage prévue, sans cadence (rapides, normales et longs silences)', () => {
  const gaps = Array.from({ length: 3000 }, () => drawGap());
  for (const g of gaps) assert.ok(g >= GAPS.quick[0] && g <= GAPS.long[1], String(g));
  // Le plus court laisse finir le mot le plus long (0,73 s) : les mots ne se coupent pas.
  assert.ok(GAPS.quick[0] >= 900);
  assert.ok(gaps.some((g) => g <= GAPS.quick[1]), 'deux mots enchaînés très vite');
  assert.ok(gaps.some((g) => g >= GAPS.long[0]), 'longs silences');
  assert.ok(new Set(gaps).size > 500, 'aucun motif répétitif');
});

test('faux départ sur un mot piège, ou avant le premier mot', () => {
  const taps = { a: { at: FEU_AT - 900, index: 1 }, b: { at: 50, index: -1 }, c: { at: FEU_AT + 300, index: 3 } };
  const r = computeFeu(['a', 'b', 'c'], taps, seq, FEU_AT);
  assert.deepEqual(r.falseStarts, [{ id: 'a', word: 'PEU' }, { id: 'b', word: null }]);
  assert.deepEqual(sipsFeu(r), { a: 1, b: 1 });
  assert.equal(r.allFalseStart, false);
});

test('mesure depuis le vrai début du « FEU », avec une marge de latence', () => {
  // Reçu un peu avant le signal de la TV (latence) : accepté ; bien avant : faux départ.
  const taps = { a: { at: FEU_AT - LATENCY_MARGIN_MS + 20, index: 3 }, b: { at: FEU_AT - LATENCY_MARGIN_MS - 50, index: 3 }, c: { at: FEU_AT + 400, index: 3 } };
  const r = computeFeu(['a', 'b', 'c'], taps, seq, FEU_AT);
  assert.deepEqual(r.falseStarts.map((f) => f.id), ['b']);
  assert.deepEqual(r.ranking, [{ id: 'a', ms: 0 }, { id: 'c', ms: 400 }]);
});

test('après « FEU » : le plus rapide gagne, le plus lent boit, ceux qui n’ont pas tapé boivent', () => {
  const taps = { a: { at: FEU_AT + 400, index: 3 }, b: { at: FEU_AT + 250, index: 3 }, c: { at: FEU_AT + 900, index: 3 } };
  const r = computeFeu(['a', 'b', 'c', 'd'], taps, seq, FEU_AT);
  assert.deepEqual(r.ranking.map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(r.lastIds, ['c']);
  assert.deepEqual(r.missed, ['d']);
  assert.deepEqual(sipsFeu(r), { c: 1, d: 1 });
});

test('un seul réflexe valide, ou une égalité parfaite : personne n’est « le plus lent »', () => {
  assert.deepEqual(computeFeu(['a', 'b'], { a: { at: FEU_AT + 700, index: 3 } }, seq, FEU_AT).lastIds, []);
  const tie = { a: { at: FEU_AT + 300, index: 3 }, b: { at: FEU_AT + 300, index: 3 } };
  assert.deepEqual(sipsFeu(computeFeu(['a', 'b'], tie, seq, FEU_AT)), {});
});

test('tous en faux départ : manche annulée, chacun boit une seule fois', () => {
  const taps = { a: { at: 3000, index: 0 }, b: { at: 4000, index: 1 } };
  const r = computeFeu(['a', 'b'], taps, seq, null);
  assert.equal(r.allFalseStart, true);
  assert.deepEqual(sipsFeu(r), { a: 1, b: 1 });
});

/** Partie de test avec une séquence imposée : 3 pièges puis FEU, 1 s entre chaque mot. */
async function running(names = ['A', 'B', 'C']) {
  const t = await makeGame('feu', names);
  t.game.start();
  t.game.roundData.seq = { words: ['FLEUR', 'PEU', 'BLEU', FEU], feuIndex: 3, gaps: [1000, 1000, 1000, 1000] };
  assert.equal(t.game.gameHostAction({ type: 'start' }), null);
  return t;
}

test('moteur : faux départ visible tout de suite, plusieurs appuis (seul le premier compte), arrêt dès le « FEU »', async () => {
  const { game, players, tick } = await running();
  assert.equal(game.action(players[0].id, { type: 'tap' }), null, 'avant le premier mot');
  assert.deepEqual(game.publicState({ host: true }).round.falseStartIds, [players[0].id]);
  assert.equal(game.publicState({ playerId: players[0].id }).round.myTap.early, true);
  tick(1700);
  assert.equal(game.publicState({ host: true }).round.word, 'FLEUR');
  tick(3000);
  assert.equal(game.publicState({ host: true }).round.word, FEU);
  // La voix démarre 200 ms après l'envoi : c'est le vrai départ.
  tick(200);
  game.gameHostAction({ type: 'spoken', index: 3 });
  tick(300);
  game.action(players[1].id, { type: 'tap' });
  tick(200);
  game.action(players[2].id, { type: 'tap' });
  game.action(players[2].id, { type: 'tap' });
  tick(900);
  assert.equal(game.phase, 'revealing', 'tout le monde a tiré : on n’attend pas la fin de la fenêtre');
  tick(game.rules.revealMs);
  assert.deepEqual(game.results.ranking, [{ id: players[1].id, ms: 300 }, { id: players[2].id, ms: 500 }]);
  assert.deepEqual(game.publicState().roundSips, { [players[0].id]: 1, [players[2].id]: 1 });
});

test('moteur : sans signal de la TV, on mesure depuis l’envoi ; les non-tapeurs boivent après 3 s', async () => {
  const { game, players, tick } = await running();
  tick(4700);
  assert.equal(game.publicState({ host: true }).round.word, FEU);
  tick(400);
  game.action(players[0].id, { type: 'tap' });
  tick(3000);
  assert.equal(game.phase, 'revealing');
  tick(game.rules.revealMs);
  assert.deepEqual(game.results.ranking, [{ id: players[0].id, ms: 400 }]);
  assert.deepEqual(game.results.missed.sort(), [players[1].id, players[2].id].sort());
});

test('moteur : tous en faux départ, la manche s’arrête tout de suite et chacun boit une fois', async () => {
  const { game, players, tick } = await running();
  tick(1700);
  for (const p of players) game.action(p.id, { type: 'tap' });
  tick(900);
  assert.equal(game.phase, 'revealing');
  tick(game.rules.revealMs);
  assert.equal(game.results.allFalseStart, true);
  assert.deepEqual(game.publicState().roundSips, Object.fromEntries(players.map((p) => [p.id, 1])));
});

test('moteur : deux manches de suite n’ont jamais le même nombre de mots avant « FEU »', async () => {
  const { game, players, tick } = await makeGame('feu', ['A', 'B']);
  game.start();
  let previous = game.roundData.seq.feuIndex;
  for (let i = 0; i < 20; i++) {
    game.end();
    game.restart('feu');
    game.start();
    assert.notEqual(game.roundData.seq.feuIndex, previous);
    previous = game.roundData.seq.feuIndex;
  }
  assert.ok(players && tick);
});

test('mots : pas de répétition d’une manche à l’autre (dernières manches)', async () => {
  const { game } = await makeGame('feu', ['A', 'B']);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    game.start();
    const words = game.roundData.seq.words.slice(0, -1);
    const recent = seen.slice(-RECENT_ROUNDS).flat();
    for (const w of words) assert.ok(!recent.includes(w), `${w} déjà dit dans les ${RECENT_ROUNDS} dernières manches`);
    seen.push(words);
    game.end();
    game.restart('feu');
  }
});

test('mode auto : départ tout seul ; un joueur déconnecté ne bloque pas et n’est pas puni', async () => {
  const { game, players, tick } = await makeGame('feu', ['A', 'B', 'C'], { auto: true });
  game.start();
  game.disconnectPlayer(players[2], 's2');
  for (let t = 0; t < 200 && game.phase === 'question'; t++) tick(500);
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
