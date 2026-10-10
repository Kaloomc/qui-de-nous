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
