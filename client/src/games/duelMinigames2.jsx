// Vues des mini-jeux de la partie 2 du mode Duel (même contrat que duelMinigames.jsx : Tv, Duelist, Bettor, Summary).
import { useEffect, useMemo, useRef, useState } from 'react';
import { WorldMap } from './duelMap.jsx';
import { DT_MS, DUCK_H, HIGH, LOW, MAX_FRAMES, OBS_W, RUN_W, STAND_H, makeTrack, simulate } from '../../../shared/runner.js';
import { TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';
import { preloadVoices, speakQueued, useSpeechStatus } from '../speech.js';
import { useFrameElapsed } from './duelFx.js';
import { PenaltyBadge, TvWrongs, usePenalty } from './duelPenalty.jsx';

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

function Wire({ wire, onCut = null, cut = false, solution = false, wrong = false }) {
  return (
    <button
      className={`mg-wire is-${wire.pattern} ${solution ? 'is-solution' : ''} ${cut ? 'is-cut' : ''} ${wrong ? 'is-wrong' : ''}`}
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

function Bomb({ play, onCut = null, blocked = false, wrong = null }) {
  return (
    <div className="mg-defuse">
      <ol className="mg-clues">
        {play.clues.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="mg-wires">
        {play.wires.map((w) => (
          <Wire key={w.n} wire={w} onCut={blocked ? null : onCut} solution={play.cut === w.n - 1} wrong={wrong === w.n - 1} />
        ))}
      </div>
    </div>
  );
}

const Defuse = {
  Tv({ play, state, round }) {
    return (
      <div className="mg-defuse-tv">
        <TvWrongs wrongs={play.wrong} ms={round?.mg?.penaltyMs} />
        <p className="mg-wrongs">
          <span className="is-rouge">ROUGE · fils ratés : {play.wrong.rouge} / 1</span>
          <span className="is-bleu">BLEU · fils ratés : {play.wrong.bleu} / 1</span>
        </p>
        <p className="duel-eyebrow">Coupe le bon fil le premier</p>
        <Bomb play={play} />
        <TimerBar timer={{ endsAt: play.startedAt + play.limitMs, totalMs: play.limitMs, paused: false }} state={state} small>
          {(s) => `${s} s avant l’explosion`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act, state, round }) {
    const pen = usePenalty(play.blockedUntil, state);
    return (
      <div className="mg-defuse-duelist">
        <PenaltyBadge left={pen.left} flash={pen.flash} ms={round?.mg?.penaltyMs} />
        <Bomb play={play} wrong={pen.wrong} onCut={(i) => { pen.mark(i); act({ wire: i }); }} blocked={pen.left > 0} />
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
const MARK = { G: { icon: '✓', label: 'bien placé' }, O: { icon: '↔', label: 'mal placé' }, X: { icon: '✕', label: 'absent' } };

function Sym({ i, onClick = null, big = false, disabled = false }) {
  const s = SYMS[i];
  return (
    <button className={`mg-sym ${big ? 'is-big' : ''}`} style={{ '--sym': s.color }} disabled={!onClick || disabled} onClick={onClick} aria-label={s.name}>
      {s.shape}
    </button>
  );
}

/** Une case de retour façon Wordle : vert (✓ bien placé), orange (↔ mal placé), gris (✕ absent) ; l'icône évite de dépendre de la couleur. */
function Tile({ mark, symbol = null, big = false }) {
  const s = symbol != null ? SYMS[symbol] : null;
  return (
    <span className={`mg-tile is-${mark} ${big ? 'is-big' : ''}`} role="img" aria-label={`${s ? `${s.name}, ` : ''}${MARK[mark].label}`}>
      {s && <b style={{ color: s.color }}>{s.shape}</b>}
      <i>{MARK[mark].icon}</i>
    </span>
  );
}

const Code = {
  Tv({ play, state }) {
    // Grandes grilles de retour (cases colorées) ; les symboles proposés ne sont jamais montrés à l'écran commun.
    return (
      <div className="mg-code-tv">
        <div className="mg-code-cols">
          {['rouge', 'bleu'].map((camp) => (
            <div key={camp} className={`mg-code-col is-${camp}`}>
              <strong>{CAMP_LABEL[camp]}</strong>
              <div className="mg-code-grid">
                {Array.from({ length: play.max }, (_, r) => (
                  <div key={r} className="mg-code-line">
                    {play.grids[camp][r] ? play.grids[camp][r].map((m, k) => <Tile key={k} mark={m} big />) : Array.from({ length: play.length }, (_, k) => <span key={k} className="mg-tile is-empty is-big" />)}
                  </div>
                ))}
              </div>
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
    // Chaque symbole ne peut être posé qu'une fois dans un essai (le code n'a jamais deux symboles identiques).
    const add = (i) => guess.length < play.length && !guess.includes(i) && setGuess([...guess, i]);
    return (
      <div className="mg-code-duelist">
        <div className="mg-code-history">
          {tries.map((t, i) => (
            <div key={i} className="mg-code-row">
              {t.guess.map((g, k) => <Tile key={k} mark={t.fb.marks[k]} symbol={g} />)}
            </div>
          ))}
        </div>
        <p className="muted">Essai {Math.min(tries.length + 1, play.max)} sur {play.max} · ✓ bien placé · ↔ mal placé · ✕ absent</p>
        <div className="mg-code-slots">
          {Array.from({ length: play.length }, (_, k) => (
            <button key={k} className="mg-slot" onClick={() => setGuess(guess.filter((_, j) => j !== k))} aria-label={guess[k] != null ? `Retirer ${SYMS[guess[k]].name}` : 'Case vide'}>
              {guess[k] != null ? <span style={{ color: SYMS[guess[k]].color }}>{SYMS[guess[k]].shape}</span> : '·'}
            </button>
          ))}
        </div>
        <div className="mg-code-palette">
          {SYMS.map((_, i) => <Sym key={i} i={i} big disabled={over || guess.includes(i)} onClick={over ? null : () => add(i)} />)}
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

/** Multiplicateur affiché : e^(rate · t), figé à la valeur d'explosion. Renvoie aussi le temps écoulé pour la courbe. */
function useMultiplier(play, state) {
  const elapsed = useFrameElapsed(play.phase === 'run' ? play.startedAt : null, state);
  if (play.crashed != null) return { m: play.crashed, t: Math.log(play.crashed) / play.rate };
  if (elapsed == null || elapsed === Infinity) return { m: 1, t: 0 };
  return { m: Math.exp(play.rate * elapsed), t: elapsed };
}
const fmtX = (x) => `${(Math.floor(x * 100) / 100).toFixed(2).replace('.', ',')}x`;

/** Courbe qui monte derrière le gros chiffre (échelle logarithmique : de 1x à 20x). */
function CrashCurve({ play, t, heat }) {
  const W = 600;
  const H = 300;
  const tMax = Math.log(20) / play.rate;
  const pts = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const tt = (t * i) / steps;
    pts.push(`${((tt / tMax) * W).toFixed(1)},${(H - ((play.rate * tt) / Math.log(20)) * H).toFixed(1)}`);
  }
  return (
    <svg className="mg-crash-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={`hsl(${170 - heat * 170} 90% 55%)`} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function CrashBoard({ play, state, big = true }) {
  const { m, t } = useMultiplier(play, state);
  const boom = play.crashed != null;
  const heat = Math.min(1, Math.log(m) / Math.log(20)); // 0 = froid, 1 = brûlant
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shake = boom || reduce ? 0 : heat * 7;
  return (
    <div className={`mg-crash ${boom ? 'is-boom' : ''} ${big ? '' : 'is-small'}`} style={{ '--heat': heat }}>
      <CrashCurve play={play} t={t} heat={heat} />
      <p className="mg-crash-x" style={{ color: boom ? undefined : `hsl(${170 - heat * 170} 90% 58%)`, transform: `translate(${(Math.sin(t / 23) * shake).toFixed(1)}px, ${(Math.cos(t / 17) * shake).toFixed(1)}px)` }}>
        {boom ? '💥 ' : ''}{fmtX(m)}
      </p>
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
        <p className="duel-eyebrow">{play.sun ? 'LÂCHEZ TOUT !' : 'Maintiens… sauf à « Soleil »'}</p>
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

const ANIMAL_NAME = { dog: 'chien', cat: 'chat', frog: 'grenouille', fox: 'renard', panda: 'panda', monkey: 'singe', lion: 'lion', pig: 'cochon', octopus: 'poulpe', penguin: 'manchot', unicorn: 'licorne', tiger: 'tigre' };
const Animal = ({ id, size = 120 }) => <img className="mg-animal" src={`/twemoji/${id}.svg`} width={size} height={size} alt={ANIMAL_NAME[id] ?? id} draggable={false} />;

/** Scène lente et claire : les animaux se montrent, le rideau tombe, un animal part ou arrive ; ou bien ils défilent derrière le rideau. */
function Stage({ play, state }) {
  const elapsed = useFrameElapsed(play.sceneAt, state);
  const t = Number.isFinite(elapsed) ? elapsed : play.sceneMs;
  const sc = play.scene;
  if (sc.kind === 'compte') {
    const CROSS = 2400;
    return (
      <div className="mg-stage is-count" aria-label="Des animaux passent derrière le rideau">
        {sc.walkers.map((a, i) => {
          const p = (t - 300 - i * 1100) / CROSS;
          if (p < 0 || p > 1) return null;
          return (
            <span key={i} className="mg-walker-img" style={{ left: `${p * 100}%` }}>
              <Animal id={a} size={150} />
            </span>
          );
        })}
        <div className="mg-curtain is-fixed" aria-hidden="true">
          🎭
        </div>
      </div>
    );
  }
  const shown = t < 4300 ? sc.before : sc.after;
  const curtain = t >= 3200 && t < 6000;
  return (
    <div className="mg-stage is-row">
      <div className="mg-row">
        {shown.map((a) => (
          <Animal key={a} id={a} size={150} />
        ))}
      </div>
      <div className={`mg-curtain ${curtain ? 'is-down' : ''}`} aria-hidden="true">
        🎭
      </div>
    </div>
  );
}

function AskChoices({ play, onPick = null, blocked = false, wrong = null }) {
  return (
    <div className="mg-choices is-picto">
      {play.choices.map((c, i) => (
        <button key={i} className={`mg-choice ${play.shown ? (i === play.shown.right ? 'is-right' : 'is-dim') : ''} ${wrong === i ? 'is-wrong' : ''}`} disabled={!onPick || blocked || !!play.shown} onClick={() => onPick?.(i)} aria-label={c.img ? ANIMAL_NAME[c.img] : c.text}>
          <b>{'ABCD'[i]}</b>
          {c.img ? <Animal id={c.img} size={84} /> : <span className="mg-choice-num">{c.text}</span>}
        </button>
      ))}
    </div>
  );
}

const Plateau = {
  Tv({ play, state, round }) {
    return (
      <div className="mg-plateau">
        <TvWrongs wrongs={play.wrongs} ms={round?.mg?.penaltyMs} />
        <Score a={play.score.rouge} b={play.score.bleu} />
        <p className="duel-eyebrow">Première équipe à 2 points</p>
        {play.phase === 'scene' && play.scene ? (
          <Stage play={play} state={state} />
        ) : (
          <>
            <h2 className="mg-question">{play.question}</h2>
            <AskChoices play={play} />
            {play.shown && <p className="duel-eyebrow">{play.shown.scorer ? `Point pour ${CAMP_LABEL[play.shown.scorer]} !` : play.shown.tie ? 'Égalité de vitesse !' : 'Personne ne marque'}</p>}
            {play.endsAt && (
              <TimerBar timer={{ endsAt: play.endsAt, totalMs: 9000, paused: false }} state={state} small>
                {(s) => `${s} s`}
              </TimerBar>
            )}
          </>
        )}
      </div>
    );
  },
  Duelist({ play, act, state, round }) {
    const pen = usePenalty(play.blockedUntil, state);
    if (play.phase === 'scene') {
      return (
        <div className="mg-plateau-wait">
          <h2>Regarde la TV !</h2>
          <p className="muted">Une question arrive juste après.</p>
        </div>
      );
    }
    return (
      <div className="mg-culture-duelist">
        <Score a={play.score.rouge} b={play.score.bleu} />
        <h2 className="mg-question is-small">{play.question}</h2>
        <PenaltyBadge left={pen.left} flash={pen.flash} ms={round?.mg?.penaltyMs} />
        <AskChoices play={play} blocked={pen.left > 0} wrong={pen.wrong} onPick={(i) => { pen.mark(i); act({ choice: i, n: play.n }); }} />
        {play.shown && <p className="duel-eyebrow">{play.shown.scorer ? `Point pour ${CAMP_LABEL[play.shown.scorer]}` : 'Pas de point'}</p>}
      </div>
    );
  },
  Summary: ({ details }) => (details?.score ? <p className="duel-cote-line">Points : ROUGE {details.score.rouge} – {details.score.bleu} BLEU</p> : null),
};
Plateau.Bettor = Plateau.Tv;

// ---------- Course d'obstacles ----------

// Dessins pixel-art originaux (un dino qui court, saute et se baisse ; cactus ; ptérodactyle). Chaque chaîne est une ligne : « # » = pixel plein.
const DINO_A = ['......#####...', '.....#######..', '.....##.#####.', '.....#########', '.....#####....', '#...######....', '##.#######....', '###########...', '.#########....', '..#######.....', '...#####......', '...##..##.....', '...#....#.....', '...##...##....'];
const DINO_B = ['......#####...', '.....#######..', '.....##.#####.', '.....#########', '.....#####....', '#...######....', '##.#######....', '###########...', '.#########....', '..#######.....', '...#####......', '...##..##.....', '...##...#.....', '....##..##....'];
const DINO_DUCK = ['..............#####.', '.............#######', '.............##.####', '..............######', '#...##########......', '##.############.....', '###############.....', '.#############......', '..####..##..##......'];
const PTERO_UP = ['......#.........', '.....##.......#.', '....###......##.', '...####.....###.', '..#########.###.', '.############.##', '..###########...', '....#######.....', '.....##.##......'];
const PTERO_DOWN = ['................', '................', '..#.........#...', '.###.......###..', '..###########.##', '.#############.#', '..###########...', '....#######..#..', '.....##.##...##.'];

function pixels(g, rows, x, y, px, color) {
  g.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === '#') g.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
  });
}

/** Cactus (trois variétés de tailles) dessiné dans la boîte de 30 × 40 de l'obstacle au sol. */
function cactus(g, x, ground, kind) {
  g.fillStyle = '#4fbf6a';
  const stem = (cx, h, w = 8) => {
    g.fillRect(cx, ground - h, w, h);
    g.fillRect(cx - 7, ground - h * 0.65, 7, 6);
    g.fillRect(cx - 7, ground - h * 0.65 - 12, 6, 12);
    g.fillRect(cx + w, ground - h * 0.5, 7, 6);
    g.fillRect(cx + w + 1, ground - h * 0.5 - 14, 6, 14);
  };
  if (kind === 0) stem(x + 11, 40);
  else if (kind === 1) {
    stem(x + 5, 28, 6);
    stem(x + 21, 36, 6);
  } else {
    g.fillRect(x + 2, ground - 22, 7, 22);
    g.fillRect(x + 12, ground - 40, 7, 40);
    g.fillRect(x + 22, ground - 26, 7, 26);
  }
}

const LANE = { tv: { w: 640, h: 200, ground: 160, ahead: 90 }, phone: { w: 440, h: 300, ground: 240, ahead: 70 } };

/** Un couloir : le coureur reste à gauche, le décor défile (sol, nuages, obstacles). Rendu dans un canvas à partir de la simulation partagée. */
function Lane({ track, events, frame, camp, deadAt, big = false }) {
  const ref = useRef(null);
  const L = big ? LANE.phone : LANE.tv;
  const px = big ? 3 : 2.2;
  const res = simulate(track, events, deadAt ? Math.min(frame, deadAt) : frame);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, L.h);
    sky.addColorStop(0, '#2d2466');
    sky.addColorStop(1, '#4a3a8f');
    g.fillStyle = sky;
    g.fillRect(0, 0, L.w, L.h);
    // Nuages : défilement lent (effet de profondeur).
    g.fillStyle = 'rgba(255,248,240,0.22)';
    for (let i = 0; i < 6; i++) {
      const cx = (((i * 173 + 40 - res.x * 0.12) % (L.w + 120)) + (L.w + 120)) % (L.w + 120) - 60;
      const cy = 20 + ((i * 53) % (L.h * 0.35));
      g.fillRect(cx, cy, 54, 12);
      g.fillRect(cx + 10, cy - 9, 32, 10);
    }
    // Sol qui défile.
    g.fillStyle = '#fff8f0';
    g.fillRect(0, L.ground, L.w, 3);
    g.fillStyle = 'rgba(255,248,240,0.55)';
    for (let i = 0; i < 16; i++) {
      const gx = (((i * 61 - res.x) % (L.w + 60)) + (L.w + 60)) % (L.w + 60) - 30;
      g.fillRect(gx, L.ground + 10 + (i % 3) * 8, 14 + (i % 4) * 5, 3);
    }
    const rx = L.ahead;
    const flap = Math.floor(frame / 8) % 2;
    for (const o of track) {
      const sx = rx + (o.x - res.x);
      if (sx < -60 || sx > L.w + 60) continue;
      if (o.kind === 'low') cactus(g, sx, L.ground, Math.floor(o.x / 7) % 3);
      else pixels(g, flap ? PTERO_UP : PTERO_DOWN, sx - 4, L.ground - HIGH.top - 4, px * 1.05, '#d9b3ff');
    }
    const color = camp === 'rouge' ? '#ff5a6b' : '#5a9bff';
    const jumping = res.y > 0;
    const step = Math.floor(frame / 5) % 2;
    if (res.duck) pixels(g, DINO_DUCK, rx - 6, L.ground - DUCK_H - res.y - 4, px, color);
    else pixels(g, jumping || step ? DINO_A : DINO_B, rx - 6, L.ground - 14 * px - res.y + 4, px, color);
    if (deadAt && frame >= deadAt) {
      g.fillStyle = 'rgba(20,16,42,0.6)';
      g.fillRect(0, 0, L.w, L.h);
      g.fillStyle = '#fff8f0';
      g.font = `bold ${big ? 44 : 34}px sans-serif`;
      g.textAlign = 'center';
      g.fillText('💥 Tombé !', L.w / 2, L.h / 2 - 10);
    }
  });
  return <canvas ref={ref} className={`mg-lane is-${camp} ${big ? 'is-big' : ''}`} width={L.w} height={L.h} aria-label={`Couloir ${CAMP_LABEL[camp]} : ${Math.round(res.x)} m`} />;
}

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
        <p className="duel-eyebrow">Le dernier debout gagne</p>
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const track = useMemo(() => makeTrack(play.seed), [play.seed]);
    const frame = useRaceFrame(play, state);
    const [mine, setMine] = useState([]);
    const ducking = useRef(false);
    const send = (k) => {
      const f = Math.max(0, Math.floor((serverNow(state) - play.startedAt) / DT_MS));
      setMine((list) => [...list, { f, k }]);
      act({ k, f });
    };
    const jump = () => send('j');
    const duck = (on) => {
      if (ducking.current === on) return;
      ducking.current = on;
      send(on ? 'd1' : 'd0');
    };
    // Au clavier (PC) : barre d'espace ou flèche haut = sauter, flèche bas = se baisser.
    useEffect(() => {
      const down = (e) => {
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'ArrowUp') {
          e.preventDefault();
          jump();
        } else if (e.code === 'ArrowDown') {
          e.preventDefault();
          duck(true);
        }
      };
      const up = (e) => e.code === 'ArrowDown' && duck(false);
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
      };
    });
    const events = mine.length ? mine : play.events[side];
    const dead = deadFrom(play, side, track, events, frame);
    return (
      <div className="mg-course-duelist">
        <Lane big track={track} events={events} frame={frame} camp={side} deadAt={dead} />
        <div className="mg-course-buttons">
          <button className="mg-run-btn is-jump" onPointerDown={(e) => { e.preventDefault(); jump(); }} onContextMenu={(e) => e.preventDefault()}>
            ⬆ SAUTER
          </button>
          <button
            className="mg-run-btn is-duck"
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); duck(true); }}
            onPointerUp={() => duck(false)}
            onPointerCancel={() => duck(false)}
            onPointerLeave={() => duck(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            ⬇ SE BAISSER
          </button>
        </div>
      </div>
    );
  },
  Summary: ({ details }) => (details?.distance ? <p className="duel-cote-line">Distance : ROUGE {details.distance.rouge} – {details.distance.bleu} BLEU</p> : null),
};
Course.Bettor = Course.Tv;

// ---------- Géo-duel ----------

const fmtKm = (km) => `${Math.round(km).toLocaleString('fr-FR')} km`;

const Geo = {
  Tv({ play, state }) {
    const rev = play.shown;
    return (
      <div className="mg-geo">
        <p className="duel-eyebrow">Ville {play.n} sur {play.count}</p>
        <h2 className="mg-geo-city">{rev ? rev.city : `📍 ${play.city?.nom ?? ''}`}</h2>
        {!rev && <p className="duel-eyebrow">{play.city?.pays} · Pose ton épingle sur la carte !</p>}
        <WorldMap pins={rev?.pins ?? {}} truth={rev?.truth ?? null} km={rev?.km ?? null} />
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
        <WorldMap interactive={!rev} pins={rev?.pins ?? {}} truth={rev?.truth ?? null} km={rev?.km ?? null} mine={play.mine ? { camp: side, pin: play.mine } : null} onPlace={(pin) => act({ pin, n: play.n })} />
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
        <p className="duel-eyebrow">Énigme {play.n} · réponds tôt pour gagner plus</p>
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

function ChronoCards({ play, onPick = null, placed = [], blocked = false, years = null, wrong = null }) {
  return (
    <div className="mg-chrono-cards">
      {play.cards.map((c, i) => {
        const pos = placed.indexOf(c.i);
        return (
          <button key={c.i} className={`mg-chrono-card ${pos >= 0 ? 'is-placed' : ''} ${wrong === c.i ? 'is-wrong' : ''}`} disabled={!onPick || blocked || pos >= 0} onClick={() => onPick?.(c.i)}>
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
  Tv({ play, state, round }) {
    return (
      <div className="mg-chrono">
        <TvWrongs wrongs={play.wrongs} ms={round?.mg?.penaltyMs} />
        <p className="duel-eyebrow">Du plus ancien au plus récent</p>
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
  Duelist({ play, act, state, round }) {
    const pen = usePenalty(play.blockedUntil, state);
    return (
      <div className="mg-chrono-duelist">
        <p className="muted">Du plus ancien au plus récent : {play.mine.length} / 5</p>
        <PenaltyBadge left={pen.left} flash={pen.flash} ms={round?.mg?.penaltyMs} />
        <ChronoCards play={play} placed={play.mine} blocked={pen.left > 0} wrong={pen.wrong} onPick={(i) => { pen.mark(i); act({ card: i }); }} years={play.years} />
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
        <p className="duel-eyebrow">Affirmation {play.n} sur {play.max}</p>
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
