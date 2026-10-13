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

/** Contexte audio (null tant que personne n'a cliqué) : sert aussi aux voix enregistrées de Réflexes. */
export const audioContext = () => ctx;

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

let noiseBuffer = null;

/** Petit coup de caisse claire : bruit blanc très court. */
function snare(delay, volume) {
  if (muted || !ctx || ctx.state !== 'running') return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = noiseBuffer;
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + 0.05);
}

/** Bruit blanc filtré (explosion, souffle, cliquet). */
function noise({ duration = 0.3, volume = 0.3, delay = 0, type = 'lowpass', freq = 800, freqTo } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + delay;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const sounds = {
  /** Explosion : grosse basse + souffle qui s'étouffe. */
  boom: () => {
    tone(90, { duration: 0.9, volume: 0.6, slideTo: 30 });
    noise({ duration: 1.4, volume: 0.7, freq: 2400, freqTo: 120 });
  },
  /** La bombe change de main. */
  whoosh: () => noise({ duration: 0.35, volume: 0.25, type: 'bandpass', freq: 400, freqTo: 2600 }),
  /** Cliquet de la roue (volume selon la vitesse). */
  clack: (volume = 0.2) => noise({ duration: 0.03, volume, type: 'highpass', freq: 2500 }),
  /** « FEU ! » : impact + crépitement. */
  fire: () => {
    tone(160, { duration: 0.35, type: 'sawtooth', volume: 0.25, slideTo: 60 });
    noise({ duration: 0.6, volume: 0.4, type: 'bandpass', freq: 1800, freqTo: 300 });
  },
  /** Roulement de tambour qui monte en intensité pendant durationMs. */
  drumroll: (durationMs) => {
    const hits = Math.floor(durationMs / 55);
    for (let i = 0; i < hits; i++) snare((i * 55) / 1000, 0.05 + 0.25 * (i / hits));
  },
  count: (n) => tone(n === 1 ? 880 : 660, { duration: 0.12, type: 'square', volume: 0.08 }),
  ding: () => {
    tone(1318, { duration: 0.6, volume: 0.18 });
    tone(1760, { duration: 0.5, volume: 0.1, delay: 0.05 });
  },
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
