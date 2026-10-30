// Vues des mini-jeux de la partie 2 du mode Duel (même contrat que duelMinigames.jsx : Tv, Duelist, Bettor, Summary).
import { useEffect, useMemo, useRef, useState } from 'react';
import { DT_MS, DUCK_H, HIGH, LOW, MAX_FRAMES, OBS_W, RUN_W, STAND_H, makeTrack, simulate } from '../../../shared/runner.js';
import { TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';
import { preloadVoices, speakQueued, useSpeechStatus } from '../speech.js';
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

// ---------- Le Crash ----------

/** Multiplicateur affiché : e^(rate · t), figé à la valeur d'explosion. */
function useMultiplier(play, state) {
  const elapsed = useFrameElapsed(play.phase === 'run' ? play.startedAt : null, state);
  if (play.crashed != null) return play.crashed;
  if (elapsed == null || elapsed === Infinity) return 1;
  return Math.exp(play.rate * elapsed);
}
const fmtX = (x) => `${(Math.floor(x * 100) / 100).toFixed(2).replace('.', ',')}x`;

function CrashBoard({ play, state, big = true }) {
  const m = useMultiplier(play, state);
  const boom = play.crashed != null;
  return (
    <div className={`mg-crash ${boom ? 'is-boom' : ''} ${big ? '' : 'is-small'}`}>
      <p className="mg-crash-x" aria-live="off">{boom ? '💥 ' : ''}{fmtX(m)}</p>
      <p className="duel-eyebrow">{play.phase === 'pause' ? 'Égalité : on rejoue une fois !' : boom ? 'Explosé !' : 'Ça monte…'}</p>
      <div className="mg-crash-banks">
        {['rouge', 'bleu'].map((camp) => (
          <span key={camp} className={`is-${camp}`}>
            {CAMP_LABEL[camp]} : {play.banked[camp] != null ? `banqué à ${fmtX(play.banked[camp])}` : boom ? '0 (explosé)' : 'pas encore banqué'}
          </span>
        ))}
      </div>
    </div>
  );
}

const Crash = {
  Tv: ({ play, state }) => <CrashBoard play={play} state={state} />,
  Duelist({ play, act, side, state }) {
    const done = play.banked[side] != null || play.crashed != null || play.phase !== 'run';
    return (
      <div className="mg-crash-duelist">
        <CrashBoard play={play} state={state} big={false} />
        <button className="mg-bank-btn" disabled={done} onClick={() => { navigator.vibrate?.(30); act({ type: 'bank' }); }}>
          {play.banked[side] != null ? `✔ Banqué à ${fmtX(play.banked[side])}` : 'BANQUE !'}
        </button>
      </div>
    );
  },
  Summary: ({ details }) =>
    details?.banked ? <p className="duel-cote-line">Banqué : ROUGE {details.banked.rouge ? fmtX(details.banked.rouge) : '0'} – {details.banked.bleu ? fmtX(details.banked.bleu) : '0'} BLEU · explosion à {fmtX(details.crash)}</p> : null,
};
Crash.Bettor = Crash.Tv;

// ---------- Dilemme en or ----------

const CHOICE_LABEL = { partager: '🤝 PARTAGER', trahir: '🗡️ TRAHIR' };

const Dilemme = {
  Tv({ play, state }) {
    return (
      <div className="mg-dilemme">
        <h2 className="mg-dilemme-title">{play.phase === 'talk' ? 'Parlez-vous !' : 'Chacun choisit en secret…'}</h2>
        <p className="duel-rule">Partager tous les deux : personne ne boit. Un seul trahit : il gagne. Les deux trahissent : 2 gorgées chacun.</p>
        <div className="mg-dilemme-boxes">
          {['rouge', 'bleu'].map((camp) => (
            <div key={camp} className={`mg-dilemme-box is-${camp}`}>
              <strong>{CAMP_LABEL[camp]}</strong>
              <span>{play.phase === 'talk' ? '💬' : play.chosen[camp] ? '🔒 a choisi' : '🤔 réfléchit'}</span>
            </div>
          ))}
        </div>
        {play.talkEndsAt && (
          <TimerBar timer={{ endsAt: play.talkEndsAt, totalMs: 20000, paused: false }} state={state}>
            {(s) => `Discussion : ${s} s`}
          </TimerBar>
        )}
        {play.deadline && (
          <TimerBar timer={{ endsAt: play.deadline, totalMs: 8000, paused: false }} state={state}>
            {(s) => `${s} s pour choisir`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const locked = !!play.mine;
    return (
      <div className="mg-dilemme-duelist">
        {play.phase === 'talk' ? (
          <>
            <h2>Parle à ton adversaire !</h2>
            <p className="muted">Négocie ou bluffe, à voix haute. Les boutons s’ouvrent dans quelques secondes.</p>
            <TimerBar timer={{ endsAt: play.talkEndsAt, totalMs: 20000, paused: false }} state={state} small>
              {(s) => `${s} s`}
            </TimerBar>
          </>
        ) : (
          <>
            <p className="muted">{locked ? 'Choix verrouillé. Attends l’autre…' : 'Choisis en secret !'}</p>
            {['partager', 'trahir'].map((c) => (
              <button key={c} className={`mg-dilemme-btn is-${c} ${play.mine === c ? 'is-picked' : ''}`} disabled={locked} onClick={() => act({ choice: c })}>
                {CHOICE_LABEL[c]}
              </button>
            ))}
            {play.deadline && (
              <TimerBar timer={{ endsAt: play.deadline, totalMs: 8000, paused: false }} state={state} small>
                {(s) => `${s} s`}
              </TimerBar>
            )}
          </>
        )}
      </div>
    );
  },
  // Suspense du verdict : rien n'est dévoilé tant que le vainqueur n'est pas annoncé.
  Reveal: () => <p className="mg-dilemme-title">🔒 ? &nbsp; 🔒 ?</p>,
  Summary: ({ details }) =>
    details?.choices ? (
      <p className="duel-cote-line">
        ROUGE : {CHOICE_LABEL[details.choices.rouge]} · BLEU : {CHOICE_LABEL[details.choices.bleu]}
      </p>
    ) : null,
};
Dilemme.Bettor = Dilemme.Tv;

// ---------- 1-2-3 Soleil ----------

const SUN_WORD = { un: 'UN…', deux: 'DEUX…', trois: 'TROIS…', soleil: '☀️ SOLEIL !' };

/** Position affichée : celle du serveur, prolongée sur la durée écoulée tant que le doigt est appuyé. */
function useRacePos(play, state) {
  const since = useFrameElapsed(play.at, state);
  const extra = Number.isFinite(since) ? since : 0;
  return Object.fromEntries(['rouge', 'bleu'].map((c) => [c, Math.min(1, play.pos[c] + (play.holding[c] ? play.rate * extra : 0))]));
}

function Tracks({ play, state }) {
  const pos = useRacePos(play, state);
  return (
    <div className="mg-tracks">
      {['rouge', 'bleu'].map((camp) => (
        <div key={camp} className={`mg-track is-${camp}`}>
          <strong>{CAMP_LABEL[camp]}</strong>
          <div className="mg-track-bar" role="progressbar" aria-valuenow={Math.round(pos[camp] * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pos[camp] * 100}%` }} />
          </div>
          <em>{Math.round(pos[camp] * 100)} %{play.penalties[camp] ? ` · reculé ${play.penalties[camp]} fois` : ''}</em>
        </div>
      ))}
    </div>
  );
}

const Soleil = {
  Tv({ play, state, gameAct }) {
    const status = useSpeechStatus();
    useEffect(() => {
      preloadVoices();
    }, []);
    useEffect(() => {
      gameAct?.({ type: 'voice', available: status === 'ok' });
    }, [status]);
    const n = play.cue?.n;
    useEffect(() => {
      if (!play.cue) return;
      const word = play.cue.word;
      speakQueued(word === 'soleil' ? 'Soleil !' : word, {
        onStart: word === 'soleil' ? () => gameAct?.({ type: 'spoken', word: 'soleil' }) : undefined,
      });
    }, [n]);
    return (
      <div className={`mg-soleil ${play.sun ? 'is-sun' : ''}`}>
        {status === 'none' && <p className="feu-sound-warn">Pas de voix sur cet écran : suivez le mot affiché. À « SOLEIL », lâchez !</p>}
        <p key={n} className="mg-soleil-word">{play.cue ? SUN_WORD[play.cue.word] : 'Prêts…'}</p>
        <p className="duel-eyebrow">{play.sun ? 'LÂCHEZ TOUT !' : 'Maintenez votre bouton… mais pas à « Soleil »'}</p>
        <Tracks play={play} state={state} />
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const [down, setDown] = useState(false);
    const send = (value) => {
      setDown(value);
      navigator.vibrate?.(value ? 15 : 0);
      act({ type: 'hold', down: value });
    };
    // Si l'onglet passe en arrière-plan ou que le doigt glisse hors du bouton, on relâche.
    useEffect(() => {
      const off = () => down && send(false);
      document.addEventListener('visibilitychange', off);
      return () => document.removeEventListener('visibilitychange', off);
    }, [down]);
    return (
      <div className="mg-soleil-duelist">
        <p className={`mg-soleil-banner ${play.sun ? 'is-sun' : ''}`}>{play.sun ? '☀️ SOLEIL ! LÂCHE !' : down ? 'Tu avances…' : 'Appuie et maintiens'}</p>
        <Tracks play={play} state={state} />
        <button
          className={`mg-hold-btn ${down ? 'is-down' : ''}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); send(true); }}
          onPointerUp={() => send(false)}
          onPointerCancel={() => send(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {down ? 'MAINTENU' : 'MAINTIENS'}
        </button>
      </div>
    );
  },
  Summary: ({ details }) => (details?.pos ? <p className="duel-cote-line">Avancée : ROUGE {Math.round(details.pos.rouge * 100)} % – {Math.round(details.pos.bleu * 100)} % BLEU</p> : null),
};
Soleil.Bettor = ({ play, state }) => (
  <div className={`mg-soleil ${play.sun ? 'is-sun' : ''}`}>
    <p className="mg-soleil-word is-small">{play.cue ? SUN_WORD[play.cue.word] : 'Prêts…'}</p>
    <Tracks play={play} state={state} />
  </div>
);

// ---------- Plateau fantôme ----------

const BODY = { rouge: '#ff4d5e', bleu: '#3c9dff', vert: '#2fd18a', jaune: '#ffc93c', violet: '#b46cff' };
const SHAPE = { rouge: 'rond', bleu: 'carre', vert: 'triangle', jaune: 'etoile', violet: 'losange' };
const CROSS_MS = 2600;

function Walker({ c, elapsed }) {
  const p = (elapsed - c.start) / CROSS_MS;
  if (p < 0 || p > 1) return null;
  const x = c.dir === 'droite' ? p : 1 - p;
  const jump = c.jumps ? Math.abs(Math.sin(p * Math.PI * 3)) * 46 : 0;
  return (
    <span className={`mg-walker shape-${SHAPE[c.color]} acc-${c.accessory} dir-${c.dir}`} style={{ left: `${4 + x * 88}%`, top: `${18 + c.lane * 26}%`, '--body': BODY[c.color], transform: `translateY(-${jump}px)` }}>
      <i className="mg-acc" />
    </span>
  );
}

function Stage({ play, state }) {
  const elapsed = useFrameElapsed(play.sceneAt, state);
  const t = Number.isFinite(elapsed) ? elapsed : play.sceneMs;
  return (
    <div className="mg-stage" aria-label="Scène : comptez bien">
      {play.scene.chars.map((c) => (
        <Walker key={c.id} c={c} elapsed={t} />
      ))}
    </div>
  );
}

function AskChoices({ play, onPick = null, blocked = false }) {
  return (
    <div className="mg-choices">
      {play.choices.map((c, i) => (
        <button key={i} className={`mg-choice ${play.shown ? (i === play.shown.right ? 'is-right' : 'is-dim') : ''}`} disabled={!onPick || blocked || !!play.shown} onClick={() => onPick?.(i)}>
          <b>{'ABCD'[i]}</b> {c}
        </button>
      ))}
    </div>
  );
}

const Plateau = {
  Tv({ play, state }) {
    return (
      <div className="mg-plateau">
        <Score a={play.score.rouge} b={play.score.bleu} />
        <p className="duel-eyebrow">Passage {play.n} · 2 points gagnent</p>
        {play.phase === 'scene' && play.scene ? (
          <>
            <Stage play={play} state={state} />
            <p className="duel-eyebrow">Regardez bien les personnages !</p>
          </>
        ) : (
          <>
            <h2 className="mg-question">{play.question}</h2>
            <AskChoices play={play} />
            {play.shown && <p className="duel-eyebrow">{play.shown.scorer ? `Point pour ${CAMP_LABEL[play.shown.scorer]} !` : play.shown.tie ? 'Égalité de vitesse !' : 'Personne ne marque'}</p>}
            {play.endsAt && (
              <TimerBar timer={{ endsAt: play.endsAt, totalMs: 7000, paused: false }} state={state} small>
                {(s) => `${s} s`}
              </TimerBar>
            )}
          </>
        )}
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const left = useBlocked(play.blockedUntil, state);
    if (play.phase === 'scene') {
      return (
        <div className="mg-plateau-wait">
          <h2>Regarde la TV !</h2>
          <p className="muted">Compte les personnages : une question arrive.</p>
        </div>
      );
    }
    return (
      <div className="mg-culture-duelist">
        <Score a={play.score.rouge} b={play.score.bleu} />
        <h2 className="mg-question is-small">{play.question}</h2>
        {left > 0 && <p className="duel-notice">Mauvaise réponse : bloqué 2 s</p>}
        <AskChoices play={play} blocked={left > 0} onPick={(i) => act({ choice: i, n: play.n })} />
      </div>
    );
  },
  Summary: ({ details }) => (details?.score ? <p className="duel-cote-line">Points : ROUGE {details.score.rouge} – {details.score.bleu} BLEU</p> : null),
};
Plateau.Bettor = ({ play, state }) =>
  play.phase === 'scene' ? (
    <p className="duel-eyebrow">Regarde la TV : compte les personnages !</p>
  ) : (
    <div className="mg-plateau">
      <Score a={play.score.rouge} b={play.score.bleu} />
      <h2 className="mg-question is-small">{play.question}</h2>
      <AskChoices play={play} />
    </div>
  );

// ---------- Course d'obstacles ----------

const LANE_W = 640;
const LANE_H = 170;
const GROUND = 130;

function useRaceFrame(play, state) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (play.startedAt == null || state?.paused) return undefined;
    let id;
    const loop = () => {
      setFrame(Math.max(0, Math.floor((serverNow(state) - play.startedAt) / DT_MS)));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [play.startedAt, state?.paused, state?.clockOffset]);
  return Math.min(frame, MAX_FRAMES);
}

/** Un couloir : le coureur reste à gauche, le décor défile. Rendu dans un canvas à partir de la simulation partagée. */
function Lane({ track, events, frame, camp, deadAt }) {
  const ref = useRef(null);
  const res = simulate(track, events, deadAt ? Math.min(frame, deadAt) : frame);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    g.clearRect(0, 0, LANE_W, LANE_H);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(0, 0, LANE_W, LANE_H);
    g.fillStyle = '#fff8f0';
    g.fillRect(0, GROUND, LANE_W, 4);
    const rx = 90;
    for (const o of track) {
      const sx = rx + (o.x - res.x);
      if (sx < -40 || sx > LANE_W + 40) continue;
      const band = o.kind === 'low' ? LOW : HIGH;
      g.fillStyle = o.kind === 'low' ? '#ffc93c' : '#b46cff';
      g.fillRect(sx, GROUND - band.top, OBS_W, band.top - band.bottom);
      g.fillStyle = '#14102a';
      g.font = 'bold 18px sans-serif';
      g.fillText(o.kind === 'low' ? '▲' : '▼', sx + 7, GROUND - band.top + 20);
    }
    const h = res.duck ? DUCK_H : STAND_H;
    g.fillStyle = camp === 'rouge' ? '#ff3b4e' : '#2f7bff';
    g.fillRect(rx, GROUND - res.y - h, RUN_W, h);
    g.fillStyle = '#fff8f0';
    g.fillRect(rx + 18, GROUND - res.y - h + 8, 6, 6);
    if (deadAt && frame >= deadAt) {
      g.fillStyle = 'rgba(20,16,42,0.55)';
      g.fillRect(0, 0, LANE_W, LANE_H);
      g.fillStyle = '#fff8f0';
      g.font = 'bold 34px sans-serif';
      g.fillText('💥 Tombé !', LANE_W / 2 - 80, 80);
    }
  });
  return <canvas ref={ref} className={`mg-lane is-${camp}`} width={LANE_W} height={LANE_H} aria-label={`Couloir ${CAMP_LABEL[camp]} : ${Math.round(res.x)} m`} />;
}

function deadFrom(play, camp, track, events, frame) {
  if (play.dead?.[camp]) return play.dead[camp];
  return simulate(track, events, frame).deadAt;
}

const Course = {
  Tv({ play, state }) {
    const track = useMemo(() => makeTrack(play.seed), [play.seed]);
    const frame = useRaceFrame(play, state);
    return (
      <div className="mg-course">
        {['rouge', 'bleu'].map((camp) => (
          <div key={camp} className="mg-course-row">
            <strong>{CAMP_LABEL[camp]}</strong>
            <Lane track={track} events={play.events[camp]} frame={frame} camp={camp} deadAt={deadFrom(play, camp, track, play.events[camp], frame)} />
          </div>
        ))}
        <p className="duel-eyebrow">Le dernier debout gagne · touche = saute, glisse vers le bas = se baisse</p>
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const track = useMemo(() => makeTrack(play.seed), [play.seed]);
    const frame = useRaceFrame(play, state);
    const [mine, setMine] = useState([]);
    const touch = useRef(null);
    const send = (k) => {
      const f = Math.max(0, Math.floor((serverNow(state) - play.startedAt) / DT_MS));
      setMine((list) => [...list, { f, k }]);
      act({ k, f });
    };
    const events = mine.length ? mine : play.events[side];
    const dead = deadFrom(play, side, track, events, frame);
    return (
      <div className="mg-course-duelist">
        <Lane track={track} events={events} frame={frame} camp={side} deadAt={dead} />
        <div
          className="mg-course-pad"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            touch.current = { y: e.clientY, ducking: false };
          }}
          onPointerMove={(e) => {
            const t = touch.current;
            if (t && !t.ducking && e.clientY - t.y > 28) {
              t.ducking = true;
              send('d1');
            }
          }}
          onPointerUp={() => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            if (t.ducking) send('d0');
            else send('j');
          }}
          onPointerCancel={() => {
            if (touch.current?.ducking) send('d0');
            touch.current = null;
          }}
        >
          <strong>TOUCHE = SAUTE</strong>
          <span>glisse vers le bas = baisse-toi</span>
        </div>
      </div>
    );
  },
  Summary: ({ details }) => (details?.distance ? <p className="duel-cote-line">Distance : ROUGE {details.distance.rouge} – {details.distance.bleu} BLEU</p> : null),
};
Course.Bettor = Course.Tv;

// ---------- Géo-duel ----------

const fmtKm = (km) => `${Math.round(km).toLocaleString('fr-FR')} km`;

/** Carte du monde simplifiée (Natural Earth, domaine public) : épingles et position exacte, zoom et déplacement au doigt. */
function WorldMap({ pins = {}, truth = null, onPlace = null, mine = null, interactive = false }) {
  const [view, setView] = useState({ x: 0, y: 0, w: MAP_W });
  const svg = useRef(null);
  const drag = useRef(null);
  const h = view.w / 2;
  const clamp = (v) => ({ w: v.w, x: Math.max(0, Math.min(MAP_W - v.w, v.x)), y: Math.max(0, Math.min(MAP_H - v.w / 2, v.y)) });
  const zoom = (f, cx = view.x + view.w / 2, cy = view.y + h / 2) => {
    const w = Math.max(125, Math.min(MAP_W, view.w * f));
    setView(clamp({ w, x: cx - ((cx - view.x) * w) / view.w, y: cy - ((cy - view.y) * w) / view.w }));
  };
  const toMap = (e) => {
    const r = svg.current.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * h };
  };
  const mark = (camp, p, key) => {
    const { x, y } = toXY(p);
    const s = view.w / 60;
    return (
      <g key={key} className={`mg-pin is-${camp}`} transform={`translate(${x} ${y})`}>
        {camp === 'rouge' ? <circle r={s} /> : <rect x={-s} y={-s} width={2 * s} height={2 * s} />}
        <text y={-s * 1.4} fontSize={s * 1.6} textAnchor="middle">
          {camp === 'rouge' ? 'R' : 'B'}
        </text>
      </g>
    );
  };
  return (
    <div className="mg-map-wrap">
      <svg
        ref={svg}
        className="mg-map"
        viewBox={`${view.x} ${view.y} ${view.w} ${h}`}
        role="img"
        aria-label="Carte du monde"
        onPointerDown={(e) => {
          if (!interactive) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.sx;
          const dy = e.clientY - d.sy;
          if (Math.abs(dx) + Math.abs(dy) > 8) d.moved = true;
          if (d.moved) {
            const r = svg.current.getBoundingClientRect();
            setView(clamp({ w: view.w, x: d.vx - (dx / r.width) * view.w, y: d.vy - (dy / r.height) * h }));
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && onPlace) onPlace(toLatLon(toMap(e).x, toMap(e).y));
        }}
      >
        <rect width={MAP_W} height={MAP_H} fill="#16335a" />
        <path d={WORLD_PATH} fill="#3d6b4f" stroke="#a8d4b8" strokeWidth={view.w / 1200} />
        {truth && (
          <g transform={`translate(${toXY(truth).x} ${toXY(truth).y})`} className="mg-truth">
            <path d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3 Z" transform={`scale(${view.w / 700})`} />
          </g>
        )}
        {Object.entries(pins).map(([camp, p]) => p && mark(camp, p, camp))}
        {mine && !Object.keys(pins).length && mark(mine.camp, mine.pin, 'mine')}
      </svg>
      {interactive && (
        <div className="mg-map-zoom">
          <button onClick={() => zoom(0.6)} aria-label="Zoom avant">+</button>
          <button onClick={() => zoom(1 / 0.6)} aria-label="Zoom arrière">−</button>
        </div>
      )}
    </div>
  );
}

const Geo = {
  Tv({ play, state }) {
    const rev = play.shown;
    return (
      <div className="mg-geo">
        <p className="duel-eyebrow">Ville {play.n} sur {play.count}</p>
        <h2 className="mg-geo-city">{rev ? rev.city : `📍 ${play.city?.nom ?? ''}`}</h2>
        {!rev && <p className="duel-eyebrow">{play.city?.pays} · Pose ton épingle sur la carte !</p>}
        <WorldMap pins={rev?.pins ?? {}} truth={rev?.truth ?? null} />
        <div className="mg-geo-status">
          {['rouge', 'bleu'].map((camp) => (
            <span key={camp} className={`is-${camp}`}>
              {CAMP_LABEL[camp]} : {rev ? fmtKm(rev.km[camp]) : play.placed[camp] ? '✔ épingle posée' : 'cherche…'}
            </span>
          ))}
        </div>
        {play.totals && <p className="duel-cote-line">Total : ROUGE {fmtKm(play.totals.rouge)} · BLEU {fmtKm(play.totals.bleu)}</p>}
        {play.deadline && (
          <TimerBar timer={{ endsAt: play.deadline, totalMs: 15000, paused: false }} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const rev = play.shown;
    return (
      <div className="mg-geo-duelist">
        <h2 className="mg-geo-city is-small">{rev ? rev.city : `📍 ${play.city?.nom ?? ''}`}</h2>
        {!rev && <p className="muted">{play.city?.pays} · touche la carte, déplace-toi, zoome avec + et −</p>}
        <WorldMap interactive={!rev} pins={rev?.pins ?? {}} truth={rev?.truth ?? null} mine={play.mine ? { camp: side, pin: play.mine } : null} onPlace={(pin) => act({ pin, n: play.n })} />
        {rev && <p className="mg-geo-status">À {fmtKm(rev.km[side])} de {rev.city}</p>}
        {play.deadline && (
          <TimerBar timer={{ endsAt: play.deadline, totalMs: 15000, paused: false }} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
      </div>
    );
  },
  Summary: ({ details }) => (details?.total ? <p className="duel-cote-line">Distance totale : ROUGE {fmtKm(details.total.rouge)} – {fmtKm(details.total.bleu)} BLEU</p> : null),
};
Geo.Bettor = ({ play }) => (
  <div className="mg-geo">
    <h2 className="mg-geo-city is-small">📍 {play.city?.nom}</h2>
    <p className="muted">{play.placed.rouge ? '✔ ROUGE a posé' : 'ROUGE cherche…'} · {play.placed.bleu ? '✔ BLEU a posé' : 'BLEU cherche…'}</p>
  </div>
);

// ---------- Qui suis-je ? ----------

function Clues({ play }) {
  return (
    <ol className="mg-qui-clues">
      {play.clues.map((c, i) => (
        <li key={i} className="pop-in">
          <b>Indice {i + 1}</b> {c}
        </li>
      ))}
      {Array.from({ length: 4 - play.clues.length }, (_, i) => (
        <li key={`x${i}`} className="is-hidden">
          <b>Indice {play.clues.length + i + 1}</b> …
        </li>
      ))}
    </ol>
  );
}

function QuiChoices({ play, onPick = null, blocked = false }) {
  return (
    <div className="mg-choices">
      {play.choices.map((c, i) => (
        <button key={i} className={`mg-choice ${play.reveal ? (i === play.reveal.right ? 'is-right' : 'is-dim') : ''}`} disabled={!onPick || blocked || !!play.reveal} onClick={() => onPick?.(i)}>
          <b>{'ABCD'[i]}</b> {c}
        </button>
      ))}
    </div>
  );
}

const Qui = {
  Tv({ play, state }) {
    // L'heure d'affichage du prochain indice : la TV se rafraîchit à chaque indice (le serveur diffuse à chaque minuteur).
    return (
      <div className="mg-qui">
        <Score a={play.score.rouge} b={play.score.bleu} unit=" pts" />
        <p className="duel-eyebrow">Énigme {play.n} · plus tu réponds tôt, plus tu gagnes de points (4, 3, 2, 1)</p>
        <Clues play={play} />
        <QuiChoices play={play} />
        {play.reveal && <p className="duel-eyebrow">C’était : {play.reveal.answer}</p>}
        <TimerBar timer={{ endsAt: play.startedAt + play.clueMs * 3 + 5000, totalMs: play.clueMs * 3 + 5000, paused: false }} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const [, tick] = useState(0);
    useEffect(() => {
      const id = setInterval(() => tick((n) => n + 1), 500);
      return () => clearInterval(id);
    }, []);
    const seen = play.clues.length;
    const blocked = play.blockedUntilClue != null && seen <= play.blockedUntilClue;
    return (
      <div className="mg-qui-duelist">
        <Score a={play.score.rouge} b={play.score.bleu} unit=" pts" />
        <Clues play={play} />
        {blocked && <p className="duel-notice">Mauvaise réponse : −1 point, bloqué jusqu’au prochain indice</p>}
        <QuiChoices play={play} blocked={blocked} onPick={(i) => act({ choice: i, n: play.n })} />
        {play.reveal && <p className="duel-eyebrow">C’était : {play.reveal.answer}</p>}
      </div>
    );
  },
  Summary: ({ details }) => (details?.score ? <p className="duel-cote-line">Points : ROUGE {details.score.rouge} – {details.score.bleu} BLEU</p> : null),
};
Qui.Bettor = ({ play }) => (
  <div className="mg-qui">
    <Score a={play.score.rouge} b={play.score.bleu} unit=" pts" />
    <Clues play={play} />
  </div>
);

// ---------- Ordre chronologique ----------

function ChronoCards({ play, onPick = null, placed = [], blocked = false, years = null }) {
  return (
    <div className="mg-chrono-cards">
      {play.cards.map((c, i) => {
        const pos = placed.indexOf(c.i);
        return (
          <button key={c.i} className={`mg-chrono-card ${pos >= 0 ? 'is-placed' : ''}`} disabled={!onPick || blocked || pos >= 0} onClick={() => onPick?.(c.i)}>
            <b>{pos >= 0 ? `${pos + 1}` : '?'}</b>
            <span>{c.texte}</span>
            {years && <em>{years[i]}</em>}
          </button>
        );
      })}
    </div>
  );
}

const Chrono = {
  Tv({ play, state }) {
    return (
      <div className="mg-chrono">
        <p className="duel-eyebrow">Touche les événements du plus ancien au plus récent · une erreur = 3 s de blocage</p>
        <ChronoCards play={play} years={play.years} />
        <div className="mg-chrono-progress">
          {['rouge', 'bleu'].map((camp) => (
            <span key={camp} className={`is-${camp}`}>
              {CAMP_LABEL[camp]} : {play.count[camp]} / 5 bien placées
            </span>
          ))}
        </div>
        <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const left = useBlocked(play.blockedUntil, state);
    return (
      <div className="mg-chrono-duelist">
        <p className="muted">Du plus ancien au plus récent : {play.mine.length} / 5</p>
        {left > 0 && <p className="duel-notice">Erreur : bloqué 3 s</p>}
        <ChronoCards play={play} placed={play.mine} blocked={left > 0} onPick={(i) => act({ card: i })} years={play.years} />
      </div>
    );
  },
  Summary: ({ details }) =>
    details?.order ? (
      <ol className="mg-chrono-order">
        {details.order.map((e) => (
          <li key={e.annee}>
            <b>{e.annee}</b> {e.texte}
          </li>
        ))}
      </ol>
    ) : null,
};
Chrono.Bettor = Chrono.Tv;

// ---------- Vrai ou Faux en survie ----------

const Vf = {
  Tv({ play, state }) {
    const r = play.reveal;
    return (
      <div className="mg-vf">
        <p className="duel-eyebrow">Affirmation {play.n} sur {play.max} · la première erreur ou absence élimine</p>
        <h2 className="mg-vf-text">{play.texte}</h2>
        <div className="mg-vf-status">
          {['rouge', 'bleu'].map((camp) => (
            <span key={camp} className={`is-${camp}`}>
              {CAMP_LABEL[camp]} : {r ? (r.ok[camp] ? '✔ juste' : '✖ éliminé') : play.answered[camp] ? '✔ a répondu' : 'réfléchit…'}
            </span>
          ))}
        </div>
        {r && (
          <p className="mg-vf-answer">
            {r.vrai ? '✔ VRAI' : '✖ FAUX'} — {r.explication}
          </p>
        )}
        {!r && (
          <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const locked = play.mine != null;
    return (
      <div className="mg-vf-duelist">
        <h2 className="mg-vf-text is-small">{play.texte}</h2>
        {['true', 'false'].map((v) => (
          <button key={v} className={`mg-vf-btn is-${v} ${play.mine === (v === 'true') ? 'is-picked' : ''}`} disabled={locked || !!play.reveal} onClick={() => act({ value: v === 'true', n: play.n })}>
            {v === 'true' ? '✔ VRAI' : '✖ FAUX'}
          </button>
        ))}
        {!play.reveal && (
          <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
        {play.reveal && <p className="duel-eyebrow">{play.reveal.vrai ? '✔ C’était VRAI' : '✖ C’était FAUX'}</p>}
      </div>
    );
  },
  Summary: ({ details }) => (details?.statements ? <p className="duel-cote-line">{details.statements} affirmation{details.statements > 1 ? 's' : ''} jouée{details.statements > 1 ? 's' : ''}</p> : null),
};
Vf.Bettor = ({ play }) => (
  <div className="mg-vf">
    <h2 className="mg-vf-text is-small">{play.texte}</h2>
    {play.reveal && <p className="mg-vf-answer">{play.reveal.vrai ? '✔ VRAI' : '✖ FAUX'}</p>}
  </div>
);

export const MG_VIEWS_2 = { defuse: Defuse, code: Code, simon2: Simon2, crash: Crash, dilemme: Dilemme, soleil: Soleil, plateau: Plateau, course: Course, geo: Geo, quisuisje: Qui, chrono: Chrono, vf: Vf };
export { CAMP_LABEL, Score, useBlocked };
