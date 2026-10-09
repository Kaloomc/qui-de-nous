import { useEffect, useRef, useState } from 'react';
import { Confetti, PlayerChip, useRevealSound } from '../components.jsx';
import { serverNow } from '../lib.js';
import { sounds } from '../sound.js';

export const id = 'tu-preferes';
export const label = 'Tu préfères ?';
export const tagline = 'A ou B : la minorité boit.';
export const waitingText = 'Suspense…';

// Découpage de la révélation (durée totale fixée par le serveur, revealMs dans server/modes.js) :
// « Attention… » pendant ANNOUNCE_MS, puis la jauge oscille, puis une courte pause avant les résultats.
const ANNOUNCE_MS = 1500;
const SETTLE_MS = 300;
const SWINGS = 6;

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const shareOfA = (results) => (results.totalVotes ? results.counts.a / results.totalVotes : 0.5);

function OptionCard({ side, text, status, percent, compact }) {
  return (
    <div className={`option option-${side} ${status ? `option-${status}` : ''} ${compact ? 'option-compact' : ''}`}>
      {status === 'win' && <Confetti />}
      <span className="option-letter">{side.toUpperCase()}</span>
      <p className={`option-text ${text.length > 45 ? 'option-text-long' : ''}`}>{text}</p>
      {percent != null && <p className="option-pct pop-in">{percent} %</p>}
    </div>
  );
}

export function HostQuestion({ state }) {
  const { round } = state;
  return (
    <>
      <p className="round">Question {round.number}</p>
      <h1 className="tp-title">Tu préfères…</h1>
      <div key={round.number} className="duel slide-in">
        <OptionCard side="a" text={round.a} />
        <div className="duel-or">ou</div>
        <OptionCard side="b" text={round.b} />
      </div>
    </>
  );
}

/**
 * Jauge qui oscille entre A (gauche) et B (droite), de plus en plus lentement,
 * puis se pose sur la vraie répartition. Animée en requestAnimationFrame en
 * écrivant directement dans le DOM, sans re-render React, pour rester fluide.
 * startIn : délai avant le début de l'oscillation (négatif si la TV a été rechargée en cours de route).
 */
function Balance({ shareA, startIn = 0, duration = 0, animate = true }) {
  const fillRef = useRef(null);
  const needleRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const draw = (pos) => {
      fillRef.current.style.transform = `scaleX(${pos})`;
      needleRef.current.style.transform = `translateX(${pos * 100}%)`;
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduced || duration <= 0) {
      draw(shareA);
      return undefined;
    }
    const beat = () => {
      const el = rootRef.current;
      el.classList.remove('beat');
      void el.offsetWidth;
      el.classList.add('beat');
    };

    const start = performance.now() + startIn;
    let raf;
    let lastSign = 0;
    const frame = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const remaining = 1 - t;
      // Centre qui glisse vers la vraie valeur, amplitude qui s'éteint, fréquence qui ralentit.
      const center = 0.5 + (shareA - 0.5) * t * t;
      const amplitude = 0.48 * remaining ** 1.4;
      const swing = Math.sin(2 * Math.PI * SWINGS * (1 - remaining * remaining));
      draw(t < 1 ? Math.min(0.98, Math.max(0.02, center + amplitude * swing)) : shareA);

      const sign = Math.sign(swing);
      if (t > 0 && t < 1 && sign !== 0 && sign !== lastSign) {
        if (lastSign !== 0) {
          sounds.tick(t);
          beat();
        }
        lastSign = sign;
      }
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [shareA, startIn, duration, animate]);

  return (
    <div ref={rootRef} className="balance">
      <div className="balance-track">
        <div ref={fillRef} className="balance-fill" />
      </div>
      <div ref={needleRef} className="balance-needle-rail">
        <span className="balance-needle" />
      </div>
    </div>
  );
}

/** Annonce + jauge à suspense. La TV seule reçoit les résultats à ce stade (les téléphones attendent). */
export function HostReveal({ state }) {
  const { round, reveal } = state;
  const announceEnd = reveal.startedAt + ANNOUNCE_MS;
  // Calculé une seule fois au montage : l'animation suit ensuite sa propre horloge.
  const [timing] = useState(() => ({
    startIn: announceEnd - serverNow(state),
    duration: reveal.durationMs - ANNOUNCE_MS - SETTLE_MS,
  }));
  const [announcing, setAnnouncing] = useState(timing.startIn > 0);

  useEffect(() => {
    if (timing.startIn <= 0) return undefined;
    sounds.heartbeat();
    const id = setTimeout(() => setAnnouncing(false), timing.startIn);
    return () => clearTimeout(id);
  }, [timing]);

  return (
    <div className="tp tp-results is-suspense">
      <p className="round">Question {round.number} · Tu préfères…</p>
      <div className="duel">
        <OptionCard side="a" text={round.a} compact />
        <div className="duel-or">ou</div>
        <OptionCard side="b" text={round.b} compact />
      </div>
      <Balance shareA={shareOfA(state.results)} startIn={timing.startIn} duration={timing.duration} />
      <p key={announcing ? 'announce' : 'suspense'} className={announcing ? 'announce pop-in' : 'suspense-label'}>
        {announcing ? 'Attention…' : 'Suspense…'}
      </p>
    </div>
  );
}

