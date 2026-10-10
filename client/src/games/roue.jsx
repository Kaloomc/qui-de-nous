import { useEffect, useRef, useState } from 'react';
import { Avatar, Confetti, PlayerChip, PlayerGrid, TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';
import { sipsLabel, StatBoard } from '../sips.jsx';
import { sounds } from '../sound.js';

export const id = 'roue';
export const waitingText = 'La roue va tourner…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Tour suivant';

// Calendrier du suspense (doit tenir dans revealMs = 11 s côté serveur).
const WHO = { start: 400, duration: 4600 };
const WHAT = { start: 5800, duration: 4400 };
const TURNS = 6;

const COLORS = ['#ff4f8b', '#ffc93c', '#3ee0c5', '#6c8bff', '#ff8a3d', '#b46cff', '#7ee05a', '#ff6f6f'];
const NIVEAUX = { chill: 'Chill', epice: 'Épicé', hardcore: 'Hardcore' };
const CONFETTI_TYPES = ['groupe', 'echange', 'distribuer'];
/** Défis adressés au joueur désigné (« Ana : bois 2 gorgées »), les autres concernent tout le groupe. */
const PERSONAL = ['boire', 'duo', 'distribuer', 'gage'];

const byIdOf = (state) => new Map(state.players.map((p) => [p.id, p]));
const lcFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const short = (name) => (name.length > 11 ? `${name.slice(0, 10)}…` : name);

export function segmentLabel({ type, n }) {
  return {
    boire: sipsLabel(n),
    groupe: 'Tout le monde',
    echange: 'Échange !',
    duo: 'Duo',
    distribuer: `Distribue ${n}`,
    tous: 'Ceux qui…',
    vote: 'Vote',
    gage: 'Gage',
  }[type];
}

export function defiLine(results, name) {
  const { texte, type } = results.defi;
  return PERSONAL.includes(type) ? `${name} : ${lcFirst(texte)}` : texte;
}

const easeOut = (p) => 1 - (1 - p) ** 4;

/**
 * Roue SVG. `spin` = { startAt, duration } en heure serveur : la rotation est calculée à chaque image
 * à partir de l'horloge, donc une TV rechargée en plein suspense reprend au bon endroit.
 */
function Wheel({ labels, index, spin, state, idle = false, dim = false, seed = 0 }) {
  const rotorRef = useRef(null);
  const pointerRef = useRef(null);
  const n = Math.max(1, labels.length);
  const seg = 360 / n;
  const jitter = (((seed * 9301 + 49297) % 233280) / 233280 - 0.5) * seg * 0.6;
  const target = index == null ? 0 : 360 * TURNS - (index + 0.5) * seg + jitter;
  const clock = useRef(null);
  clock.current = { offset: state.clockOffset ?? 0 };

  useEffect(() => {
    let raf;
    let lastSlot = null;
    let flick = 0;
    let lastAngle = 0;
    let lastTime = performance.now();
    const loop = (now) => {
      const dt = Math.max(1, now - lastTime);
      lastTime = now;
      let angle;
      if (idle) angle = (now / 60) % 360;
      else if (!spin) angle = target;
      else {
        const p = Math.min(1, Math.max(0, (Date.now() + clock.current.offset - spin.startAt) / spin.duration));
        angle = target * easeOut(p);
      }
      // Cliquet : un « clac » à chaque case qui passe sous l'aiguille, plus fort quand ça va vite.
      const slot = Math.floor((angle + seg / 2) / seg);
      if (!idle && spin && lastSlot != null && slot !== lastSlot) {
        const speed = Math.min(1, Math.abs(angle - lastAngle) / dt / 1.2);
        sounds.clack(0.08 + 0.25 * speed);
        flick = 1;
      }
      lastSlot = slot;
      lastAngle = angle;
      flick *= 0.85;
      rotorRef.current?.setAttribute('transform', `rotate(${angle} 100 100)`);
      if (pointerRef.current) pointerRef.current.style.transform = `rotate(${-24 * flick}deg)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [idle, spin?.startAt, spin?.duration, target, seg]);

  const point = (a, r) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(100 + r * Math.cos(rad)).toFixed(2)},${(100 + r * Math.sin(rad)).toFixed(2)}`;
  };
  const fontSize = Math.max(6, Math.min(12, 120 / n + 3));

  return (
    <div className={`wheel-wrap ${dim ? 'is-dim' : ''}`}>
      <svg className="wheel" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="98" fill="#fff8f0" />
        <g ref={rotorRef}>
          {labels.map((label, i) => (
            <g key={i}>
              {n === 1 ? (
                <circle cx="100" cy="100" r="94" fill={COLORS[0]} />
              ) : (
                <path d={`M100,100 L${point(i * seg, 94)} A94,94 0 ${seg > 180 ? 1 : 0} 1 ${point((i + 1) * seg, 94)} Z`} fill={COLORS[i % COLORS.length]} stroke="#14102a" strokeWidth="1" />
              )}
              {/* Texte le long du rayon, du centre vers le bord. */}
              <text transform={`rotate(${(i + 0.5) * seg - 90} 100 100)`} x="186" y="100" textAnchor="end" dominantBaseline="central" fontSize={fontSize} className="wheel-label">
                {label}
              </text>
            </g>
          ))}
        </g>
        <circle cx="100" cy="100" r="13" fill="#14102a" stroke="#fff8f0" strokeWidth="4" />
      </svg>
      <span ref={pointerRef} className="wheel-pointer" aria-hidden="true" />
    </div>
  );
}

function WhoWheel({ state, results, spin, idle }) {
  const byId = byIdOf(state);
  const ids = results?.whoSegments ?? state.players.map((p) => p.id);
  return <Wheel labels={ids.map((pid) => short(byId.get(pid)?.name ?? '?'))} index={results?.whoIndex} spin={spin} state={state} idle={idle} seed={state.round.number} />;
}

export function HostQuestion({ state, gameAct }) {
  return (
    <div className="roue">
      <p className="round">Tour {state.round.number} · La Roue</p>
      <h1 className="question-text slide-in">Qui va trinquer ?</h1>
      <WhoWheel state={state} idle />
      <TimerBar timer={state.round.autoTimer} state={state}>
        {(s) => `La roue se lance dans ${s} s`}
      </TimerBar>
      <button className="btn btn-primary btn-xl pulse" onClick={() => gameAct({ type: 'spin' })}>
        Lancer la roue
      </button>
    </div>
  );
}

export function HostReveal({ state }) {
  const { results, reveal } = state;
  const byId = byIdOf(state);
  const target = byId.get(results.targetId);
  const elapsed = useElapsed(state, reveal.startedAt);
  const whoDone = elapsed > WHO.start + WHO.duration;
  const whatDone = elapsed > WHAT.start + WHAT.duration;
  useEffect(() => {
    if (whoDone) sounds.ding();
  }, [whoDone]);
  useEffect(() => {
    if (whatDone) sounds.reveal();
  }, [whatDone]);
  return (
    <div className="roue">
      <p className="round">Tour {state.round.number} · La Roue</p>
      <div className="wheels">
        <div className="wheel-col">
          <WhoWheel state={state} results={results} spin={{ startAt: reveal.startedAt + WHO.start, duration: WHO.duration }} />
          <p className={`wheel-caption ${whoDone ? 'zoom-in' : ''}`}>{whoDone && target ? target.name : 'Qui ?'}</p>
        </div>
        <div className="wheel-col">
          <Wheel
            labels={results.whatSegments.map(segmentLabel)}
            index={results.whatIndex}
            spin={whoDone ? { startAt: reveal.startedAt + WHAT.start, duration: WHAT.duration } : null}
            state={state}
            idle={!whoDone}
            dim={!whoDone}
            seed={state.round.number + 7}
          />
          <p className={`wheel-caption ${whatDone ? 'zoom-in' : ''}`}>{whatDone ? segmentLabel(results.defi) : 'Quoi ?'}</p>
        </div>
      </div>
    </div>
  );
}

/** Temps écoulé depuis `startedAt` (heure serveur), rafraîchi toutes les 100 ms. */
function useElapsed(state, startedAt) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 100);
    return () => clearInterval(timer);
  }, []);
  return serverNow(state) - startedAt;
}

