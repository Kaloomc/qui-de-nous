import { CREDIT } from './credit.js';

export { CREDIT };

/** Petit crédit discret (peu contrasté), jamais au milieu du jeu. */
export function Credit({ className = '' }) {
  return (
    <p className={`credit ${className}`}>
      {CREDIT.url ? (
        <a href={CREDIT.url} target="_blank" rel="noreferrer">
          {CREDIT.text}
        </a>
      ) : (
        CREDIT.text
      )}
    </p>
  );
}
