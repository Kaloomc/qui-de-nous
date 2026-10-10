// Illustrations maison (SVG), aux couleurs de l'application.

function Glass() {
  return (
    <g>
      <defs>
        <linearGradient id="brand-liquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc93c" />
          <stop offset="100%" stopColor="#ff4f8b" />
        </linearGradient>
      </defs>
      <path d="M68 4 C68 4 61 13 61 18 a7 7 0 0 0 14 0 C75 13 68 4 68 4 Z" fill="#ff4f8b" className="brand-drop" />
      <path d="M23 52 Q37 45 50 52 T77 51 L72.6 106 Q72 111 66.5 111 L33.5 111 Q28 111 27.4 106 Z" fill="url(#brand-liquid)" />
      <circle cx="41" cy="92" r="4.5" fill="#fff" opacity="0.75" className="brand-bubble" />
      <circle cx="56" cy="80" r="3.2" fill="#fff" opacity="0.65" className="brand-bubble brand-bubble-2" />
      <circle cx="62" cy="97" r="2.6" fill="#fff" opacity="0.6" className="brand-bubble brand-bubble-3" />
      <path d="M18 30 L82 30 L74.5 107 Q73.8 116 65 116 L35 116 Q26.2 116 25.5 107 Z" fill="none" stroke="#fff8f0" strokeWidth="5" strokeLinejoin="round" />
    </g>
  );
}

/** Logo « Gorgée » : un verre qui pétille + le nom. */
export function Logo({ size = 'lg' }) {
  return (
    <h1 className={`brand brand-${size}`}>
      <svg viewBox="0 0 480 130" role="img" aria-label="Gorgée">
        <g transform="translate(0 4)">
          <Glass />
        </g>
        <text x="112" y="104" fontFamily="'Baloo 2', system-ui, sans-serif" fontWeight="800" fontSize="108" textLength="360" lengthAdjust="spacingAndGlyphs" fill="#fff8f0">
          Gorg<tspan fill="#ff4f8b">ée</tspan>
        </text>
      </svg>
    </h1>
  );
}

