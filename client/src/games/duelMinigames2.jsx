// Vues des mini-jeux de la partie 2 du mode Duel (même contrat que duelMinigames.jsx : Tv, Duelist, Bettor, Summary).
import { useEffect, useState } from 'react';
import { TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';

const CAMP_LABEL = { rouge: 'ROUGE', bleu: 'BLEU' };

function Score({ a, b, unit = '' }) {
  return (
    <p className="duel-score" aria-label={`ROUGE ${a}${unit}, BLEU ${b}${unit}`}>
      <span className="is-rouge">ROUGE {a}{unit}</span>
      <span className="duel-score-sep">–</span>
      <span className="is-bleu">{b}{unit} BLEU</span>
    </p>
  );
}

/** Secondes restantes d'un blocage (heure du serveur), avec un rafraîchissement à la fin du blocage. */
function useBlocked(until, state) {
  const [, tick] = useState(0);
  const left = Math.max(0, (until ?? 0) - serverNow(state));
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => tick((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [until, left > 0]);
  return left;
}

// ---------- Désamorçage ----------

const WIRE_COLORS = { rouge: '#ff4d5e', bleu: '#3c9dff', vert: '#2fd18a', jaune: '#ffc93c', violet: '#b46cff' };
const PATTERN_NAMES = { uni: 'uni', raye: 'rayé', point: 'pointillé' };

function Wire({ wire, onCut = null, cut = false, solution = false }) {
  return (
    <button
      className={`mg-wire is-${wire.pattern} ${solution ? 'is-solution' : ''} ${cut ? 'is-cut' : ''}`}
      style={{ '--wire': WIRE_COLORS[wire.color] }}
      disabled={!onCut}
      onClick={() => onCut?.(wire.n - 1)}
      aria-label={`Fil ${wire.n}, ${wire.color}, ${PATTERN_NAMES[wire.pattern]}`}
    >
      <b>{wire.n}</b>
      <span className="mg-wire-line" />
      <small>{PATTERN_NAMES[wire.pattern]}</small>
    </button>
  );
}

function Bomb({ play, onCut = null, blocked = false }) {
  return (
    <div className="mg-defuse">
      <ol className="mg-clues">
        {play.clues.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="mg-wires">
        {play.wires.map((w) => (
          <Wire key={w.n} wire={w} onCut={blocked ? null : onCut} solution={play.cut === w.n - 1} />
        ))}
      </div>
    </div>
  );
}

const Defuse = {
  Tv({ play, state }) {
    return (
      <div className="mg-defuse-tv">
        <Score a={play.wrong.rouge} b={play.wrong.bleu} unit=" ✂✖" />
        <p className="duel-eyebrow">Mauvais fils coupés · le premier à couper le bon fil gagne</p>
        <Bomb play={play} />
        <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
          {(s) => `${s} s avant l’explosion`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const left = useBlocked(play.blockedUntil, state);
    return (
      <div className="mg-defuse-duelist">
        {left > 0 && <p className="duel-notice">Mauvais fil : bloqué 3 s</p>}
        <Bomb play={play} onCut={(i) => act({ wire: i })} blocked={left > 0} />
      </div>
    );
  },
  Summary: ({ details }) => (details?.wrong ? <p className="duel-cote-line">Mauvais fils : ROUGE {details.wrong.rouge} – {details.wrong.bleu} BLEU</p> : null),
};
Defuse.Bettor = Defuse.Tv;

export const MG_VIEWS_2 = { defuse: Defuse };
export { CAMP_LABEL, Score, useBlocked };
