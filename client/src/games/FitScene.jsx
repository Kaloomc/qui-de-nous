// Filet de sécurité d'affichage de la TV : si une scène est plus haute que la place disponible sous la barre de l'hôte, elle est réduite d'un seul bloc
// (transform, donc sans recalcul de mise en page) pour tenir à l'écran sans défilement. Une scène qui tient déjà n'est pas touchée.
import { useLayoutEffect, useRef, useState } from 'react';

export function FitScene({ children, reserve = 0 }) {
  const outer = useRef(null);
  const inner = useRef(null);
  const [fit, setFit] = useState({ k: 1, h: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const h = inner.current.offsetHeight; // hauteur réelle, sans la réduction
      // Place disponible : l'écran moins les marges de la page TV du Duel (64 en haut, 20 en bas) et une marge de sécurité.
      const avail = innerHeight - 64 - 20 - 64 - reserve;
      const k = h > avail && avail > 120 ? Math.max(0.4, avail / h) : 1;
      setFit((f) => (Math.abs(f.k - k) < 0.005 && f.h === h ? f : { k, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner.current);
    addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, [reserve]);
  const shrunk = fit.k < 1;
  return (
    <div ref={outer} className="fit-scene" style={shrunk ? { height: fit.h * fit.k } : undefined}>
      <div ref={inner} className="fit-scene-inner" style={shrunk ? { transform: `scale(${fit.k})`, transformOrigin: 'top center' } : undefined}>
        {children}
      </div>
    </div>
  );
}
