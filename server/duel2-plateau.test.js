// Plateau fantôme : sur 1 000 scènes la réponse est unique et vérifiable ; règles de manche ; la scène n'est jamais envoyée aux téléphones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as PL from './duel/minigames/plateau.js';
import { duel, leaks } from './duelTestKit.js';

test('1 000 scènes : réponse unique, 4 choix distincts, aucun personnage hors cadre, types variés', () => {
  const kinds = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const rng = seededRng(seed);
    const scene = PL.makeScene(rng);
    assert.ok(scene.chars.length >= 10 && scene.chars.length <= 14);
    assert.ok(scene.durationMs >= 6000 && scene.durationMs <= 8000);
    for (const c of scene.chars) {
      assert.ok(c.start >= 0 && c.start + 2600 <= scene.durationMs, 'personnage à moitié visible : il sort de la scène');
      assert.ok(PL.ACCESSORIES.includes(c.accessory) && ['gauche', 'droite'].includes(c.dir) && typeof c.jumps === 'boolean');
    }
    const q = PL.makeQuestion(scene, rng);
    kinds.add(q.kind);
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4, `choix en double (${seed})`);
    const truth = PL.answerOf(q.kind, scene);
    assert.ok(truth != null && truth !== 0);
    if (q.kind === 'couleur') {
      const color = PL.COLORS.find((c) => c.id === truth);
      assert.ok(q.choices[q.right].toLowerCase().startsWith(color.name), `couleur ${seed}`);
      assert.equal(q.choices.filter((c) => c.toLowerCase().startsWith(color.name)).length, 1);
    } else assert.equal(q.choices[q.right], String(truth), `comptage ${seed}`);
    assert.ok(q.choices.every((c, i) => i === q.right || c !== q.choices[q.right]), 'une seule bonne réponse');
  }
  assert.ok(kinds.size >= 6, `types de questions variés : ${[...kinds]}`);
  assert.deepEqual(PL.makeScene(seededRng(3)), PL.makeScene(seededRng(3)), 'reproductible');
});

test('couleur à égalité : la question n’est jamais posée', () => {
  const scene = { durationMs: 6000, chars: ['rouge', 'rouge', 'bleu', 'bleu'].map((color, id) => ({ id, color, accessory: 'aucun', dir: 'gauche', jumps: false, start: id * 10, lane: 0 })) };
  assert.equal(PL.answerOf('couleur', scene), null);
  for (let i = 0; i < 50; i++) assert.notEqual(PL.makeQuestion({ ...scene, chars: [...scene.chars, ...scene.chars.slice(0, 1).map((c) => ({ ...c, id: 9 }))] }, seededRng(i)).kind, 'chapeau', 'aucun chapeau : jamais posée');
});

const toAsk = (s) => {
  s.tick(s.mgState().scene.durationMs + 400);
  assert.equal(s.mgState().phase, 'ask');
};
const ans = (s, camp, ok) => s.play(camp, { choice: ok ? s.mgState().q.right : (s.mgState().q.right + 1) % 4, n: s.mgState().n });

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

test('1-1 après 3 passages : 4e passage, puis égalité finale ; question non répondue : personne ne marque', async () => {
  const s = await duel('plateau');
  toAsk(s);
  ans(s, 'rouge', true);
  s.tick(PL.SETTLE_MS + PL.REVEAL_MS);
  toAsk(s);
  ans(s, 'bleu', true);
  s.tick(PL.SETTLE_MS + PL.REVEAL_MS);
  toAsk(s);
  s.tick(PL.QUESTION_MS + PL.REVEAL_MS);
  assert.equal(s.mgState().n, 4, '4e passage');
  toAsk(s);
  s.tick(PL.QUESTION_MS);
  assert.equal(s.winner(), 'égalité');
});

test('confidentialité : la scène n’est envoyée qu’à la TV pendant le défilé, jamais aux téléphones ; la bonne réponse jamais avant la fin', async () => {
  const s = await duel('plateau');
  const scene = s.mgState().scene;
  assert.ok(s.view('tv').scene);
  for (const who of [s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.scene, undefined, 'les téléphones sont vides pendant le défilé');
    assert.equal(leaks(v, ['accessory', 'chars', 'jumps']), false);
    assert.equal(v.question, null);
  }
  toAsk(s);
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.scene, undefined);
    assert.equal(v.shown, null);
    assert.equal(JSON.stringify(v).includes('"right"'), false);
    assert.equal(v.choices.length, 4);
  }
  assert.ok(scene.chars.length >= 10);
});
