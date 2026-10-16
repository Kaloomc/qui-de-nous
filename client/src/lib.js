import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export const CODE_LENGTH = 4;

export const socket = io({ transports: ['websocket', 'polling'] });

// Retour sur l'appli après un passage en arrière-plan (téléphone verrouillé, autre appli) : on se reconnecte tout de suite.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !socket.connected) socket.connect();
  });
}

/** `timeout: true` dans la réponse : le serveur n'a pas répondu à temps (réseau lent), ce n'est pas un refus. */
export function request(event, payload = {}, timeout = 8000) {
  return new Promise((resolve) => {
    socket.timeout(timeout).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, error: 'Pas de réponse du serveur.', timeout: true } : res);
    });
  });
}

/** Garde l'écran allumé tant que `active` est vrai (si le navigateur le permet), et le redemande au retour sur la page. */
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return undefined;
    let lock = null;
    const acquire = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);
  return connected;
}

/** Appelle `callback` maintenant si connecté, puis à chaque (re)connexion. */
export function useOnConnect(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const run = () => ref.current();
    if (socket.connected) run();
    socket.on('connect', run);
    return () => socket.off('connect', run);
  }, []);
}

export function useGameState(code) {
  const [state, setState] = useState(null);
  useEffect(() => {
    // clockOffset : écart entre l'horloge du serveur et celle de cet appareil, pour synchroniser les animations.
    const onState = (s) => s.code === code && setState({ ...s, clockOffset: s.serverTime - Date.now() });
    socket.on('state', onState);
    return () => socket.off('state', onState);
  }, [code]);
  return state;
}

/** Même objet tant que le contenu ne change pas (le serveur renvoie tout l'état à chaque événement). */
export function useStable(value) {
  const ref = useRef({ key: null, value: null });
  const key = JSON.stringify(value ?? null);
  if (ref.current.key !== key) ref.current = { key, value };
  return ref.current.value;
}

export const serverNow = (state) => Date.now() + (state?.clockOffset ?? 0);

/** Millisecondes restantes d'un minuteur serveur ({ endsAt } ou { remainingMs, paused }), rafraîchies régulièrement. */
export function useRemaining(timer, state, intervalMs = 200) {
  const compute = () => {
    if (!timer) return null;
    if (timer.paused) return timer.remainingMs;
    return Math.max(0, timer.endsAt - serverNow(state));
  };
  const [remaining, setRemaining] = useState(compute);
  useEffect(() => {
    setRemaining(compute());
    if (!timer || timer.paused) return undefined;
    const id = setInterval(() => setRemaining(compute()), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.endsAt, timer?.paused, timer?.remainingMs, state?.clockOffset]);
  return remaining;
}

export const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible (navigation privée, quota) */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* idem */
    }
  },
};

export function navigate(to, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return path;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** URL de join à mettre dans le QR : si l'écran est ouvert en localhost, on bascule sur l'IP du réseau local. */
export function useJoinUrl(code) {
  const [base, setBase] = useState(window.location.origin);
  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then(({ lanIps, publicUrl }) => {
        const { protocol, hostname, port } = window.location;
        if (publicUrl) setBase(publicUrl.replace(/\/$/, ''));
        else if (LOCAL_HOSTS.includes(hostname) && lanIps.length) setBase(`${protocol}//${lanIps[0]}${port ? `:${port}` : ''}`);
      })
      .catch(() => {});
  }, []);
  return `${base}/join/${code}`;
}

export { colorFor } from './colors.js';
