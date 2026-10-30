// 1-2-3 Soleil : rythme de la voix, avancée et recul côté serveur, tolérance et latences différentes, égalités, durée maximale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from './rules/duel.js';
import * as SO from './duel/minigames/soleil.js';
import { duel } from './duelTestKit.js';

const untilSun = (s) => {
  for (let g = 0; g < 2000 && !s.mgState().sun; g++) s.tick(25);
  assert.ok(s.mgState().sun, 'Soleil jamais dit');
};

test('rythme : jamais moins de 700 ms entre deux mots, imprévisible (silences longs et enchaînements rapides)', () => {
  const rng = seededRng(5);
  const all = Array.from({ length: 2000 }, () => SO.cycleGaps(rng)).flat();
  assert.ok(all.every((g) => g >= SO.MIN_GAP_MS), 'trop court : la voix serait coupée');
  assert.ok(all.some((g) => g === SO.MIN_GAP_MS), 'très rapide');
  assert.ok(all.some((g) => g >= 2500), 'long silence');
  assert.ok(new Set(all).size > 100, 'pas de cadence fixe');
});

test('avancée : la barre progresse tant qu’on appuie, s’arrête au relâchement, calculée côté serveur', async () => {
  const s = await duel('soleil');
  s.play('rouge', { type: 'hold', down: true });
  s.tick(2500);
  s.play('rouge', { type: 'hold', down: false });
  const p = s.mgState().p.rouge.pos;
  assert.ok(Math.abs(p - 2500 * SO.RATE) < 1e-6, `position ${p}`);
  s.tick(3000);
  assert.equal(s.mgState().p.rouge.pos, p, 'relâché : plus d’avancée');
  assert.equal(s.mgState().p.bleu.pos, 0);
});

test('Soleil : appuyé après la tolérance = recul d’un quart ; relâché à temps = rien', async () => {
  const s = await duel('soleil');
  s.play('rouge', { type: 'hold', down: true });
  s.play('bleu', { type: 'hold', down: true });
  untilSun(s);
  s.tick(100);
  s.play('bleu', { type: 'hold', down: false }); // relâché pendant la tolérance (250 ms)
  s.tick(SO.TOLERANCE_MS + 200);
  assert.equal(s.mgState().p.rouge.penalties, 1);
  assert.equal(s.mgState().p.bleu.penalties, 0);
  assert.ok(s.mgState().p.rouge.pos < 0.25, 'a reculé');
  assert.ok(s.mgState().p.rouge.pos >= 0);
});

test('le recul ne passe jamais sous zéro', async () => {
  const s = await duel('soleil');
  s.play('rouge', { type: 'hold', down: true });
  untilSun(s);
  s.tick(SO.TOLERANCE_MS + 200);
  assert.ok(s.mgState().p.rouge.pos >= 0);
  assert.ok(s.view('tv').pos.rouge >= 0);
});

test('latence : un relâchement parti à temps mais arrivé après la tolérance n’est pas puni', async () => {
  const s = await duel('soleil', { latency: true });
  s.game.duelLatency.set(s.camp.rouge, 600); // RTT 600 ms : le geste arrive 300 ms après
  s.game.duelLatency.set(s.camp.bleu, 0);
  s.play('rouge', { type: 'hold', down: true });
  s.play('bleu', { type: 'hold', down: true });
  untilSun(s);
  s.tick(350); // le geste de ROUGE a été fait à ≈ 50 ms après le mot : il arrive maintenant
  s.play('rouge', { type: 'hold', down: false });
  s.play('bleu', { type: 'hold', down: false }); // BLEU arrive aussi à 350 ms réels : trop tard pour lui
  s.tick(1200);
  assert.equal(s.mgState().p.rouge.penalties, 0, 'compensé : il avait lâché à temps');
  assert.equal(s.mgState().p.bleu.penalties, 1, 'sans latence : 350 ms > 250 ms de tolérance');
});

test('le premier à l’arrivée gagne ; moins de 20 ms d’écart : on rejoue une fois, puis égalité', async () => {
  const s = await duel('soleil');
  s.play('rouge', { type: 'hold', down: true });
  s.tick(300);
  s.play('bleu', { type: 'hold', down: true });
  // Pas de recul pendant ce test : on sort l'état pour qu'il n'y ait pas de « Soleil » qui punisse.
  s.mgState().sun = false;
  for (let g = 0; g < 400 && !s.game.results; g++) {
    s.tick(100);
    for (const c of ['rouge', 'bleu']) s.mgState().p[c].events.length = 0;
  }
  assert.equal(s.winner(), 'rouge', 'ROUGE est parti 300 ms plus tôt');
  const t = await duel('soleil');
  const first = t.mgState().startedAt;
  t.play('rouge', { type: 'hold', down: true });
  t.play('bleu', { type: 'hold', down: true });
  for (let g = 0; g < 400 && t.game.phase === 'question' && t.mgState().startedAt === first; g++) {
    t.tick(100);
    for (const c of ['rouge', 'bleu']) t.mgState().p[c].events.length = 0;
  }
  assert.equal(t.mgState().replayed, true, 'égalité parfaite : reprise');
});

test('40 s écoulées : le plus avancé gagne ; personne n’a avancé : égalité', async () => {
  const s = await duel('soleil');
  s.play('bleu', { type: 'hold', down: true });
  s.tick(2000);
  s.play('bleu', { type: 'hold', down: false });
  s.tick(SO.MAX_MS);
  assert.equal(s.winner(), 'bleu');
  const t = await duel('soleil');
  t.tick(SO.MAX_MS);
  assert.equal(t.winner(), 'égalité');
});

test('le signal « Soleil » de la TV affine le départ de la tolérance ; voix annoncée par la TV', async () => {
  const s = await duel('soleil');
  untilSun(s);
  s.game.gameHostAction({ type: 'spoken', word: 'soleil' });
  assert.ok(s.mgState().spokenAt != null);
  s.game.gameHostAction({ type: 'voice', available: true });
  assert.equal(s.view('tv').voice, true);
});
