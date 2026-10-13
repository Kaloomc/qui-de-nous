// Voix de la TV pour « Réflexes ». D'abord les voix enregistrées (client/public/voix/, générées une fois avec
// ElevenLabs par scripts/voices.js), préchargées et jouées en WebAudio pour partir pile à l'heure ;
// à défaut (fichier manquant, chargement raté), la synthèse vocale du navigateur (Web Speech API).
import { useEffect, useState } from 'react';
import { VOICE_DIR, voiceFile } from '../../shared/voices.js';
import { storage } from './lib.js';
import { audioContext, isMuted } from './sound.js';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
/** Fichiers des voix enregistrées (ArrayBuffer, puis AudioBuffer une fois le son débloqué). */
const recorded = new Map();
let recordedReady = false;
let voice = null;
/** 'unknown' tant que les voix chargent, puis 'ok' (voix française trouvée) ou 'none' (affichage seul). */
let status = supported ? 'unknown' : 'none';
let unlocked = false;
const listeners = new Set();

function setStatus(next) {
  status = next;
  listeners.forEach((fn) => fn(next));
}

// Voix du navigateur : gardée en secours même quand les voix enregistrées sont là.
function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith('fr'));
  voice = fr.find((v) => v.lang.toLowerCase() === 'fr-fr' && v.localService) ?? fr.find((v) => v.lang.toLowerCase() === 'fr-fr') ?? fr[0] ?? null;
  if (!recordedReady) setStatus(voice ? 'ok' : 'none');
}

let loading = null;
/** Précharge toutes les voix enregistrées (moins de 1 Mo). Appelé à l'ouverture de Réflexes sur la TV. */
export function preloadVoices() {
  loading ??= fetch(`${VOICE_DIR}/manifest.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(({ files }) =>
      Promise.all(
        files.map((file) =>
          fetch(`${VOICE_DIR}/${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((data) => data && recorded.set(file, data))
            .catch(() => {}),
        ),
      ),
    )
    .then(() => {
      if (recorded.size === 0) return;
      recordedReady = true;
      setStatus('ok');
      decodeAll();
    })
    .catch(() => {});
  return loading;
}

/** Décode les fichiers dès que le contexte audio existe (il faut un clic de l'hôte). */
function decodeAll() {
  const ctx = audioContext();
  if (!ctx) return;
  for (const [file, data] of recorded) {
    if (!(data instanceof ArrayBuffer)) continue;
    recorded.set(file, null);
    ctx.decodeAudioData(data).then((buffer) => recorded.set(file, buffer), () => recorded.delete(file));
  }
}

let current = null;
function playRecorded(text) {
  const ctx = audioContext();
  const buffer = recorded.get(voiceFile(text));
  if (!ctx || ctx.state !== 'running' || !(buffer instanceof AudioBuffer)) return false;
  // Deux mots très rapprochés : le nouveau coupe l'ancien, comme la synthèse.
  try {
    current?.stop();
  } catch {
    /* déjà fini */
  }
  const source = ctx.createBufferSource();
  current = source;
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = getVolume();
  source.connect(gain).connect(ctx.destination);
  source.start();
  return true;
}

if (supported) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  // Certains navigateurs n'annoncent jamais leurs voix : passé ce délai, on considère qu'il n'y en a pas.
  setTimeout(() => status === 'unknown' && setStatus('none'), 2500);
}

export function useSpeechStatus() {
  const [value, setValue] = useState(status);
  useEffect(() => {
    listeners.add(setValue);
    setValue(status);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

export const getVolume = () => storage.get('feu:volume') ?? 1;
export const setVolume = (value) => storage.set('feu:volume', value);
export const isSpeechUnlocked = () => unlocked;

/** À appeler dans un clic de l'hôte : les navigateurs bloquent la voix tant que personne n'a cliqué. */
export function unlockSpeech() {
  unlocked = true;
  decodeAll();
  if (!supported) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

/**
 * Dit un mot. onStart est appelé quand la voix commence vraiment (début du son enregistré, ou onstart de la
 * synthèse) ; sans voix (son coupé, aucune voix), tout de suite : c'est alors l'affichage qui fait foi.
 */
export function speak(text, { onStart } = {}) {
  if (isMuted()) return onStart?.();
  if (playRecorded(text)) return onStart?.();
  if (!supported || !voice) return onStart?.();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.toLowerCase());
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    onStart?.();
  };
  u.onstart = start;
  // Certains navigateurs n'envoient jamais onstart : on ne bloque pas la mesure pour autant.
  setTimeout(start, 600);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.05;
  u.volume = getVolume();
  window.speechSynthesis.speak(u);
}
