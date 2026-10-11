import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Avatar, Confetti } from './components.jsx';
import { Credit } from './credit.jsx';
import { Logo } from './icons.jsx';
import { navigate, useJoinUrl } from './lib.js';
import { downloadBlob, formatRecapDate, renderRecapBlob, shareOrDownload } from './recapImage.js';
import { sipsLabel } from './sips.jsx';
import { sounds } from './sound.js';

// Récap de fin de soirée : trophées calculés par le serveur (server/recap.js), image générée sur l'appareil (recapImage.js).

const TEASE_MS = 1500;
const SHOW_MS = 1700;
const KEEP_NOTICE = 'Le récap reste disponible tant que la partie existe : elle est effacée 6 h après la dernière activité.';

const playerOf = (recap, id) => recap.players.find((p) => p.id === id);

function TrophyCard({ recap, trophy, revealed, delay = 0 }) {
  const player = playerOf(recap, trophy.playerId);
  return (
    <div className={`trophy-card ${revealed ? 'is-revealed' : 'is-teased'} pop-in`} style={{ animationDelay: `${delay}ms` }}>
      <span className="trophy-emoji" aria-hidden="true">
        {trophy.emoji}
      </span>
      <span className="trophy-title">{trophy.title}</span>
      {revealed ? (
        <>
          <Avatar player={player} size={96} className="zoom-in" />
          <strong className="trophy-name zoom-in">{player?.name}</strong>
          <span className="trophy-label">{trophy.label}</span>
        </>
      ) : (
        <>
          <span className="avatar avatar-fallback trophy-mystery" style={{ width: 96, height: 96, fontSize: 44 }}>
            ?
          </span>
          <strong className="trophy-name">Et c’est…</strong>
        </>
      )}
    </div>
  );
}

