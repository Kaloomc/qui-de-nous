// Animations du mode Duel : tout minuteur ou image d'animation passe par ici, pour être annulé au même endroit (teardownGame),
// quand l'écran est démonté, quand la partie est en pause ou que le jeu change.
import { useEffect, useState } from 'react';
import { serverNow } from '../lib.js';

const timeouts = new Set();
const frames = new Set();

/** Échelle de la TV par rapport à un écran 1920×1080 (jamais en dessous de 0,5) : tout le mode Duel est dessiné pour 1080p puis ramené à la taille réelle. */
export const tvScale = () => (typeof innerWidth === 'number' ? Math.max(0.5, Math.min(1.5, innerWidth / 1920, innerHeight / 1080)) : 1);
export function useTvScale() {
  const [k, setK] = useState(tvScale);
  useEffect(() => {
    const f = () => setK(tvScale());
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);
  return k;
}

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function later(fn, ms) {
  const id = setTimeout(() => {
    timeouts.delete(id);
    fn();
  }, ms);
  timeouts.add(id);
  return () => {
    clearTimeout(id);
    timeouts.delete(id);
  };
}

/** Boucle d'animation (une image à la fois), annulée par teardownGame() comme le reste. Renvoie sa fonction d'arrêt. */
export function startLoop(fn) {
  let id;
  let stopped = false;
  const step = (t) => {
    if (stopped) return;
    frames.delete(id);
    fn(t);
    if (stopped) return;
    id = requestAnimationFrame(step);
    frames.add(id);
  };
  id = requestAnimationFrame(step);
  frames.add(id);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
    frames.delete(id);
  };
}

/** Annule d'un coup tous les minuteurs et animations du mode (fin du mode, changement de jeu, pause). */
export function teardownGame() {
  for (const id of timeouts) clearTimeout(id);
  for (const id of frames) cancelAnimationFrame(id);
  timeouts.clear();
  frames.clear();
}

/**
 * Millisecondes écoulées depuis `startedAt` (heure du serveur), à chaque image (30 par seconde au plus).
 * En pause ou avec `prefers-reduced-motion` : tout de suite l'état final (Infinity), jamais d'animation figée à mi-course.
 */
export function useFrameElapsed(startedAt, state, { active = true } = {}) {
  const skip = !!state?.paused || reducedMotion();
  const compute = () => (startedAt == null ? null : skip ? Infinity : Math.max(0, serverNow(state) - startedAt));
  const [elapsed, setElapsed] = useState(compute);
  useEffect(() => {
    setElapsed(compute());
    if (startedAt == null || skip || !active) return undefined;
    let id;
    let last = 0;
    const loop = (t) => {
      if (t - last >= 33) {
        last = t;
        setElapsed(compute());
      }
      id = requestAnimationFrame(loop);
      frames.add(id);
    };
    id = requestAnimationFrame(loop);
    frames.add(id);
    return () => {
      cancelAnimationFrame(id);
      frames.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, skip, active, state?.clockOffset]);
  return elapsed;
}

/** Ordre mélangé mais stable (même résultat à chaque image) : graine tirée d'un texte. */
export function stableShuffle(list, seedText) {
  let a = [...String(seedText)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Roulette : l'élément affiché à `elapsed` ms. Elle défile vite, ralentit (décélération cubique) et se verrouille sur `finalItem`
 * à `lockAt` ms. Renvoie { item, index, locked }. Le résultat est connu du serveur avant : l'animation ne fait que le montrer.
 */
export function reelAt(items, finalItem, elapsed, lockAt, steps = 26) {
  if (elapsed >= lockAt || !items.length) return { item: finalItem, index: steps, locked: true };
  const t = elapsed / lockAt;
  const index = Math.floor(steps * (1 - (1 - t) ** 3));
  const pool = items.length > 1 ? items : [...items, finalItem];
  return { item: pool[index % pool.length], index, locked: false };
}
