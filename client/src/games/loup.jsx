// Loup-Garou : écrans de la TV (village en cercle, nuit, aube, débat, vote) et des téléphones (rôle secret, actions de nuit,
// vote, fantômes, Tribunal des gorgées). Toutes les actions portent le `phaseId` de la phase affichée : le serveur ignore le reste.
import { useEffect, useRef, useState } from 'react';
import { Avatar, PlayerGrid } from '../components.jsx';
import { sipsLabel } from '../sips.jsx';
import { sounds, unlockAudio } from '../sound.js';
import { getNarratorVolume, narrate, preloadNarration, say, setNarrationPaused, setNarrationSession, setNarratorVolume, useNarratorStatus } from '../narrator.js';
import { CAMP_NAME, PHASE_LABEL, ROLE_INFO, roleIcon } from './loupRoles.js';

export const id = 'loup';
export const waitingText = 'Le village décide…';
export const hostLayout = 'custom';
export const playerLayout = 'custom';
export const nextLabel = 'Partie suivante';

const nameOf = (round, pid) => round.circle.find((c) => c.id === pid)?.name ?? '?';
const playerOf = (round, pid) => round.circle.find((c) => c.id === pid);

/** Ambiance de nuit : la palette actuelle assombrie (pas le thème rouge du mode 18+). */
function useNightTheme(round) {
  const dark = round?.stage === 'sleep' || round?.stage === 'night' || round?.stage === 'deal';
  useEffect(() => {
    document.body.classList.toggle('loup-night', !!dark);
    return () => document.body.classList.remove('loup-night');
  }, [dark]);
}

