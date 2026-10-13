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

function WordStage({ round }) {
  const isFeu = round.word === FEU;
  useEffect(() => {
    if (!round.word) return;
    speak(isFeu ? 'Feu !' : round.word);
    if (isFeu) sounds.fire();
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
      {isFeu && (
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
        className={`feu-word ${isFeu ? 'fx-feu' : EFFECTS[round.index % EFFECTS.length]}`}
        style={isFeu ? undefined : { color: WORD_COLORS[(round.index * 3) % WORD_COLORS.length] }}
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
      <div className="feu">
        <p className="round">Manche {round.number} · Réflexes</p>
        <h1 className="question-text slide-in">
          Tape sur ton téléphone uniquement quand j’entends… <span className="feu-inline">FEU</span>
        </h1>
        <p className="lead">Méfie-toi de « feuille », « bleu », « fou »… Le plus lent boit, et ceux qui tapent trop tôt aussi.</p>
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
    <div className="feu feu-running">
      <WordStage round={round} />
      <p className="muted">
        {round.tappedIds.length} / {total} ont tapé
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
        {losers.length ? (
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
        <p className="verdict-title zoom-in">{round.myTap.early ? 'Faux départ !' : 'Tapé !'}</p>
        <p className="verdict-detail">{round.myTap.early ? 'Ce n’était pas « feu »…' : 'Résultats sur la TV.'}</p>
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
      <small>{ready ? 'Seulement quand la TV dit « feu » !' : 'Pose ton doigt, pas trop près'}</small>
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
  if (falseStart) return { drinks: true, title: 'Faux départ !', detail: falseStart.word ? `Tu as tapé sur « ${falseStart.word} ».` : 'Tu as tapé trop tôt.' };
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
