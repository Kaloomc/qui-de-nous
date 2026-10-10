import { useEffect, useRef, useState } from 'react';
import { Avatar, PlayerChip, PlayerGrid, TimerBar } from '../components.jsx';
import { serverNow } from '../lib.js';
import { sipsLabel, StatBoard } from '../sips.jsx';
import { sounds } from '../sound.js';

export const id = 'patate';
export const waitingText = 'La bombe tourne…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Manche suivante';

const BOOM_SIPS = 2;
/** Durée maximale de la mèche (le serveur tire entre 15 et 45 s) : sert seulement à accélérer l'ambiance. */
const MAX_FUSE_MS = 45000;

const byIdOf = (state) => new Map(state.players.map((p) => [p.id, p]));
const vibrate = (pattern) => navigator.vibrate?.(pattern);

/** Bombe SVG animée en requestAnimationFrame : battements et tremblements qui s'accélèrent, mèche qui brûle. */
function Bomb({ state, size = 240, beat = true }) {
  const bodyRef = useRef(null);
  const fuseRef = useRef(null);
  const sparkRef = useRef(null);
  const base = useRef(null);
  base.current = { elapsed: state.round.elapsedMs ?? 0, at: performance.now(), paused: state.paused };

  useEffect(() => {
    let raf;
    let last = performance.now();
    let phase = 0;
    const loop = (now) => {
      const b = base.current;
      const dt = now - last;
      last = now;
      const elapsed = b.paused ? b.elapsed : b.elapsed + (now - b.at);
      const t = Math.min(1, elapsed / MAX_FUSE_MS);
      if (!b.paused) {
        phase += dt / (1000 - 720 * t);
        if (phase >= 1) {
          phase %= 1;
          if (beat) sounds.heartbeat();
        }
      }
      const pulse = Math.max(0, 1 - phase * 4);
      const amp = b.paused ? 0 : 1 + 7 * t;
      const dx = (Math.random() - 0.5) * amp;
      const dy = (Math.random() - 0.5) * amp;
      if (bodyRef.current) bodyRef.current.style.transform = `translate(${dx}px, ${dy}px) scale(${1 + 0.09 * pulse * (0.6 + t)})`;
      const fuse = fuseRef.current;
      if (fuse && sparkRef.current) {
        const length = fuse.getTotalLength();
        const left = length * (1 - 0.9 * t);
        fuse.style.strokeDasharray = `${left} ${length}`;
        const p = fuse.getPointAtLength(left);
        sparkRef.current.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${0.8 + Math.random() * 0.6})`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beat]);

  return (
    <svg className="bomb" viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <g ref={bodyRef} className="bomb-body">
        <circle cx="54" cy="70" r="40" fill="#1b1530" stroke="#fff8f0" strokeWidth="4" />
        <circle cx="40" cy="56" r="9" fill="#fff" opacity="0.25" />
        <rect x="62" y="26" width="18" height="14" rx="3" transform="rotate(35 71 33)" fill="#fff8f0" />
        {/* Mèche : part de la bombe ; elle raccourcit depuis le bout qui brûle. */}
        <path ref={fuseRef} d="M77 28 q4 -18 18 -18 q12 0 12 -8" stroke="#ffc93c" strokeWidth="5" fill="none" strokeLinecap="round" />
        <g ref={sparkRef}>
          <circle r="7" fill="#ff4f8b" />
          <circle r="3.5" fill="#ffc93c" />
        </g>
      </g>
    </svg>
  );
}

function ringPosition(index, count) {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + 44 * Math.cos(angle), y: 50 + 41 * Math.sin(angle) };
}

export function HostQuestion({ state }) {
  const { round } = state;
  const byId = byIdOf(state);
  const holder = byId.get(round.holderId);
  const positions = new Map(state.players.map((p, i) => [p.id, ringPosition(i, state.players.length)]));
  const from = positions.get(round.previousHolderId);
  const to = positions.get(round.holderId);

  useEffect(() => {
    if (round.passCount > 0) sounds.whoosh();
  }, [round.passCount]);

  return (
    <div className="patate">
      <p className="round">Manche {round.number} · Patate chaude</p>
      <div className="patate-arena">
        {state.players.map((p) => {
          const pos = positions.get(p.id);
          const hot = p.id === round.holderId;
          return (
            <div key={p.id} className={`patate-seat ${hot ? 'is-hot' : ''}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
              <PlayerChip player={p} size={hot ? 84 : 60} />
            </div>
          );
        })}
        {from && to && (
          <span
            key={round.passCount}
            className="bomb-fly"
            style={{ '--fx': `${from.x}%`, '--fy': `${from.y}%`, '--tx': `${to.x}%`, '--ty': `${to.y}%` }}
            aria-hidden="true"
          />
        )}
        <div className="patate-center">
          <div className="patate-holder">
            {holder && <Avatar key={holder.id} player={holder} size={150} className="avatar-hot pop-in" />}
            <div className="patate-bomb">
              <Bomb state={state} />
            </div>
          </div>
          <p key={round.holderId} className="speaker-name zoom-in">{holder ? `${holder.name} a la bombe !` : 'La mèche est allumée…'}</p>
          <p className="lead">Elle peut exploser à tout moment.</p>
        </div>
      </div>
    </div>
  );
}

