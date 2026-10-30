// Simulateur de bots du mode Duel : 300 sessions de 3 à 30 joueurs aux comportements variés (paris au hasard, retardataires, déconnexions,
// actions périmées ou invalides, spam d'emojis, pause, « passer ce duel »), horloge factice. Aucune exception, aucun invariant violé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './testClock.js';
import { seededRng } from './rules/duel.js';
import * as D from './rules/duel.js';

const KNOWN_STEPS = new Set(['waiting', 'duelists', 'game', 'bets', 'betsReveal', 'ready', 'play']);
const TIMER = /^(g:(phase|soon|gone|mg\d+)|next|reveal|pending|autoReveal|grace|vote)$/;

/** Une action au hasard, de la forme attendue par l'un des 5 mini-jeux (ou carrément invalide). */
function randomPlay(rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  return pick([
    { choice: pick(['pierre', 'feuille', 'ciseaux', 'laser']) },
    { pad: Math.floor(rng() * 6) - 1 },
    { i: Math.floor(rng() * 5), color: pick(['rouge', 'bleu', 'vert', 'jaune', 'noir']) },
    { type: 'tap' },
    { choice: Math.floor(rng() * 5), n: Math.floor(rng() * 4) },
    {},
    { choice: null, pad: 'x', i: {} },
  ]);
}

async function session(seed) {
  const rng = seededRng(seed * 7919);
  const n = 3 + Math.floor(rng() * 28);
  const names = Array.from({ length: n }, (_, i) => `J${i}`);
  const { game, clock, players } = await makeGame('duel', names);
  game.duelContent = { culture: Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, question: `Question ${i} ?`, choix: ['a', 'b', 'c', 'd'], bonne: i % 4 })) };
  game.duelOptions = { king: seed % 2 === 0, cote: seed % 3 === 0 ? 'hardcore' : 'standard', games: null };
  const chaos = [0, 0.05, 0.3][seed % 3];
  assert.equal(game.start(), null);
  const offline = new Set();
  let duels = 0;
  let lastRound = game.round;
  for (let t = 0; t < 900; t++) {
    clock.tick(200);
    const d = game.roundData;
    // Comportements
    for (const p of players) {
      if (!game.players.has(p.id)) continue;
      const r = rng();
      if (chaos && r < chaos * 0.02) {
        if (offline.has(p.id)) {
          game.connectPlayer(p, `re${t}`);
          offline.delete(p.id);
        } else {
          game.disconnectPlayer(p, [...p.sockets][0]);
          offline.add(p.id);
        }
        continue;
      }
      if (offline.has(p.id) || game.phase === 'ended') continue;
      if (rng() < 0.25) {
        const act = rng();
        if (act < 0.3) game.vote(p.id, rng() < 0.8 ? (rng() < 0.5 ? 'rouge' : 'bleu') : 'vert', rng() < 0.1 ? 3 : undefined);
        else if (act < 0.45) game.action(p.id, { type: 'ready', phaseId: rng() < 0.1 ? 'périmé' : undefined });
        else if (act < 0.7) game.action(p.id, { type: 'play', data: randomPlay(rng) });
        else if (act < 0.95) game.action(p.id, { type: 'cheer', kind: rng() < 0.5 ? 'confetti' : 'emoji', emoji: D.EMOJIS[Math.floor(rng() * 9)] });
        else game.action(p.id, { type: 'bidon' });
      }
    }
    if (chaos && rng() < 0.002) game.gameHostAction({ type: 'skip' });
    if (chaos && rng() < 0.002) game.pause();
    if (game.paused && rng() < 0.1) game.resume();
    if (game.phase === 'results' && !game.settings.auto) game.hostNext();
    // Invariants
    if (game.phase === 'question' && d.step) {
      assert.ok(KNOWN_STEPS.has(d.step), `étape inconnue ${d.step}`);
      if (d.step !== 'waiting') {
        assert.notEqual(d.red, d.blue, 'un joueur contre lui-même');
        assert.ok(!d.bettors?.includes(d.red) && !d.bettors?.includes(d.blue), 'un duelliste parmi les parieurs');
      }
      const st = game.publicState({ host: true }).round;
      assert.ok((st.cheers?.length ?? 0) <= D.FEED_MAX);
      assert.deepEqual(game.publicState({ host: true }).votedIds, [], 'noms des parieurs publics');
    }
    for (const name of Object.keys(game.timers)) assert.match(name, TIMER, `minuteur inattendu ${name}`);
    assert.ok(Object.keys(game.timers).length < 14, `trop de minuteurs : ${Object.keys(game.timers)}`);
    for (const [id, sips] of game.sips) {
      assert.ok(Number.isInteger(sips) && sips >= 0, 'gorgées invalides');
      assert.ok(game.players.has(id));
    }
    if (game.round !== lastRound) {
      duels += 1;
      lastRound = game.round;
    }
    if (game.results && game.phase === 'results') {
      const r = game.results;
      assert.ok(Object.values(r.sips).every((s) => s >= 0 && s <= D.SIP_CAP[r.cote] + 1));
      if (r.winner === 'égalité') assert.ok(Object.keys(r.sips).every((id) => id === r.red || id === r.blue), 'égalité : seuls les duellistes boivent');
      else assert.equal(r.sips[r.winnerId], undefined, 'le vainqueur ne boit jamais');
    }
  }
  game.end();
  game.chooseGame();
  assert.deepEqual(Object.keys(game.timers), [], 'minuteurs restants après le démontage');
  return { n, duels, round: game.round };
}

test('simulateur : 300 sessions de 3 à 30 joueurs, comportements variés, aucune exception ni invariant violé', async () => {
  let total = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const res = await session(seed);
    total += res.duels;
  }
  assert.ok(total > 100, `les duels avancent (${total} au total)`);
});
