// Mode Duel côté écrans (TV et téléphones). Chaque écran est remonté avec une `key` basée sur l'identifiant d'étape (`phaseId`),
// et toute action porte ce `phaseId` : le serveur ignore ce qui vient d'une étape passée.
// Les animations (roulettes, révélation des paris, confettis) sont pilotées par l'heure du serveur et passent par duelFx.js :
// annulées d'un coup par teardownGame(), à la pause et quand l'écran est démonté.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, TimerBar } from '../components.jsx';
import { GameIcon } from '../icons.jsx';
import { sipsLabel } from '../sips.jsx';
import { sounds } from '../sound.js';
import { buildStrip, travel } from '../../../shared/roulette.js';
import { socket } from '../lib.js';
import { later, reducedMotion, reelAt, stableShuffle, startLoop, teardownGame, useFrameElapsed } from './duelFx.js';
import { MG_VIEWS } from './duelMinigames.jsx';

export const id = 'duel';
export const waitingText = 'Les paris sont ouverts…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Duel suivant';

const EMOJIS = ['🔥', '😱', '😂', '👏', '💀', '🍿', '😈', '🙌'];
const CAMPS = {
  rouge: { label: 'ROUGE', cls: 'is-rouge' },
  bleu: { label: 'BLEU', cls: 'is-bleu' },
};
const other = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');
const playerOf = (state, pid) => state.players.find((p) => p.id === pid) ?? { id: pid, name: '?', photoUrl: null };
const idOf = (round, camp) => (camp === 'rouge' ? round.red : round.blue);

const NOTICES = {
  gone: (names) => `Duel annulé : ${names} s’est déconnecté. On en tire un autre !`,
  notReady: (names) => `Duel annulé : ${names} n’était pas prêt. On en tire un autre !`,
  removed: (names) => `Duel annulé : ${names} a quitté la partie.`,
  skipped: () => 'Duel passé par l’hôte. On en tire un autre !',
  pause: () => 'Il reste moins de 3 joueurs connectés : le mode attend.',
  resume: () => 'On reprend !',
};
const noticeText = (state, notice) => {
  if (!notice || !NOTICES[notice.kind]) return null;
  return NOTICES[notice.kind]((notice.ids ?? []).map((pid) => playerOf(state, pid).name).join(' et '));
};

/** Un duelliste : photo, prénom, couleur ET libellé (jamais la couleur seule). */
function Fighter({ state, round, camp, size = 150, status = null, locked = true, player: forced = null }) {
  const player = forced ?? playerOf(state, idOf(round, camp));
  const king = round.kingId && round.kingId === player.id;
  return (
    <div className={`duel-fighter ${CAMPS[camp].cls} ${locked ? 'is-locked' : 'is-spinning'}`}>
      <span className="duel-camp-label">{CAMPS[camp].label}</span>
      <div className="duel-fighter-avatar">
        <Avatar player={player} size={size} />
        {king && (
          <span className="duel-crown" aria-label="Roi de la colline">
            👑
          </span>
        )}
      </div>
      <strong className="duel-fighter-name">{player.name}</strong>
      {status && <span className="duel-fighter-status">{status}</span>}
    </div>
  );
}

function KingBanner({ state, round }) {
  if (!round.king) return null;
  const p = playerOf(state, round.king.id);
  return (
    <p className="duel-king-banner">
      👑 Roi de la colline : <strong>{p.name}</strong> · {round.king.streak} victoire{round.king.streak > 1 ? 's' : ''} d’affilée ({CAMPS[round.king.camp].label})
    </p>
  );
}

function Notice({ state, round }) {
  const text = noticeText(state, round.notice);
  return text ? (
    <p className="duel-notice" role="status">
      {text}
    </p>
  ) : null;
}

// ---------- Roulettes ----------

/** Un son par case qui défile, un impact au verrouillage. */
function useReelSound(reel, enabled) {
  const last = useRef(-1);
  const lockedPlayed = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    if (reel.index !== last.current && !reel.locked) {
      last.current = reel.index;
      sounds.clack(0.12);
    }
    if (reel.locked && !lockedPlayed.current) {
      lockedPlayed.current = true;
      sounds.fire();
    }
  }, [reel.index, reel.locked, enabled]);
}

const ROW = 190;
const WINDOW_ROWS = 3;