const ICONS = {
  vote: (
    <>
      <path d="M20 22 h80 a12 12 0 0 1 12 12 v38 a12 12 0 0 1 -12 12 h-44 l-18 16 v-16 h-18 a12 12 0 0 1 -12 -12 v-38 a12 12 0 0 1 12 -12 z" fill="#ff4f8b" />
      <text x="60" y="73" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="52" fill="#fff">?</text>
      <circle cx="78" cy="104" r="7" fill="#ffc93c" />
      <circle cx="96" cy="104" r="7" fill="#3ee0c5" />
      <circle cx="60" cy="108" r="5" fill="#6c8bff" />
    </>
  ),
  versus: (
    <>
      <path d="M60 14 A46 46 0 0 0 60 106 Z" fill="#ff4f8b" />
      <path d="M60 14 A46 46 0 0 1 60 106 Z" fill="#3c9dff" />
      <rect x="57" y="10" width="6" height="100" rx="3" fill="#fff" />
      <text x="36" y="74" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="40" fill="#fff">A</text>
      <text x="84" y="74" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="40" fill="#fff">B</text>
    </>
  ),
  quill: (
    <>
      <rect x="20" y="18" width="62" height="84" rx="10" fill="#fff8f0" />
      <rect x="31" y="36" width="40" height="6" rx="3" fill="#b3a9d6" />
      <rect x="31" y="52" width="32" height="6" rx="3" fill="#b3a9d6" />
      <rect x="31" y="68" width="36" height="6" rx="3" fill="#b3a9d6" />
      <path d="M96 30 l10 10 -40 40 -14 4 4 -14 z" fill="#ffc93c" />
      <path d="M56 84 l4 -14 10 10 z" fill="#14102a" />
    </>
  ),
  ruler: (
    <>
      <rect x="10" y="62" width="100" height="26" rx="8" fill="#ffc93c" />
      {[22, 34, 46, 58, 70, 82, 94].map((x, i) => (
        <rect key={x} x={x - 1.5} y="62" width="3" height={i % 2 ? 9 : 15} rx="1.5" fill="#14102a" />
      ))}
      <path d="M78 22 a12 12 0 0 1 12 12 c0 10 -12 22 -12 22 s-12 -12 -12 -22 a12 12 0 0 1 12 -12 z" fill="#ff4f8b" />
      <circle cx="78" cy="34" r="5" fill="#fff" />
      <text x="36" y="48" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="34" fill="#3ee0c5">?</text>
    </>
  ),
  mirror: (
    <>
      <circle cx="60" cy="50" r="34" fill="#6c8bff" />
      <circle cx="60" cy="50" r="26" fill="#14102a" />
      <path d="M48 46 a8 8 0 0 1 16 0 c0 7 -8 8 -8 14 M56 68 v1" stroke="#ffc93c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M44 34 l8 -6" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      <rect x="54" y="84" width="12" height="26" rx="6" fill="#6c8bff" />
      <path d="M86 92 c0 -8 12 -8 12 0 c0 8 -12 16 -12 16 s-12 -8 -12 -16 c0 -8 12 -8 12 0" fill="#ff4f8b" transform="translate(4 -4)" />
    </>
  ),
  mask: (
    <>
      <path d="M14 40 q46 -22 92 0 q2 34 -26 44 q-14 4 -20 -10 q-6 14 -20 10 q-28 -10 -26 -44 z" fill="#b46cff" />
      <ellipse cx="40" cy="52" rx="11" ry="8" fill="#14102a" />
      <ellipse cx="80" cy="52" rx="11" ry="8" fill="#14102a" />
      <path d="M60 22 v-8 M44 26 l-4 -7 M76 26 l4 -7" stroke="#ffc93c" strokeWidth="5" strokeLinecap="round" />
      <text x="60" y="112" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="30" fill="#3ee0c5">?</text>
    </>
  ),
  bomb: (
    <>
      <circle cx="54" cy="70" r="34" fill="#2a2254" stroke="#fff8f0" strokeWidth="5" />
      <rect x="62" y="30" width="20" height="14" rx="4" transform="rotate(35 72 37)" fill="#fff8f0" />
      <path d="M78 30 q8 -14 20 -10" stroke="#ffc93c" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="100" cy="18" r="8" fill="#ff4f8b" className="icon-spark" />
      <circle cx="100" cy="18" r="4" fill="#ffc93c" />
      <path d="M38 60 a18 18 0 0 1 12 -12" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.6" />
    </>
  ),
  wheel: (
    <>
      {['#ff4f8b', '#ffc93c', '#3ee0c5', '#6c8bff', '#ff8a3d', '#b46cff'].map((c, i) => {
        const a0 = (i * Math.PI) / 3;
        const a1 = ((i + 1) * Math.PI) / 3;
        const p = (a) => `${60 + 46 * Math.cos(a)},${62 + 46 * Math.sin(a)}`;
        return <path key={c} d={`M60 62 L${p(a0)} A46 46 0 0 1 ${p(a1)} Z`} fill={c} />;
      })}
      <circle cx="60" cy="62" r="10" fill="#fff8f0" />
      <path d="M60 4 l10 16 h-20 z" fill="#fff8f0" />
    </>
  ),
  flame: (
    <>
      <path d="M60 10 c6 18 30 28 30 58 a30 30 0 0 1 -60 0 c0 -16 10 -24 14 -34 c4 10 6 14 12 16 c-2 -16 -2 -28 4 -40 z" fill="#ff4f8b" />
      <path d="M60 52 c4 10 16 16 16 30 a16 16 0 0 1 -32 0 c0 -10 8 -14 10 -22 c2 6 4 8 6 8 z" fill="#ffc93c" />
      <text x="60" y="114" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="20" fill="#fff8f0">FEU !</text>
    </>
  ),
  shot: (
    <>
      <path d="M30 24 h60 l-9 78 a8 8 0 0 1 -8 7 h-26 a8 8 0 0 1 -8 -7 z" fill="none" stroke="#fff8f0" strokeWidth="6" strokeLinejoin="round" />
      <path d="M38 58 h44 l-5 44 a4 4 0 0 1 -4 3 h-26 a4 4 0 0 1 -4 -3 z" fill="#3ee0c5" />
      <circle cx="52" cy="84" r="4" fill="#fff" opacity="0.7" />
      <circle cx="66" cy="72" r="3" fill="#fff" opacity="0.6" />
    </>
  ),
};

export function GameIcon({ icon, size = 96 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className="game-icon">
      {ICONS[icon] ?? ICONS.vote}
    </svg>
  );
}

export function LockIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="4" y="10" width="16" height="12" rx="3" fill="currentColor" />
      <path d="M8 10 V7 a4 4 0 0 1 8 0 v3" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}
