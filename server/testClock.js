// Horloge factice pour les tests du moteur : les minuteurs ne partent qu'avec tick(ms).
export function fakeClock() {
  const clock = {
    t: 0,
    timers: [],
    now: () => clock.t,
    setTimeout: (fn, ms) => clock.timers.push({ fn, at: clock.t + ms }) - 1,
    clearTimeout: (i) => (clock.timers[i] = null),
    tick(ms) {
      const end = clock.t + ms;
      for (;;) {
        const next = clock.timers.map((t, i) => [t, i]).filter(([t]) => t && t.at <= end).sort((a, b) => a[0].at - b[0].at)[0];
        if (!next) break;
        clock.timers[next[1]] = null;
        clock.t = next[0].at;
        next[0].fn();
      }
      clock.t = end;
    },
  };
  return clock;
}

/** Partie de test avec des joueurs déjà connectés. */
export async function makeGame(mode, names, settings) {
  const { Game } = await import('./gameStore.js');
  const clock = fakeClock();
  const game = new Game('TEST', mode, { clock });
  const players = names.map((name, i) => {
    const { player } = game.upsertPlayer({ name });
    game.connectPlayer(player, `s${i}`);
    return player;
  });
  if (settings) game.setSettings(settings);
  return { game, clock, players, tick: clock.tick };
}
