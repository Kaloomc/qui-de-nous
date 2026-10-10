// Voix de la TV (Web Speech API du navigateur), pour « Réflexes ». Aucune dépendance, aucun fichier audio.
import { useEffect, useState } from 'react';
import { storage } from './lib.js';
import { isMuted } from './sound.js';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice = null;
/** 'unknown' tant que les voix chargent, puis 'ok' (voix française trouvée) ou 'none' (affichage seul). */
let status = supported ? 'unknown' : 'none';
let unlocked = false;
const listeners = new Set();

function setStatus(next) {
  status = next;
  listeners.forEach((fn) => fn(next));
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith('fr'));
  voice = fr.find((v) => v.lang.toLowerCase() === 'fr-fr' && v.localService) ?? fr.find((v) => v.lang.toLowerCase() === 'fr-fr') ?? fr[0] ?? null;
  setStatus(voice ? 'ok' : 'none');
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
  if (!supported) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
  unlocked = true;
}

export function speak(text) {
  if (!supported || status !== 'ok' || isMuted()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.toLowerCase());
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.05;
  u.volume = getVolume();
  window.speechSynthesis.speak(u);
}