const SHARDS = Array.from({ length: 18 }, (_, i) => i);

export function HostReveal({ state }) {
  const loser = byIdOf(state).get(state.results?.loserId);
  useEffect(() => {
    if (serverNow(state) - state.reveal.startedAt < 1500) sounds.boom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="patate patate-boom">
      <div className="boom-flash" aria-hidden="true" />
      <div className="boom-shards" aria-hidden="true">
        {SHARDS.map((i) => (
          <span key={i} style={{ '--a': `${i * 20}deg`, '--d': `${180 + (i % 4) * 70}px` }} />
        ))}
      </div>
      <p className="boom-text">BOUM !</p>
      {loser && <Avatar player={loser} size={180} className="avatar-caught boom-victim" />}
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  const byId = byIdOf(state);
  const loser = byId.get(results.loserId);
  const giver = byId.get(results.lastFromId);
  const bombs = state.players
    .map((p) => ({ player: p, n: state.stats?.[p.id]?.bombs ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  return (
    <div className="patate">
      <p className="round">Manche {round.number} · Patate chaude</p>
      {loser ? (
        <div className="speaker zoom-in">
          <Avatar player={loser} size={170} className="avatar-caught" />
          <p className="speaker-name">{loser.name} boit {sipsLabel(BOOM_SIPS)} !</p>
        </div>
      ) : (
        <p className="speaker-name">La bombe a explosé dans le vide.</p>
      )}
      <p className="verdict-line fade-up" style={{ animationDelay: '300ms' }}>
        {results.passCount} passe{results.passCount > 1 ? 's' : ''}
        {giver && (results.lastWasRandom ? ` · ${giver.name} a trop traîné, la bombe est partie toute seule` : ` · cadeau de ${giver.name}`)}
      </p>
      {bombs.length > 0 && (
        <div className="vote-tally fade-up" style={{ animationDelay: '600ms' }}>
          {bombs.map((r) => (
            <PlayerChip key={r.player.id} player={r.player} size={64} badge={String(r.n)} caption={`bombe${r.n > 1 ? 's' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PlayerRound({ state, me, act }) {
  const { round } = state;
  const holder = byIdOf(state).get(round.holderId);
  const mine = round.holderId === me.id;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mine) vibrate([120, 60, 120]);
    setBusy(false);
  }, [mine, round.passCount]);

  async function pass(targetId) {
    if (busy) return;
    setBusy(true);
    if (await act({ type: 'pass', targetId })) setBusy(false);
  }

  if (mine) {
    const others = state.players.filter((p) => p.id !== me.id && p.connected);
    return (
      <div className="vote patate-hot">
        <p className="patate-alert">TU AS LA BOMBE !</p>
        <TimerBar timer={round.idleTimer} state={state} small>
          {(s) => `Passe-la vite ! ${s} s avant qu’elle parte toute seule`}
        </TimerBar>
        <PlayerGrid players={others} onPick={pass} disabledIds={others.filter((p) => !round.allowedIds.includes(p.id)).map((p) => p.id)} />
      </div>
    );
  }
  return (
    <div className="center patate-phone">
      <p className="round">Manche {round.number}</p>
      <h1>Quelqu’un d’autre a la bombe</h1>
      {holder && (
        <div key={holder.id} className="speaker pop-in">
          <Avatar player={holder} size={140} className="avatar-hot" />
          <p className="speaker-name">{holder.name}</p>
        </div>
      )}
      <p className="lead">Prie pour qu’elle ne revienne pas vers toi…</p>
    </div>
  );
}

export function PlayerReveal({ state, me }) {
  const mine = state.round.holderId === me.id;
  useEffect(() => {
    if (mine) vibrate([400, 100, 400]);
  }, [mine]);
  return (
    <div className={`verdict ${mine ? 'verdict-drink' : 'verdict-safe'}`}>
      <p className="verdict-title zoom-in">BOUM !</p>
      <p className="verdict-detail">{mine ? 'Elle t’a explosé dans les mains…' : 'Ouf, ce n’était pas toi.'}</p>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  if (results.loserId === me.id) {
    return { drinks: true, title: 'Tu bois !', detail: `La bombe t’a explosé dans les mains : ${sipsLabel(BOOM_SIPS)}.` };
  }
  return { drinks: false, title: 'Sauvé !', detail: 'La bombe a explosé chez quelqu’un d’autre.' };
}

export function EndStats({ state }) {
  return <StatBoard state={state} title="Bombes explosées" valueOf={(s) => s.bombs} format={(n) => `${n} bombe${n > 1 ? 's' : ''}`} />;
}
