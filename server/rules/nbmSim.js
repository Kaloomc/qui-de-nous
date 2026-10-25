// Simulateur de parties de « Noir Boire Mangue » avec le vrai moteur de partie (horloge simulée) et des bots au comportement varié :
// actifs, inactifs, réponses vides, déconnexions, double clics, Golden en double, actions d'une étape passée.
// Il lève une erreur dès qu'un invariant est violé : partie bloquée, plafond de gorgées dépassé, auteur qui fuit avant la fin de la manche.
import { Game } from '../gameStore.js';
import { fakeClock } from '../testClock.js';
import { seeded } from './loupSim.js';
import { RATING_NAMES, SIP_CAP } from './nbm.js';

const SENTENCES = Array.from({ length: 30 }, (_, i) => ({ niveau: 'chill', texte: `Phrase de test numéro ${i} : ___ !` }));
const CARDS = Array.from({ length: 200 }, (_, i) => `carte ${i}`);

/**
 * Joue une partie complète. Renvoie { done, n, rounds, sipMax, steps, simMs, where }.
 * `kinds` des joueurs : 0 actif, 1 inactif, 2 se déconnecte parfois, 3 double clic, 4 réponses vides, 5 Golden en double.
 */
export function playOne(seed, { maxPlayers = 30 } = {}) {
  const rng = seeded(seed);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const n = 3 + Math.floor(rng() * (maxPlayers - 2));
  const clock = fakeClock();
  clock.t = 1_000_000;
  const game = new Game(`N${seed}`, 'nbm', { clock });
  game.nbmDeck = CARDS;
  game.contentPool = () => ({ key: 'nbm-test', list: SENTENCES });
  const players = [];
  for (let i = 0; i < n; i++) {
    const { player } = game.upsertPlayer({ name: `J${i}`, gender: pick(['m', 'f', 'n']) });
    game.connectPlayer(player, `s${seed}-${i}`);
    players.push({ id: player.id, player, kind: rng() < 0.5 ? 0 : pick([1, 2, 3, 4, 5]) });
  }
  game.setSettings({ auto: rng() < 0.5 });
  const started = game.start();
  if (started) throw new Error(`partie ${seed} non lancée : ${started}`);
  let steps = 0;
  let rounds = 0;
  let sipMax = 0;
  let lastMarker = null;
  let lastChange = clock.t;
  const act = (p, action) => {
    game.action(p.id, action);
    if (p.kind === 3) game.action(p.id, action); // double clic
  };
  const fail = (m) => {
    throw new Error(`partie ${seed} (${n} joueurs) : ${m}`);
  };
  while (game.phase !== 'ended' && steps < 200000 && clock.t - lastChange < 10 * 60_000) {
    steps += 1;
    const marker = `${game.phase}:${game.roundId}:${game.roundData?.phaseId}:${game.pending}`;
    const changed = marker !== lastMarker;
    if (changed) {
      lastMarker = marker;
      lastChange = clock.t;
    }
    if (game.phase === 'results' && !game.pending) {
      rounds += 1;
      for (const v of Object.values(game.roundSips ?? {})) {
        sipMax = Math.max(sipMax, v);
        if (v > SIP_CAP) fail(`plafond dépassé (${v})`);
      }
      if (game.isLastRound || rounds > 12) game.end();
      else game.nextQuestion();
      continue;
    }
    // Confidentialité : tant que la manche n'est pas finie, aucun identifiant de joueur dans la manche vue par la TV.
    if (changed && game.phase === 'question' && game.roundData?.step) {
      const host = JSON.stringify(game.publicState({ host: true }).round);
      for (const p of players) if (host.includes(p.id)) fail(`l'identifiant ${p.id} apparaît dans la manche envoyée à la TV (étape ${game.roundData.step})`);
    }
    for (const p of players) {
      if (p.kind === 1) continue;
      if (p.kind === 2 && rng() < 0.01 && p.player.sockets.size) game.disconnectPlayer(p.player, [...p.player.sockets][0]);
      if (p.kind === 2 && !p.player.sockets.size && rng() < 0.08) game.connectPlayer(p.player, `s${seed}-${p.id}-${steps}`);
      if (game.phase === 'results' && game.pending) {
        if (game.results.credits?.[p.id]) act(p, { type: 'allocate', allocation: rng() < 0.5 ? {} : { [pick(players).id]: 5 } });
        continue;
      }
      const r = game.phase === 'question' ? game.rules.publicRound(game, { playerId: p.id }) : null;
      const me = r?.me;
      if (!me || me.role === 'out' || rng() < 0.35) continue;
      if (rng() < 0.03) game.action(p.id, { type: 'rate', rating: 'drole', phaseId: 'périmée' }); // événement d'une étape passée
      if (r.step === 'write') {
        const text = p.kind === 4 ? '   ' : rng() < 0.5 ? pick(me.hand ?? ['x']) : `ma réponse ${Math.floor(rng() * 1e6)}`.padEnd(rng() < 0.1 ? 90 : 20, '.');
        act(p, { type: 'answer', text, phaseId: r.phaseId });
      } else if (r.step === 'rate' && !me.isAuthor) {
        const rating = p.kind === 5 ? 'golden' : pick(RATING_NAMES);
        act(p, { type: 'rate', rating, phaseId: r.phaseId });
        if (p.kind === 5) act(p, { type: 'rate', rating: 'golden', phaseId: r.phaseId });
      }
    }
    clock.tick(1000);
  }
  const done = game.phase === 'ended';
  const where = `phase ${game.phase}, étape ${game.roundData?.step}, manche ${game.round}, timers ${Object.keys(game.timers)}`;
  game.dispose();
  const timersLeft = Object.keys(game.timers).length + clock.timers.filter(Boolean).length;
  return { done, n, rounds, sipMax, steps, simMs: clock.t - 1_000_000, where, timersLeft };
}