function Status({ state }) {
  const { results } = state;
  const byId = byIdOf(state);
  const target = byId.get(results.targetId);
  const { type, n } = results.defi;
  const picks = Object.entries(results.picks).map(([pid, k]) => ({ player: byId.get(pid), k })).filter((r) => r.player);
  if (type === 'duo') {
    if (!picks.length) return state.pending ? <p className="lead pulse-text">{target?.name} choisit son binôme…</p> : null;
    return <p className="verdict-line"><strong>{target?.name}</strong> et <strong>{picks[0].player.name}</strong> trinquent !</p>;
  }
  if (type === 'distribuer') {
    const given = picks.reduce((a, r) => a + r.k, 0);
    return (
      <>
        <p className="lead">{given} / {n} gorgée{n > 1 ? 's' : ''} distribuée{given > 1 ? 's' : ''}</p>
        <div className="vote-tally">
          {picks.map((r) => <PlayerChip key={r.player.id} player={r.player} size={64} badge={`+${r.k}`} />)}
        </div>
      </>
    );
  }
  if (type === 'tous' || type === 'vote') {
    const answered = Object.keys(results.responses).length;
    if (state.pending) return <p className="lead">{answered} / {state.players.filter((p) => p.connected).length} réponses sur les téléphones…</p>;
    return null;
  }
  if (type === 'gage') {
    if (!results.gage) return state.pending ? <p className="lead pulse-text">Gage relevé… ou on boit ?</p> : null;
    return <p className="verdict-line">{results.gage === 'fait' ? <strong>Gage relevé, bravo !</strong> : <strong>{target?.name} préfère boire !</strong>}</p>;
  }
  return null;
}