function sideStatus(results, side) {
  if (results.tie) return 'tie';
  return results.majority === side ? 'win' : 'lose';
}

function Camp({ side, players, status, results }) {
  const empty = players.length === 0;
  const campDrinks = players.some((p) => results.drinkerIds.includes(p.id));
  let tag = null;
  if (status === 'win') tag = <span className="camp-tag camp-tag-win">Épargnés</span>;
  if (status === 'lose') tag = <span className="camp-tag camp-tag-lose">{empty ? 'Personne' : 'Ils boivent !'}</span>;
  if (status === 'tie') tag = <span className="camp-tag camp-tag-tie">{campDrinks ? 'Ils boivent !' : 'Sauvés'}</span>;
  return (
    <div className={`camp camp-${side} camp-${status}`}>
      <div className="camp-head fade-up">{tag}</div>
      <div className="camp-players">
        {players.map((p, i) => (
          <div key={p.id} className="land" style={{ animationDelay: `${150 + i * 110}ms` }}>
            <PlayerChip player={p} size={players.length > 8 ? 56 : 72} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  const { counts, totalVotes } = results;
  useRevealSound(state);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const campOf = (side) =>
    Object.entries(results.choices)
      .filter(([, choice]) => choice === side)
      .map(([pid]) => byId.get(pid))
      .filter(Boolean);
  const nonVoters = results.nonVoterIds.map((pid) => byId.get(pid)).filter(Boolean);
  const votersDrinkOnTie = Object.keys(results.choices).some((pid) => results.drinkerIds.includes(pid));

  return (
    <div className="tp tp-results is-revealed">
      <p className="round">Question {round.number} · Tu préfères…</p>
      <div className="duel">
        <OptionCard side="a" text={round.a} compact status={sideStatus(results, 'a')} percent={pct(counts.a, totalVotes)} />
        <div className="duel-or">ou</div>
        <OptionCard side="b" text={round.b} compact status={sideStatus(results, 'b')} percent={pct(counts.b, totalVotes)} />
      </div>

      <Balance shareA={shareOfA(results)} animate={false} />

      {results.tie && (
        <p className="tie-banner zoom-in">
          {totalVotes === 0 ? 'Personne n’a voté : tout le monde boit !' : votersDrinkOnTie ? 'Égalité : tout le monde boit !' : 'Égalité, tout le monde est sauvé !'}
        </p>
      )}
      <div className="camps">
        <Camp side="a" players={campOf('a')} status={sideStatus(results, 'a')} results={results} />
        <Camp side="b" players={campOf('b')} status={sideStatus(results, 'b')} results={results} />
      </div>
      {nonVoters.length > 0 && totalVotes > 0 && (
        <div className="no-vote fade-up" style={{ animationDelay: '600ms' }}>
          <span className="camp-tag camp-tag-lose">Pas voté : ils boivent</span>
          <div className="camp-players">
            {nonVoters.map((p) => (
              <PlayerChip key={p.id} player={p} size={56} badge="zzz" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerVote({ state, onVote }) {
  const { round } = state;
  return (
    <div className="vote tp-vote">
      <p className="round">Question {round.number}</p>
      <h1 className="vote-question">Tu préfères…</h1>
      <button className="tp-choice tp-choice-a" onClick={() => onVote('a')}>
        <span className="option-letter">A</span>
        <span>{round.a}</span>
      </button>
      <div className="duel-or">ou</div>
      <button className="tp-choice tp-choice-b" onClick={() => onVote('b')}>
        <span className="option-letter">B</span>
        <span>{round.b}</span>
      </button>
    </div>
  );
}

export function VoteSummary({ state, choice }) {
  if (choice !== 'a' && choice !== 'b') return null;
  return (
    <div className={`tp-summary tp-choice-${choice}`}>
      <span className="option-letter">{choice.toUpperCase()}</span>
      <span>{state.round[choice]}</span>
    </div>
  );
}

export function verdict(state, me) {
  const { results } = state;
  const choice = results.choices[me.id];
  const drinks = results.drinkerIds.includes(me.id);
  const { a, b } = results.counts;
  const extra = `A : ${pct(a, results.totalVotes)} % · B : ${pct(b, results.totalVotes)} %`;

  if (!choice) return { drinks: true, title: 'Tu bois !', detail: 'Tu n’as pas voté à temps.', extra };
  if (results.tie) {
    return drinks
      ? { drinks, title: 'Tu bois !', detail: 'Égalité : tout le monde boit.', extra }
      : { drinks, title: 'Sauvé !', detail: 'Égalité, tout le monde est sauvé.', extra };
  }
  return drinks
    ? { drinks, title: 'Tu bois !', detail: 'Ton camp est en minorité.', extra }
    : { drinks, title: 'Tu ne bois pas', detail: 'Tu es dans la majorité.', extra };
}
