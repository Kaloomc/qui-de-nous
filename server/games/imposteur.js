import { applyLastChance, checkClue, computeImposteur, NO_CLUE, lastChanceOptions, setupImposteur, sipsImposteur, speakingTurns } from '../rules/imposteur.js';
import { TIMING } from '../gameStore.js';
import { loadJson } from './load.js';

const WORDS = loadJson('../content/words-imposteur.json');
const WORDS_MS = 10000; // temps pour regarder son mot (mode auto)
const TURN_MS = 25000; // temps pour écrire son indice sur le téléphone
const LAST_CHANCE_MS = 20000;

const data = (game) => game.roundData;

function startSpeaking(game) {
  const d = data(game);
  if (d.step !== 'words') return 'Les indices ont déjà commencé.';
  game.cancel('g:words');
  d.step = 'speaking';
  d.turnIndex = -1;
  advanceTurn(game);
  return null;
}

/**
 * Passe au joueur suivant (en sautant les déconnectés), puis au vote après le dernier tour.
 * Celui dont c'était le tour et qui n'a rien envoyé garde « — » comme indice.
 */
function advanceTurn(game) {
  const d = data(game);
  game.cancel('g:turn');
  game.cancel('g:speakerGone');
  if (d.turnIndex >= 0 && d.turnIndex < d.turns.length && d.clues[d.turnIndex] == null) d.clues[d.turnIndex] = NO_CLUE;
  let next = d.turnIndex + 1;
  while (next < d.turns.length && !game.players.get(d.turns[next])?.sockets.size) d.clues[next++] = NO_CLUE;
  d.turnIndex = next;
  if (next >= d.turns.length) {
    d.step = 'voting';
    game.openVoting();
    return;
  }
  game.schedulePausable('g:turn', TURN_MS, () => {
    // En mode auto, on enchaîne ; sinon le chrono reste à zéro jusqu'au « Suivant » de l'hôte.
    if (game.settings.auto && data(game).step === 'speaking') advanceTurn(game);
  });
}

const currentSpeaker = (game) => {
  const d = data(game);
  return d.step === 'speaking' ? d.turns[d.turnIndex] ?? null : null;
};

function submitClue(game, playerId, text) {
  const d = data(game);
  if (game.phase !== 'question' || d.step !== 'speaking') return 'Ce n’est pas le moment des indices.';
  if (currentSpeaker(game) !== playerId) return 'Ce n’est pas ton tour.';
  const { clue, error } = checkClue(text, d.words[playerId]);
  if (error) return error;
  d.clues[d.turnIndex] = clue;
  advanceTurn(game);
  return null;
}

export default {
  id: 'imposteur',
  questions: WORDS,
  startRound(game) {
    const connected = game.connectedPlayers().map((p) => p.id);
    const ids = connected.length >= 3 ? connected : [...game.players.keys()];
    const setup = setupImposteur(ids, game.question);
    Object.assign(game.roundData, setup, { step: 'words', turnIndex: -1, turns: speakingTurns(setup.order), clues: [], options: null });
    if (game.settings.auto) game.schedulePausable('g:words', WORDS_MS, () => startSpeaking(game));
  },
  acceptsVotes: (game) => data(game).step === 'voting',
  isValidVote: (game, choice, playerId) => game.players.has(choice) && choice !== playerId,
  hostAction(game, action) {
    if (game.phase !== 'question') return 'Aucune manche en cours.';
    const d = data(game);
    if (action.type === 'startSpeaking') return startSpeaking(game);
    if (action.type === 'reveal') return d.step === 'voting' ? game.reveal(game.round) : 'Le vote n’a pas commencé.';
    if (action.type === 'nextTurn') {
      if (d.step !== 'speaking') return 'Ce n’est pas le moment des indices.';
      advanceTurn(game);
      return null;
    }
    if (action.type === 'skipToVote') {
      if (d.step === 'voting') return null;
      game.cancel('g:words');
      d.turnIndex = d.turns.length;
      d.step = 'speaking';
      advanceTurn(game);
      return null;
    }
    return 'Action inconnue.';
  },
  computeResults: (playerIds, votes, game) => computeImposteur(playerIds, votes, data(game).imposterId, game.question),
  // Imposteur démasqué : il a une dernière chance de deviner le mot des autres.
  afterReveal(game) {
    const imposter = game.players.get(game.results.imposterId);
    if (!game.results.unmasked || !imposter?.sockets.size) return false;
    data(game).options = lastChanceOptions(game.question, WORDS);
    game.schedule('pending', LAST_CHANCE_MS, () => game.finalize());
    return true;
  },
  // Celui qui doit écrire son indice se déconnecte : on l'attend le temps d'un rechargement, puis on passe.
  onPresenceChange(game) {
    if (game.phase !== 'question') return;
    const speakerId = currentSpeaker(game);
    if (!speakerId) return;
    const speaker = game.players.get(speakerId);
    if (!speaker) advanceTurn(game);
    else if (speaker.sockets.size > 0) game.cancel('g:speakerGone');
    else if (!game.timers['g:speakerGone']) {
      game.schedule('g:speakerGone', TIMING.disconnectGraceMs, () => {
        if (currentSpeaker(game) === speaker.id && !speaker.sockets.size) advanceTurn(game);
      });
    }
  },
  handleAction(game, playerId, action) {
    if (action.type === 'clue') return submitClue(game, playerId, action.text);
    if (action.type !== 'guess') return 'Action inconnue.';
    if (game.phase !== 'results' || !game.pending) return 'Pas de dernière chance en cours.';
    if (playerId !== game.results.imposterId) return 'Seul l’imposteur peut tenter sa chance.';
    if (!data(game).options?.includes(action.word)) return 'Choix invalide.';
    game.results = applyLastChance(game.results, action.word);
    game.finalize();
    return null;
  },
  sipsOf: sipsImposteur,
  updateStats(stats, results) {
    if (!results.present) return;
    if (!results.unmasked && stats[results.imposterId]) stats[results.imposterId].fooled = (stats[results.imposterId].fooled ?? 0) + 1;
    for (const id of results.votersForImposter) if (stats[id]) stats[id].found = (stats[id].found ?? 0) + 1;
  },
  // La TV ne voit jamais les mots avant la révélation ; chaque téléphone ne voit que le sien.
  publicRound(game, viewer) {
    const d = data(game);
    const round = {
      step: d.step,
      categorie: game.question?.categorie ?? null,
      order: d.order ?? [],
      speakerId: currentSpeaker(game),
      // Seuls les indices déjà envoyés (ou passés) partent vers les écrans.
      clues: (d.clues ?? []).flatMap((text, i) =>
        text == null ? [] : [{ playerId: d.turns[i], lap: Math.floor(i / d.order.length) + 1, text }],
      ),
      turnNumber: d.turnIndex + 1,
      totalTurns: d.turns?.length ?? 0,
      turnTimer: game.timerState('g:turn'),
      wordsTimer: game.timerState('g:words'),
      options: game.pending ? d.options : null,
    };
    if (viewer.playerId) round.myWord = d.words?.[viewer.playerId] ?? null;
    return round;
  },
  revealMs: 4500,
};
