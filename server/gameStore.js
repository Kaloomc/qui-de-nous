import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { computeResults, shuffle } from './rules.js';

const QUESTIONS = JSON.parse(readFileSync(new URL('./questions.json', import.meta.url), 'utf8'));
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
const GAME_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 20;
const MAX_PHOTO_BYTES = 300 * 1024;
const PHOTO_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const token = () => randomBytes(12).toString('hex');

function parsePhoto(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = PHOTO_DATA_URL.exec(dataUrl);
  if (!match) return null;
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0 || data.length > MAX_PHOTO_BYTES) return null;
  return { mime: match[1], data };
}

export class Game {
  constructor(code) {
    this.code = code;
    this.mode = 'qui-de-nous';
    this.hostSecret = token();
    this.hostSockets = new Set();
    this.players = new Map();
    this.reset();
    this.touch();
  }

  reset() {
    this.phase = 'lobby';
    this.questionPool = [];
    this.round = 0;
    this.question = null;
    this.votes = new Map();
    this.results = null;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  get isActive() {
    return this.hostSockets.size > 0 || [...this.players.values()].some((p) => p.sockets.size > 0);
  }

  findPlayer(playerId, secret) {
    const player = this.players.get(playerId);
    return player && player.secret === secret ? player : null;
  }

  upsertPlayer({ playerId, secret, name, photo }) {
    const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH) : '';
    if (!cleanName) return { error: 'Choisis un prénom.' };
    const parsedPhoto = photo ? parsePhoto(photo) : null;
    if (photo && !parsedPhoto) return { error: 'Photo invalide ou trop lourde.' };

    let player = this.findPlayer(playerId, secret);
    if (!player) {
      let id;
      do id = token().slice(0, 8);
      while (this.players.has(id));
      player = { id, secret: token(), sockets: new Set(), photo: null, photoVersion: 0 };
      this.players.set(id, player);
    }
    player.name = cleanName;
    if (parsedPhoto) {
      player.photo = parsedPhoto;
      player.photoVersion += 1;
    }
    return { player };
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.votes.delete(playerId);
    for (const [voter, target] of this.votes) if (target === playerId) this.votes.delete(voter);
  }

  start() {
    if (this.phase !== 'lobby') return 'La partie a déjà commencé.';
    if (this.players.size < 2) return 'Il faut au moins 2 joueurs.';
    return this.nextQuestion();
  }

  nextQuestion() {
    if (this.phase !== 'lobby' && this.phase !== 'results') return 'Action impossible maintenant.';
    if (this.questionPool.length === 0) this.questionPool = shuffle(QUESTIONS);
    this.question = this.questionPool.pop();
    this.round += 1;
    this.votes = new Map();
    this.results = null;
    this.phase = 'question';
    return null;
  }

  vote(playerId, targetId) {
    if (this.phase !== 'question') return 'Le vote est fermé.';
    if (!this.players.has(playerId)) return 'Tu n’es plus dans la partie.';
    if (!this.players.has(targetId)) return 'Joueur inconnu.';
    this.votes.set(playerId, targetId);
    return null;
  }

  reveal() {
    if (this.phase !== 'question') return 'Aucune question en cours.';
    this.results = computeResults([...this.players.keys()], this.votes);
    this.phase = 'results';
    return null;
  }

  end() {
    if (this.phase === 'ended') return null;
    this.phase = 'ended';
    return null;
  }

  restart() {
    if (this.phase !== 'ended') return 'La partie n’est pas terminée.';
    this.reset();
    return null;
  }

  publicState() {
    return {
      code: this.code,
      mode: this.mode,
      phase: this.phase,
      hostConnected: this.hostSockets.size > 0,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.sockets.size > 0,
        photoUrl: p.photo ? `/api/photo/${this.code}/${p.id}?v=${p.photoVersion}` : null,
      })),
      round: this.question ? { number: this.round, text: this.question } : null,
      votedIds: this.phase === 'question' ? [...this.votes.keys()] : [],
      results: this.phase === 'results' ? this.results : null,
    };
  }
}

export class GameStore {
  constructor() {
    this.games = new Map();
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  create() {
    let code;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    while (this.games.has(code));
    const game = new Game(code);
    this.games.set(code, game);
    return game;
  }

  get(code) {
    return typeof code === 'string' ? this.games.get(code.toUpperCase()) : undefined;
  }

  sweep() {
    const limit = Date.now() - GAME_TTL_MS;
    for (const [code, game] of this.games) {
      if (!game.isActive && game.lastActivity < limit) this.games.delete(code);
    }
  }
}
