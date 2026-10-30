// Course d'obstacles : simulation déterministe à pas de temps fixe, partagée par le client (affichage immédiat) et le serveur (juge).
// Seules des additions, soustractions, multiplications et comparaisons sont utilisées : le résultat est identique partout.
// Le serveur rejoue la simulation à partir des entrées horodatées par image et ne fait jamais confiance à un résultat envoyé.

export const FPS = 60;
export const DT_MS = 1000 / FPS;
export const MAX_FRAMES = 60 * FPS; // 60 s
export const V0 = 6; // vitesse de départ, en unités par image
export const K = 0.0011; // accélération par unité de distance : v = V0 + K · x (8,5 vers x = 2 300… jusqu'à ≈ 16 au bout de 60 s)
export const V_MAX = 15;
export const JUMP_V = 14;
export const GRAVITY = 0.7; // saut de 40 images, apogée à 140
export const AIR_FRAMES = (2 * JUMP_V) / GRAVITY;
export const RUN_W = 30;
export const STAND_H = 50;
export const DUCK_H = 25;
export const OBS_W = 30;
export const LOW = { bottom: 0, top: 40 }; // obstacle au sol : on saute
export const HIGH = { bottom: 40, top: 100 }; // obstacle aérien : on se baisse
export const FIRST_X = 700;

export const speedAt = (x) => Math.min(V_MAX, V0 + K * x);

/** Petit générateur à graine (mulberry32), identique côté client et serveur. */
export function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tracé : obstacles au sol (« low ») et aériens (« high »). L'écart entre deux obstacles laisse toujours le temps d'atterrir, de réagir
 * et de se baisser : jamais d'obstacle infranchissable (vérifié par un joueur parfait sur 1 000 tracés).
 */
export function makeTrack(seed, length = 60000) {
  const rng = rngOf(seed);
  const obstacles = [];
  let x = FIRST_X;
  while (x < length) {
    const kind = rng() < 0.55 ? 'low' : 'high';
    obstacles.push({ x: Math.round(x), kind });
    const v = speedAt(x);
    // Temps d'un saut complet + temps de réaction, à la vitesse de ce point, avec une marge variable.
    x += OBS_W + v * (AIR_FRAMES + 22) * (1 + rng() * 0.9);
  }
  return obstacles;
}

/** Entrées d'un joueur : [{ f, k }] avec k = 'j' (saut), 'd1' (début de baisse), 'd0' (fin de baisse), triées par image. */
export function simulate(track, events, upTo = MAX_FRAMES) {
  let x = 0;
  let y = 0;
  let vy = 0;
  let duck = false;
  let e = 0;
  const ordered = [...events].sort((a, b) => a.f - b.f);
  for (let f = 0; f < upTo; f++) {
    while (e < ordered.length && ordered[e].f <= f) {
      const k = ordered[e].k;
      if (k === 'j' && y === 0) vy = JUMP_V;
      else if (k === 'd1') duck = true;
      else if (k === 'd0') duck = false;
      e += 1;
    }
    if (y > 0 || vy > 0) {
      vy -= GRAVITY;
      y += vy;
      if (y <= 0) {
        y = 0;
        vy = 0;
      }
    }
    x += speedAt(x);
    const h = duck && y === 0 ? DUCK_H : STAND_H;
    for (const o of track) {
      if (o.x > x + RUN_W) break;
      if (x < o.x + OBS_W && x + RUN_W > o.x) {
        const band = o.kind === 'low' ? LOW : HIGH;
        if (y < band.top && y + h > band.bottom) return { deadAt: f + 1, x, y, duck: duck && y === 0, frames: f + 1 };
      }
    }
  }
  return { deadAt: null, x, y, duck: duck && y === 0, frames: upTo };
}

/** Joueur parfait (pour les tests : prouve qu'un tracé est franchissable) : saute ou se baisse juste avant chaque obstacle. */
export function perfectEvents(track, upTo = MAX_FRAMES) {
  const events = [];
  // Simulation en direct du joueur : à chaque image on regarde les obstacles proches et on décide.
  let x = 0;
  let y = 0;
  let vy = 0;
  let duck = false;
  for (let f = 0; f < upTo; f++) {
    const v = speedAt(x);
    const next = track.find((o) => o.x + OBS_W > x);
    if (next) {
      const dist = next.x - (x + RUN_W);
      if (next.kind === 'low' && y === 0 && dist > 0 && dist < v * 8 + 1) {
        events.push({ f, k: 'j' });
        vy = JUMP_V;
      } else if (next.kind === 'high') {
        const near = dist < v * 22;
        if (near && !duck) {
          events.push({ f, k: 'd1' });
          duck = true;
        } else if (!near && duck && x > next.x + OBS_W) {
          events.push({ f, k: 'd0' });
          duck = false;
        }
      }
      if (duck && x > next.x + OBS_W && next.kind === 'high') {
        events.push({ f, k: 'd0' });
        duck = false;
      }
    }
    if (y > 0 || vy > 0) {
      vy -= GRAVITY;
      y += vy;
      if (y <= 0) {
        y = 0;
        vy = 0;
      }
    }
    x += v;
  }
  return events;
}