function RecapRanking({ recap, limit = 10 }) {
  const rows = recap.ranking.slice(0, limit);
  return (
    <ol className="ranking recap-ranking">
      {rows.map((r) => {
        const player = playerOf(recap, r.playerId);
        return (
          <li key={r.playerId} className={r.rank === 1 && r.sips > 0 ? 'is-top' : ''}>
            <span className="ranking-rank">{r.rank}</span>
            <Avatar player={player} size={36} />
            <span className="ranking-name">{player?.name}</span>
            <span className="ranking-sips">{sipsLabel(r.sips)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** TV : les trophées se révèlent un par un (suspense, puis le gagnant), puis le classement final. */
export function RecapShow({ recap }) {
  const count = recap.trophies.length;
  // step 2k+1 : trophée k annoncé ; 2k+2 : gagnant révélé ; 2·count+1 : classement.
  const [step, setStep] = useState(0);
  const done = step > 2 * count;

  useEffect(() => {
    if (done) return undefined;
    const teasing = step % 2 === 1;
    const id = setTimeout(() => setStep((s) => s + 1), step === 0 ? 1200 : teasing ? TEASE_MS : SHOW_MS);
    return () => clearTimeout(id);
  }, [step, done]);

  useEffect(() => {
    if (step === 0) return;
    if (step > 2 * count) sounds.reveal();
    else if (step % 2 === 1) sounds.drumroll(TEASE_MS);
    else sounds.ding();
  }, [step, count]);

  const shown = recap.trophies.slice(0, Math.ceil(step / 2));
  return (
    <div className="recap-show">
      {done && count > 0 && <Confetti />}
      <h1 className="logo logo-sm">Le récap de la soirée</h1>
      <p className="lead">
        {formatRecapDate(recap.date)} · {sipsLabel(recap.totalSips)} en tout
      </p>
      {count === 0 && <p className="lead muted">Pas assez de manches pour des trophées : il faudra rejouer !</p>}
      <div className="trophy-grid">
        {shown.map((t, i) => (
          <TrophyCard key={t.id} recap={recap} trophy={t} revealed={step >= 2 * i + 2} />
        ))}
      </div>
      {done && (
        <div className="fade-up">
          <h3>Classement des gorgées</h3>
          <RecapRanking recap={recap} />
        </div>
      )}
      {!done && (
        <button className="btn btn-ghost small" onClick={() => setStep(2 * count + 1)}>
          Tout afficher
        </button>
      )}
    </div>
  );
}

/** Génère l'image sur l'appareil (aperçu), puis la partage (téléphone) ou la télécharge (TV / PC). */
export function RecapShare({ recap, phone = false }) {
  const [hidePhotos, setHidePhotos] = useState(false);
  const [image, setImage] = useState(null); // { blob, url }
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let url = null;
    setImage(null);
    renderRecapBlob(recap, { hidePhotos }).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setImage({ blob, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [recap, hidePhotos]);

  const filename = `gorgee-recap-${recap.date.slice(0, 10)}.png`;
  async function share() {
    if (!image) return;
    if (!phone) {
      downloadBlob(image.blob, filename);
      return setStatus('Image téléchargée.');
    }
    const result = await shareOrDownload(image.blob, filename);
    setStatus(result === 'downloaded' ? 'Partage indisponible ici : l’image a été téléchargée.' : null);
  }

  return (
    <div className="recap-share">
      {image ? <img className="recap-preview" src={image.url} alt="Aperçu de l’image du récap" /> : <div className="recap-preview recap-preview-loading">Préparation de l’image…</div>}
      <div className="recap-share-side">
        <label className="recap-hide">
          <input type="checkbox" checked={hidePhotos} onChange={(e) => setHidePhotos(e.target.checked)} />
          Masquer les photos dans l’image
        </label>
        <p className="muted small">Les photos des autres joueurs apparaissent dans l’image, partage-la avec leur accord.</p>
        <button className="btn btn-primary btn-xl" onClick={share} disabled={!image}>
          {phone ? 'Partager le récap' : 'Télécharger l’image'}
        </button>
        {status && <p className="muted small">{status}</p>}
      </div>
    </div>
  );
}

/** QR code vers /recap/CODE : chacun ouvre le récap sur son téléphone pour l'enregistrer. */
export function RecapQr({ code }) {
  const url = useJoinUrl(code).replace(/\/join\//, '/recap/');
  const [qr, setQr] = useState(null);
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#14102a', light: '#ffffff' } }).then(setQr);
  }, [url]);
  return (
    <div className="recap-qr">
      {qr && <img src={qr} alt={`QR code vers ${url}`} />}
      <p>
        Scanne pour garder le récap sur ton téléphone.
        <br />
        <span className="muted small">{KEEP_NOTICE}</span>
      </p>
    </div>
  );
}

/** Écran de fin de soirée sur la TV : révélation, puis image à télécharger et QR code. */
export function HostRecap({ recap, code, actions }) {
  return (
    <div className="host-recap">
      <RecapShow recap={recap} />
      <div className="host-recap-share fade-up" style={{ animationDelay: `${(recap.trophies.length * (TEASE_MS + SHOW_MS)) / 1000 + 1.5}s` }}>
        <RecapQr code={code} />
        <RecapShare recap={recap} />
      </div>
      <div className="actions">{actions}</div>
      <Credit />
    </div>
  );
}

/** Téléphone, en fin de partie : bouton de partage. */
export function PlayerRecap({ recap }) {
  return (
    <div className="player-recap">
      <h2>Le récap de la soirée</h2>
      <RecapShare recap={recap} phone />
      <p className="muted small">{KEEP_NOTICE}</p>
    </div>
  );
}

/** Page /recap/CODE, ouverte depuis le QR code de la TV (pas besoin d'être dans la partie). */
export function RecapPage({ code }) {
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`/api/recap/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setRecap)
      .catch(() => setError('Ce récap n’existe plus : les parties sont effacées 6 h après la dernière activité (ou au redémarrage du serveur).'));
  }, [code]);

  if (error) {
    return (
      <main className="page center">
        <h1>Oups</h1>
        <p className="lead">{error}</p>
        <button className="btn btn-primary btn-xl" onClick={() => navigate('/')}>
          Accueil
        </button>
      </main>
    );
  }
  if (!recap) return <main className="page center muted">Chargement du récap…</main>;
  return (
    <main className="page recap-page">
      <Logo size="sm" />
      <h1>Le récap de la soirée</h1>
      <p className="lead">
        {formatRecapDate(recap.date)} · {sipsLabel(recap.totalSips)} en tout
      </p>
      <div className="trophy-grid">
        {recap.trophies.map((t) => (
          <TrophyCard key={t.id} recap={recap} trophy={t} revealed />
        ))}
      </div>
      <RecapRanking recap={recap} />
      <RecapShare recap={recap} phone />
      <p className="muted small">{KEEP_NOTICE}</p>
      <Credit />
    </main>
  );
}
