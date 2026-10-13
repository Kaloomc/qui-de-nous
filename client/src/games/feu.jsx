import { useEffect, useState } from 'react';
import { Avatar, PlayerChip, TimerBar } from '../components.jsx';
import { StatBoard } from '../sips.jsx';
import { sounds, unlockAudio } from '../sound.js';
import { getVolume, isSpeechUnlocked, preloadVoices, setVolume, speak, unlockSpeech, useSpeechStatus } from '../speech.js';

export const id = 'feu';
export const waitingText = 'Doigt prêt…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Manche suivante';

const FEU = 'FEU';
/** Une animation et une couleur différentes à chaque mot. */
const EFFECTS = ['fx-slam', 'fx-spin', 'fx-drop', 'fx-stretch', 'fx-skew', 'fx-zoomout', 'fx-wobble'];
const WORD_COLORS = ['#3ee0c5', '#ffc93c', '#6c8bff', '#ff8a3d', '#b46cff', '#7ee05a', '#ff4f8b'];

const byIdOf = (state) => new Map(state.players.map((p) => [p.id, p]));
const vibrate = (pattern) => navigator.vibrate?.(pattern);

function SoundSetup() {
  const status = useSpeechStatus();
  const [on, setOn] = useState(isSpeechUnlocked);
  const [volume, setVol] = useState(getVolume);
  useEffect(() => {
    preloadVoices();
  }, []);
  function activate() {
    unlockAudio();
    unlockSpeech();
    setOn(true);
    setTimeout(() => speak('Prêts ?'), 150);
  }
  return (
    <div className="feu-sound">
      {!on && (
        <button className="btn btn-secondary btn-xl" onClick={activate}>
          Activer le son
        </button>
      )}
      {status === 'ok' && on && <p className="feu-sound-ok">Voix prête</p>}
      {status === 'none' && <p className="feu-sound-warn">Pas de voix française sur ce navigateur : les mots seront seulement affichés.</p>}
      {status === 'ok' && (
        <label className="feu-volume">
          Volume de la voix
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVol(v);
              setVolume(v);
            }}
            onPointerUp={() => speak('Feuille')}
          />
        </label>
      )}
    </div>
  );
}

/** Décor de duel (désert, soleil, deux cowboys en silhouette), derrière l'écran « Prêts ? » et les mots. */
function DuelScene({ dim = false }) {
  return (
    <svg className={`duel-scene ${dim ? 'is-dim' : ''}`} viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="duel-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc93c" />
          <stop offset="100%" stopColor="#ff7a59" />
        </radialGradient>
      </defs>
      <circle cx="800" cy="450" r="120" fill="url(#duel-sun)" opacity="0.8" />
      <path d="M0 470 Q 300 420 620 455 T 1600 440 V 600 H 0 Z" fill="#2a1d4f" />
      <path d="M0 520 Q 400 480 820 510 T 1600 500 V 600 H 0 Z" fill="#1f1640" />
      <g fill="#120c26">
        <path d="M280 470 h70 v-100 c0 -20 -10 -30 -35 -30 c-25 0 -35 10 -35 30 Z" />
        <circle cx="315" cy="322" r="20" />
        <path d="M268 305 h94 l-14 -8 h-14 l-6 -26 h-26 l-6 26 h-14 Z" />
        <path d="M350 380 l48 -10 v10 l-48 12 Z" />
        <path d="M1320 470 h-70 v-100 c0 -20 10 -30 35 -30 c25 0 35 10 35 30 Z" />
        <circle cx="1285" cy="322" r="20" />
        <path d="M1332 305 h-94 l14 -8 h14 l6 -26 h26 l6 26 h14 Z" />
        <path d="M1250 380 l-48 -10 v10 l48 12 Z" />
        <path d="M120 470 v-90 h16 v40 h18 v-60 h16 v110 Z" />
        <path d="M1460 470 v-70 h14 v30 h16 v-46 h14 v86 Z" />
      </g>
    </svg>
  );
}

/** « X a tiré trop tôt ! » : les faux départs s'affichent sur la TV dès qu'ils arrivent. */
function FalseStarts({ state }) {
  const byId = byIdOf(state);
  const ids = state.round.falseStartIds ?? [];
  if (ids.length === 0) return null;
  return (
    <div className="feu-busted-list">
      {ids.map((pid) => {
        const p = byId.get(pid);
        return p ? (
          <div key={pid} className="feu-busted">
            <Avatar player={p} size={56} />
            <span>
              <strong>{p.name}</strong> a tiré trop tôt !
            </span>
          </div>
        ) : null;
      })}
    </div>
  );
}

