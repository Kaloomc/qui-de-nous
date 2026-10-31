// Carte du Géo-duel : frontières des pays (Natural Earth, domaine public), zoom profond (9 niveaux, pincement à deux doigts, double tap, boutons),
// glissement, noms de pays qui apparaissent quand on zoome, épingles rouge (rond) et bleue (carré), et une révélation avec traits, distances
// en km et zoom animé sur le vrai lieu. Aucun service externe : tout vient de shared/worldmap.js.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { toLatLon, toXY } from '../../../shared/geo.js';
import { COUNTRIES, MAP_H, MAP_W } from '../../../shared/worldmap.js';
import { reducedMotion, startLoop } from './duelFx.js';

export const ZOOMS = [1000, 640, 410, 260, 165, 105, 66, 42, 26]; // largeur visible, en unités de carte : 9 niveaux
const FILLS = ['#3d6b5c', '#477566', '#35604f', '#527c6a', '#43705f'];
const hash = (text) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Les pays : dessinés une seule fois (mémorisés), le zoom ne change que le viewBox. */
const Countries = memo(function Countries() {
  return (
    <g className="mg-countries">
      {COUNTRIES.map((c) => (
        <path key={c.n} d={c.d} fill={FILLS[hash(c.n) % FILLS.length]} stroke="#cfe9dc" strokeWidth="0.45" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});

const clampView = (v, ratio) => {
  const w = Math.max(ZOOMS.at(-1), Math.min(MAP_W, v.w));
  const h = w * ratio;
  const x = h >= 0 ? (w >= MAP_W ? 0 : Math.max(0, Math.min(MAP_W - w, v.x))) : v.x;
  const y = h >= MAP_H ? (MAP_H - h) / 2 : Math.max(0, Math.min(MAP_H - h, v.y));
  return { x, y, w };
};

/** Vue de départ : le monde entier, ou (téléphone) une fenêtre plus serrée centrée sur l'Europe et l'Atlantique. */
function startView(w, ratio) {
  if (w >= MAP_W) return clampView({ x: 0, y: 0, w: MAP_W }, ratio);
  const c = toXY({ lat: 32, lon: 10 });
  return clampView({ x: c.x - w / 2, y: c.y - (w * ratio) / 2, w }, ratio);
}

/** Vue qui cadre un ensemble de points (pour la révélation) : centre et largeur, avec de l'air autour. */
function fitView(points, ratio) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const w = Math.max(90, spanX * 1.8, (spanY * 1.8) / ratio);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return clampView({ x: cx - w / 2, y: cy - (w * ratio) / 2, w }, ratio);
}

/**
 * pins : { rouge, bleu } (lat/lon) ; truth : la vraie position (à la révélation) ; km : distances à afficher ;
 * onPlace(pin) : pose d'une épingle au toucher ; mine : { camp, pin } l'épingle du joueur avant la révélation.
 */
export function WorldMap({ pins = {}, truth = null, km = null, onPlace = null, mine = null, camp = null, interactive = false, ratio = MAP_H / MAP_W, maxVh = null, start = MAP_W, resetKey = 0 }) {
  const svg = useRef(null);
  const [view, setView] = useState(() => startView(start, ratio));
  const [local, setLocal] = useState(null); // mon épingle posée, affichée tout de suite sans attendre le serveur
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const h = view.w * ratio;

  const toMap = (clientX, clientY, v = viewRef.current) => {
    const r = svg.current.getBoundingClientRect();
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.w * ratio };
  };
  /** Zoom centré sur un point de la carte (il reste sous le doigt). */
  const zoomAt = (factor, at, v = viewRef.current) => {
    const w = Math.max(ZOOMS.at(-1), Math.min(MAP_W, v.w * factor));
    return clampView({ w, x: at.x - ((at.x - v.x) * w) / v.w, y: at.y - ((at.y - v.y) * w) / v.w }, ratio);
  };
  /** `in` : prochain niveau plus proche (+) ; sinon plus lointain (−). */
  const step = (zoomIn) => {
    const v = viewRef.current;
    const at = { x: v.x + v.w / 2, y: v.y + (v.w * ratio) / 2 };
    const target = zoomIn ? ZOOMS.find((z) => z < v.w - 0.5) ?? ZOOMS.at(-1) : [...ZOOMS].reverse().find((z) => z > v.w + 0.5) ?? ZOOMS[0];
    setView(zoomAt(target / v.w, at));
  };
  const place = (pin) => {
    setLocal(pin);
    onPlace?.(pin);
  };

  // Révélation : zoom animé sur le vrai lieu (cadre les épingles et la position exacte).
  useEffect(() => {
    if (!truth) return undefined;
    const pts = [toXY(truth), ...Object.values(pins).filter(Boolean).map(toXY)];
    const to = fitView(pts, ratio);
    if (reducedMotion()) {
      setView(to);
      return undefined;
    }
    const from = viewRef.current;
    const t0 = performance.now();
    return startLoop((now) => {
      const p = Math.min(1, (now - t0) / 1300);
      const e = 1 - (1 - p) ** 3;
      setView(clampView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e }, ratio));
      if (p >= 1) setView(to);
    });
  }, [truth?.lat, truth?.lon]);

  // Nouvelle ville : on repart de la vue de départ, sans épingle.
  useEffect(() => {
    setLocal(null);
    setView(startView(start, ratio));
  }, [resetKey]);

  const onDown = (e) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = viewRef.current;
    if (pointers.current.size === 1) gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, v, moved: false };
    else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), v };
    }
  };
  const onMove = (e) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2, g.v);
      setView(zoomAt(g.d / Math.max(10, d), mid, g.v));
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
      if (g.moved) {
        const r = svg.current.getBoundingClientRect();
        setView(clampView({ w: g.v.w, x: g.v.x - (dx / r.width) * g.v.w, y: g.v.y - (dy / r.height) * g.v.w * ratio }, ratio));
      }
    }
  };
  const onUp = (e) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (!g) return;
    if (pointers.current.size > 0) {
      const [rest] = [...pointers.current.values()];
      gesture.current = { kind: 'pan', sx: rest.x, sy: rest.y, v: viewRef.current, moved: true };
      return;
    }
    gesture.current = null;
    if (g.kind !== 'pan' || g.moved) return;
    // Un toucher simple pose l'épingle tout de suite (elle se déplace jusqu'à la fin du temps) ; deux touchers rapprochés zooment (double tap).
    const now = performance.now();
    const at = toMap(e.clientX, e.clientY);
    const lt = lastTap.current;
    if (now - lt.t < 320 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      setView(zoomAt(0.5, at));
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    place(toLatLon(at.x, at.y));
  };

  const unit = view.w / 55; // taille d'un repère à l'écran : constante quelle que soit l'échelle
  const zoomFactor = MAP_W / view.w;
  const labels = useMemo(() => COUNTRIES.filter((c) => c.a * zoomFactor * zoomFactor >= 2500), [Math.round(zoomFactor * 4)]);
  const mark = (camp, p, key) => {
    const { x, y } = toXY(p);
    return (
      <g key={key} className={`mg-pin is-${camp}`} transform={`translate(${x} ${y})`}>
        {camp === 'rouge' ? <circle r={unit * 0.9} /> : <rect x={-unit * 0.9} y={-unit * 0.9} width={unit * 1.8} height={unit * 1.8} />}
        <text y={-unit * 1.3} fontSize={unit * 1.6} textAnchor="middle">
          {camp === 'rouge' ? 'R' : 'B'}
        </text>
      </g>
    );
  };
  const t = truth ? toXY(truth) : null;
  return (
    <div className="mg-map-wrap" style={maxVh ? { width: `min(94vw, 1800px, calc(${maxVh}vh / ${ratio}))` } : undefined}>
      <svg
        ref={svg}
        className="mg-map"
        data-decor="true"
        viewBox={`${view.x} ${view.y} ${view.w} ${h}`}
        role="img"
        aria-label="Carte du monde"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ aspectRatio: `${1 / ratio}` }}
      >
        <defs>
          <linearGradient id="mg-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d2f66" />
            <stop offset="1" stopColor="#14224d" />
          </linearGradient>
        </defs>
        <rect x={-500} y={-500} width={MAP_W + 1000} height={MAP_H + 1000} fill="url(#mg-sea)" />
        <Countries />
        <g className="mg-labels" pointerEvents="none">
          {labels.map((c) => (
            <text key={c.n} x={c.lx} y={c.ly} fontSize={view.w / 62} textAnchor="middle">
              {c.n}
            </text>
          ))}
        </g>
        {t &&
          Object.entries(pins)
            .filter(([, p]) => p)
            .map(([camp, p]) => {
              const a = toXY(p);
              return (
                <g key={`l${camp}`} className={`mg-line is-${camp}`}>
                  <line x1={a.x} y1={a.y} x2={t.x} y2={t.y} strokeWidth={unit * 0.35} strokeDasharray={`${unit} ${unit * 0.6}`} />
                  {km?.[camp] != null && (
                    <text x={(a.x + t.x) / 2} y={(a.y + t.y) / 2 - unit * 0.6} fontSize={unit * 1.5} textAnchor="middle">
                      {Math.round(km[camp]).toLocaleString('fr-FR')} km
                    </text>
                  )}
                </g>
              );
            })}
        {t && (
          <g transform={`translate(${t.x} ${t.y}) scale(${unit / 9})`} className="mg-truth">
            <path d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3 Z" />
          </g>
        )}
        {Object.entries(pins).map(([camp, p]) => p && mark(camp, p, camp))}
        {!Object.keys(pins).length && (local ?? mine?.pin) && mark(camp ?? mine?.camp ?? 'rouge', local ?? mine.pin, 'mine')}
      </svg>
      {interactive && (
        <div className="mg-map-zoom">
          <button onClick={() => step(true)} aria-label="Zoom avant">+</button>
          <button onClick={() => step(false)} aria-label="Zoom arrière">−</button>
        </div>
      )}
    </div>
  );
}
