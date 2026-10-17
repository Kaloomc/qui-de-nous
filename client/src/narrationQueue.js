// File de lecture du narrateur : une phrase à la fois, jamais coupée ni chevauchée par un changement de phase.
// Indépendante du navigateur (le lecteur audio est injecté) pour pouvoir être testée avec un faux lecteur.
//
// player : { play(id, ms, sleep) → Promise résolue à la fin de la phrase, pause?(), resume?(), stop?() }
//   `sleep(ms)` est une attente qui se fige pendant la pause et se libère à reset() : à utiliser pour tout délai de sécurité.
// Un groupe (les phrases d'une phase) appelle `onDone` quand sa dernière phrase est terminée : c'est l'accusé envoyé au serveur.

export function createNarrationQueue(player, { tickMs = 50 } = {}) {
  let groups = [];
  let running = false;
  let paused = false;
  let epoch = 0;
  const waits = new Set();

  const release = (w) => {
    clearInterval(w.timer);
    waits.delete(w);
    w.resolve();
  };
  const sleep = (ms) =>
    new Promise((resolve) => {
      const w = { left: ms, resolve, last: Date.now() };
      // Temps réellement écoulé (et non le nombre de tops) : un onglet en arrière-plan ralentit les minuteurs.
      w.timer = setInterval(() => {
        const now = Date.now();
        if (!paused) w.left -= now - w.last;
        w.last = now;
        if (w.left <= 0) release(w);
      }, tickMs);
      waits.add(w);
    });

  async function run() {
    if (running) return;
    running = true;
    try {
      while (groups.length) {
        const group = groups.shift();
        const mine = epoch;
        for (const clip of group.clips) {
          if (mine !== epoch) break;
          if (clip.after) await sleep(clip.after);
          if (mine !== epoch) break;
          try {
            await player.play(clip.id, clip.ms, sleep);
          } catch {
            // un clip qui plante ne bloque jamais la partie
          }
        }
        if (mine === epoch) group.onDone?.();
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(clips, onDone) {
      groups.push({ clips, onDone });
      run();
    },
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (value) player.pause?.();
      else player.resume?.();
    },
    /** Quitter le jeu ou changer de partie : on arrête la phrase en cours et on vide la file (sans accusé). */
    reset() {
      epoch += 1;
      groups = [];
      player.stop?.();
      for (const w of [...waits]) release(w);
    },
    get idle() {
      return !running && groups.length === 0;
    },
  };
}
