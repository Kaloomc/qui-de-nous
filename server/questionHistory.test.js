import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from './games/index.js';
import { GLOBAL_RECENT_SIZE, globalHistory, keyOf, QuestionHistory, resetGlobalHistory } from './questionHistory.js';
import { makeGame } from './testClock.js';

const list = (n) => Array.from({ length: n }, (_, i) => ({ text: `q${i}` }));
const drawMany = (history, items, n, id = 'test') => Array.from({ length: n }, () => history.draw(id, items));

beforeEach(resetGlobalHistory);

test('pas de répétition tant que la liste n’est pas épuisée', () => {
  const items = list(30);
  const drawn = drawMany(new QuestionHistory(), items, 30);
  assert.equal(new Set(drawn).size, 30);
});

test('liste épuisée : on remélange, sans reprendre en premier les dernières posées', () => {
  const items = list(10);
  for (let run = 0; run < 50; run++) {
    resetGlobalHistory();
    const history = new QuestionHistory();
    const first = drawMany(history, items, 10);
    const second = drawMany(history, items, 10);
    assert.equal(new Set(second).size, 10, 'le deuxième tour repose toute la liste');
    assert.ok(!first.slice(-5).includes(second[0]), 'pas une des 5 dernières en premier');
  }
});

test('listes minuscules : toujours une question, jamais de blocage', () => {
  const history = new QuestionHistory();
  assert.equal(history.draw('x', []), null);
  const one = list(1);
  for (const q of drawMany(history, one, 5, 'un')) assert.equal(q, one[0]);
  const two = list(2);
  const drawn = drawMany(history, two, 6, 'deux');
  for (let i = 0; i < 6; i += 2) assert.equal(new Set(drawn.slice(i, i + 2)).size, 2);
});

test('nouvelle partie à zéro : évite les questions tirées juste avant par une autre partie', () => {
  const items = list(20);
  const before = new Set(drawMany(new QuestionHistory(), items, 10));
  const after = drawMany(new QuestionHistory(), items, 10);
  for (const q of after) assert.ok(!before.has(q), `${q.text} déjà tirée par la partie précédente`);
});

test('liste plus petite que l’historique global : les plus anciennes d’abord, sans répétition dans le groupe', () => {
  const items = list(8);
  for (let g = 0; g < 20; g++) drawMany(new QuestionHistory(), items, 3);
  assert.ok(globalHistory('test').length <= items.length);
  const history = new QuestionHistory();
  const drawn = drawMany(history, items, 8);
  assert.equal(new Set(drawn).size, 8);
});

test('historique global plafonné', () => {
  drawMany(new QuestionHistory(), list(500), 300);
  assert.equal(globalHistory('test').length, GLOBAL_RECENT_SIZE);
});

/** Joue `n` manches (révélation forcée par l'hôte) et renvoie les questions posées. */
function play(game, tick, n) {
  const asked = [];
  assert.equal(game.start(), null);
  for (let i = 0; i < n; i++) {
    asked.push(game.question);
    game.reveal(game.roundId);
    tick(game.rules.revealMs);
    if (i < n - 1) assert.equal(game.nextQuestion(), null);
  }
  game.end();
  return asked;
}

test('dans une partie, puis après « Rejouer » : aucune question déjà vue par le groupe', async () => {
  const { game, tick } = await makeGame('qui-de-nous', ['Alice', 'Bob', 'Chloé']);
  const first = play(game, tick, 40);
  assert.equal(new Set(first.map(keyOf)).size, 40, 'pas de répétition dans la partie');
  assert.equal(game.restart(), null);
  const second = play(game, tick, 40);
  const seen = new Set(first.map(keyOf));
  for (const q of second) assert.ok(!seen.has(keyOf(q)), `déjà posée : ${q.text}`);
});

test('« Changer de jeu » puis revenir : le groupe garde son historique pour chaque jeu', async () => {
  const { game, tick } = await makeGame('tu-preferes', ['Alice', 'Bob', 'Chloé']);
  const first = play(game, tick, 20);
  assert.equal(game.chooseGame(), null);
  assert.equal(game.pickGame('estimation'), null);
  play(game, tick, 5);
  assert.equal(game.chooseGame(), null);
  assert.equal(game.pickGame('tu-preferes'), null);
  const again = play(game, tick, 20);
  const seen = new Set(first.map(keyOf));
  for (const q of again) assert.ok(!seen.has(keyOf(q)), `déjà posée : ${q.a} / ${q.b}`);
});

test('toute la liste d’un jeu posée au même groupe : on remélange et la partie continue', async () => {
  const { game, tick } = await makeGame('estimation', ['Alice', 'Bob']);
  const total = GAMES.estimation.questions.length;
  const asked = play(game, tick, total + 10);
  assert.equal(new Set(asked.slice(0, total).map(keyOf)).size, total, 'toutes posées une fois');
  for (const q of asked.slice(total)) assert.ok(q && typeof q.question === 'string');
});

test('La Roue : pas deux fois le même défi avant d’avoir fait le tour', async () => {
  const { game, tick } = await makeGame('roue', ['Alice', 'Bob', 'Chloé']);
  const defis = [];
  game.start();
  for (let i = 0; i < 60; i++) {
    game.reveal(game.roundId);
    tick(game.rules.revealMs);
    defis.push(game.results.defi);
    game.finalize();
    game.nextQuestion();
  }
  assert.equal(new Set(defis.map(keyOf)).size, 60);
});
