// Vues des mini-jeux du mode Duel. Chaque mini-jeu fournit des vues qui ne reçoivent que ce que le serveur leur a envoyé :
//   Tv({ state, round, play, gameAct })             : l'écran commente le duel
//   Duelist({ state, round, play, side, act })      : le téléphone d'un duelliste (act(data) envoie une action)
//   Bettor({ state, round, play })                  : l'écran « spectateur » d'un parieur (facultatif)
// et, facultativement, Summary({ state, details }) : une ligne de résultat. `play` est la vue serveur du mini-jeu (round.play).
import { useEffect, useRef, useState } from 'react';
import { TimerBar } from '../components.jsx';
import { sounds } from '../sound.js';
import { preloadVoices, speak, useSpeechStatus } from '../speech.js';
import { useFrameElapsed } from './duelFx.js';
import { MG_VIEWS_2 } from './duelMinigames2.jsx';

const CAMP_LABEL = { rouge: 'ROUGE', bleu: 'BLEU' };
const timerOf = (endsAt, totalMs) => (endsAt ? { endsAt, totalMs, paused: false } : null);

/** « ROUGE 1 – 0 BLEU » : le score en couleur et en toutes lettres. */
function Score({ a, b }) {
  return (
    <p className="duel-score" aria-label={`Score : ROUGE ${a}, BLEU ${b}`}>
      <span className="is-rouge">ROUGE {a}</span>
      <span className="duel-score-sep">–</span>
      <span className="is-bleu">{b} BLEU</span>
    </p>
  );
}

// ---------- Pierre-feuille-ciseaux ----------

const HANDS = { pierre: { icon: '✊', label: 'Pierre' }, feuille: { icon: '✋', label: 'Feuille' }, ciseaux: { icon: '✌️', label: 'Ciseaux' } };