/** Les joueurs en cercle, dans l'ordre fixe du début ; les morts en gris avec leur rôle révélé. */
function Village({ round, marked = [] }) {
  const n = round.circle.length;
  return (
    <div className="village" style={{ '--seat': `calc(var(--village) * ${Math.min(0.16, 2.2 / n).toFixed(3)})` }}>
      {round.circle.map((c, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <div
            key={c.id}
            className={`village-seat ${c.alive ? '' : 'is-dead'} ${marked.includes(c.id) ? 'is-marked' : ''} ${c.connected ? '' : 'is-away'}`}
            style={{ left: `${50 + 42 * Math.cos(a)}%`, top: `${50 + 42 * Math.sin(a)}%` }}
          >
            <Avatar player={c} size={100} className="village-avatar" />
            {!c.alive && <span className="village-role">{c.role ? roleIcon(c.role) : '💀'}</span>}
            {c.idiotOut && c.alive && <span className="village-role">🤡</span>}
            <span className="village-name">{c.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- TV ----------

/**
 * Narrateur : le serveur décide des phrases de chaque phase (`round.narration`, sans prénom : la photo et le prénom s'affichent
 * pendant le roulement de tambour, puis le rôle). Elles partent dans une seule file, jamais coupées ; quand la dernière est
 * terminée, la TV envoie l'accusé `narrated` et le serveur lance la phase. Sans clip ou sans son, le texte reste à l'écran
 * pendant une durée de lecture estimée.
 */
function useLoupNarration(state, gameAct) {
  const narration = state.round?.narration;
  useEffect(() => {
    preloadNarration();
  }, []);
  useEffect(() => {
    setNarrationSession(state.roundId);
  }, [state.roundId]);
  useEffect(() => {
    setNarrationPaused(!!state.paused);
  }, [state.paused]);
  useEffect(() => {
    if (!narration) return;
    const ack = gameAct && !narration.phaseId.endsWith(':win') ? () => gameAct({ type: 'narrated', phaseId: narration.phaseId }) : undefined;
    narrate(narration, ack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration?.phaseId]);
}

/** Activation de la voix (clic de l'hôte : les navigateurs bloquent le son avant) et volume ; avertit si aucun clip n'est disponible. */
function NarratorControls() {
  const status = useNarratorStatus();
  const [volume, setVolume] = useState(getNarratorVolume);
  if (status === 'loading') return <p className="muted small loup-narrator">Chargement de la voix du narrateur…</p>;
  if (status === 'none') return <p className="muted small loup-narrator">Voix du narrateur indisponible : texte seul.</p>;
  if (status === 'locked')
    return (
      <button className="ctrl loup-narrator" onClick={unlockAudio}>
        🔊 Activer la voix du narrateur
      </button>
    );
  return (
    <label className="loup-narrator muted small">
      🔊 Voix
      <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => (setNarratorVolume(Number(e.target.value)), setVolume(Number(e.target.value)))} />
    </label>
  );
}

function DeathCard({ item, round }) {
  const c = playerOf(round, item.id);
  useEffect(() => {
    sounds.drumroll?.(2200);
  }, []);
  const drinkers = item.drinkers ?? [];
  const lines = {
    nuit: 'Le village se réveille. Quelqu’un ne s’est pas réveillé.',
    chagrin: 'Le chagrin est plus fort que tout.',
    chasseur: 'Le Chasseur a tiré. Une dernière balle, un dernier regret.',
    vote: 'Le village a parlé.',
    retire: 'Cette personne a quitté le village.',
  };
  return (
    <div className="loup-announce">
      <p className="loup-line">{lines[item.cause] ?? lines.nuit}</p>
      <div className="loup-reveal">
        <Avatar player={c} size={200} className="loup-reveal-avatar" />
        <p className="loup-reveal-name">{c?.name}</p>
        {item.role && (
          <p className="loup-reveal-role">
            {roleIcon(item.role)} {ROLE_INFO[item.role]?.name}
          </p>
        )}
        {drinkers.length > 0 && <p className="loup-drinkers">🍺 Boivent aussi : {drinkers.map((pid) => nameOf(round, pid)).join(', ')}</p>}
      </div>
    </div>
  );
}

function AnnounceItem({ round }) {
  const { items, i } = round.announce;
  const item = items[i];
  const c = playerOf(round, item.id);
  if (item.type === 'death') return <DeathCard key={round.phaseId} item={item} round={round} />;
  if (item.type === 'idiot')
    return (
      <div className="loup-announce">
        <p className="loup-line">Le village a voté contre… l’Idiot du village. Il reste, mais il ne votera plus.</p>
        <div className="loup-reveal">
          <Avatar player={c} size={180} />
          <p className="loup-reveal-name">{c?.name}</p>
          <p className="loup-reveal-role">🤡 Idiot du village</p>
          {item.drinkers?.length > 0 && <p className="loup-drinkers">🍺 Boivent : {item.drinkers.map((pid) => nameOf(round, pid)).join(', ')}</p>}
        </div>
      </div>
    );
  const text = {
    none: 'Personne n’est mort cette nuit. Les loups ont dû se tromper de maison.',
    novote: 'Égalité. Personne n’est éliminé. Bravo, tout ça pour ça.',
    gorgees: `Une gorgée pour ${(item.ids ?? []).map((pid) => nameOf(round, pid)).join(', ')}. Le village se demandera pourquoi.`,
  }[item.type];
  return (
    <div className="loup-announce">
      <p className="loup-line loup-line-big">{text}</p>
      {item.type === 'gorgees' && (
        <div className="loup-tally">
          {item.ids.map((pid) => (
            <Avatar key={pid} player={playerOf(round, pid)} size={110} />
          ))}
        </div>
      )}
    </div>
  );
}

function VoteTally({ round }) {
  const r = round.voteResult;
  if (!r) return null;
  const rows = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="loup-tally">
      {rows.map(([pid, n]) => (
        <span key={pid} className="loup-tally-row">
          <Avatar player={playerOf(round, pid)} size={36} /> {nameOf(round, pid)} <strong>{n}</strong>
        </span>
      ))}
    </div>
  );
}

/** Dernières paroles des morts (option), avec un bouton pour masquer une phrase déplacée. */
function LastWordsBoard({ round, gameAct }) {
  if (!round.lastWords?.length) return null;
  return (
    <div className="loup-lastwords">
      {round.lastWords.slice(-3).map((w) => (
        <div key={w.id} className="loup-lastword">
          <Avatar player={playerOf(round, w.id)} size={44} />
          <q>{w.hidden ? 'phrase masquée' : w.text}</q>
          <button className="ctrl" onClick={() => gameAct({ type: 'hideLast', id: w.id })}>
            {w.hidden ? 'Afficher' : 'Masquer'}
          </button>
        </div>
      ))}
    </div>
  );
}

export function HostQuestion({ state, gameAct }) {
  const round = state.round;
  useNightTheme(round);
  useLoupNarration(state, gameAct);
  let body;
  if (round.stage === 'deal') {
    body = (
      <>
        <h1>Regardez votre téléphone</h1>
        <p className="lead">Chacun découvre son rôle en secret. Ne le montrez à personne. Surtout pas aux loups, enfin sauf si vous êtes un loup.</p>
      </>
    );
  } else if (round.stage === 'sleep') {
    body = (
      <>
        <p className="loup-moon">🌙</p>
        <h1>Le village s’endort…</h1>
        <p className="lead">Nuit {round.night}. Fermez les yeux.</p>
      </>
    );
  } else if (round.stage === 'night') {
    body = (
      <>
        <p className="loup-moon">🌙</p>
        <h1>{PHASE_LABEL[round.phase]}</h1>
        <p className="lead">Les yeux fermés, tout le monde. Même vous.</p>
      </>
    );
  } else if (round.stage === 'announce') {
    body = (
      <>
        <AnnounceItem round={round} />
        <VoteTally round={round} />
      </>
    );
  } else if (round.stage === 'hunter') {
    body = (
      <>
        <p className="loup-moon">🏹</p>
        <h1>Le Chasseur tire !</h1>
        <p className="lead">Une dernière balle. Qui va la recevoir ?</p>
      </>
    );
  } else if (round.stage === 'debate') {
    body = (
      <>
        <h1>Le village débat</h1>
        <p className="lead">Qui est le loup ? Accusez, mentez, défendez-vous.</p>
        <p className="loup-count">{round.ready.n} / {round.ready.of} prêts à voter</p>
        <button className="btn btn-primary btn-xl" onClick={() => gameAct({ type: 'skipDebate' })}>
          Passer au vote
        </button>
      </>
    );
  } else if (round.stage === 'vote') {
    body = (
      <>
        <h1>{round.tie ? 'Égalité : second vote' : 'Vote du village'}</h1>
        <p className="lead">{round.tie ? 'Départagez ces joueurs.' : 'Qui est éliminé ?'}</p>
        <p className="loup-count">{round.votedIds.length} ont voté</p>
      </>
    );
  } else body = <h1>Loup-Garou</h1>;

  return (
    <div className={`loup loup-tv loup-stage-${round.stage}`}>
      <div className="loup-main">
        <p className="round">Loup-Garou · Nuit {round.night || 1}</p>
        {body}
        <LastWordsBoard round={round} gameAct={gameAct} />
        <NarratorControls />
      </div>
      <Village round={round} marked={round.tie ?? []} />
    </div>
  );
}

export function HostReveal({ state }) {
  const results = state.results;
  const winner = results?.winner;
  useEffect(() => {
    sounds.reveal?.();
  }, [winner]);
  useLoupNarration(state);
  return (
    <div className="loup loup-end">
      <p className="round">Loup-Garou</p>
      <h1 className="loup-win">{winner === 'nul' ? 'Plus personne…' : `${CAMP_NAME[winner]} ${winner === 'amoureux' ? 'gagnent' : 'gagne'} !`}</h1>
      <p className="lead">{winner === 'loups' ? 'Le village n’a pas survécu.' : winner === 'village' ? 'Les loups sont tombés.' : winner === 'amoureux' ? 'L’amour a gagné. Ça arrive.' : 'Tout le monde a perdu.'}</p>
    </div>
  );
}

export function HostResults({ state }) {
  const { results, round } = state;
  const sips = results.tribunal?.sips;
  const rows = state.players.filter((p) => results.roles[p.id]);
  const losers = (p) => (sips ? sips[p.id] ?? 0 : null);
  useEffect(() => {
    say('tribunal', 1500);
  }, []);
  return (
    <div className="loup loup-tribunal">
      <p className="round">Le Tribunal des gorgées</p>
      <h1>{CAMP_NAME[results.winner]} {results.winner === 'amoureux' ? 'gagnent' : 'gagne'}</h1>
      <p className="muted">Un verre d’eau compte aussi.</p>
      <div className="loup-roles">
        {rows.map((p) => (
          <div key={p.id} className={`loup-role-card ${results.dead?.[p.id] ? 'is-dead' : ''}`}>
            <Avatar player={p} size={64} />
            <strong>{p.name}</strong>
            <span>
              {roleIcon(results.roles[p.id])} {ROLE_INFO[results.roles[p.id]]?.name}
            </span>
            {losers(p) != null ? <em className={losers(p) ? 'is-drinking' : ''}>{losers(p) ? sipsLabel(losers(p)) : 'rien'}</em> : round?.credits?.[p.id] ? <em>distribue {round.credits[p.id]}</em> : null}
          </div>
        ))}
      </div>
      {!sips && <p className="lead pulse-text">Les distributeurs choisissent à qui donner leurs gorgées…</p>}
    </div>
  );
}

// ---------- Téléphones ----------

function Intel({ me, round }) {
  const seen = me.intel.seen.at(-1);
  const bear = me.intel.bear.at(-1);
  return (
    <>
      {me.role === 'voyante' && seen && (
        <p className="loup-intel">
          🔮 {nameOf(round, seen.id)} est {roleIcon(seen.role)} <strong>{ROLE_INFO[seen.role]?.name}</strong>
        </p>
      )}
      {me.role === 'ours' && bear && (
        <p className="loup-intel">
          🐻 Autour de {nameOf(round, bear.id)} : <strong>{bear.yes ? 'oui, il y a un loup' : 'non, aucun loup'}</strong>
        </p>
      )}
    </>
  );
}

function Pick({ round, options, onPick, selected = null, disabled = [] }) {
  const players = options.map((pid) => playerOf(round, pid)).filter(Boolean);
  return <PlayerGrid players={players} onPick={onPick} selectedId={selected} disabledIds={disabled} />;
}

/** Dernières paroles (option) : une phrase de 80 caractères, texte brut, affichée sur la TV ; on peut passer. */
function LastWords({ act }) {
  const [text, setText] = useState('');
  return (
    <form
      className="loup-last"
      onSubmit={(e) => {
        e.preventDefault();
        act({ type: 'last', text });
      }}
    >
      <p className="lead">💀 Tes dernières paroles ? (affichées sur la TV)</p>
      <input className="input" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} placeholder="80 caractères maximum" enterKeyHint="send" autoComplete="off" />
      <div className="loup-actions">
        <button className="btn btn-primary" disabled={!text.trim()}>
          Envoyer
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'last', text: '' })}>
          Passer
        </button>
      </div>
    </form>
  );
}

/** Rappel du rôle, avec sa description : on peut le cacher d'un tap (comme le mot de l'Imposteur) si un voisin regarde. */
function RoleReminder({ role }) {
  const [hidden, setHidden] = useState(false);
  const info = ROLE_INFO[role];
  if (!info) return null;
  return (
    <button className={`loup-reminder ${hidden ? 'is-hidden' : ''}`} onClick={() => setHidden(!hidden)}>
      {hidden ? (
        <span className="muted">👁 Rôle caché · touche pour l’afficher</span>
      ) : (
        <>
          <strong>
            {info.icon} {info.name}
          </strong>
          <span>{info.text}</span>
          <em className="muted small">Touche pour le cacher</em>
        </>
      )}
    </button>
  );
}

function Ghost({ me, round, act }) {
  if (!me.allRoles) return null;
  return (
    <div className="loup-ghost">
      {me.last === 'pending' && <LastWords act={act} />}
      <p className="muted small">👻 Tu es un fantôme : tu vois tout, mais interdit de parler du jeu !</p>
      <div className="loup-ghost-list">
        {me.allRoles.map((r) => (
          <span key={r.id} className={r.alive ? '' : 'is-dead'}>
            {roleIcon(r.role)} {nameOf(round, r.id)}
          </span>
        ))}
      </div>
      {!round.winner && (
        <div className="loup-camp-bet">
          <span className="muted small">Pari bonus : qui va gagner ?</span>
          {['village', 'loups', 'amoureux'].map((camp) => (
            <button key={camp} className="ctrl" onClick={() => act({ type: 'campBet', camp })}>
              {CAMP_NAME[camp]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Witch({ screen, round, act, base }) {
  const [save, setSave] = useState(false);
  const [kill, setKill] = useState(null);
  const [gorgee, setGorgee] = useState(null);
  const [pick, setPick] = useState(null); // 'kill' | 'gorgee'
  const others = screen.options;
  if (pick)
    return (
      <div className="vote">
        <h1 className="vote-question">{pick === 'kill' ? 'Qui empoisonner ?' : 'Qui boit demain matin ?'}</h1>
        <Pick
          round={round}
          options={others}
          disabled={pick === 'gorgee' && screen.lastGorgee ? [screen.lastGorgee] : []}
          onPick={(pid) => {
            if (pick === 'kill') setKill(pid);
            else setGorgee(pid);
            setPick(null);
          }}
        />
      </div>
    );
  return (
    <div className="vote">
      <h1 className="vote-question">Ta potion, Sorcière</h1>
      {screen.victim ? <p className="lead">Les loups ont choisi : <strong>{nameOf(round, screen.victim)}</strong></p> : <p className="lead">Personne n’a été attaqué cette nuit.</p>}
      <div className="loup-actions">
        {screen.victim && screen.life && (
          <button className={`btn ${save ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSave(!save)}>
            {save ? '✓ Je la sauve' : '🧪 Sauver (potion de vie)'}
          </button>
        )}
        {screen.death && (
          <button className={`btn ${kill ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPick('kill')}>
            {kill ? `☠️ ${nameOf(round, kill)} (changer)` : '☠️ Empoisonner (potion de mort)'}
          </button>
        )}
        {screen.gorgee && (
          <button className={`btn ${gorgee ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPick('gorgee')}>
            {gorgee ? `🍷 ${nameOf(round, gorgee)} boira (changer)` : '🍷 Faire boire quelqu’un demain'}
          </button>
        )}
      </div>
      <button className="btn btn-primary btn-xl btn-block" onClick={() => act({ type: 'night', save, kill: kill ?? undefined, gorgee: gorgee ?? undefined, ...base })}>
        Valider
      </button>
    </div>
  );
}

function MultiPick({ round, options, max, label, onDone }) {
  const [chosen, setChosen] = useState([]);
  const toggle = (pid) => setChosen((c) => (c.includes(pid) ? c.filter((x) => x !== pid) : c.length < max ? [...c, pid] : c));
  return (
    <div className="vote">
      <h1 className="vote-question">{label}</h1>
      <div className="grid grid-vote">
        {options.map((pid) => (
          <button key={pid} className={`vote-option ${chosen.includes(pid) ? 'is-selected' : ''}`} onClick={() => toggle(pid)}>
            <Avatar player={playerOf(round, pid)} size={80} />
            <span>{nameOf(round, pid)}</span>
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-xl btn-block" disabled={chosen.length === 0 || (max === 2 && chosen.length < 2)} onClick={() => onDone(chosen)}>
        Valider
      </button>
    </div>
  );
}

function NightAct({ me, round, act, selfId }) {
  const s = me.screen;
  const base = { phaseId: round.phaseId };
  const night = (payload) => act({ type: 'night', ...payload, ...base });
  if (s.phase === 'loups')
    return (
      <div className="vote">
        <h1 className="vote-question">🐺 Quelle proie ?</h1>
        <p className="muted small">Tes complices : {me.partners.map((p) => nameOf(round, p)).join(', ') || 'personne, tu es seul'}</p>
        <Pick round={round} options={s.options} selected={s.mine} onPick={(target) => act({ type: 'wolfVote', target, ...base })} />
        {Object.keys(s.wolfVotes).length > 0 && <p className="muted small">{Object.entries(s.wolfVotes).map(([w, t]) => `${nameOf(round, w)} → ${nameOf(round, t)}`).join(' · ')}</p>}
      </div>
    );
  if (s.phase === 'sorciere') return <Witch screen={s} round={round} act={act} base={base} />;
  if (s.phase === 'cupidon') return <MultiPick round={round} options={s.options} max={2} label="💘 Choisis deux amoureux" onDone={(pair) => night({ pair })} />;
  if (s.phase === 'distributeur')
    return s.used ? <p className="lead">Tu as déjà fait ta tournée.</p> : <MultiPick round={round} options={s.options} max={3} label="🎁 Qui boit ? (jusqu’à 3)" onDone={(targets) => night({ targets })} />;
  const prompts = { salvateur: '🛡️ Qui protéger ?', voyante: '🔮 Qui espionner ?', ours: `🐻 Qui flairer ? (${s.uses} restant${s.uses > 1 ? 's' : ''})` };
  return (
    <div className="vote">
      <h1 className="vote-question">{prompts[s.phase]}</h1>
      <Pick round={round} options={s.options.filter((pid) => s.phase !== 'voyante' || pid !== selfId)} disabled={s.phase === 'salvateur' && s.last ? [s.last] : []} onPick={(target) => night({ target })} />
    </div>
  );
}

function Deal({ me, round, act }) {
  const info = ROLE_INFO[me.role];
  return (
    <div className="center loup-deal">
      <p className="round">Ton rôle secret</p>
      <p className="loup-role-icon">{info.icon}</p>
      <h1>{info.name}</h1>
      <p className="lead">{info.text}</p>
      {me.partners.length > 0 && <p className="loup-intel">🐺 Tes complices : <strong>{me.partners.map((p) => nameOf(round, p)).join(', ')}</strong></p>}
      {me.screen.kind === 'role' ? (
        <button className="btn btn-primary btn-xl" onClick={() => act({ type: 'ack', phaseId: round.phaseId })}>
          Compris
        </button>
      ) : (
        <p className="muted">On attend les autres…</p>
      )}
    </div>
  );
}

export function PlayerRound({ state, me: player, act }) {
  const round = state.round;
  useNightTheme(round);
  const me = round.me;
  const base = { phaseId: round.phaseId };
  if (!me) return <div className="center muted">Connexion à la partie…</div>;
  if (me.spectator)
    return (
      <div className="center loup-sleep">
        <p className="loup-moon">👀</p>
        <h1>Partie en cours</h1>
        <p className="lead">Tu joueras à la prochaine. Regarde l’écran !</p>
      </div>
    );
  const s = me.screen;
  let content;
  if (s.kind === 'role' || s.kind === 'waiting') content = <Deal me={me} round={round} act={act} />;
  else if (s.kind === 'act') content = <NightAct me={me} round={round} act={act} selfId={player.id} />;
  else if (s.kind === 'drink')
    content = (
      <div className="center loup-sleep">
        <p className="loup-role-icon">🍺</p>
        <h1>Bois une gorgée</h1>
        <p className="lead">Discrètement. Personne ne sait.</p>
      </div>
    );
  else if (s.kind === 'shoot')
    content = (
      <div className="vote">
        <h1 className="vote-question">🏹 Tu tires sur qui ?</h1>
        <Pick round={round} options={s.options} onPick={(target) => act({ type: 'shoot', target, ...base })} />
        <button className="btn btn-ghost" onClick={() => act({ type: 'shoot', target: null, ...base })}>
          Personne
        </button>
      </div>
    );
  else if (s.kind === 'vote')
    content = (
      <div className="vote">
        <h1 className="vote-question">{round.tie ? 'Second vote' : 'Qui est éliminé ?'}</h1>
        <Pick round={round} options={s.options} selected={s.mine} onPick={(target) => act({ type: 'vote', target, ...base })} />
        {s.mine && <p className="muted">Tu peux changer ton vote jusqu’à la fin.</p>}
      </div>
    );
  else if (s.kind === 'bet')
    content = (
      <div className="vote">
        <h1 className="vote-question">👻 Parie : qui sera éliminé ?</h1>
        <Pick round={round} options={s.options} selected={s.mine} onPick={(target) => act({ type: 'bet', target, ...base })} />
      </div>
    );
  else if (s.kind === 'novote')
    content = (
      <div className="center loup-sleep">
        <h1>Plus de vote pour toi</h1>
        <p className="lead">L’Idiot du village débat encore, mais il ne vote plus.</p>
      </div>
    );
  else if (s.kind === 'done')
    content = (
      <div className="center loup-sleep">
        <p className="loup-moon">✓</p>
        <h1>C’est noté</h1>
        <Intel me={me} round={round} />
      </div>
    );
  else if (s.kind === 'debate')
    content = (
      <div className="center">
        <h1>Débat</h1>
        <p className="lead">Discutez à voix haute. {me.role === 'loup' ? 'Fais l’innocent.' : 'Trouve le loup.'}</p>
        <Intel me={me} round={round} />
        <button className={`btn btn-xl ${s.ready ? 'btn-primary' : 'btn-secondary'}`} onClick={() => act({ type: 'ready', ...base })}>
          {s.ready ? '✓ Prêt à voter (retirer)' : '👍 On peut voter'}
        </button>
        <p className="muted small">On vote dès que tout le monde est d’accord.</p>
      </div>
    );
  else if (s.kind === 'sleep')
    content = (
      <div className="center loup-sleep">
        <p className="loup-moon">🌙</p>
        <h1>Le village dort…</h1>
        <p className="lead">Les yeux fermés.</p>
        <Intel me={me} round={round} />
      </div>
    );
  else
    content = (
      <div className="center">
        <h1>Regarde l’écran</h1>
        {me.lover && <p className="loup-intel">💘 Amoureux(se) de <strong>{nameOf(round, me.lover)}</strong></p>}
      </div>
    );
  return (
    <div className="loup loup-phone">
      {s.kind !== 'role' && s.kind !== 'waiting' && <RoleReminder role={me.role} />}
      {me.lover && s.kind !== 'role' && (
        <p className="loup-lover">
          💘 <Avatar player={playerOf(round, me.lover)} size={28} /> {nameOf(round, me.lover)}
        </p>
      )}
      {content}
      <Ghost me={me} round={round} act={act} />
    </div>
  );
}

export function PlayerReveal() {
  return (
    <div className="center suspense">
      <h1>Fin de partie</h1>
      <p className="lead">Les yeux sur l’écran !</p>
    </div>
  );
}

export function PlayerResults({ state, me, act, verdict }) {
  const { results, round } = state;
  const credits = round?.credits?.[me.id] ?? 0;
  const [alloc, setAlloc] = useState({});
  const [sent, setSent] = useState(false);
  const used = Object.values(alloc).reduce((a, b) => a + b, 0);
  if (state.pending && credits > 0) {
    const others = state.players.filter((p) => p.id !== me.id && results.roles[p.id]);
    return (
      <div className="vote">
        <p className="round">Tribunal des gorgées</p>
        <h1 className="vote-question">Distribue {credits} gorgée{credits > 1 ? 's' : ''} ({credits - used} restante{credits - used > 1 ? 's' : ''})</h1>
        <div className="grid grid-vote">
          {others.map((p) => (
            <button key={p.id} className={`vote-option ${alloc[p.id] ? 'is-selected' : ''}`} disabled={sent || used >= credits} onClick={() => setAlloc({ ...alloc, [p.id]: (alloc[p.id] ?? 0) + 1 })}>
              <Avatar player={p} size={72} />
              <span>
                {p.name} {alloc[p.id] ? `+${alloc[p.id]}` : ''}
              </span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-xl btn-block" disabled={sent} onClick={() => (setSent(true), act({ type: 'allocate', allocation: alloc }))}>
          {sent ? 'Envoyé' : 'Valider (le reste au hasard)'}
        </button>
        <button className="btn btn-ghost" onClick={() => setAlloc({})}>
          Recommencer
        </button>
      </div>
    );
  }
  if (state.pending)
    return (
      <div className="center suspense">
        <h1>Le Tribunal des gorgées</h1>
        <p className="lead">Les gorgées se distribuent. Un verre d’eau compte aussi.</p>
      </div>
    );
  return verdict;
}

export function verdict(state, me) {
  const { results } = state;
  const mine = results.roles?.[me.id];
  const drinks = (results.tribunal?.sips?.[me.id] ?? 0) > 0;
  if (!mine) return { drinks: false, title: 'Pas joué', detail: 'Tu joues à la prochaine partie.' };
  const camp = ROLE_INFO[mine].camp;
  const won = results.winner === camp || (results.winner === 'amoureux' && results.lovers?.includes(me.id));
  return {
    drinks,
    title: drinks ? 'Tu bois !' : 'Tu ne bois pas',
    detail: `${roleIcon(mine)} ${ROLE_INFO[mine].name} · ${won ? 'ton camp a gagné' : 'ton camp a perdu'}`,
    extra: 'Un verre d’eau compte aussi.',
  };
}
