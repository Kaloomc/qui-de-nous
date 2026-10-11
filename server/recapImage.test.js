import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDIT } from '../client/src/credit.js';
import { drawRecap, fitText, RECAP_HEIGHT, RECAP_WIDTH } from '../client/src/recapImage.js';

/** Faux contexte 2D : enregistre les textes et les images dessinés. */
function fakeContext() {
  const calls = { texts: [], images: 0 };
  const ctx = {
    font: '16px x',
    calls,
    measureText: (t) => ({ width: t.length * (parseInt(/(\d+)px/.exec(ctx.font)[1], 10) * 0.55) }),
    fillText: (t, x, y) => calls.texts.push({ t, x, y }),
    drawImage: () => (calls.images += 1),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  for (const name of ['fillRect', 'save', 'restore', 'beginPath', 'closePath', 'arc', 'arcTo', 'moveTo', 'clip', 'fill']) ctx[name] = () => {};
  return ctx;
}

const recap = {
  date: '2026-10-11T12:00:00.000Z',
  players: [
    { id: 'a', name: 'Alice', photoUrl: '/api/photo/X/a' },
    { id: 'b', name: 'Bob', photoUrl: null },
    { id: 'c', name: 'Un prénom vraiment beaucoup trop long', photoUrl: null },
  ],
  trophies: [
    { id: 'roi', emoji: '👑', title: 'Le roi des gorgées', playerId: 'a', label: '9 gorgées' },
    { id: 'accuse', emoji: '👉', title: 'Le plus accusé', playerId: 'b', label: '4 votes reçus' },
  ],
  ranking: [
    { playerId: 'a', sips: 9, rank: 1 },
    { playerId: 'b', sips: 4, rank: 2 },
    { playerId: 'c', sips: 0, rank: 3 },
  ],
  totalSips: 13,
};

test('image du récap : format story, logo, date, trophées, classement, crédit et adresse', () => {
  assert.equal(RECAP_WIDTH, 1080);
  assert.equal(RECAP_HEIGHT, 1920);
  const ctx = fakeContext();
  const drawn = drawRecap(ctx, recap, { images: { a: {} }, publicUrl: 'https://gorgee.example/' });
  const texts = ctx.calls.texts.map((c) => c.t);
  assert.deepEqual(drawn, { trophies: 2, rankingRows: 3 });
  for (const expected of ['Gorg', 'ée', '👑 Le roi des gorgées', 'Alice', '9 gorgées', 'Classement des gorgées', '13 gorgées en tout ce soir']) {
    assert.ok(texts.includes(expected), `texte manquant : ${expected}`);
  }
  assert.ok(texts.some((t) => t.includes('11 octobre 2026')));
  assert.ok(texts.includes(`${CREDIT.text} · gorgee.example`));
  assert.equal(ctx.calls.images, 2); // la photo d'Alice : trophée + classement
  assert.ok(ctx.calls.texts.every((c) => c.y > 0 && c.y < RECAP_HEIGHT));
});

test('image du récap : photos masquées, noms trop longs coupés, sans adresse', () => {
  const ctx = fakeContext();
  drawRecap(ctx, recap, { images: { a: {} }, hidePhotos: true });
  const texts = ctx.calls.texts.map((c) => c.t);
  assert.equal(ctx.calls.images, 0);
  assert.ok(texts.includes('A')); // initiale à la place de la photo
  assert.ok(texts.includes(CREDIT.text));
  assert.ok(texts.some((t) => t.startsWith('Un prénom') && t.endsWith('…')));
  assert.equal(fitText(ctx, 'court', 1000), 'court');
});

test('image du récap : beaucoup de joueurs, le classement s’arrête avant le pied de page', () => {
  const many = {
    ...recap,
    players: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` })),
    trophies: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, emoji: '⭐', title: `Trophée ${i}`, playerId: `p${i}`, label: 'x' })),
    ranking: Array.from({ length: 20 }, (_, i) => ({ playerId: `p${i}`, sips: 20 - i, rank: i + 1 })),
  };
  const ctx = fakeContext();
  const drawn = drawRecap(ctx, many);
  assert.equal(drawn.trophies, 6);
  assert.ok(drawn.rankingRows >= 3 && drawn.rankingRows < 20);
  const rankingYs = ctx.calls.texts.filter((c) => /^Joueur/.test(c.t)).map((c) => c.y);
  assert.ok(Math.max(...rankingYs) < 1760);
});
