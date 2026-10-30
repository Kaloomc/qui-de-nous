// Vues des mini-jeux « le secret des parieurs » du mode Duel : Dés menteurs et Roulette russe (même contrat que duelMinigames.jsx : Tv, Duelist,
// Summary, plus `Secret` : ce que voit, en plus des emojis, un parieur de ce duel quand le serveur lui envoie `play.secret`).
import { useEffect, useState } from 'react';
import { TimerBar } from '../components.jsx';
import { later, reducedMotion } from './duelFx.js';

const CAMP_LABEL = { rouge: 'ROUGE', bleu: 'BLEU' };
const other = (camp) => (camp === 'rouge' ? 'bleu' : 'rouge');
const nameOf = (state, round, camp) => state.players.find((p) => p.id === (camp === 'rouge' ? round.red : round.blue))?.name ?? CAMP_LABEL[camp];
const timerOf = (endsAt, totalMs) => ({ endsAt, totalMs, paused: false });

function Score({ a, b }) {
  return (
    <p className="duel-score" aria-label={`Score : ROUGE ${a}, BLEU ${b}`}>
      <span className="is-rouge">ROUGE {a}</span>
      <span className="duel-score-sep">–</span>
      <span className="is-bleu">{b} BLEU</span>
    </p>
  );
}

// ---------- Dés menteurs ----------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Un dé : `value` de 1 à 6, ou « ? » s'il est caché. */
function Die({ value = null, size = 140, rolling = false, label }) {
  return (
    <svg className={`mg-die ${value == null ? 'is-hidden' : ''} ${rolling ? 'is-rolling' : ''}`} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label ?? (value == null ? 'Dé caché' : `Dé : ${value}`)}>
      <rect x="4" y="4" width="92" height="92" rx="18" />
      {value == null ? (
        <text x="50" y="68" textAnchor="middle" fontSize="60" fontWeight="800">
          ?
        </text>
      ) : (
        PIPS[value].map((p) => <circle key={p} cx={24 + (p % 3) * 26} cy={24 + Math.floor(p / 3) * 26} r="8" />)
      )}
    </svg>
  );
}

/** Le dé qui roule : des faces au hasard pendant `ms`, puis la valeur finale (fixe tout de suite avec « réduire les animations »). */
function RollingDie({ value, ms = 1300, delay = 0, size = 120, label }) {
  const calm = reducedMotion();
  const [face, setFace] = useState(calm ? value : null);
  useEffect(() => {
    if (calm) return undefined;
    let stop = null;
    let n = 0;
    const tick = () => {
      n += 1;
      if (n * 90 >= ms) return setFace(value);
      setFace(1 + Math.floor(Math.random() * 6));
      stop = later(tick, 90);
    };
    stop = later(tick, delay);
    return () => stop?.();
  }, [value, ms, delay]);
  return <Die value={face ?? 1} size={size} rolling={face !== value} label={label} />;
}

const CHOICE_TEXT = { garder: '✋ Garde', relancer: '🔄 Relance' };

/** Révélation d'une manche : dé de départ, choix, dé final, pour chaque duelliste, puis le verdict. */
function DiceReveal({ shown, small = false }) {
  const verdict = shown.winner ? `Manche pour ${CAMP_LABEL[shown.winner]}` : 'Égalité : on rejoue !';
  return (
    <div className={`mg-des-reveal ${small ? 'is-small' : ''}`}>
      <div className="mg-des-cols">
        {['rouge', 'bleu'].map((camp, i) => (
          <div key={camp} className={`mg-des-col is-${camp} ${shown.winner === camp ? 'is-win' : shown.winner ? 'is-lose' : ''}`}>
            <strong>{CAMP_LABEL[camp]}</strong>
            <small>Dé de départ</small>
            <Die value={shown.dice[camp]} size={small ? 70 : 110} />
            <span className="mg-des-choice" style={{ '--d': '0.9s' }}>
              {shown.noReroll ? 'Sans relance' : CHOICE_TEXT[shown.choice[camp]]}
            </span>
            <small>Dé final</small>
            <RollingDie value={shown.final[camp]} delay={900 + i * 150} size={small ? 90 : 150} label={`Dé final de ${CAMP_LABEL[camp]} : ${shown.final[camp]}`} />
            {shown.winner === camp && <em className="mg-des-badge">🏆 Plus haut</em>}
          </div>
        ))}
      </div>
      <p className="mg-des-verdict" style={{ '--d': '2.6s' }}>
        {verdict}
      </p>
    </div>
  );
}

