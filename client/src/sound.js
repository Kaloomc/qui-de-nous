// Petits sons synthétisés avec WebAudio (aucun fichier audio).
import { storage } from './lib.js';

let ctx = null;
let muted = storage.get('qdn:muted') === true;

/** À appeler dans un clic : les navigateurs n'autorisent le son qu'après une interaction. */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  storage.set('qdn:muted', value);
}

function tone(freq, { duration = 0.08, type = 'sine', volume = 0.15, delay = 0, slideTo } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sounds = {
  /** progress de 0 à 1 : le tic monte dans les aigus à mesure que le suspense grandit. */
  tick: (progress = 0) => tone(380 + 520 * progress, { duration: 0.05, type: 'triangle', volume: 0.22 }),
  heartbeat: () => {
    tone(70, { duration: 0.12, volume: 0.5, slideTo: 45 });
    tone(64, { duration: 0.12, volume: 0.4, slideTo: 40, delay: 0.17 });
  },
  reveal: () => {
    tone(140, { duration: 0.4, volume: 0.5, slideTo: 50 });
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { duration: 0.3, type: 'triangle', volume: 0.12, delay: 0.1 + i * 0.08 }));
  },
};