/** Une colonne de la roulette : photos qui défilent (rouge : de haut en bas, bleu : de bas en haut), arrêt net sur l'élu avec zoom et halo. */
function RouletteColumn({ state, strip, camp, elapsed, lockAt }) {
  const dir = camp === 'rouge' ? 'down' : 'up';
  const L = strip.length;
  const items = dir === 'down' ? [...strip].reverse() : strip;
  const p = elapsed === Infinity ? 1 : travel(elapsed ?? 0, lockAt);
  const idx = dir === 'down' ? (L - 1) * (1 - p) : (L - 1) * p;
  const center = Math.round(idx);
  const locked = p >= 1;
  const y = (WINDOW_ROWS * ROW) / 2 - ROW / 2 - idx * ROW;
  useReelSound({ index: center, locked }, elapsed !== Infinity);
  const byId = useMemo(() => new Map(state.players.map((pl) => [pl.id, pl])), [state.players]);
  const from = Math.max(0, center - 3);
  const to = Math.min(L - 1, center + 3);
  return (
    <div className={`duel-col ${CAMPS[camp].cls} ${locked ? 'is-locked' : ''}`} style={{ height: WINDOW_ROWS * ROW }}>
      <span className="duel-camp-label duel-col-label">{CAMPS[camp].label}</span>
      <div className="duel-col-strip" style={{ transform: `translateY(${y}px)` }}>
        {items.slice(from, to + 1).map((id, i) => {
          const k = from + i;
          const player = byId.get(id) ?? { id, name: '?', photoUrl: null };
          const isCenter = k === center;
          return (
            <div key={k} className={`duel-thumb ${isCenter ? 'is-center' : ''} ${isCenter && locked ? 'is-chosen' : ''}`} style={{ top: k * ROW, height: ROW }}>
              <Avatar player={player} size={isCenter ? 150 : 120} />
              <strong>{player.name}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DuelistRoulette({ state, round }) {
  const elapsed = useFrameElapsed(round.startedAt, state);
  const total = round.timer?.totalMs ?? 6500;
  const ids = state.players.filter((p) => p.connected).map((p) => p.id);
  const strips = useMemo(
    () => ({ rouge: buildStrip(ids, round.red, `${round.phaseId}r`), bleu: buildStrip(ids, round.blue, `${round.phaseId}b`) }),
    [round.phaseId, round.red, round.blue, ids.length],
  );
  const done = elapsed === Infinity || (elapsed ?? 0) >= total * 0.82;
  return (
    <div className="duel-roulette">
      <div className="duel-split" aria-hidden="true" />
      <RouletteColumn state={state} strip={strips.rouge} camp="rouge" elapsed={elapsed} lockAt={total * 0.62} />
      <div className={`duel-vs ${done ? 'is-hit' : ''}`}>VS</div>
      <RouletteColumn state={state} strip={strips.bleu} camp="bleu" elapsed={elapsed} lockAt={total * 0.82} />
    </div>
  );
}

function GameRoulette({ state, round }) {
  const elapsed = useFrameElapsed(round.startedAt, state);
  const total = round.timer?.totalMs ?? 4000;
  const games = round.games ?? [];
  const final = games.find((g) => g.id === round.mg?.id) ?? round.mg;
  const shuffled = useMemo(() => stableShuffle(games, round.phaseId), [round.phaseId]);
  const reel = reelAt(shuffled, final, elapsed ?? 0, total * 0.8, 20);
  useReelSound(reel, elapsed !== Infinity);
  return (
    <div className="duel-gameroulette">
      <p className="duel-eyebrow">Le mini-jeu est…</p>
      <div className={`duel-gamebox ${reel.locked ? 'is-locked' : ''}`}>
        <GameIcon icon={reel.item?.icon} size={170} />
        <strong>{reel.locked ? reel.item?.name : '…'}</strong>
      </div>
    </div>
  );
}

// ---------- Paris ----------

function BetsTv({ state, round }) {
  const { n = 0, of = 0 } = round.betCount ?? {};
  return (
    <div className="duel-bets">
      <div className="duel-bets-fighters">
        <Fighter state={state} round={round} camp="rouge" size={190} />
        <div className="duel-vs">VS</div>
        <Fighter state={state} round={round} camp="bleu" size={190} />
      </div>
      <p className="duel-bets-title">Les paris sont ouverts !</p>
      {round.mg?.rule && <p className="duel-rule">{round.mg.rule}</p>}
      <p className="duel-bets-count">
        <strong>{n}</strong> / {of} ont parié
      </p>
      <div className="duel-dots" aria-hidden="true">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={i < n ? 'is-on' : ''} />
        ))}
      </div>
      <TimerBar timer={round.timer} state={state}>
        {(s) => `Fin des paris dans ${s} s`}
      </TimerBar>
    </div>
  );
}

/** Les paris dévoilés un à un : les photos arrivent du côté choisi, la cote bouge en direct. */
function BetsReveal({ state, round }) {
  const elapsed = useFrameElapsed(round.startedAt, state);
  const total = round.timer?.totalMs ?? 5500;
  const bettors = round.betCount?.of ?? 0;
  const keys = Object.keys(round.bets ?? {});
  const order = useMemo(() => stableShuffle(keys, round.phaseId), [round.phaseId, keys.length]);
  const shownCount = Math.min(order.length, elapsed === Infinity ? order.length : Math.floor(((elapsed ?? 0) / (total * 0.75)) * order.length));
  const shown = order.slice(0, shownCount);
  const side = (camp) => shown.filter((pid) => round.bets[pid] === camp);
  const red = side('rouge').length;
  const blue = side('bleu').length;
  const pct = red + blue ? Math.round((100 * red) / (red + blue)) : 50;
  const lastCount = useRef(0);
  useEffect(() => {
    if (shownCount > lastCount.current) sounds.tick(shownCount / Math.max(1, order.length));
    lastCount.current = shownCount;
  }, [shownCount]);
  const size = bettors > 20 ? 44 : bettors > 12 ? 58 : 76;
  const silent = bettors - order.length;
  return (
    <div className="duel-betsreveal">
      <div className="duel-bets-fighters is-small">
        <Fighter state={state} round={round} camp="rouge" size={110} />
        <div className="duel-vs">VS</div>
        <Fighter state={state} round={round} camp="bleu" size={110} />
      </div>
      <div className="duel-odds" role="img" aria-label={`Cote : ROUGE ${pct} %, BLEU ${100 - pct} %`}>
        <span className="is-rouge" style={{ width: `${pct}%` }}>
          ROUGE {pct} %
        </span>
        <span className="is-bleu" style={{ width: `${100 - pct}%` }}>
          {100 - pct} % BLEU
        </span>
      </div>
      <div className="duel-crowd">
        {['rouge', 'bleu'].map((camp) => (
          <div key={camp} className={`duel-crowd-side ${CAMPS[camp].cls}`}>
            {side(camp).map((pid) => (
              <span key={pid} className="duel-crowd-bettor pop-in" title={playerOf(state, pid).name}>
                <Avatar player={playerOf(state, pid)} size={size} />
                {size >= 58 && <small>{playerOf(state, pid).name}</small>}
              </span>
            ))}
          </div>
        ))}
      </div>
      {silent > 0 && shownCount >= order.length && <p className="duel-silent">{silent} sans pari : ils boiront quoi qu’il arrive !</p>}
    </div>
  );
}

// ---------- Prêts ----------

function ReadyTv({ state, round }) {
  return (
    <div className="duel-ready">
      <p className="duel-eyebrow">{round.mg?.name}</p>
      <div className="duel-bets-fighters">
        {['rouge', 'bleu'].map((camp) => (
          <Fighter key={camp} state={state} round={round} camp={camp} size={190} status={round.ready?.[camp] ? '✔ Prêt !' : 'Pas encore prêt…'} />
        ))}
      </div>
      <TimerBar timer={round.timer} state={state}>
        {(s) => `Départ dans ${s} s (ou dès que les deux sont prêts)`}
      </TimerBar>
    </div>
  );
}

// ---------- Emojis et confettis ----------

const CHEER_COLORS = ['#ff4f8b', '#ffc93c', '#3ee0c5', '#6c8bff', '#7ee05a', '#ff8a3d', '#b46cff', '#ffffff'];
const MARGIN = 0.14; // part de la largeur réservée à chaque marge : les emojis ne montent jamais sur la zone de jeu

/** Sprite d'un emoji (dessiné une seule fois, puis copié à chaque image : fluide même avec beaucoup d'éléments). */
function emojiSprite(cache, emoji) {
  let c = cache.get(emoji);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.font = '76px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 48, 54);
    cache.set(emoji, c);
  }
  return c;
}

/**
 * Emojis et confettis de la TV, dessinés dans un canvas plein écran (60 images par seconde) : uniquement dans les marges, du côté du camp
 * misé. Les lots arrivent par l'événement `duel:cheers` ; beaucoup d'envois en même temps déclenchent un effet de combo.
 */
function CheerCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas.getContext('2d');
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const calm = reducedMotion();
    const cache = new Map();
    const parts = [];
    const recent = []; // [heure, nombre d'appuis] sur la dernière seconde, pour le combo
    let combo = 0;
    const zone = () => {
      const w = canvas.width * MARGIN;
      return { left: [0, w], right: [canvas.width - w, canvas.width] };
    };
    const pickX = (camp) => {
      const z = zone();
      const side = camp === 'bleu' ? z.right : camp === 'rouge' ? z.left : Math.random() < 0.5 ? z.left : z.right;
      return side[0] + Math.random() * (side[1] - side[0]);
    };
    const add = (p) => {
      parts.push(p);
      if (parts.length > 600) parts.splice(0, parts.length - 600);
    };
    const onCheers = (items) => {
      const now = performance.now();
      for (const it of items) {
        recent.push([now, it.count]);
        const big = 1 + Math.min(1.2, combo / 60);
        if (it.kind === 'emoji') {
          const n = calm ? 1 : Math.min(it.count, 8);
          for (let i = 0; i < n; i++) add({ k: 'emoji', sprite: emojiSprite(cache, it.emoji), x: pickX(it.camp), y: canvas.height + 40, vy: -(240 + Math.random() * 260), ph: Math.random() * 6, size: (64 + Math.random() * 40) * big, life: calm ? 1.2 : 3.4, age: 0 });
        } else if (!calm) {
          // Rafale de confettis : de grosses poignées, formes et couleurs variées, tirées vers le haut dans la marge.
          const n = Math.min(40 + it.count * 14, 160) * (combo > 30 ? 2 : 1);
          const x0 = pickX(it.camp);
          const camp = it.camp === 'bleu' ? '#2f7bff' : it.camp === 'rouge' ? '#ff3b4e' : null;
          for (let i = 0; i < n; i++) {
            add({ k: 'conf', shape: i % 4, x: x0, y: canvas.height - 20, vx: (Math.random() - 0.5) * 500, vy: -(500 + Math.random() * 800), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, size: 10 + Math.random() * 14, color: camp && i % 3 === 0 ? camp : CHEER_COLORS[i % CHEER_COLORS.length], life: 2.6 + Math.random() * 1.2, age: 0 });
          }
        }
      }
    };
    socket.on('duel:cheers', onCheers);
    let last = performance.now();
    const stop = startLoop((t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      while (recent.length && t - recent[0][0] > 1000) recent.shift();
      combo = recent.reduce((n, r) => n + r[1], 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      const lz = zone().left;
      const rz = zone().right;
      if (combo > 30 && !calm) {
        // Combo : les marges s'embrasent.
        const a = Math.min(0.45, combo / 200);
        for (const [x0, x1] of [lz, rz]) {
          const grad = g.createLinearGradient(0, canvas.height, 0, 0);
          grad.addColorStop(0, `rgba(255,201,60,${a})`);
          grad.addColorStop(1, 'rgba(255,79,139,0)');
          g.fillStyle = grad;
          g.fillRect(x0, 0, x1 - x0, canvas.height);
        }
        g.font = '800 44px "Baloo 2", sans-serif';
        g.fillStyle = '#fff8f0';
        g.textAlign = 'center';
        g.fillText(`COMBO ×${combo}`, lz[1] / 2, 70);
        g.fillText(`COMBO ×${combo}`, (rz[0] + rz[1]) / 2, 70);
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) {
          parts.splice(i, 1);
          continue;
        }
        g.globalAlpha = Math.min(1, (p.life - p.age) / (p.life * 0.35));
        if (p.k === 'emoji') {
          p.y += p.vy * dt;
          const wob = Math.sin(p.age * 3 + p.ph) * 18;
          g.drawImage(p.sprite, p.x + wob - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else {
          p.vy += 1100 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          // Les confettis restent dans la marge : ils rebondissent sur ses bords.
          const [x0, x1] = p.x < canvas.width / 2 ? lz : rz;
          if (p.x < x0 || p.x > x1) {
            p.vx *= -0.8;
            p.x = Math.max(x0, Math.min(x1, p.x));
          }
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          if (p.shape === 0) g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          else if (p.shape === 1) {
            g.beginPath();
            g.arc(0, 0, p.size / 2.4, 0, 6.3);
            g.fill();
          } else if (p.shape === 2) {
            g.beginPath();
            g.moveTo(0, -p.size / 2);
            g.lineTo(p.size / 2, p.size / 2);
            g.lineTo(-p.size / 2, p.size / 2);
            g.fill();
          } else {
            g.beginPath();
            for (let s = 0; s < 10; s++) {
              const r = s % 2 ? p.size / 4 : p.size / 1.6;
              const a = (s * Math.PI) / 5;
              g.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
            }
            g.fill();
          }
          g.restore();
        }
      }
      g.globalAlpha = 1;
    });
    return () => {
      socket.off('duel:cheers', onCheers);
      stop();
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="duel-cheer-canvas" aria-hidden="true" />;
}

/**
 * Téléphone d'un parieur pendant les jeux : seulement des emojis et des confettis (grille de 2 colonnes, gros boutons).
 * Les appuis sont regroupés par lots toutes les 100 ms ; le serveur plafonne à 15 par seconde (le surplus est ignoré sans erreur).
 */
function CheerPad({ cheer }) {
  const pending = useRef(new Map());
  useEffect(() => {
    const flush = () => {
      for (const [key, count] of pending.current) {
        const [kind, emoji] = key.split('|');
        cheer({ kind, emoji: emoji || undefined, count });
      }
      pending.current.clear();
    };
    const id = setInterval(flush, 100);
    return () => {
      clearInterval(id);
      flush();
    };
  }, []);
  const tap = (kind, emoji = '') => {
    navigator.vibrate?.(12);
    const key = `${kind}|${emoji}`;
    pending.current.set(key, Math.min(15, (pending.current.get(key) ?? 0) + 1));
  };
  return (
    <div className="duel-cheerpad is-fill" role="group" aria-label="Encourager">
      {EMOJIS.map((e) => (
        <button key={e} className="duel-cheerbtn" onClick={() => tap('emoji', e)} aria-label={`Envoyer ${e}`}>
          {e}
        </button>
      ))}
      <button className="duel-cheerbtn is-wide" onClick={() => tap('confetti')}>
        🎉 Confettis
      </button>
    </div>
  );
}

// ---------- Carte d'intro, bannière, menu hôte ----------

/** Carte d'intro du mini-jeu (TV et duellistes) : icône, nom, règle en gros, pictogramme, puis décompte 3-2-1. */
function IntroCard({ state, round, compact = false }) {
  const elapsed = useFrameElapsed(round.startedAt, state);
  const total = round.timer?.totalMs ?? 4500;
  const left = elapsed === Infinity ? 0 : Math.max(0, total - (elapsed ?? 0));
  const count = left > 3000 ? null : Math.max(1, Math.ceil(left / 1000));
  const [picto, rule] = round.mg?.intro ?? ['', ''];
  return (
    <div className={`duel-intro ${compact ? 'is-compact' : ''}`}>
      <GameIcon icon={round.mg?.icon} size={compact ? 90 : 150} />
      <h1 className="duel-intro-name">{round.mg?.name}</h1>
      <p className="duel-intro-rule">{rule}</p>
      <p className="duel-intro-picto" aria-hidden="true">{picto}</p>
      <p key={count} className={`duel-intro-count ${count ? 'is-on' : ''}`} aria-live="polite">{count ?? '…'}</p>
    </div>
  );
}

/** Bannière « duel annulé » : seule à l'écran quelques secondes, puis le duel suivant. */
function NoticeOnly({ state, round }) {
  return (
    <div className="duel-notice-only">
      <p className="duel-notice is-big" role="status">{noticeText(state, round.notice)}</p>
    </div>
  );
}

/** Petit menu hôte discret : replié par défaut, dans un coin (jamais au milieu de l'écran). */
function HostMenu({ gameAct, onQuit, skip = true }) {
  return (
    <details className="duel-hostmenu">
      <summary aria-label="Menu hôte">⋯</summary>
      <div className="duel-hostmenu-items">
        {skip && (
          <button className="ctrl" onClick={() => gameAct({ type: 'skip' })}>
            Passer ce duel
          </button>
        )}
        {onQuit && (
          <button className="ctrl" onClick={onQuit}>
            Terminer le mode
          </button>
        )}
      </div>
    </details>
  );
}

// ---------- Duel ----------

function PlayTv({ state, round, gameAct }) {
  const View = MG_VIEWS[round.mg?.id]?.Tv;
  return (
    <div className="duel-play">
      <div className="duel-corner is-rouge">
        <Fighter state={state} round={round} camp="rouge" size={150} />
      </div>
      <div className="duel-corner is-bleu">
        <Fighter state={state} round={round} camp="bleu" size={150} />
      </div>
      <div className="duel-play-body">{View && round.play ? <View state={state} round={round} play={round.play} gameAct={gameAct} /> : null}</div>
    </div>
  );
}

// ---------- Écrans de la TV ----------

export function HostQuestion({ state, gameAct, onQuit }) {
  const round = state.round;
  // Fin du mode, changement de jeu ou pause : toutes les animations s'arrêtent.
  useEffect(() => () => teardownGame(), []);
  useEffect(() => {
    if (state.paused) teardownGame();
  }, [state.paused]);
  let body;
  if (round.step === 'waiting') {
    body = (
      <div className="duel-waiting">
        <h2>En attente de joueurs…</h2>
        <p>Il faut au moins 3 joueurs connectés (2 duellistes et 1 parieur).</p>
        <Notice state={state} round={round} />
      </div>
    );
  } else {
    const Step = { notice: NoticeOnly, duelists: DuelistRoulette, game: GameRoulette, bets: BetsTv, betsReveal: BetsReveal, ready: ReadyTv, intro: IntroCard, play: PlayTv }[round.step];
    body = (
      <>
        {!['notice', 'intro', 'play'].includes(round.step) && <KingBanner state={state} round={round} />}
        {Step && <Step key={round.phaseId} state={state} round={round} gameAct={gameAct} />}
        {['betsReveal', 'ready', 'intro', 'play'].includes(round.step) && <CheerCanvas />}
      </>
    );
  }
  return (
    <div className="duel-host">
      <HostMenu gameAct={gameAct} onQuit={onQuit} />
      <div key={round.step} className="duel-fade">
        {body}
      </div>
    </div>
  );
}

/** Suspense avant le verdict : les deux duellistes, puis le vainqueur. */
export function HostReveal({ state }) {
  const r = state.results;
  const round = state.round;
  const elapsed = useFrameElapsed(state.reveal?.startedAt, state);
  const done = elapsed === Infinity || (elapsed ?? 0) > (state.reveal?.durationMs ?? 4500) * 0.55;
  const View = MG_VIEWS[round.mg?.id]?.Reveal ?? MG_VIEWS[round.mg?.id]?.Tv;
  useEffect(() => {
    if (done) sounds.reveal();
    else sounds.drumroll(2200);
    return () => teardownGame();
  }, [done]);
  return (
    <div className="duel-reveal">
      <div className="duel-bets-fighters">
        {['rouge', 'bleu'].map((camp) => (
          <div key={camp} className={done ? (r.winner === camp ? 'is-winner' : r.winner === 'égalité' ? '' : 'is-loser') : ''}>
            <Fighter state={state} round={round} camp={camp} size={200} />
          </div>
        ))}
      </div>
      {View && round.play && !done && (
        <div className="duel-reveal-play">
          <View state={state} round={round} play={round.play} />
        </div>
      )}
      <p className="duel-eyebrow">{done ? (r.winner === 'égalité' ? 'Égalité !' : `${CAMPS[r.winner].label} gagne !`) : 'Et le vainqueur est…'}</p>
    </div>
  );
}

/** Pluie de confettis de victoire : deux salves depuis le haut, puis le canvas se vide ; rien du tout avec « réduire les animations ». */
function WinnerBurst({ camp }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reducedMotion()) return undefined;
    const canvas = ref.current;
    const g = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const parts = [];
    const colors = camp === 'bleu' ? ['#2f7bff', '#ffc93c', '#ffffff', '#3ee0c5'] : ['#ff3b4e', '#ffc93c', '#ffffff', '#ff8a3d'];
    const burst = (n) => {
      for (let i = 0; i < n; i++) parts.push({ x: Math.random() * canvas.width, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 240, vy: 120 + Math.random() * 320, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 10 + Math.random() * 14, h: 6 + Math.random() * 10, color: colors[i % colors.length], gold: i % 5 === 0 });
    };
    burst(140);
    const second = later(() => burst(120), 900);
    let last = performance.now();
    const stop = startLoop((t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += (p.vx + Math.sin(p.y / 60) * 60) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > canvas.height + 30) {
          parts.splice(i, 1);
          continue;
        }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.gold ? '#ffd24a' : p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
    });
    return () => {
      second?.();
      stop();
    };
  }, [camp]);
  return <canvas ref={ref} className="duel-winner-burst" aria-hidden="true" />;
}

