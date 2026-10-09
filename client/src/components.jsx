import { colorFor } from './lib.js';

export function Avatar({ player, size = 64, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (player?.photoUrl) {
    return <img className={`avatar ${className}`} style={style} src={player.photoUrl} alt={player.name} draggable={false} />;
  }
  return (
    <span className={`avatar avatar-fallback ${className}`} style={{ ...style, background: colorFor(hash(player?.name ?? '?')) }}>
      {(player?.name ?? '?').charAt(0).toUpperCase()}
    </span>
  );
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function PlayerChip({ player, size = 72, dim = false, badge, onRemove }) {
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
