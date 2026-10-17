// Narrateur vocal du Loup-Garou (TV) : clips MP3 générés une fois par scripts/narration.js, préchargés puis joués en WebAudio.
// Sans clip, son coupé ou son verrouillé : on ne joue rien (le texte reste à l'écran) et le jeu ne plante jamais.
// Une file : deux phrases ne se chevauchent jamais ; chaque phrase a plusieurs variantes, jamais la même deux fois de suite.
import { useEffect, useState } from 'react';
import { NARRATION_DIR } from '../../shared/narration.js';
import { storage } from './lib.js';
import { audioContext, isMuted } from './sound.js';

/** id → variantes (ArrayBuffer chargé, puis AudioBuffer décodé quand le son est débloqué). */
const clips = new Map();
const lastVariant = new Map();
let loading = null;
let status = 'unknown'; // 'unknown' | 'ok' | 'none'
const listeners = new Set();
const setStatus = (next) => {
  status = next;
  listeners.forEach((fn) => fn(next));
};

/** Précharge tous les clips (une fois). Appelé quand l'hôte ouvre le Loup-Garou : aucune latence pendant la partie. */
export function preloadNarration() {
  loading ??= fetch(`${NARRATION_DIR}/manifest.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('pas de manifest'))))
    .then(({ clips: files }) =>
      Promise.all(
        Object.keys(files ?? {}).map((file) =>
          fetch(`${NARRATION_DIR}/${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((data) => {
              const m = /^(.*)-(\d+)\.mp3$/.exec(file);
              if (!data || !m) return;
              const list = clips.get(m[1]) ?? [];
              list[Number(m[2]) - 1] = data;
              clips.set(m[1], list);
            })
            .catch(() => {}),
        ),
      ),
    )
    .then(() => setStatus(clips.size ? 'ok' : 'none'))
    .catch(() => setStatus('none'));
  return loading;
}

async function bufferOf(id, n) {
  const list = clips.get(id);
  const ctx = audioContext();
  let item = list?.[n];
  if (!item || !ctx) return null;
  if (item instanceof ArrayBuffer) {
    try {
      item = await ctx.decodeAudioData(item.slice(0));
    } catch {
      return null;
    }
    list[n] = item;
  }
  return item;
}

export const getNarratorVolume = () => storage.get('loup:volume') ?? 1;
export const setNarratorVolume = (value) => storage.set('loup:volume', value);

// ---------- File de lecture ----------

const queue = [];
let playing = false;
let session = null;

/** Nouvelle partie / nouveau jeu : on oublie ce qui attendait. */
export function setNarrationSession(token) {
  if (session === token) return;
  session = token;
  queue.length = 0;
}

async function playNext() {
  if (playing) return;
  const id = queue.shift();
  if (!id) return;
  playing = true;
  try {
    const list = clips.get(id);
    const ctx = audioContext();
    if (list?.length && ctx && ctx.state === 'running' && !isMuted()) {
      const variants = list.map((_, i) => i).filter((i) => list[i]);
      const choices = variants.length > 1 ? variants.filter((i) => i !== lastVariant.get(id)) : variants;
      const n = choices[Math.floor(Math.random() * choices.length)];
      lastVariant.set(id, n);
      const buffer = await bufferOf(id, n);
      if (buffer) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = getNarratorVolume();
        source.connect(gain).connect(ctx.destination);
        // Garde-fou : si le son se bloque (onglet en arrière-plan…), la file ne reste pas coincée.
        await new Promise((resolve) => {
          source.onended = resolve;
          setTimeout(resolve, buffer.duration * 1000 + 1500);
          source.start();
        });
      }
    }
  } finally {
    playing = false;
    playNext();
  }
}

/** Dit une phrase (variante au hasard) après `delayMs`. Une file trop longue est raccourcie : mieux vaut sauter que raconter en retard. */
export function say(id, delayMs = 0) {
  const token = session;
  setTimeout(() => {
    if (token !== session) return;
    if (queue.length >= 3) queue.shift();
    queue.push(id);
    playNext();
  }, delayMs);
}

/** État pour l'interface : 'none' (aucun clip : texte seul), 'locked' (cliquer pour activer), 'ok'. */
export function useNarratorStatus() {
  const [value, setValue] = useState(status);
  const [locked, setLocked] = useState(() => audioContext()?.state !== 'running');
  useEffect(() => {
    listeners.add(setValue);
    setValue(status);
    const id = setInterval(() => setLocked(audioContext()?.state !== 'running'), 500);
    return () => {
      listeners.delete(setValue);
      clearInterval(id);
    };
  }, []);
  return value === 'none' ? 'none' : locked ? 'locked' : value;
}