function WordStage({ round, gameAct }) {
  const isFeu = round.word === FEU;
  // Le flash et les flammes du « FEU » ne partent qu'une fois la voix lancée : aucun indice avant.
  const [feuLive, setFeuLive] = useState(false);
  useEffect(() => {
    setFeuLive(false);
    if (!round.word) return;
    speak(isFeu ? 'Feu !' : round.word, {
      onStart: isFeu
        ? () => {
            setFeuLive(true);
            sounds.fire();
            gameAct({ type: 'spoken', index: round.index });
          }
        : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.index]);

  if (!round.word) {
    return (
      <div className="feu-stage">
        <p className="feu-word feu-ready pulse-text">Prêts…</p>
      </div>
    );
  }
  return (
    <div className="feu-stage">
      {isFeu && feuLive && (
        <>
          <div key={`flash-${round.index}`} className="feu-flash" aria-hidden="true" />
          <div className="feu-flames" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ left: `${(i * 7.4) % 100}%`, animationDelay: `${(i % 5) * 0.09}s` }} />
            ))}
          </div>
        </>
      )}
      <p
        key={round.index}
        className={`feu-word ${isFeu && feuLive ? 'fx-feu' : EFFECTS[round.index % EFFECTS.length]}`}
        style={isFeu && feuLive ? undefined : { color: WORD_COLORS[(round.index * 3) % WORD_COLORS.length] }}
      >
        {round.word}
      </p>
    </div>
  );
}

export function HostQuestion({ state, gameAct }) {
  const { round } = state;
  if (round.step === 'ready') {
    return (
      <div className="feu feu-duel">
        <DuelScene />
        <p className="round">Manche {round.number} · Réflexes</p>
        <h1 className="question-text slide-in">
          Prêts ? Dégainez seulement quand j’entends… <span className="feu-inline">FEU</span>
        </h1>
        <p className="lead">Méfie-toi de « feuille », « fichier », « fou »… Tirer trop tôt fait boire, le plus lent aussi.</p>
        <SoundSetup />
        <TimerBar timer={round.startTimer} state={state}>
          {(s) => `C’est parti dans ${s} s`}
        </TimerBar>
        <button
          className="btn btn-primary btn-xl pulse"
          onClick={() => {
            if (!isSpeechUnlocked()) unlockSpeech();
            gameAct({ type: 'start' });
          }}
        >
          C’est parti !
        </button>
      </div>
    );
  }
  const total = state.players.filter((p) => p.connected).length;
  return (
    <div className="feu feu-running feu-duel">
      <DuelScene dim />
      <WordStage round={round} gameAct={gameAct} />
      <FalseStarts state={state} />
      <p className="muted">
        {round.tappedIds.length} / {total} ont tiré
      </p>
    </div>
  );
}

