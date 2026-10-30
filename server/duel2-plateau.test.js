// Plateau fantôme : une règle par passage, réponse unique sur 1 000 passages, illustrations présentes, règles de manche, scène réservée à la TV.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { seededRng } from './rules/duel.js';
import * as PL from './duel/minigames/plateau.js';
import { duel, leaks } from './duelTestKit.js';

test('1 000 passages : 4 choix distincts, une seule bonne réponse retrouvée à partir de la scène, 3 à 5 animaux au plus à l’écran', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const round = PL.makeRound(seededRng(seed * 31));
    kinds.add(round.kind);
    assert.equal(round.choices.length, 4);
    const labels = round.choices.map((c) => c.img ?? c.text);
    assert.equal(new Set(labels).size, 4, `choix en double (${seed})`);
    assert.equal(labels[round.right], PL.answerFromScene(round), `mauvaise réponse (${seed}, ${round.kind})`);
    assert.equal(labels.filter((l) => l === PL.answerFromScene(round)).length, 1);
    const { scene } = round;
    if (round.kind === 'compte') {
      assert.ok(scene.walkers.length >= 2 && scene.walkers.length <= 6);
      assert.ok(scene.walkers.every((a) => PL.ANIMALS.includes(a)));
    } else {
      assert.ok(scene.before.length >= 3 && scene.before.length <= 5 && scene.after.length <= 5, 'trop de personnages à l’écran');
      assert.equal(new Set(scene.before).size, scene.before.length, 'deux fois le même animal');
      assert.equal(Math.abs(scene.after.length - scene.before.length), 1, 'une seule règle : un animal de moins ou de plus');
    }
    assert.ok(scene.durationMs >= 4000 && scene.durationMs <= 9500, 'animation lente et lisible');
  }
  assert.deepEqual([...kinds].sort(), ['compte', 'disparu', 'nouveau']);
  assert.deepEqual(PL.makeRound(seededRng(3)), PL.makeRound(seededRng(3)), 'reproductible');
});

test('les 12 illustrations Twemoji sont présentes (aucun fichier manquant) et le crédit est dans le README', () => {
  assert.equal(PL.ANIMALS.length, 12);
  for (const a of PL.ANIMALS) {
    const file = new URL(`../client/public/twemoji/${a}.svg`, import.meta.url);
    assert.ok(existsSync(file), `illustration manquante : ${a}`);
    assert.match(readFileSync(file, 'utf8'), /<svg /, `${a} : fichier SVG invalide`);
  }
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /Twemoji/);
  assert.match(readme, /CC-BY 4\.0/);
});

const toAsk = (s) => {
  s.tick(s.mgState().round.scene.durationMs + 400);
  assert.equal(s.mgState().phase, 'ask');
};
const ans = (s, camp, ok) => s.play(camp, { choice: ok ? s.mgState().round.right : (s.mgState().round.right + 1) % 4, n: s.mgState().n });

test('manche : le premier juste marque, une mauvaise réponse bloque 2 s, 2 points gagnent', async () => {
  const s = await duel('plateau');
  toAsk(s);
  ans(s, 'rouge', false);
  assert.match(ans(s, 'rouge', true), /Bloqué/);
  ans(s, 'bleu', true);
  s.tick(PL.SETTLE_MS);
  assert.deepEqual(s.view('tv').score, { rouge: 0, bleu: 1 });
  s.tick(PL.REVEAL_MS);
  toAsk(s);
  ans(s, 'bleu', true);
  s.tick(PL.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
});

test('deux passages de suite ne reprennent jamais la même règle ; 1-1 après 3 passages : 4e passage, puis égalité', async () => {
  const s = await duel('plateau');
  const kinds = [s.mgState().round.kind];
  toAsk(s);
  ans(s, 'rouge', true);
  s.tick(PL.SETTLE_MS + PL.REVEAL_MS);
  kinds.push(s.mgState().round.kind);
  toAsk(s);
  ans(s, 'bleu', true);
  s.tick(PL.SETTLE_MS + PL.REVEAL_MS);
  kinds.push(s.mgState().round.kind);
  assert.ok(kinds[0] !== kinds[1] && kinds[1] !== kinds[2], `règles répétées : ${kinds}`);
  toAsk(s);
  s.tick(PL.QUESTION_MS + PL.REVEAL_MS);
  assert.equal(s.mgState().n, 4, '4e passage');
  toAsk(s);
  s.tick(PL.QUESTION_MS);
  assert.equal(s.winner(), 'égalité');
});

test('confidentialité : la scène n’est envoyée qu’à la TV pendant l’animation, jamais aux téléphones ; la bonne réponse jamais avant la fin', async () => {
  const s = await duel('plateau');
  assert.ok(s.view('tv').scene);
  for (const who of [s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.scene, undefined, 'les téléphones sont vides pendant l’animation');
    assert.equal(leaks(v, ['before', 'after', 'walkers']), false);
    assert.equal(v.question, null);
  }
  toAsk(s);
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.scene, undefined);
    assert.equal(v.shown, null);
    assert.equal(JSON.stringify(v).includes('"right"'), false);
    assert.equal(v.choices.length, 4);
    assert.ok(v.question.length <= 60, 'question courte');
  }
});