export function HostResults({ state }) {
  const { results, round } = state;
  const byId = byIdOf(state);
  const target = byId.get(results.targetId);
  const drinkers = Object.entries(state.roundSips ?? {}).map(([pid, k]) => ({ player: byId.get(pid), k })).filter((r) => r.player);
  return (
    <div className="roue">
      {CONFETTI_TYPES.includes(results.defi.type) && <Confetti />}
      <p className="round">Tour {round.number} · La Roue</p>
      {target && <Avatar player={target} size={140} className="roulette-avatar zoom-in" />}
      <div className={`defi-card niveau-${results.defi.niveau} fade-up`}>
        <span className="niveau-chip">{NIVEAUX[results.defi.niveau]}</span>
        <p>{defiLine(results, target?.name ?? '?')}</p>
      </div>
      <Status state={state} />
      {!state.pending && drinkers.length > 0 && (
        <div className="vote-tally fade-up" style={{ animationDelay: '400ms' }}>
          {drinkers.map((r) => <PlayerChip key={r.player.id} player={r.player} size={64} badge={`+${r.k}`} />)}
        </div>
      )}
      {!state.pending && drinkers.length === 0 && <p className="verdict-line">Personne ne boit… pour cette fois.</p>}
    </div>
  );
}

export function PlayerRound() {
  return (
    <div className="center">
      <h1>Les yeux sur la roue</h1>
      <p className="lead">Elle va choisir quelqu’un… et lui trouver un défi.</p>
    </div>
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
      <h1>La roue tourne…</h1>
      <p className="lead">Croise les doigts.</p>
    </div>
  );
}

function Waiting({ title, text }) {
  return (
    <div className="center">
      <h1>{title}</h1>
      <p className="lead">{text}</p>
    </div>
  );
}

export function PlayerResults({ state, me, act, verdict }) {
  const { results } = state;
  if (!state.pending) return verdict;
  const byId = byIdOf(state);
  const target = byId.get(results.targetId);
  const { type, n, texte } = results.defi;
  const mine = results.targetId === me.id;
  const others = state.players.filter((p) => p.id !== me.id && p.connected);
  const card = (
    <div className={`defi-card defi-card-phone niveau-${results.defi.niveau}`}>
      <p>{mine ? texte : defiLine(results, target?.name ?? '?')}</p>
    </div>
  );

  if (type === 'tous') {
    if (me.id in results.responses) return <Waiting title="Réponse envoyée" text="On attend les aveux des autres…" />;
    return (
      <div className="vote">
        {card}
        <button className="answer-choice roue-yes" onClick={() => act({ yes: true })}>
          <span>C’est mon cas, je bois</span>
        </button>
        <button className="answer-choice" onClick={() => act({ yes: false })}>
          <span>Pas moi !</span>
        </button>
      </div>
    );
  }
  if (type === 'vote') {
    if (me.id in results.responses) return <Waiting title="Vote enregistré" text="On attend les autres…" />;
    return (
      <div className="vote">
        {card}
        <h1 className="vote-question">Qui boit ?</h1>
        <PlayerGrid players={others} onPick={(targetId) => act({ targetId })} />
      </div>
    );
  }
  if (!mine) return <Waiting title={`${target?.name ?? 'Le joueur'} a un défi`} text={defiLine(results, target?.name ?? '?')} />;
  if (type === 'duo') {
    return (
      <div className="vote">
        {card}
        <h1 className="vote-question">Qui boit avec toi ?</h1>
        <PlayerGrid players={others} onPick={(targetId) => act({ targetId })} />
      </div>
    );
  }
  if (type === 'distribuer') {
    const given = Object.values(results.picks).reduce((a, b) => a + b, 0);
    return (
      <div className="vote">
        {card}
        <h1 className="vote-question">
          Encore {n - given} gorgée{n - given > 1 ? 's' : ''} à donner
        </h1>
        <p className="muted small">Un toucher = une gorgée.</p>
        <PlayerGrid players={others.map((p) => ({ ...p, name: results.picks[p.id] ? `${p.name} (+${results.picks[p.id]})` : p.name }))} onPick={(targetId) => act({ targetId })} />
      </div>
    );
  }
  // Gage
  if (results.gage) return <Waiting title="C’est noté" text="Regarde l’écran." />;
  return (
    <div className="vote">
      {card}
      <button className="answer-choice roue-yes" onClick={() => act({ done: true })}>
        <span>Gage relevé !</span>
      </button>
      <button className="answer-choice" onClick={() => act({ done: false })}>
        <span>Je préfère boire {sipsLabel(n)}</span>
      </button>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  const target = byIdOf(state).get(results.targetId);
  const sips = state.roundSips?.[me.id] ?? 0;
  const detail = defiLine(results, results.targetId === me.id ? 'Toi' : target?.name ?? '?');
  if (sips > 0) return { drinks: true, title: 'Tu bois !', detail };
  return { drinks: false, title: 'Tu ne bois pas', detail };
}

export function EndStats({ state }) {
  return <StatBoard state={state} title="Les chouchous de la roue" valueOf={(s) => s.picked} format={(n) => `${n} fois désigné${n > 1 ? 's' : ''}`} />;
}