export function HostReveal({ state }) {
  useEffect(() => {
    sounds.drumroll(state.reveal.durationMs - 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="feu">
      <p className="round">Manche {state.round.number} · Réflexes</p>
      <p className="announce">Et le plus lent est…</p>
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  const byId = byIdOf(state);
  const losers = results.loserIds.map((pid) => byId.get(pid)).filter(Boolean);
  return (
    <div className="feu">
      <p className="round">Manche {round.number} · Réflexes</p>
      <div className="feu-sequence fade-up">
        {results.words.map((w, i) => (
          <span key={i} className={`mode-pill ${i === results.feuIndex ? 'feu-pill' : ''}`}>
            {w}
          </span>
        ))}
      </div>
      <ol className="feu-ranking">
        {results.ranking.map((r, i) => {
          const p = byId.get(r.id);
          if (!p) return null;
          const last = results.lastIds.includes(r.id);
          return (
            <li key={r.id} className={`land ${last ? 'is-last' : ''} ${i === 0 ? 'is-first' : ''}`} style={{ animationDelay: `${200 + i * 150}ms` }}>
              <span className="ranking-rank">{i + 1}</span>
              <Avatar player={p} size={52} />
              <span className="ranking-name">{p.name}</span>
              <span className="feu-ms">{r.ms} ms</span>
              {last && <span className="feu-tag">le plus lent</span>}
              {i === 0 && !last && <span className="feu-tag feu-tag-win">le plus rapide</span>}
            </li>
          );
        })}
      </ol>
      {(results.falseStarts.length > 0 || results.missed.length > 0) && (
        <div className="vote-tally fade-up" style={{ animationDelay: '600ms' }}>
          {results.falseStarts.map((f) =>
            byId.get(f.id) ? <PlayerChip key={f.id} player={byId.get(f.id)} size={60} badge="!" caption={f.word ? `faux départ sur « ${f.word} »` : 'faux départ'} /> : null,
          )}
          {results.missed.map((pid) => (byId.get(pid) ? <PlayerChip key={pid} player={byId.get(pid)} size={60} badge="?" caption="pas tapé" /> : null))}
        </div>
      )}
      <p className="verdict-line fade-up" style={{ animationDelay: '900ms' }}>
        {results.allFalseStart ? (
          <>
            Tout le monde a tiré trop tôt ! Chacun boit pour son faux départ, et <strong>on rejoue</strong>.
          </>
        ) : losers.length ? (
          <>
            Boivent : <strong>{losers.map((p) => p.name).join(', ')}</strong>
          </>
        ) : (
          'Réflexes parfaits : personne ne boit !'
        )}
      </p>
    </div>
  );
}

export function PlayerRound({ state, me, act }) {
  const { round } = state;
  const [tapped, setTapped] = useState(false);
  useEffect(() => setTapped(false), [round.number]);

  if (!round.playing) {
    return (
      <div className="center">
        <h1>Manche en cours</h1>
        <p className="lead">Tu joues à la prochaine !</p>
      </div>
    );
  }
  if (round.myTap) {
    return (
      <div className={`verdict ${round.myTap.early ? 'verdict-drink' : 'verdict-safe'}`}>
        <p className="verdict-title zoom-in">{round.myTap.early ? 'Raté !' : 'Tapé !'}</p>
        <p className="verdict-detail">{round.myTap.early ? 'Tu as tiré trop tôt : ce n’était pas « feu »… Tu bois.' : 'Résultats sur la TV.'}</p>
      </div>
    );
  }
  const ready = round.step === 'running';
  return (
    <button
      className={`feu-button ${ready ? '' : 'is-waiting'}`}
      disabled={!ready || tapped}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!ready || tapped) return;
        setTapped(true);
        vibrate(60);
        act({ type: 'tap' }).then((error) => error && setTapped(false));
      }}
    >
      <span>{ready ? 'FEU' : 'Attention…'}</span>
      <small>{ready ? 'Seulement au vrai « feu » !' : 'Pose ton doigt, pas trop près'}</small>
    </button>
  );
}

export function PlayerReveal() {
  return (
    <div className="center suspense">
      <div className="suspense-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <h1>Qui a été le plus lent ?</h1>
      <p className="lead">Les yeux sur l’écran !</p>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  const falseStart = results.falseStarts.find((f) => f.id === me.id);
  if (falseStart) {
    const detail = falseStart.word && falseStart.word !== FEU ? `Tu as tiré sur « ${falseStart.word} ».` : 'Tu as tiré trop tôt.';
    return { drinks: true, title: 'Raté !', detail: results.allFalseStart ? `${detail} Tout le monde aussi : on rejoue !` : detail };
  }
  if (results.missed.includes(me.id)) return { drinks: true, title: 'Tu bois !', detail: 'Tu n’as pas tapé.' };
  const rank = results.ranking.findIndex((r) => r.id === me.id);
  if (rank < 0) return { drinks: false, title: 'Pas joué', detail: 'Tu joues à la prochaine manche.' };
  const { ms } = results.ranking[rank];
  if (results.lastIds.includes(me.id)) return { drinks: true, title: 'Le plus lent !', detail: `${ms} ms. Réveille-toi !` };
  return { drinks: false, title: rank === 0 ? 'Le plus rapide !' : 'Sauvé !', detail: `${ms} ms · ${rank + 1}${rank === 0 ? 'er' : 'e'}` };
}

export function EndStats({ state }) {
  return <StatBoard state={state} title="Réflexes d’acier" valueOf={(s) => s.fastest} format={(n) => `${n} fois le plus rapide`} />;
}
