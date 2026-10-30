// Vues des mini-jeux de la partie 2 du mode Duel (même contrat que duelMinigames.jsx : Tv, Duelist, Bettor, Summary).
import { useEffect, useState } from 'react';
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

export const MG_VIEWS_2 = { defuse: Defuse, code: Code, simon2: Simon2, crash: Crash, dilemme: Dilemme, soleil: Soleil, plateau: Plateau };
export { CAMP_LABEL, Score, useBlocked };
