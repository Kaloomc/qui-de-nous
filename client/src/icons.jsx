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
  duel: (
    <>
      <path d="M12 16 L84 16 L12 96 Z" fill="#ff3b4e" />
      <path d="M108 104 L36 104 L108 24 Z" fill="#2f7bff" />
      <path d="M84 16 L108 24 L36 104 L12 96 Z" fill="#14102a" />
      <text x="60" y="72" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="40" fill="#fff8f0" transform="rotate(-42 60 60)">VS</text>
    </>
  ),
  pfc: (
    <>
      <circle cx="34" cy="72" r="22" fill="#b3a9d6" />
      <rect x="58" y="28" width="34" height="46" rx="6" fill="#fff8f0" transform="rotate(12 75 51)" />
      <path d="M70 100 L100 62 M100 100 L70 62" stroke="#ff4f8b" strokeWidth="9" strokeLinecap="round" />
    </>
  ),
  simon: (
    <>
      <rect x="12" y="12" width="46" height="46" rx="12" fill="#ff4f8b" />
      <rect x="62" y="12" width="46" height="46" rx="12" fill="#ffc93c" />
      <rect x="12" y="62" width="46" height="46" rx="12" fill="#3ee0c5" />
      <rect x="62" y="62" width="46" height="46" rx="12" fill="#b46cff" />
    </>
  ),
  couleur: (
    <>
      <path d="M60 12 C30 12 10 34 10 58 c0 22 18 32 34 32 c10 0 12 -8 8 -14 c-4 -7 0 -14 9 -14 h14 c18 0 35 -8 35 -26 C110 30 90 12 60 12 Z" fill="#fff8f0" />
      <circle cx="38" cy="46" r="8" fill="#ff4d5e" />
      <circle cx="62" cy="34" r="8" fill="#ffc93c" />
      <circle cx="86" cy="46" r="8" fill="#3c9dff" />
      <circle cx="34" cy="70" r="8" fill="#2fd18a" />
    </>
  ),
  culture: (
    <>
      <circle cx="60" cy="54" r="40" fill="#ffc93c" />
      <path d="M44 48 q4 -14 16 -14 q16 0 16 14 q0 8 -9 14 q-5 4 -5 10" fill="none" stroke="#14102a" strokeWidth="8" strokeLinecap="round" />
      <circle cx="62" cy="86" r="5" fill="#14102a" />
      <rect x="44" y="98" width="32" height="10" rx="5" fill="#fff8f0" />
    </>
  ),
  defuse: (
    <>
      <circle cx="54" cy="70" r="34" fill="#2a2254" stroke="#fff8f0" strokeWidth="5" />
      <path d="M70 38 Q82 22 98 24" fill="none" stroke="#ffc93c" strokeWidth="6" strokeLinecap="round" />
      <path d="M36 62 h36 M36 74 h36 M36 86 h36" stroke="#ff4d5e" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 6" />
      <path d="M96 14 l6 8 m0 -8 l-6 8" stroke="#ffc93c" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  code: (
    <>
      <circle cx="26" cy="34" r="14" fill="#ff4f8b" />
      <rect x="50" y="20" width="28" height="28" rx="5" fill="#ffc93c" />
      <path d="M96 20 L110 48 H82 Z" fill="#3ee0c5" />
      <circle cx="30" cy="88" r="6" fill="#fff8f0" />
      <circle cx="50" cy="88" r="6" fill="#fff8f0" opacity="0.4" />
      <circle cx="70" cy="88" r="6" fill="#fff8f0" opacity="0.4" />
      <circle cx="90" cy="88" r="6" fill="none" stroke="#fff8f0" strokeWidth="3" />
    </>
  ),
  simon2: (
    <>
      <rect x="10" y="10" width="44" height="44" rx="12" fill="#ff4f8b" />
      <rect x="66" y="66" width="44" height="44" rx="12" fill="#3ee0c5" />
      <path d="M60 30 H86 V56" fill="none" stroke="#fff8f0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M60 90 H34 V64" fill="none" stroke="#fff8f0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  crash: (
    <>
      <path d="M12 100 L40 70 L58 82 L96 24" fill="none" stroke="#3ee0c5" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M96 24 l-4 -14 M96 24 l12 6 M96 24 l8 -10" stroke="#ffc93c" strokeWidth="6" strokeLinecap="round" />
      <circle cx="96" cy="24" r="7" fill="#ff4d5e" />
    </>
  ),
  dilemme: (
    <>
      <circle cx="60" cy="34" r="22" fill="#ffc93c" />
      <circle cx="60" cy="34" r="10" fill="#14102a" />
      <path d="M14 110 Q14 74 40 66 L60 82 L80 66 Q106 74 106 110 Z" fill="#b46cff" />
      <path d="M52 92 l8 8 l14 -16" fill="none" stroke="#fff8f0" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  soleil: (
    <>
      <circle cx="60" cy="40" r="22" fill="#ffc93c" />
      <path d="M60 6 v10 M60 64 v10 M26 40 h10 M84 40 h10 M36 16 l7 7 M77 57 l7 7 M84 16 l-7 7 M43 57 l-7 7" stroke="#ffc93c" strokeWidth="5" strokeLinecap="round" />
      <rect x="14" y="88" width="92" height="12" rx="6" fill="#2a2254" />
      <rect x="14" y="88" width="54" height="12" rx="6" fill="#3ee0c5" />
    </>
  ),
  plateau: (
    <>
      <path d="M18 100 V60 a14 14 0 0 1 28 0 V100 Z" fill="#b3a9d6" />
      <path d="M50 100 V46 a14 14 0 0 1 28 0 V100 Z" fill="#fff8f0" />
      <path d="M82 100 V66 a12 12 0 0 1 24 0 V100 Z" fill="#b3a9d6" />
      <circle cx="32" cy="72" r="3" fill="#14102a" /><circle cx="64" cy="58" r="3" fill="#14102a" /><circle cx="94" cy="76" r="3" fill="#14102a" />
      <path d="M52 22 L64 8 L76 22 Z" fill="#ffc93c" />
    </>
  ),
  course: (
    <>
      <rect x="14" y="54" width="26" height="40" rx="6" fill="#ff4f8b" />
      <circle cx="27" cy="42" r="10" fill="#fff8f0" />
      <path d="M10 100 H110" stroke="#fff8f0" strokeWidth="5" strokeLinecap="round" />
      <rect x="70" y="70" width="18" height="30" fill="#ffc93c" />
      <path d="M96 50 h14 v14 h-14 Z" fill="#b46cff" />
    </>
  ),
  geo: (
    <>
      <circle cx="60" cy="58" r="42" fill="#16335a" stroke="#fff8f0" strokeWidth="5" />
      <path d="M32 44 q10 -14 24 -6 q6 10 -4 16 q-10 4 -12 14 q-10 -8 -8 -24 Z M66 62 q14 -4 20 8 q-8 14 -18 8 Z" fill="#3d6b4f" />
      <path d="M92 10 c10 0 16 7 16 15 c0 11 -16 26 -16 26 s-16 -15 -16 -26 c0 -8 6 -15 16 -15 Z" fill="#ff4d5e" />
      <circle cx="92" cy="25" r="6" fill="#fff8f0" />
    </>
  ),
  quisuisje: (
    <>
      <circle cx="60" cy="60" r="48" fill="#2a2254" stroke="#fff8f0" strokeWidth="5" />
      <circle cx="60" cy="44" r="16" fill="#b3a9d6" />
      <path d="M28 96 q4 -30 32 -30 q28 0 32 30 Z" fill="#b3a9d6" />
      <text x="60" y="62" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="40" fill="#ffc93c">?</text>
    </>
  ),
  chrono: (
    <>
      <rect x="14" y="14" width="92" height="22" rx="8" fill="#ff4f8b" />
      <rect x="14" y="48" width="92" height="22" rx="8" fill="#ffc93c" />
      <rect x="14" y="82" width="92" height="22" rx="8" fill="#3ee0c5" />
      <path d="M96 20 v10 M96 54 v10 M96 88 v10" stroke="#14102a" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  vf: (
    <>
      <circle cx="38" cy="60" r="30" fill="#3ee0c5" />
      <path d="M24 60 l10 11 l20 -22" fill="none" stroke="#14102a" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="84" cy="60" r="26" fill="#ff4d5e" />
      <path d="M73 49 l22 22 M95 49 l-22 22" stroke="#fff8f0" strokeWidth="8" strokeLinecap="round" />
    </>
  ),
  des: (
    <>
      <rect x="10" y="30" width="58" height="58" rx="12" fill="#fff8f0" stroke="#14102a" strokeWidth="4" transform="rotate(-10 39 59)" />
      <g fill="#14102a" transform="rotate(-10 39 59)">
        <circle cx="26" cy="46" r="5" />
        <circle cx="39" cy="59" r="5" />
        <circle cx="52" cy="72" r="5" />
      </g>
      <rect x="58" y="14" width="48" height="48" rx="10" fill="#ff4f8b" stroke="#fff8f0" strokeWidth="4" transform="rotate(12 82 38)" />
      <g fill="#fff8f0" transform="rotate(12 82 38)">
        <circle cx="70" cy="26" r="4.5" />
        <circle cx="94" cy="26" r="4.5" />
        <circle cx="70" cy="50" r="4.5" />
        <circle cx="94" cy="50" r="4.5" />
      </g>
    </>
  ),
  russe: (
    <>
      <circle cx="60" cy="60" r="46" fill="#2a2254" stroke="#fff8f0" strokeWidth="5" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={60 + 28 * Math.cos((i / 6) * 2 * Math.PI - Math.PI / 2)} cy={60 + 28 * Math.sin((i / 6) * 2 * Math.PI - Math.PI / 2)} r="10" fill={i === 1 ? '#3ee0c5' : '#14102a'} stroke="#b3a9d6" strokeWidth="3" />
      ))}
      <path d="M60 46 c0 0 -9 11 -9 17 a9 9 0 0 0 18 0 c0 -6 -9 -17 -9 -17 Z" fill="#6cc4ff" stroke="#fff8f0" strokeWidth="3" />
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
  house: (
    <>
      <circle cx="92" cy="26" r="14" fill="#ffc93c" />
      <circle cx="98" cy="22" r="12" fill="#14102a" />
      <path d="M14 108 V62 L60 24 L106 62 V108 Z" fill="#6c8bff" />
      <path d="M8 66 L60 18 L112 66" stroke="#ff4f8b" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="48" y="72" width="24" height="36" rx="4" fill="#14102a" />
      <path d="M26 88 l8 -14 l8 14 z" fill="#ffc93c" />
    </>
  ),
  savant: (
    <>
      <path d="M60 10 a30 30 0 0 1 17 55 c-4 3 -6 7 -6 12 H49 c0 -5 -2 -9 -6 -12 A30 30 0 0 1 60 10 z" fill="#ffc93c" />
      <rect x="49" y="82" width="22" height="8" rx="4" fill="#fff8f0" />
      <rect x="53" y="94" width="14" height="8" rx="4" fill="#fff8f0" />
      <path d="M52 40 a8 8 0 0 1 16 0 c0 6 -8 7 -8 13 M60 62 v1" stroke="#14102a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="96" cy="86" r="14" fill="none" stroke="#3ee0c5" strokeWidth="6" />
      <path d="M106 96 l10 10" stroke="#3ee0c5" strokeWidth="7" strokeLinecap="round" />
    </>
  ),
  cards: (
    <>
      <rect x="12" y="26" width="58" height="82" rx="9" fill="#14102a" stroke="#fff8f0" strokeWidth="5" transform="rotate(-9 41 67)" />
      <rect x="40" y="16" width="58" height="82" rx="9" fill="#fff8f0" transform="rotate(7 69 57)" />
      <g transform="rotate(7 69 57)">
        <rect x="50" y="40" width="38" height="6" rx="3" fill="#b3a9d6" />
        <rect x="50" y="54" width="26" height="6" rx="3" fill="#b3a9d6" />
        <rect x="50" y="68" width="34" height="6" rx="3" fill="#ff4f8b" />
      </g>
      <text x="30" y="74" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="30" fill="#ffc93c" transform="rotate(-9 41 67)">___</text>
      <path d="M100 86 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="#3ee0c5" />
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
