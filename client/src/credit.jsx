// Crédit de l'auteur, affiché sur l'accueil, le lobby de la TV et l'image du récap de fin.
// Seul endroit à modifier pour changer le texte ou ajouter un lien.
export const CREDIT = {
  text: 'Made by Kaloo',
  // TODO : renseigner l'URL du crédit (profil GitHub ou site), par exemple 'https://github.com/…'. null = texte seul.
  url: null,
};

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