const Pfc = {
  Tv({ play, state }) {
    return (
      <div className="mg-pfc">
        <Score a={play.wins.rouge} b={play.wins.bleu} />
        <p className="duel-eyebrow">Manche {play.round} sur {play.max} au plus · meilleur des 3</p>
        <div className="mg-pfc-hands">
          {['rouge', 'bleu'].map((camp) => {
            const shown = play.shown?.[camp];
            return (
              <div key={camp} className={`mg-pfc-hand is-${camp} ${play.shown?.winner === camp ? 'is-win' : ''} ${shown ? 'is-shown' : ''}`}>
                <span className="mg-hand-icon">{shown ? HANDS[shown].icon : play.chosen[camp] ? '🔒' : '❔'}</span>
                <small>{shown ? HANDS[shown].label : play.chosen[camp] ? 'A choisi' : 'Réfléchit…'}</small>
              </div>
            );
          })}
        </div>
        {play.shown && <p className="duel-eyebrow">{play.shown.winner ? `${CAMP_LABEL[play.shown.winner]} gagne la manche` : 'Manche nulle : on rejoue'}</p>}
        {play.deadline && (
          <TimerBar timer={timerOf(play.deadline, 8000)} state={state} small>
            {(s) => `${s} s pour choisir`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const locked = !!play.mine;
    return (
      <div className="mg-pfc-pad">
        <Score a={play.wins.rouge} b={play.wins.bleu} />
        {play.shown ? (
          <p className="mg-pfc-shown">
            {HANDS[play.shown[side]].icon} contre {HANDS[play.shown[side === 'rouge' ? 'bleu' : 'rouge']].icon}
            <br />
            <strong>{play.shown.winner === side ? 'Manche gagnée !' : play.shown.winner ? 'Manche perdue…' : 'Manche nulle, on rejoue'}</strong>
          </p>
        ) : (
          <>
            <div className="mg-pfc-buttons">
              {Object.entries(HANDS).map(([id, h]) => (
                <button key={id} className={`mg-pfc-btn ${play.mine === id ? 'is-picked' : ''}`} disabled={locked} onClick={() => act({ choice: id })} aria-label={h.label}>
                  <span>{h.icon}</span>
                  <small>{h.label}</small>
                </button>
              ))}
            </div>
            <p className="muted">{locked ? 'Choix verrouillé. Attends l’autre…' : 'Choisis en secret !'}</p>
            {play.deadline && (
              <TimerBar timer={timerOf(play.deadline, 8000)} state={state} small>
                {(s) => `${s} s`}
              </TimerBar>
            )}
          </>
        )}
      </div>
    );
  },
  Summary: ({ details }) => (details?.wins ? <p className="duel-cote-line">Manches : ROUGE {details.wins.rouge} – {details.wins.bleu} BLEU</p> : null),
};
Pfc.Bettor = Pfc.Tv;

// ---------- Simon ----------

const PADS = [
  { shape: '●', color: '#ff4f8b', name: 'rond rose' },
  { shape: '■', color: '#ffc93c', name: 'carré jaune' },
  { shape: '▲', color: '#3ee0c5', name: 'triangle turquoise' },
  { shape: '★', color: '#b46cff', name: 'étoile violette' },
];
const STEP = 420;

/** Le pavé allumé à l'instant `elapsed` de la séquence (400 ms de pause, puis un pavé toutes les 420 ms). */
const litAt = (seq, elapsed) => {
  const i = Math.floor((elapsed - 400) / STEP);
  return elapsed === Infinity || i < 0 || i >= seq.length || (elapsed - 400) % STEP > STEP * 0.75 ? -1 : seq[i];
};

function PadGrid({ lit = -1, onTap = null, big = false }) {
  const lastLit = useRef(-1);
  useEffect(() => {
    if (lit >= 0 && lit !== lastLit.current) sounds.count(lit % 2 ? 1 : 2);
    lastLit.current = lit;
  }, [lit]);
  return (
    <div className={`mg-pads ${big ? 'is-big' : ''}`}>
      {PADS.map((p, i) => (
        <button key={i} className={`mg-pad ${lit === i ? 'is-lit' : ''}`} style={{ '--pad': p.color }} disabled={!onTap} onClick={() => onTap?.(i)} aria-label={p.name}>
          {p.shape}
        </button>
      ))}
    </div>
  );
}

const Simon = {
  Tv({ play, state }) {
    const elapsed = useFrameElapsed(play.turnAt, state);
    const showing = elapsed !== Infinity && (elapsed ?? 0) < play.displayMs;
    return (
      <div className="mg-simon">
        <p className="duel-eyebrow">
          Tour {play.turn} sur {play.max}
        </p>
        <PadGrid lit={showing ? litAt(play.seq, elapsed) : -1} />
        <div className="mg-simon-progress">
          {['rouge', 'bleu'].map((camp) => {
            const p = play.players[camp];
            return (
              <div key={camp} className={`mg-simon-row is-${camp} ${p.alive ? '' : 'is-out'}`}>
                <strong>{CAMP_LABEL[camp]}</strong>
                <span className="mg-simon-dots">
                  {Array.from({ length: play.turn }, (_, i) => (
                    <i key={i} className={i < p.pos || p.done ? 'is-on' : ''} />
                  ))}
                </span>
                <em>{!p.alive ? 'Éliminé !' : p.done ? '✔ Tour réussi' : 'Joue…'}</em>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
  Duelist({ play, act, side, state }) {
    const elapsed = useFrameElapsed(play.turnAt, state);
    const me = play.players[side];
    const showing = elapsed !== Infinity && (elapsed ?? 0) < play.displayMs;
    const [pressed, setPressed] = useState(-1);
    return (
      <div className="mg-simon-duelist">
        <p className="duel-eyebrow">
          Tour {play.turn} · {me.alive ? (showing ? 'Regarde bien…' : me.done ? 'Réussi ! Attends…' : `À toi : ${me.pos} / ${play.turn}`) : 'Raté !'}
        </p>
        <PadGrid
          big
          lit={showing ? litAt(play.seq, elapsed) : pressed}
          onTap={
            me.alive && !showing && !me.done
              ? (i) => {
                  setPressed(i);
                  setTimeout(() => setPressed(-1), 140);
                  act({ pad: i });
                }
              : null
          }
        />
      </div>
    );
  },
  Summary: ({ details }) => (details?.reached ? <p className="duel-cote-line">Tours réussis : ROUGE {details.reached.rouge} – {details.reached.bleu} BLEU</p> : null),
};
Simon.Bettor = Simon.Tv;

// ---------- Couleur piège ----------

const INK = { rouge: '#ff4d5e', bleu: '#3c9dff', vert: '#2fd18a', jaune: '#ffc93c' };
const COLOR_NAMES = [
  ['rouge', 'ROUGE'],
  ['bleu', 'BLEU'],
  ['vert', 'VERT'],
  ['jaune', 'JAUNE'],
];

const Couleur = {
  Tv({ play, state }) {
    const top = Math.max(8, play.gauge.rouge, play.gauge.bleu);
    return (
      <div className="mg-couleur">
        <p className="duel-eyebrow">{play.extra ? 'Prolongation : 5 secondes !' : 'Tape la couleur de l’encre, pas le mot !'}</p>
        <div className="mg-gauges">
          {['rouge', 'bleu'].map((camp) => (
            <div key={camp} className={`mg-gauge is-${camp}`}>
              <div className="mg-gauge-bar" style={{ height: `${Math.max(4, (100 * Math.max(0, play.gauge[camp])) / top)}%` }} />
              <strong>{play.gauge[camp]}</strong>
              <small>{CAMP_LABEL[camp]}</small>
            </div>
          ))}
        </div>
        <TimerBar timer={timerOf(play.endsAt, play.extra ? 5000 : 15000)} state={state} small>
          {(s) => `${s} s`}
        </TimerBar>
      </div>
    );
  },
  Duelist({ play, act, state }) {
    if (!play.item) return null;
    return (
      <div className="mg-couleur-duelist">
        <TimerBar timer={timerOf(play.endsAt, play.extra ? 5000 : 15000)} state={state} small>
          {(s) => `${s} s · score ${play.score}`}
        </TimerBar>
        <p key={play.i} className="mg-stroop-word" style={{ color: INK[play.item.ink] }}>
          {play.item.word}
        </p>
        <p className="muted">Tape la couleur de l’ENCRE</p>
        <div className="mg-stroop-buttons">
          {COLOR_NAMES.map(([id, name]) => (
            <button key={id} className="mg-stroop-btn" onClick={() => act({ i: play.i, color: id })}>
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  },
  Summary: ({ details }) => (details?.scores ? <p className="duel-cote-line">Scores : ROUGE {details.scores.rouge} – {details.scores.bleu} BLEU</p> : null),
};
Couleur.Bettor = Couleur.Tv;

// ---------- Duel du Feu ----------

const REPLAY = { bothFault: 'Les deux ont tiré trop tôt : on rejoue !', nobody: 'Personne n’a tiré : on rejoue !', tie: 'Égalité parfaite : on rejoue !' };

const Feu = {
  Tv({ play, gameAct }) {
    const status = useSpeechStatus();
    useEffect(() => {
      preloadVoices();
    }, []);
    useEffect(() => {
      gameAct?.({ type: 'voice', available: status === 'ok' });
    }, [status]);
    const isFeu = play.word === 'FEU';
    useEffect(() => {
      if (!play.word) return;
      speak(isFeu ? 'Feu !' : play.word, {
        onStart: isFeu
          ? () => {
              sounds.fire();
              gameAct?.({ type: 'spoken', index: play.index });
            }
          : undefined,
      });
    }, [play.index, play.word]);
    return (
      <div className={`mg-feu ${isFeu ? 'is-feu' : ''}`}>
        {status === 'none' && <p className="feu-sound-warn">Pas de voix française sur cet écran : les mots sont seulement affichés.</p>}
        {play.replay ? (
          <p className="mg-feu-word is-small">{REPLAY[play.replay]}</p>
        ) : (
          <p key={play.index} className="mg-feu-word">
            {play.word ?? 'Prêts…'}
          </p>
        )}
        {['rouge', 'bleu'].map((camp) => play.faults[camp] && <p key={camp} className="duel-notice">{CAMP_LABEL[camp]} a tiré trop tôt !</p>)}
        {play.attempt > 1 && !play.replay && <p className="muted">Reprise n° {play.attempt - 1}</p>}
      </div>
    );
  },
  Duelist({ play, act }) {
    const mine = play.mine ?? {};
    const live = ['wait', 'words', 'feu'].includes(play.phase) && !mine.tapped;
    return (
      <div className="mg-feu-duelist">
        <p className="muted">{play.replay ? REPLAY[play.replay] : mine.fault ? 'Faux départ…' : mine.tapped ? 'Tiré ! On attend…' : 'Écoute la TV : tire seulement au vrai « FEU » !'}</p>
        <button className="mg-feu-btn" disabled={!live} onClick={() => { navigator.vibrate?.(30); act({ type: 'tap' }); }}>
          {mine.fault ? '❌' : mine.tapped ? '✔' : 'TIRE !'}
        </button>
      </div>
    );
  },
  Bettor({ play }) {
    return <p className="mg-feu-word is-small">{play.replay ? REPLAY[play.replay] : play.word ?? 'Prêts…'}</p>;
  },
  // Le suspense du verdict ne reparle pas : juste le dernier état.
  Reveal: ({ play }) => <p className="mg-feu-word is-small">{play.word ?? '…'}</p>,
  Summary: ({ details }) =>
    details?.times ? (
      <p className="duel-cote-line">Réflexes : ROUGE {details.times.rouge ?? '—'} ms – {details.times.bleu ?? '—'} ms BLEU</p>
    ) : details?.reason === 'falseStart' ? (
      <p className="duel-cote-line">Faux départ de {CAMP_LABEL[details.fault]} !</p>
    ) : null,
};

// ---------- Culture G éclair ----------

const LETTERS = ['A', 'B', 'C', 'D'];

function Choices({ play, onPick = null, blocked = false }) {
  return (
    <div className="mg-choices">
      {play.choices.map((c, i) => (
        <button
          key={i}
          className={`mg-choice ${play.shown ? (i === play.shown.right ? 'is-right' : 'is-dim') : ''}`}
          disabled={!onPick || blocked || !!play.shown}
          onClick={() => onPick?.(i)}
        >
          <b>{LETTERS[i]}</b> {c}
        </button>
      ))}
    </div>
  );
}

const Culture = {
  Tv({ play, state }) {
    return (
      <div className="mg-culture">
        <Score a={play.score.rouge} b={play.score.bleu} />
        <p className="duel-eyebrow">Question {play.n}{play.categorie ? ` · ${play.categorie}` : ''} · 2 points gagnent</p>
        <h2 className="mg-question">{play.question}</h2>
        <Choices play={play} />
        {play.shown && <p className="duel-eyebrow">{play.shown.scorer ? `Point pour ${CAMP_LABEL[play.shown.scorer]} !` : play.shown.tie ? 'Égalité de vitesse : on la rejoue !' : 'Personne ne marque'}</p>}
        {play.endsAt && (
          <TimerBar timer={timerOf(play.endsAt, 10000)} state={state} small>
            {(s) => `${s} s`}
          </TimerBar>
        )}
      </div>
    );
  },
  Duelist({ play, act, state }) {
    const [now, setNow] = useState(0);
    const blockedFor = Math.max(0, (play.blockedUntil ?? 0) - Date.now() - (state?.clockOffset ?? 0));
    useEffect(() => {
      if (blockedFor <= 0) return undefined;
      const id = setTimeout(() => setNow((n) => n + 1), blockedFor + 20);
      return () => clearTimeout(id);
    }, [play.blockedUntil, now]);
    return (
      <div className="mg-culture-duelist">
        <Score a={play.score.rouge} b={play.score.bleu} />
        <h2 className="mg-question is-small">{play.question}</h2>
        {blockedFor > 0 && <p className="duel-notice">Mauvaise réponse : bloqué 2 s</p>}
        <Choices play={play} blocked={blockedFor > 0} onPick={(i) => act({ choice: i, n: play.n })} />
        {play.shown && <p className="duel-eyebrow">{play.shown.scorer ? `Point pour ${CAMP_LABEL[play.shown.scorer]}` : 'Pas de point'}</p>}
      </div>
    );
  },
  Summary: ({ details }) => (details?.score ? <p className="duel-cote-line">Points : ROUGE {details.score.rouge} – {details.score.bleu} BLEU</p> : null),
};
Culture.Bettor = ({ play }) => (
  <div className="mg-culture">
    <Score a={play.score.rouge} b={play.score.bleu} />
    <h2 className="mg-question is-small">{play.question}</h2>
    <Choices play={play} />
  </div>
);

export const MG_VIEWS = { pfc: Pfc, simon: Simon, couleur: Couleur, feu: Feu, culture: Culture, ...MG_VIEWS_2 };
