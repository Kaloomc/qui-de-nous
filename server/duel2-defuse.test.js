// Désamorçage : générateur (solution unique, difficulté constante sur 1 000 puzzles), règles, égalités, confidentialité.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as DEF from './duel/minigames/defuse.js';
import { duel, leaks } from './duelTestKit.js';

test('générateur : 1 000 puzzles, solution unique, 3 indices, aucun indice ne suffit seul, 5 ou 6 fils distincts', () => {
  const sizes = new Set();
  for (let seed = 1; seed <= 1000; seed++) {
    const p = DEF.makePuzzle(seededRng(seed));
    sizes.add(p.wires.length);
    assert.equal(p.clues.length, 3);
    assert.deepEqual(DEF.solve(p.wires, p.clues), [p.solution], `puzzle ${seed} ambigu`);
    for (const c of p.clues) assert.ok(DEF.solve(p.wires, [c]).length > 1, `puzzle ${seed} : un indice donne la réponse seul`);
    assert.equal(new Set(p.wires.map((w) => `${w.color}/${w.pattern}`)).size, p.wires.length, 'fils identiques');
    assert.deepEqual(p.wires.map((w) => w.n), p.wires.map((_, i) => i + 1), 'fils numérotés');
    for (const c of p.clues) assert.match(c.text, /^Le fil à couper .+\.$/);
  }
  assert.deepEqual([...sizes].sort(), [5, 6]);
  assert.deepEqual(DEF.makePuzzle(seededRng(7)), DEF.makePuzzle(seededRng(7)), 'reproductible à graine égale');
});

test('indices : chaque règle se vérifie sur un cas connu', () => {
  const w = [
    { n: 1, color: 'rouge', pattern: 'uni' },
    { n: 2, color: 'bleu', pattern: 'raye' },
    { n: 3, color: 'vert', pattern: 'point' },
    { n: 4, color: 'jaune', pattern: 'uni' },
  ];
  const t = (i, clue) => DEF.satisfies(w, i, clue);
  assert.ok(t(1, { kind: 'beside', key: 'color', val: 'rouge' }));
  assert.ok(!t(3, { kind: 'beside', key: 'color', val: 'rouge' }));
  assert.ok(t(3, { kind: 'notBeside', key: 'color', val: 'rouge' }));
  assert.ok(t(0, { kind: 'edge', val: 'first' }) && t(3, { kind: 'edge', val: 'last' }));
  assert.ok(t(1, { kind: 'notEdge' }) && !t(0, { kind: 'notEdge' }));
  assert.ok(t(0, { kind: 'leftOf', key: 'color', val: 'bleu' }));
  assert.ok(!t(2, { kind: 'leftOf', key: 'color', val: 'bleu' }));
  assert.ok(t(3, { kind: 'rightOf', key: 'pattern', val: 'raye' }));
  assert.ok(!t(0, { kind: 'leftOf', key: 'color', val: 'noir' }), 'couleur absente : indice faux');
});

test('jeu : le premier à couper le bon fil gagne ; un mauvais fil bloque 3 s ; le fil à couper n’est jamais envoyé avant la fin', async () => {
  const s = await duel('defuse');
  const sol = s.mgState().puzzle.solution;
  const wrong = (sol + 1) % s.mgState().puzzle.wires.length;
  for (const who of ['tv', s.bettor, ...s.ids]) {
    const v = s.view(who);
    assert.equal(v.cut, null);
    assert.equal(leaks(v, ['solution']), false);
    assert.equal(v.wires.length, s.mgState().puzzle.wires.length);
    assert.equal(v.clues.length, 3);
  }
  assert.match(s.play('rouge', { wire: 99 }), /invalide/);
  s.play('rouge', { wire: wrong });
  assert.equal(s.view('tv').wrong.rouge, 1);
  assert.match(s.play('rouge', { wire: sol }), /Bloqué/);
  assert.ok(s.view(s.camp.rouge).blockedUntil > 0);
  assert.equal(s.view(s.camp.bleu).blockedUntil, 0);
  s.tick(DEF.BLOCK_MS + 1);
  s.play('bleu', { wire: sol });
  s.tick(DEF.SETTLE_MS);
  assert.equal(s.game.phase, 'revealing');
  assert.equal(s.winner(), 'bleu');
});

test('jeu : latence compensée, égalité à 20 ms : nouveau puzzle une fois puis égalité ; sans coupe, le moins de mauvais fils gagne', async () => {
  const s = await duel('defuse', { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 0);
  s.game.duelLatency.set(s.camp.bleu, 300);
  s.tick(2000);
  const sol = s.mgState().puzzle.solution;
  s.play('rouge', { wire: sol });
  s.tick(100);
  s.play('bleu', { wire: sol }); // 2100 − 300 = 1800 ms : plus rapide malgré l'arrivée tardive
  s.tick(DEF.SETTLE_MS);
  assert.equal(s.winner(), 'bleu');
  const t = await duel('defuse');
  const first = JSON.stringify(t.mgState().puzzle);
  t.play('rouge', { wire: t.mgState().puzzle.solution });
  t.tick(5);
  t.play('bleu', { wire: t.mgState().puzzle.solution });
  t.tick(DEF.SETTLE_MS);
  assert.equal(t.game.phase, 'question', 'égalité : on rejoue');
  assert.notEqual(JSON.stringify(t.mgState().puzzle), first, 'nouveau puzzle');
  t.play('rouge', { wire: t.mgState().puzzle.solution });
  t.tick(5);
  t.play('bleu', { wire: t.mgState().puzzle.solution });
  t.tick(DEF.SETTLE_MS);
  assert.equal(t.winner(), 'égalité');
  const u = await duel('defuse');
  const bad = (u.mgState().puzzle.solution + 1) % u.mgState().puzzle.wires.length;
  u.play('rouge', { wire: bad });
  u.tick(DEF.MAX_MS);
  assert.equal(u.winner(), 'bleu', 'ROUGE a coupé un mauvais fil, BLEU aucun');
  const v = await duel('defuse');
  v.tick(DEF.MAX_MS);
  assert.equal(v.winner(), 'égalité');
});
