// Image du récap de fin de soirée (format story 1080×1920), dessinée dans le navigateur : rien n'est envoyé à un serveur.
// drawRecap ne dépend que du contexte 2D, ce qui permet de la tester sous Node avec un faux contexte.
import { avatarColor } from './colors.js';
import { CREDIT } from './credit.js';

export const RECAP_WIDTH = 1080;
export const RECAP_HEIGHT = 1920;
export const MAX_TROPHIES_IN_IMAGE = 6;

const COLORS = { bg: '#14102a', bg2: '#2d1f63', card: 'rgba(255, 255, 255, 0.06)', text: '#fff8f0', muted: '#b3a9d6', pink: '#ff4f8b', yellow: '#ffc93c' };
const FONT = "'Baloo 2', system-ui, sans-serif";
const font = (size, weight = 700) => `${weight} ${size}px ${FONT}`;

export function formatRecapDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Coupe le texte avec « … » s'il dépasse maxWidth. */
export function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function drawAvatar(ctx, player, image, x, y, size) {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.fillStyle = avatarColor(player?.name ?? '?');
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = COLORS.bg;
    ctx.font = font(Math.round(size * 0.5), 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((player?.name ?? '?').charAt(0).toUpperCase(), x + r, y + r + size * 0.04);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, value, x, y, { size, weight = 700, color = COLORS.text, align = 'left', maxWidth } = {}) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(maxWidth ? fitText(ctx, value, maxWidth) : value, x, y);
}

/**
 * Dessine le récap. images : { playerId: image chargée } ; hidePhotos : initiales à la place des photos.
 * Renvoie ce qui a été dessiné (nombre de trophées et de lignes du classement).
 */
export function drawRecap(ctx, recap, { images = {}, hidePhotos = false, publicUrl = null } = {}) {
  const W = RECAP_WIDTH;
  const H = RECAP_HEIGHT;
  const players = Object.fromEntries(recap.players.map((p) => [p.id, p]));
  const imageOf = (id) => (hidePhotos ? null : images[id] ?? null);

  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, COLORS.bg2);
  bg.addColorStop(0.55, COLORS.bg);
  bg.addColorStop(1, COLORS.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Logo « Gorgée » (« ée » en rose, comme sur l'écran).
  ctx.font = font(150, 800);
  const gorg = ctx.measureText('Gorg').width;
  const ee = ctx.measureText('ée').width;
  const left = (W - gorg - ee) / 2;
  text(ctx, 'Gorg', left, 190, { size: 150, weight: 800 });
  text(ctx, 'ée', left + gorg, 190, { size: 150, weight: 800, color: COLORS.pink });
  text(ctx, `Le récap de la soirée · ${formatRecapDate(recap.date)}`, W / 2, 265, { size: 44, weight: 600, color: COLORS.muted, align: 'center', maxWidth: W - 120 });

  // Trophées
  let y = 320;
  const trophies = recap.trophies.slice(0, MAX_TROPHIES_IN_IMAGE);
  const rowH = trophies.length > 4 ? 150 : 175;
  for (const trophy of trophies) {
    const player = players[trophy.playerId];
    ctx.fillStyle = COLORS.card;
    roundRect(ctx, 60, y, W - 120, rowH - 20, 32);
    ctx.fill();
    const size = rowH - 50;
    drawAvatar(ctx, player, imageOf(trophy.playerId), 90, y + 15, size);
    const tx = 90 + size + 36;
    text(ctx, `${trophy.emoji} ${trophy.title}`, tx, y + rowH * 0.3 + 6, { size: 36, color: COLORS.yellow, maxWidth: W - tx - 90 });
    text(ctx, player?.name ?? '?', tx, y + rowH * 0.58 + 6, { size: 50, weight: 800, maxWidth: W - tx - 90 });
    text(ctx, trophy.label, tx, y + rowH * 0.8 + 4, { size: 30, weight: 500, color: COLORS.muted, maxWidth: W - tx - 90 });
    y += rowH;
  }
  if (trophies.length === 0) {
    text(ctx, 'Pas encore de trophée : il faudra rejouer !', W / 2, y + 60, { size: 40, color: COLORS.muted, align: 'center' });
    y += 120;
  }

  // Classement des gorgées : autant de lignes que la place le permet.
  y += 40;
  text(ctx, 'Classement des gorgées', W / 2, y, { size: 48, weight: 800, align: 'center' });
  y += 30;
  const footerTop = 1745;
  const lineH = 66;
  const rows = recap.ranking.slice(0, Math.max(0, Math.floor((footerTop - y) / lineH)));
  for (const row of rows) {
    const player = players[row.playerId];
    const highlight = row.rank === 1 && row.sips > 0;
    text(ctx, String(row.rank), 120, y + 46, { size: 38, weight: 800, color: highlight ? COLORS.yellow : COLORS.muted, align: 'center' });
    drawAvatar(ctx, player, imageOf(row.playerId), 165, y + 6, 52);
    text(ctx, player?.name ?? '?', 240, y + 46, { size: 40, weight: highlight ? 800 : 600, maxWidth: 560 });
    text(ctx, `${row.sips} gorgée${row.sips > 1 ? 's' : ''}`, W - 100, y + 46, { size: 38, color: highlight ? COLORS.yellow : COLORS.text, align: 'right' });
    y += lineH;
  }

  // Pied : total, crédit, adresse du site.
  text(ctx, `${recap.totalSips} gorgée${recap.totalSips > 1 ? 's' : ''} en tout ce soir`, W / 2, 1790, { size: 38, color: COLORS.pink, align: 'center' });
  const footer = [CREDIT.text, publicUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '')].filter(Boolean).join(' · ');
  text(ctx, footer, W / 2, 1860, { size: 30, weight: 500, color: COLORS.muted, align: 'center', maxWidth: W - 120 });

  return { trophies: trophies.length, rankingRows: rows.length };
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Image PNG du récap (Blob), générée localement. */
export async function renderRecapBlob(recap, { hidePhotos = false } = {}) {
  // La police vient de Google Fonts : sans internet (soirée en Wi-Fi local), on n'attend pas plus de 1,5 s.
  await Promise.race([document.fonts?.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);
  const images = {};
  if (!hidePhotos) {
    await Promise.all(recap.players.filter((p) => p.photoUrl).map(async (p) => (images[p.id] = await loadImage(p.photoUrl))));
  }
  const canvas = document.createElement('canvas');
  canvas.width = RECAP_WIDTH;
  canvas.height = RECAP_HEIGHT;
  drawRecap(canvas.getContext('2d'), recap, { images, hidePhotos, publicUrl: recap.publicUrl });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Partage natif (Web Share API avec le fichier) si le téléphone sait faire, sinon téléchargement. */
export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Le récap de la soirée Gorgée' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}