const Des = {
  Tv({ play, state }) {
    const head = (
      <>
        <Score a={play.wins.rouge} b={play.wins.bleu} />
        <p className="duel-eyebrow">
          Manche {play.round} · {play.wins.rouge} – {play.wins.bleu}
          {play.noReroll ? ' · sans relance' : ''}
        </p>
      </>
    );
    if (play.phase === 'reveal' && play.shown) {
      return (
        <div className="mg-des" key={`r${play.round}`}>
          {head}
          <DiceReveal shown={play.shown} />
        </div>
      );
    }
    const text = play.phase === 'talk' ? 'Ils négocient…' : play.phase === 'decide' ? 'Ils décident…' : 'Choix enregistrés… révélation !';
    return (
      <div className="mg-des" key={`${play.round}${play.phase}`}>
        {head}
        <h2 className="mg-des-title">{text}</h2>
        <div className="mg-des-face">
          <div className="mg-des-side is-rouge">
            <strong>{CAMP_LABEL.rouge}</strong>
            <Die size={170} />
          </div>
          <span className="mg-des-vs">VS</span>
          <div className="mg-des-side is-bleu">
            <strong>{CAMP_LABEL.bleu}</strong>
            <Die size={170} />
          </div>
        </div>
        {play.phase === 'decide' && (
          <p className="mg-des-status">
            {['rouge', 'bleu'].map((c) => (
              <span key={c} className={`is-${c}`}>
                {CAMP_LABEL[c]} : {play.chosen[c] ? '🔒 a choisi' : '🤔 réfléchit'}
              </span>
            ))}
          </p>
        )}
        {play.deadline && (
          <div className="mg-des-timer">
            <TimerBar timer={timerOf(play.deadline, play.phase === 'talk' ? 30000 : 10000)} state={state}>
              {(s) => `${s} s`}
            </TimerBar>
          </div>
        )}
      </div>
    );
  },
  Duelist({ play, act, side, state, round }) {
    const opp = other(side);
    const oppName = nameOf(state, round, opp);
    const head = <Score a={play.wins.rouge} b={play.wins.bleu} />;
    const send = (data) => {
      navigator.vibrate?.(20);
      act({ ...data, round: play.round, phase: play.phase });
    };
    if (play.phase === 'reveal' && play.shown) {
      return (
        <div className="mg-des-duelist" key={`r${play.round}`}>
          {head}
          <DiceReveal shown={play.shown} small />
        </div>
      );
    }
    if (play.phase === 'locked') {
      return (
        <div className="mg-des-duelist">
          {head}
          <p className="mg-des-feedback is-ok" role="status">
            🔒 Choix enregistrés… regarde l’écran !
          </p>
        </div>
      );
    }
    if (play.phase === 'talk') {
      const ready = play.ready[side];
      return (
        <div className="mg-des-duelist">
          {head}
          <p className="mg-des-hint">Tu vois son dé, il voit le tien. Conseille-le… ou bluffe-le !</p>
          <p className="duel-eyebrow">Dé de {oppName}</p>
          <Die value={play.opponentDie} size={190} label={`Dé de ${oppName} : ${play.opponentDie}`} />
          <p className="mg-des-mine">
            Ton dé : <b>?</b>
          </p>
          {play.noReroll && <p className="duel-notice">Manche sans relance : le plus haut dé gagne.</p>}
          <button className="btn btn-primary btn-xl mg-des-btn" disabled={ready} onClick={() => send({ type: 'ready' })}>
            {ready ? '✔ Prêt (on attend l’autre)' : 'Prêt'}
          </button>
          <TimerBar timer={timerOf(play.deadline, 30000)} state={state} small>
            {(s) => `Négociation : ${s} s`}
          </TimerBar>
        </div>
      );
    }
    const locked = !!play.mine;
    return (
      <div className="mg-des-duelist">
        {head}
        <p className="duel-eyebrow">
          Dé de {oppName} : <b>{play.opponentDie}</b> · ton dé : <b>?</b>
        </p>
        {locked ? (
          <p className="mg-des-feedback is-ok" role="status">
            ✔ Choix enregistré. On attend l’autre…
          </p>
        ) : (
          <p className="mg-des-hint">Garder ou relancer ? Choisis en secret.</p>
        )}
        {['garder', 'relancer'].map((c) => (
          <button key={c} className={`mg-des-btn mg-des-pick is-${c} ${play.mine === c ? 'is-picked' : ''}`} disabled={locked} onClick={() => send({ choice: c })}>
            {c === 'garder' ? '✋ Garder' : '🔄 Relancer'}
          </button>
        ))}
        <TimerBar timer={timerOf(play.deadline, 10000)} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  },
  /** Parieur de ce duel : les deux dés, puis les deux choix une fois enregistrés. */
  Secret({ play }) {
    const { dice, choices } = play.secret;
    return (
      <div className="mg-secret mg-des-secret" role="group" aria-label="Secret des parieurs">
        <p className="mg-secret-title">🤫 Secret des parieurs</p>
        <div className="mg-des-secret-row">
          {['rouge', 'bleu'].map((c) => (
            <div key={c} className={`is-${c}`}>
              <small>{CAMP_LABEL[c]}</small>
              <Die value={dice[c]} size={64} />
              {choices && <b>{CHOICE_TEXT[choices[c]]}</b>}
            </div>
          ))}
        </div>
        <p className="muted">{choices ? 'Qui a menti ?' : 'Ils ne voient pas leur propre dé…'}</p>
      </div>
    );
  },
  Summary: ({ details }) => (details?.wins ? <p className="duel-cote-line">Manches : ROUGE {details.wins.rouge} – {details.wins.bleu} BLEU</p> : null),
};
Des.Bettor = Des.Tv;

// ---------- Roulette russe ----------

/** Le barillet : 6 chambres en cercle. `trap` : la case piégée, montrée seulement aux parieurs (icône + libellé) ou au SPLASH. */
function Barrel({ play, onPick = null, trap = null, compact = false }) {
  const splashed = play.splash?.slot;
  return (
    <div className={`mg-barrel ${compact ? 'is-compact' : ''}`} role="group" aria-label="Barillet de 6 cases">
      <div className="mg-barrel-core" aria-hidden="true">
        💧
      </div>
      {Array.from({ length: play.slots }, (_, i) => {
        const angle = (i / play.slots) * 2 * Math.PI - Math.PI / 2;
        const owner = play.taken[i];
        const isTrap = trap === i || splashed === i;
        const burst = splashed === i;
        const free = !owner;
        const cls = [`mg-chamber`, owner && !burst ? 'is-safe' : '', burst ? 'is-splash' : '', free && isTrap ? 'is-trap' : '', onPick && free ? 'is-open' : ''].join(' ');
        return (
          <button
            key={i}
            className={cls}
            style={{ left: `${50 + 36 * Math.cos(angle)}%`, top: `${50 + 36 * Math.sin(angle)}%` }}
            disabled={!onPick || !free}
            onClick={() => onPick?.(i)}
            aria-label={`Case ${i + 1}${owner ? (burst ? ', SPLASH' : ', sûre') : isTrap ? ', piégée' : ''}`}
          >
            <b>{i + 1}</b>
            {burst ? <span>💦</span> : owner ? <span>✓ {owner === 'rouge' ? 'R' : 'B'}</span> : isTrap ? <span>💧 PIÉGÉE</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const Passes = ({ passes }) => (
  <p className="mg-russe-passes" aria-label="Jetons Passe restants">
    {['rouge', 'bleu'].map((c) => (
      <span key={c} className={`is-${c}`}>
        {CAMP_LABEL[c]} : {passes[c] ? '🎟 Passe ×1' : '✕ plus de Passe'}
      </span>
    ))}
  </p>
);

/** Gouttes du SPLASH : de grosses gouttes qui jaillissent (rien avec « réduire les animations »). */
function Splash() {
  return (
    <div className="mg-splash" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ '--a': `${(i / 18) * 360}deg`, '--d': `${(i % 6) * 0.05}s`, '--s': `${1.2 + (i % 4) * 0.35}rem` }}>
          {i % 3 === 0 ? '💦' : i % 3 === 1 ? '💧' : '🎉'}
        </span>
      ))}
    </div>
  );
}

const Russe = {
  Tv({ play, state, round }) {
    const turnName = play.turn ? nameOf(state, round, play.turn) : null;
    let title;
    if (play.phase === 'announce') title = `${nameOf(state, round, play.first)} commence !`;
    else if (play.phase === 'splash') title = `SPLASH ! ${nameOf(state, round, play.splash.loser)} est trempé·e`;
    else if (play.phase === 'beat') title = play.last.kind === 'pass' ? `${nameOf(state, round, play.last.camp)} passe son tour` : `CLIC ✓ case ${play.last.slot + 1} sûre`;
    else if (play.forced) title = `Plus qu’une case… ${turnName} n’a plus de Passe !`;
    else title = `À ${turnName} de jouer`;
    return (
      <div className={`mg-russe ${play.phase === 'splash' ? 'is-splash' : ''}`} key={play.phase === 'splash' ? 'splash' : 'live'}>
        <h2 className="mg-russe-title" role="status">
          {title}
        </h2>
        <Barrel play={play} />
        <Passes passes={play.passes} />
        {play.phase === 'splash' && <Splash />}
        {play.deadline && play.phase === 'turn' && (
          <div className="mg-des-timer">
            <TimerBar timer={timerOf(play.deadline, play.forced ? 3200 : 10000)} state={state}>
              {(s) => (play.forced ? `Suspense… ${s} s` : `${s} s`)}
            </TimerBar>
          </div>
        )}
      </div>
    );
  },
  Duelist({ play, act, side, state, round }) {
    const mine = play.phase === 'turn' && play.turn === side;
    const pick = (data) => {
      navigator.vibrate?.(25);
      act({ ...data, t: play.turnNo });
    };
    const oppName = nameOf(state, round, other(side));
    let msg = `Au tour de ${oppName}…`;
    if (play.phase === 'announce') msg = `${nameOf(state, round, play.first)} commence !`;
    else if (play.phase === 'splash') msg = play.splash.loser === side ? '💦 SPLASH ! Tu es trempé·e' : '💦 SPLASH ! Il est trempé';
    else if (play.phase === 'beat') msg = play.last.kind === 'pass' ? 'Passe…' : 'CLIC ✓ case sûre';
    else if (mine) msg = play.forced ? 'Plus qu’une case, et plus de Passe…' : 'À toi ! Choisis une case';
    return (
      <div className="mg-russe-duelist">
        <p className={`mg-russe-msg ${mine ? 'is-mine' : ''}`} role="status">
          {msg}
        </p>
        <Barrel play={play} onPick={mine && !play.forced ? (slot) => pick({ slot }) : null} />
        {play.phase === 'splash' && <Splash />}
        <button className="btn btn-ghost btn-xl mg-des-btn" disabled={!mine || !play.passes[side]} onClick={() => pick({ pass: true })}>
          {play.passes[side] ? '🎟 Passer mon tour (1 fois)' : '✕ Plus de Passe'}
        </button>
        {play.deadline && play.phase === 'turn' && (
          <TimerBar timer={timerOf(play.deadline, play.forced ? 3200 : 10000)} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
      </div>
    );
  },
  /** Parieur de ce duel : la case piégée, avec icône et libellé. */
  Secret({ play }) {
    return (
      <div className="mg-secret mg-russe-secret" role="group" aria-label="Secret des parieurs">
        <p className="mg-secret-title">🤫 Case piégée : n°{play.secret.trap + 1}</p>
        <Barrel play={play} trap={play.secret.trap} compact />
      </div>
    );
  },
  Summary: ({ details }) => (details?.loser ? <p className="duel-cote-line">{CAMP_LABEL[details.loser]} a pris la case piégée (n°{details.trap + 1}).</p> : null),
};
Russe.Bettor = Russe.Tv;

export const MG_VIEWS_3 = { des: Des, russe: Russe };