export function HostResults({ state, onQuit }) {
  const r = state.results;
  const round = state.round;
  const drinkers = Object.entries(r.sips)
    .filter(([pid]) => state.players.some((p) => p.id === pid))
    .sort((a, b) => b[1] - a[1]);
  const Summary = MG_VIEWS[r.mgId]?.Summary;
  const tie = r.winner === 'égalité';
  const winner = r.winnerId ? playerOf(state, r.winnerId) : null;
  return (
    <div className="duel-results">
      <HostMenu skip={false} gameAct={() => {}} onQuit={onQuit} />
      {!tie && <WinnerBurst camp={r.winner} />}
      <h1 className={`duel-winner ${tie ? '' : CAMPS[r.winner].cls}`}>{tie ? 'Égalité !' : `🏆 ${winner.name} gagne !`}</h1>
      <div className="duel-bets-fighters is-small">
        {['rouge', 'bleu'].map((camp) => (
          <div key={camp} className={tie ? '' : r.winner === camp ? 'is-winner' : 'is-loser'}>
            <Fighter state={state} round={{ ...round, kingId: r.kingId }} camp={camp} size={150} />
            {!tie && <span className={`duel-outcome ${r.winner === camp ? 'is-win' : 'is-lose'}`}>{r.winner === camp ? '🏆 Vainqueur' : '✕ Battu'}</span>}
          </div>
        ))}
      </div>
      {Summary && <Summary state={state} details={r.details} />}
      {r.kingRetires && <p className="duel-king-banner is-retire">👏 {winner?.name} part invaincu après 5 victoires d’affilée !</p>}
      {r.kingFell && !tie && (
        <p className="duel-king-banner is-fall">
          👑 Le roi est tombé ! +{r.kingStreak} gorgée{r.kingStreak > 1 ? 's' : ''} pour ses {r.kingStreak} victoires
        </p>
      )}
      {r.kingNext && (
        <p className="duel-king-banner">
          👑 {playerOf(state, r.kingNext.id).name} reste roi · {r.kingNext.streak} victoire{r.kingNext.streak > 1 ? 's' : ''}
        </p>
      )}
      <p className="duel-cote-line">
        {tie ? 'Égalité : seuls les duellistes boivent 1 gorgée.' : `Cote ${r.cote === 'hardcore' ? 'Hardcore' : 'Standard'} : ${r.B} pari${r.B > 1 ? 's' : ''} sur le vainqueur`}
      </p>
      <div className="duel-drinkers">
        <h2>{drinkers.length ? 'Ça trinque !' : 'Personne ne boit'}</h2>
        <div className="duel-drinkers-grid">
          {drinkers.map(([pid, n]) => (
            <div key={pid} className="duel-drinker">
              <Avatar player={playerOf(state, pid)} size={drinkers.length > 14 ? 64 : drinkers.length > 8 ? 84 : 104} />
              <strong>{playerOf(state, pid).name}</strong>
              <span className="duel-drinker-sips">🍺 {sipsLabel(n)}</span>
              {pid === r.loserId && <small>perdant</small>}
              {r.wrong.includes(pid) && <small>mauvais pari</small>}
              {r.silent.includes(pid) && <small>sans pari</small>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Écrans des téléphones ----------

function BetButtons({ state, round, my, vote }) {
  return (
    <div className="duel-betpad">
      <h1>Qui va gagner ?</h1>
      {round.mg?.rule && <p className="duel-rule">{round.mg.rule}</p>}
      <p className="muted">Ton pari est secret. Tu peux changer jusqu’à la révélation.</p>
      {['rouge', 'bleu'].map((camp) => {
        const p = playerOf(state, idOf(round, camp));
        return (
          <button key={camp} className={`duel-betbtn ${CAMPS[camp].cls} ${my.bet === camp ? 'is-picked' : ''}`} onClick={() => vote(camp)} aria-pressed={my.bet === camp}>
            <Avatar player={p} size={72} />
            <span>
              <small>{CAMPS[camp].label}</small>
              <strong>{p.name}</strong>
            </span>
            {my.bet === camp && <em>✔ Ton pari</em>}
          </button>
        );
      })}
      <TimerBar timer={round.timer} state={state} small>
        {(s) => `${s} s pour parier`}
      </TimerBar>
    </div>
  );
}

function Spectator({ round, my, cheer }) {
  // Seul rappel du pari : un fin liseré en haut (rouge ou bleu, avec son libellé pour les lecteurs d'écran).
  return (
    <div className="duel-spectator is-fill">
      <div className={`duel-betband ${my.bet ? CAMPS[my.bet].cls : 'is-none'}`} role="note" aria-label={my.bet ? `Ton pari : ${CAMPS[my.bet].label}` : 'Pas de pari'} />
      {['betsReveal', 'intro', 'ready', 'play'].includes(round.step) && !round.finished ? <CheerPad cheer={cheer} /> : <p className="duel-eyebrow">Regarde l’écran !</p>}
    </div>
  );
}

/** Cache `children` jusqu'à `at` (part de la durée de l'étape) : un duelliste ne gâche pas le suspense de la roulette. */
function Reveal({ at, state, round, wait, children }) {
  const elapsed = useFrameElapsed(round.startedAt, state);
  const total = round.timer?.totalMs ?? 6500;
  return (elapsed ?? 0) >= total * at ? children : <div className="center">{wait}</div>;
}

function DuelistScreen({ state, round, act, my }) {
  const camp = my.camp;
  const opponent = playerOf(state, idOf(round, other(camp)));
  const Dview = MG_VIEWS[round.mg?.id]?.Duelist;
  const intro = (
    <div className={`duel-me ${CAMPS[camp].cls}`}>
      <p className="duel-eyebrow">Tu es</p>
      <h1>{CAMPS[camp].label}</h1>
      <p>
        contre <strong>{opponent.name}</strong>
      </p>
    </div>
  );
  if (round.step === 'duelists') {
    return (
      <Reveal at={0.85} state={state} round={round} wait={<p className="duel-eyebrow">Regarde la TV…</p>}>
        <div className="center">{intro}</div>
      </Reveal>
    );
  }
  if (round.step === 'notice') return <NoticeOnly state={state} round={round} />;
  if (round.step === 'intro') return <IntroCard compact state={state} round={round} />;
  if (round.step === 'game') {
    return (
      <div className="center">
        {intro}
        <p className="muted">Mini-jeu : regarde la TV…</p>
      </div>
    );
  }
  if (round.step === 'bets' || round.step === 'betsReveal') {
    return (
      <div className="center">
        {intro}
        <p className="muted">Les autres parient sur toi. Concentre-toi !</p>
      </div>
    );
  }
  if (round.step === 'ready') {
    return (
      <div className="center">
        {intro}
        <h2>{round.mg?.name}</h2>
        {my.ready ? (
          <p className="duel-ready-ok">✔ Prêt ! On attend {opponent.name}…</p>
        ) : (
          <button className="btn btn-primary btn-xl duel-ready-btn" onClick={() => act({ type: 'ready', phaseId: round.phaseId })}>
            Prêt
          </button>
        )}
        <TimerBar timer={round.timer} state={state} small>
          {(s) => `${s} s pour être prêt`}
        </TimerBar>
      </div>
    );
  }
  if (round.step === 'play') {
    return Dview && round.play ? (
      <div className={`duel-duelist ${CAMPS[camp].cls}`}>
        <p className="duel-eyebrow">
          {CAMPS[camp].label} · {round.mg?.name}
        </p>
        <Dview state={state} round={round} play={round.play} side={camp} act={(data) => act({ type: 'play', data, phaseId: round.phaseId })} />
      </div>
    ) : (
      <div className="center">
        <p className="muted">C’est parti…</p>
      </div>
    );
  }
  return <div className="center">{intro}</div>;
}

export function PlayerRound({ state, act, vote, cheer }) {
  const round = state.round;
  const my = round?.me;
  useEffect(() => () => teardownGame(), []);
  if (!round || !my) return <div className="center muted">…</div>;
  if (round.step === 'waiting') {
    return (
      <div className="center">
        <h1>En pause</h1>
        <p className="lead">{noticeText(state, round.notice) ?? 'On attend des joueurs.'}</p>
      </div>
    );
  }
  let body;
  if (round.step === 'notice') body = <NoticeOnly state={state} round={round} />;
  else if (my.role === 'duelist') body = <DuelistScreen state={state} round={round} act={act} my={my} />;
  else if (round.step === 'bets' && my.role === 'bettor') body = <BetButtons state={state} round={round} my={my} vote={vote} />;
  else if (my.role === 'out') {
    body = (
      <div className="center">
        <h1>Duel en cours</h1>
        <p className="lead">Tu paries dès le prochain duel.</p>
      </div>
    );
  } else if (['duelists', 'game'].includes(round.step)) {
    body = (
      <div className="center">
        <h1>Regarde la TV !</h1>
        <p className="lead">Qui va se battre ?</p>
      </div>
    );
  } else body = <Spectator round={round} my={my} cheer={cheer} />;
  return (
    <div key={round.phaseId} className="duel-phone">
      {body}
    </div>
  );
}

export function PlayerResults({ verdict }) {
  return verdict;
}

export function verdict(state, me) {
  const r = state.results;
  const sips = state.roundSips?.[me.id] ?? 0;
  const drinks = sips > 0;
  const camp = r.red === me.id ? 'rouge' : r.blue === me.id ? 'bleu' : null;
  const tie = r.winner === 'égalité';
  const banner = tie ? null : { kind: r.winner === 'rouge' ? 'red' : 'blue', icon: '⚔️', text: `${CAMPS[r.winner].label} gagne : ${playerOf(state, r.winnerId).name}` };
  if (camp) {
    if (tie) return { drinks, title: 'Égalité !', detail: 'Personne ne l’emporte : vous buvez chacun 1 gorgée.', banner };
    return camp === r.winner
      ? { drinks: false, title: 'Victoire !', detail: `Tu as battu ${playerOf(state, camp === 'rouge' ? r.blue : r.red).name}.`, banner }
      : { drinks, title: 'Tu bois !', detail: r.kingFell && r.kingId === me.id ? `Le roi est tombé : ${sipsLabel(sips)}.` : 'Battu. Au suivant !', banner };
  }
  if (!r.bettors.includes(me.id)) return { drinks: false, title: 'Spectateur', detail: 'Tu paries dès le prochain duel.', banner };
  if (tie) return { drinks: false, title: 'Égalité', detail: 'Les parieurs sont épargnés.', banner };
  if (r.right.includes(me.id)) return { drinks: false, title: 'Bien joué, tu as vu juste', detail: 'Ton pari est gagnant.', banner };
  return { drinks, title: 'Tu bois !', detail: r.silent.includes(me.id) ? 'Tu n’avais pas parié.' : 'Mauvais pari.', banner };
}

export function EndStats({ state }) {
  const rows = state.players.map((p) => ({ p, ...(state.stats?.[p.id] ?? {}) })).filter((x) => x.duelWins || x.betsRight);
  if (!rows.length) return null;
  const best = [...rows].sort((a, b) => (b.duelWins ?? 0) - (a.duelWins ?? 0))[0];
  return best.duelWins ? <p className="lead">🏆 Plus de victoires : {best.p.name} ({best.duelWins})</p> : null;
}
