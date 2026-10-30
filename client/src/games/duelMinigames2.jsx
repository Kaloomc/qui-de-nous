// Vues des mini-jeux de la partie 2 du mode Duel (même contrat que duelMinigames.jsx : Tv, Duelist, Bettor, Summary).
import { useEffect, useState } from 'react';
import { TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';
import { useFrameElapsed } from './duelFx.js';

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

// ---------- Le Code ----------

const SYMS = [
  { shape: '●', color: '#ff4f8b', name: 'rond rose' },
  { shape: '■', color: '#ffc93c', name: 'carré jaune' },
  { shape: '▲', color: '#3ee0c5', name: 'triangle turquoise' },
  { shape: '★', color: '#b46cff', name: 'étoile violette' },
  { shape: '◆', color: '#ff8a3d', name: 'losange orange' },
  { shape: '✚', color: '#7ee05a', name: 'croix verte' },
];

function Sym({ i, onClick = null, big = false }) {
  const s = SYMS[i];
  return (
    <button className={`mg-sym ${big ? 'is-big' : ''}`} style={{ '--sym': s.color }} disabled={!onClick} onClick={onClick} aria-label={s.name}>
      {s.shape}
    </button>
  );
}

/** Indices en pastilles : ● bien placé, ○ bon symbole mal placé, avec le texte pour ne pas dépendre de la forme seule. */
function Pips({ fb, length = 4 }) {
  return (
    <span className="mg-pips" aria-label={`${fb.exact} bien placé(s), ${fb.misplaced} mal placé(s)`}>
      {Array.from({ length }, (_, i) => (
        <i key={i} className={i < fb.exact ? 'is-exact' : i < fb.exact + fb.misplaced ? 'is-mis' : ''} />
      ))}
      <small>{fb.exact}✔ {fb.misplaced}↔</small>
    </span>
  );
}

const Code = {
  Tv({ play, state }) {
    return (
      <div className="mg-code-tv">
        <div className="mg-code-cols">
          {['rouge', 'bleu'].map((camp) => (
            <div key={camp} className={`mg-code-col is-${camp}`}>
              <strong>{CAMP_LABEL[camp]} · {play.pips[camp].length} / {play.max} essais</strong>
              {play.pips[camp].map((fb, i) => (
                <Pips key={i} fb={fb} length={play.length} />
              ))}
              {play.found[camp] && <em>✔ Code trouvé !</em>}
            </div>
          ))}
        </div>
        {play.secret && (
          <p className="mg-code-secret">
            Le code : {play.secret.map((x, i) => <span key={i} style={{ color: SYMS[x].color }}>{SYMS[x].shape} </span>)}
          </p>
        )}
        <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act }) {
    const [guess, setGuess] = useState([]);
    const tries = play.mine ?? [];
    const over = tries.length >= play.max || play.found.rouge || play.found.bleu;
    const add = (i) => guess.length < play.length && setGuess([...guess, i]);
    return (
      <div className="mg-code-duelist">
        <div className="mg-code-history">
          {tries.map((t, i) => (
            <div key={i} className="mg-code-row">
              {t.guess.map((g, k) => <Sym key={k} i={g} />)}
              <Pips fb={t.fb} length={play.length} />
            </div>
          ))}
        </div>
        <p className="muted">Essai {Math.min(tries.length + 1, play.max)} sur {play.max}</p>
        <div className="mg-code-slots">
          {Array.from({ length: play.length }, (_, k) => (
            <button key={k} className="mg-slot" onClick={() => setGuess(guess.filter((_, j) => j !== k))} aria-label={guess[k] != null ? `Retirer ${SYMS[guess[k]].name}` : 'Case vide'}>
              {guess[k] != null ? <span style={{ color: SYMS[guess[k]].color }}>{SYMS[guess[k]].shape}</span> : '·'}
            </button>
          ))}
        </div>
        <div className="mg-code-palette">
          {SYMS.map((_, i) => <Sym key={i} i={i} big onClick={over ? null : () => add(i)} />)}
        </div>
        <button className="btn btn-primary btn-xl" disabled={over || guess.length < play.length} onClick={() => { act({ guess }); setGuess([]); }}>
          Valider
        </button>
      </div>
    );
  },
  Summary: ({ details }) => (details?.tries ? <p className="duel-cote-line">Essais : ROUGE {details.tries.rouge} – {details.tries.bleu} BLEU</p> : null),
};
Code.Bettor = Code.Tv;

// ---------- Simon croisé ----------

const CROSS_PADS = [
  { shape: '●', color: '#ff4f8b', name: 'rond rose' },
  { shape: '■', color: '#ffc93c', name: 'carré jaune' },
  { shape: '▲', color: '#3ee0c5', name: 'triangle turquoise' },
  { shape: '★', color: '#b46cff', name: 'étoile violette' },
];

function CrossPads({ lit = -1, onTap = null }) {
  return (
    <div className="mg-pads is-big">
      {CROSS_PADS.map((p, i) => (
        <button key={i} className={`mg-pad ${lit === i ? 'is-lit' : ''}`} style={{ '--pad': p.color }} disabled={!onTap} onClick={() => onTap?.(i)} aria-label={p.name}>
          {p.shape}
        </button>
      ))}
    </div>
  );
}

const Simon2 = {
  Tv({ play, state }) {
    const elapsed = useFrameElapsed(play.phase === 'replay' ? play.replayAt : null, state);
    const i = elapsed == null || elapsed === Infinity ? -1 : Math.floor((elapsed - 500) / 520);
    const lit = play.seq && i >= 0 && i < play.seq.length && (elapsed - 500) % 520 < 400 ? play.seq[i] : -1;
    return (
      <div className="mg-simon2-tv">
        <p className="duel-eyebrow">
          {play.steps} pas sur {play.max} · {play.phase === 'replay' ? 'Regardez bien la séquence !' : `Au tour de ${CAMP_LABEL[play.turn]} : rejouer puis ajouter un pas`}
        </p>
        <CrossPads lit={lit} />
        {play.deadline && (
          <TimerBar timer={{ endsAt: play.deadline, totalMs: 6000, paused: false }} state={state} small>
            {(s) => `${s} s pour le prochain pas`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, side }) {
    const mine = play.turn === side && play.phase === 'input';
    return (
      <div className="mg-simon-duelist">
        <p className="duel-eyebrow">
          {play.phase === 'replay' ? 'Regarde la séquence sur la TV…' : mine ? (play.pos < play.steps ? `Rejoue la séquence : ${play.pos} / ${play.steps}` : 'Ajoute un pas pour piéger l’autre !') : 'Ton adversaire joue…'}
        </p>
        <CrossPads onTap={mine ? (i) => act({ pad: i }) : null} />
      </div>
    );
  },
  Summary: ({ details }) => (details?.steps ? <p className="duel-cote-line">Séquence de {details.steps} pas</p> : null),
};
Simon2.Bettor = Simon2.Tv;

export const MG_VIEWS_2 = { defuse: Defuse, code: Code, simon2: Simon2 };
export { CAMP_LABEL, Score, useBlocked };
