// Pénalités de temps des mini-jeux (Désamorçage −3 s, Culture G −2 s, Plateau fantôme −2 s, Ordre chronologique −3 s) :
// la mauvaise réponse passe en rouge, un « −X s » flotte et le décompte du blocage est visible tout de suite.
import { useEffect, useRef, useState } from 'react';
import { serverNow } from '../lib.js';
import { later } from './duelFx.js';

/**
 * Téléphone du duelliste : `until` est l'heure serveur de fin de blocage. Renvoie le temps restant, un drapeau « vient d'échouer »
 * et la clé de la réponse fausse (à passer à `mark(clé)` au moment du toucher).
 */
export function usePenalty(until, state) {
  const prev = useRef(until ?? 0);
  const last = useRef(null);
  const [flash, setFlash] = useState(false);
  const [wrong, setWrong] = useState(null);
  const [, tick] = useState(0);
  const left = Math.max(0, (until ?? 0) - serverNow(state));
  useEffect(() => {
    if ((until ?? 0) > prev.current) {
      setWrong(last.current);
      setFlash(true);
      later(() => setFlash(false), 1300);
    }
    prev.current = until ?? 0;
  }, [until]);
  useEffect(() => {
    if (left <= 0) {
      setWrong(null);
      return undefined;
    }
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [left > 0]);
  return { left, flash, wrong: left > 0 || flash ? wrong : null, mark: (key) => (last.current = key) };
}

/** « Mauvaise réponse · 2,3 s » en direct + « −3 s » qui flotte. */
export function PenaltyBadge({ left, flash, ms }) {
  if (left <= 0 && !flash) return null;
  return (
    <p className="duel-notice mg-penalty" role="status">
      Mauvaise réponse · {(left / 1000).toFixed(1).replace('.', ',')} s
      {flash && ms ? <span className="mg-penalty-float">−{ms / 1000} s</span> : null}
    </p>
  );
}

/** TV : un « −X s » rouge flotte à côté du camp dont le compteur d'erreurs vient d'augmenter. */
export function TvWrongs({ wrongs, ms }) {
  const seen = useRef({ rouge: wrongs?.rouge ?? 0, bleu: wrongs?.bleu ?? 0 });
  const [flash, setFlash] = useState({});
  useEffect(() => {
    for (const camp of ['rouge', 'bleu']) {
      if ((wrongs?.[camp] ?? 0) > seen.current[camp]) {
        setFlash((f) => ({ ...f, [camp]: true }));
        later(() => setFlash((f) => ({ ...f, [camp]: false })), 1500);
      }
      seen.current[camp] = wrongs?.[camp] ?? 0;
    }
  }, [wrongs?.rouge, wrongs?.bleu]);
  if (!flash.rouge && !flash.bleu) return <div className="mg-tvwrongs" aria-hidden="true" />;
  return (
    <div className="mg-tvwrongs" role="status">
      {['rouge', 'bleu'].map((camp) => flash[camp] && <span key={camp} className={`mg-penalty-float is-tv is-${camp}`}>{camp === 'rouge' ? 'ROUGE' : 'BLEU'} : erreur{ms ? ` −${ms / 1000} s` : ''}</span>)}
    </div>
  );
}
