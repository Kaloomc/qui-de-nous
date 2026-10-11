import { useEffect } from 'react';
import { avatarColor } from './colors.js';
import { serverNow, useRemaining } from './lib.js';
import { sounds } from './sound.js';

/** Joue le son de révélation quand les résultats apparaissent (pas si la TV est rechargée plus tard). */
export function useRevealSound(state) {
  useEffect(() => {
    if (state.reveal && serverNow(state) - state.reveal.endsAt < 1500) sounds.reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Barre qui se vide pour un minuteur serveur. children(secondes restantes) donne le texte. */
export function TimerBar({ timer, state, children, small = false }) {
  const remaining = useRemaining(timer, state);
  if (!timer || remaining == null) return null;
  const fraction = timer.totalMs ? Math.min(1, remaining / timer.totalMs) : 0;
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className={`timer ${small ? 'timer-small' : ''} ${timer.paused ? 'timer-paused' : ''} ${seconds <= 5 ? 'timer-low' : ''}`}>
      <div className="timer-label">{timer.paused ? 'En pause' : children(seconds)}</div>
      <div className="timer-track">
        <div className="timer-fill" style={{ transform: `scaleX(${fraction})` }} />
      </div>
    </div>
  );
}

export function Avatar({ player, size = 64, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (player?.photoUrl) {
    return <img className={`avatar ${className}`} style={style} src={player.photoUrl} alt={player.name} draggable={false} />;
  }
  return (
    <span className={`avatar avatar-fallback ${className}`} style={{ ...style, background: avatarColor(player?.name ?? '?') }}>
      {(player?.name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

export function PlayerChip({ player, size = 72, dim = false, badge, caption, inline = false, onRemove }) {
  if (inline) {
    return (
      <div className={`chip chip-inline ${player.connected ? '' : 'chip-offline'}`}>
        <div className="chip-avatar">
          <Avatar player={player} size={size} />
          {badge && <span className="chip-badge">{badge}</span>}
        </div>
        <div className="chip-text">
          <span className="chip-name">{player.name}</span>
          {caption && <span className="chip-caption">{caption}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={`chip ${dim ? 'chip-dim' : ''} ${player.connected ? '' : 'chip-offline'}`}>
      <div className="chip-avatar">
        <Avatar player={player} size={size} />
        {badge && <span className="chip-badge">{badge}</span>}
        {onRemove && (
          <button className="chip-remove" onClick={onRemove} aria-label={`Retirer ${player.name}`} title="Retirer">
            ×
          </button>
        )}
      </div>
      <span className="chip-name">{player.name}</span>
      {caption && <span className="chip-caption">{caption}</span>}
    </div>
  );
}

/** Grille de joueurs à toucher sur le téléphone (désigner, passer, voter…). */
export function PlayerGrid({ players, onPick, me, disabledIds = [], selectedId = null }) {
  return (
    <div className="grid grid-vote">
      {players.map((p) => (
        <button
          key={p.id}
          className={`vote-option ${selectedId === p.id ? 'is-selected' : ''}`}
          onClick={() => onPick(p.id)}
          disabled={disabledIds.includes(p.id)}
        >
          <Avatar player={p} size={80} />
          <span>{me && p.id === me.id ? `${p.name} (moi)` : p.name}</span>
        </button>
      ))}
    </div>
  );
}

export function VoteProgress({ state }) {
  const total = state.players.length;
  const done = state.votedIds.filter((id) => state.players.some((p) => p.id === id)).length;
  return (
    <div className="vote-progress">
      <div className="vote-count">
        <strong>{done}</strong> / {total} ont voté
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export function allVoted(state) {
  const voted = new Set(state.votedIds);
  return state.players.length > 0 && state.players.every((p) => voted.has(p.id));
}

const CONFETTI_COLORS = ['#ffc93c', '#3ee0c5', '#ff4f8b', '#6c8bff', '#7ee05a', '#ffffff'];

export function Confetti({ count = 36 }) {
  const pieces = Array.from({ length: count }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    delay: `${(i % 9) * 0.12}s`,
    duration: `${1.6 + ((i * 13) % 10) / 10}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    rotate: `${(i * 47) % 360}deg`,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{ left: p.left, background: p.color, animationDelay: p.delay, animationDuration: p.duration, '--r': p.rotate }}
        />
      ))}
    </div>
  );
}

export function PieChart({ slices, size = 340 }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const c = 100;
  const r = 96;
  let angle = -Math.PI / 2;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      return { ...s, frac, a0, a1 };
    });

  const point = (a, radius) => `${(c + radius * Math.cos(a)).toFixed(2)},${(c + radius * Math.sin(a)).toFixed(2)}`;

  return (
    <svg className="pie" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Répartition des votes">
      {arcs.map((s, i) => {
        const mid = (s.a0 + s.a1) / 2;
        const [lx, ly] = point(mid, r * 0.62).split(',');
        return (
          <g key={s.id} className="pie-slice" style={{ animationDelay: `${300 + i * 140}ms` }}>
            {s.frac > 0.9999 ? (
              <circle cx={c} cy={c} r={r} fill={s.color} />
            ) : (
              <path
                d={`M${c},${c} L${point(s.a0, r)} A${r},${r} 0 ${s.frac > 0.5 ? 1 : 0} 1 ${point(s.a1, r)} Z`}
                fill={s.color}
                stroke="var(--bg)"
                strokeWidth="1.5"
              />
            )}
            {s.frac >= 0.07 && (
              <text x={lx} y={ly} className="pie-label" textAnchor="middle" dominantBaseline="central">
                {s.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Choix exclusif en boutons (réglages de la partie, du mode soirée…). */
export function Segmented({ label, hint, value, options, onChange, disabled }) {
  return (
    <div className={`setting ${disabled ? 'setting-disabled' : ''}`}>
      <div className="setting-head">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'is-selected' : ''}
            onClick={() => onChange(o.value)}
            disabled={disabled}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
