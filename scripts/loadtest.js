// Test de charge sans navigateur : 1 hôte + N joueurs (socket.io-client) jouent à tous les jeux, puis au mode soirée.
// Usage : node scripts/loadtest.js [joueurs=30]   (lance son propre serveur sur un port libre)
// Comportements variés (rapides, lents, muets, qui changent d'avis, qui tapent plusieurs fois), déconnexions
// et reconnexions aléatoires, hôte qui recharge sa page. Mesure latence, mémoire du serveur, débit et taille des messages.
import { fork } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

if (process.argv[2] === '--server') {
  // Processus serveur : répond sur sa mémoire, le reste est le vrai serveur.
  process.on('message', (m) => m === 'mem' && process.send({ mem: process.memoryUsage() }));
  await import('../server/index.js');
} else {
  await main(Number(process.argv[2]) || 30);
}

async function main(N) {
  const PORT = 3900 + Math.floor(Math.random() * 90);
  const URL_ = `http://localhost:${PORT}`;
  const server = fork(fileURLToPath(import.meta.url), ['--server'], { env: { ...process.env, PORT: String(PORT) }, silent: true });
  const serverErrors = [];
  server.stderr.on('data', (d) => serverErrors.push(String(d).trim()));
  server.stdout.on('data', () => {});
  let serverDied = null;
  server.on('exit', (code) => (serverDied = code));
  process.on('exit', () => server.kill());
  await waitFor(() => fetch(`${URL_}/api/info`).then((r) => r.ok).catch(() => false), 10000);

  const memSamples = [];
  const memory = () => new Promise((resolve) => {
    server.once('message', (m) => resolve(m.mem));
    server.send('mem');
  });
  memSamples.push(await memory());

  const stats = { acks: [], errors: {}, states: 0, bytes: 0, maxState: 0, maxStateWhere: '', reconnects: 0, base64InState: 0 };
  const t0 = Date.now();

  // ---------- Hôte ----------
  const host = { socket: null, state: null, code: null, hostSecret: null };
  function hostSocket() {
    const s = io(URL_, { transports: ['websocket'], forceNew: true });
    s.on('state', (st) => {
      host.state = st;
      countState(st, 'hôte');
    });
    return s;
  }
  const hostEmit = (event, payload = {}) => emit(host.socket, event, payload, 'hôte');

  host.socket = hostSocket();
  const created = await hostEmit('host:create', { mode: 'qui-de-nous', settings: { auto: true, voteMs: 15000, resultsMs: 5000 } });
  Object.assign(host, { code: created.code, hostSecret: created.hostSecret });

  // ---------- Joueurs ----------
  const PROFILES = ['rapide', 'rapide', 'rapide', 'lent', 'lent', 'muet', 'indécis', 'spammeur'];
  const photo = makePhoto();
  const players = [];
  for (let i = 0; i < N; i++) players.push(makePlayer(i, PROFILES[i % PROFILES.length]));
  await Promise.all(players.map((p) => p.join()));

  function makePlayer(i, profile) {
    const p = { i, profile, name: `Joueur ${i + 1}`, id: null, secret: null, socket: null, state: null, done: new Set(), online: false };
    const delay = () => (profile === 'rapide' ? rand(50, 400) : profile === 'lent' ? rand(2000, 9000) : rand(200, 3000));
    const once = (key, fn) => {
      if (p.done.has(key)) return;
      p.done.add(key);
      if (profile === 'muet' && Math.random() < 0.8) return;
      setTimeout(() => p.online && fn(), delay());
    };
    const vote = (choice, key) =>
      once(key, () => {
        const times = profile === 'spammeur' ? 3 : 1;
        for (let k = 0; k < times; k++) emit(p.socket, 'player:vote', { choice }, p.name);
        if (profile === 'indécis') setTimeout(() => p.online && emit(p.socket, 'player:vote', { choice: otherChoice(choice) }, p.name), 500);
      });
    const act = (action, key) =>
      once(key, () => {
        const times = profile === 'spammeur' ? 3 : 1;
        for (let k = 0; k < times; k++) emit(p.socket, 'player:action', { action }, p.name);
      });
    const others = (st) => st.players.filter((x) => x.id !== p.id).map((x) => x.id);
    function otherChoice(c) {
      const st = p.state;
      if (c === 'a' || c === 'b') return c === 'a' ? 'b' : 'a';
      if (typeof c === 'number') return c * 2 + 1;
      if (['c', 'd'].includes(c)) return 'a';
      return pick(others(st)) ?? c;
    }

    function react(st) {
      const r = st.round;
      const key = (s) => `${st.mode}:${st.code}:${r?.number}:${st.phase}:${s}`;
      if (!r) return;
      if (st.phase === 'question' && st.votingOpen && !st.votedIds.includes(p.id)) {
        if (st.mode === 'qui-de-nous') vote(pick(st.players).id, key('vote'));
        if (st.mode === 'tu-preferes') vote(pick(['a', 'b']), key('vote'));
        if (st.mode === 'estimation') vote(rand(1, 5000), key('vote'));
        if (st.mode === 'qui-me-connait') vote(pick(['a', 'b', 'c', 'd']), key('vote'));
        if (st.mode === 'imposteur') vote(pick(others(st)), key('vote'));
      }
      if (st.phase === 'question' && st.mode === 'imposteur' && r.step === 'speaking' && r.speakerId === p.id) {
        act({ type: 'clue', text: pick(['soirée', 'rouge', 'connu', 'bof', 'grand']) }, key(`clue${r.turnNumber}`));
      }
      if (st.phase === 'question' && st.mode === 'patate' && r.holderId === p.id && r.allowedIds.length) {
        act({ type: 'pass', targetId: pick(r.allowedIds) }, key(`pass${r.passCount}`));
      }
      if (st.phase === 'question' && st.mode === 'feu' && r.playing && r.word && !r.myTap) {
        // Un joueur sur dix tire trop tôt, les autres attendent « FEU ».
        if (r.word === 'FEU' || (profile === 'indécis' && Math.random() < 0.1)) act({ type: 'tap' }, key('tap'));
      }
      if (st.phase === 'results' && st.pending && st.results) {
        const res = st.results;
        if (st.mode === 'imposteur' && res.imposterId === p.id && r.options) act({ type: 'guess', word: pick(r.options) }, key('guess'));
        if (st.mode === 'estimation' && res.chooserId === p.id) act({ type: 'pick', targetId: pick(others(st)) }, key('pick'));
        if (st.mode === 'roue' && res.defi) {
          const { type } = res.defi;
          const isTarget = res.targetId === p.id;
          if ((type === 'duo' || type === 'distribuer') && isTarget) {
            for (let k = 0; k < (type === 'distribuer' ? res.defi.n : 1); k++) act({ type: 'pick', targetId: pick(others(st)) }, key(`roue${k}`));
          }
          if (type === 'tous') act({ yes: Math.random() < 0.5 }, key('tous'));
          if (type === 'vote') act({ targetId: pick(others(st)) }, key('rvote'));
          if (type === 'gage' && isTarget) act({ done: Math.random() < 0.5 }, key('gage'));
        }
      }
    }

    function connect() {
      p.socket = io(URL_, { transports: ['websocket'], forceNew: true, reconnection: false });
      p.socket.on('state', (st) => {
        p.state = st;
        countState(st, p.name);
        if (['lobby', 'picking', 'ended'].includes(st.phase)) p.done.clear();
        react(st);
      });
      p.socket.on('kicked', () => (p.online = false));
    }

    p.join = async () => {
      connect();
      const ack = await emit(p.socket, 'player:join', { code: host.code, name: p.name, photo: i % 3 === 0 ? null : photo }, p.name);
      Object.assign(p, { id: ack.playerId, secret: ack.secret, online: true });
    };
    p.drop = () => {
      p.online = false;
      p.socket.disconnect();
    };
    p.resume = async () => {
      connect();
      const ack = await emit(p.socket, 'player:resume', { code: host.code, playerId: p.id, secret: p.secret }, p.name);
      if (ack.ok) {
        p.online = true;
        stats.reconnects += 1;
        if (p.state) react(p.state);
      }
    };
    return p;
  }

  // Coupures réseau aléatoires : 15 % des joueurs décrochent quelques secondes, toutes les 10 s.
  const chaos = setInterval(() => {
    for (const p of players) {
      if (!p.online || Math.random() > 0.15 / 3) continue;
      p.drop();
      setTimeout(() => p.resume(), rand(1000, 6000));
    }
  }, 3300);

  // L'hôte joue la TV : il lance les manches sans attendre, signale le « FEU » prononcé, et répond aux temps morts.
  const hostTick = setInterval(() => {
    const st = host.state;
    if (!st || !st.round || st.phase !== 'question') return;
    if (st.mode === 'imposteur' && st.round.step === 'words') hostEmit('host:gameAction', { action: { type: 'startSpeaking' } });
    // À 30, une manche d'Imposteur fait 60 tours d'indices : l'hôte passe au vote après 10.
    if (st.mode === 'imposteur' && st.round.step === 'speaking' && st.round.turnNumber > 10) hostEmit('host:gameAction', { action: { type: 'skipToVote' } });
    if (st.mode === 'feu' && st.round.step === 'ready') hostEmit('host:gameAction', { action: { type: 'start' } });
    if (st.mode === 'feu' && st.round.word === 'FEU' && !st.round.feuSpoken) hostEmit('host:gameAction', { action: { type: 'spoken', index: st.round.index } });
    if (st.mode === 'roue') hostEmit('host:gameAction', { action: { type: 'spin' } });
  }, 400);

  // ---------- Déroulé ----------
  const MODES = ['qui-de-nous', 'tu-preferes', 'estimation', 'qui-me-connait', 'imposteur', 'patate', 'roue', 'feu'];
  const played = [];
  for (const [k, mode] of MODES.entries()) {
    if (k > 0) {
      await hostEmit('host:chooseGame');
      await hostEmit('host:pickGame', { mode });
    }
    const t = Date.now();
    await hostEmit('host:start');
    // 2 manches par jeu, puis fin de partie.
    await waitFor(() => host.state?.phase === 'results' && !host.state.pending && host.state.round?.number >= 2, 120000, `${mode} : 2 manches`);
    if (k === 2) {
      // L'hôte recharge sa page en pleine partie.
      host.socket.disconnect();
      host.socket = hostSocket();
      const ack = await hostEmit('host:resume', { code: host.code, hostSecret: host.hostSecret });
      if (!ack.ok) throw new Error('Reprise de l’hôte impossible');
    }
    await hostEmit('host:end');
    await waitFor(() => host.state?.phase === 'ended', 5000, `${mode} : fin`);
    played.push(`${mode} ${((Date.now() - t) / 1000).toFixed(0)} s`);
    memSamples.push(await memory());
    if (k === 0) {
      // « Rejouer » une manche du même jeu.
      await hostEmit('host:restart', { mode });
      await hostEmit('host:start');
      await waitFor(() => host.state?.phase === 'results' && !host.state.pending, 60000, 'rejouer');
      await hostEmit('host:end');
    }
  }

  // Mode soirée : 90 secondes d'enchaînement automatique, puis fin.
  await hostEmit('host:chooseGame');
  const party = await hostEmit('host:partyStart', { durationMs: 30 * 60 * 1000 });
  if (!party.ok) throw new Error(`Mode soirée : ${party.error}`);
  await sleep(90000);
  await hostEmit('host:partyEnd');
  await hostEmit('host:partyEnd');
  await waitFor(() => host.state?.phase === 'ended', 10000, 'fin de soirée');
  played.push(`mode soirée ${host.state.party?.gameNumber ?? '?'} jeu(x)`);

  clearInterval(chaos);
  clearInterval(hostTick);
  memSamples.push(await memory());
  const duration = (Date.now() - t0) / 1000;

  // ---------- Rapport ----------
  const lat = stats.acks.sort((a, b) => a - b);
  const pct = (q) => lat[Math.min(lat.length - 1, Math.floor(lat.length * q))] ?? 0;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
  const heap = memSamples.map((m) => m.heapUsed);
  console.log(`\n=== Test de charge : ${N} joueurs + 1 hôte, ${duration.toFixed(0)} s ===`);
  console.log(`Jeux joués : ${played.join(' · ')}`);
  console.log(`Latence des réponses serveur : moyenne ${(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1)} ms, p95 ${pct(0.95)} ms, max ${pct(1)} ms (${lat.length} requêtes)`);
  console.log(`Mémoire serveur (heap) : départ ${mb(heap[0])}, max ${mb(Math.max(...heap))}, fin ${mb(heap.at(-1))} · RSS fin ${mb(memSamples.at(-1).rss)}`);
  console.log(`Messages « state » reçus : ${stats.states} (${(stats.states / duration).toFixed(0)}/s), ${mb(stats.bytes)} au total`);
  console.log(`Plus gros message : ${(stats.maxState / 1024).toFixed(1)} Ko (${stats.maxStateWhere}) · photo envoyée : ${(photo.length / 1024).toFixed(1)} Ko, photos en base64 dans l'état : ${stats.base64InState}`);
  console.log(`Reconnexions réussies : ${stats.reconnects}`);
  console.log(`Refus du serveur : ${Object.entries(stats.errors).map(([e, n]) => `${n}× « ${e} »`).join(', ') || 'aucun'}`);
  console.log(`Erreurs serveur (stderr) : ${serverErrors.length ? serverErrors.join('\n') : 'aucune'}${serverDied != null ? ` · SERVEUR ARRÊTÉ (code ${serverDied})` : ''}`);

  for (const p of players) p.socket.disconnect();
  host.socket.disconnect();
  server.kill();
  process.exit(serverErrors.length || serverDied != null ? 1 : 0);

  // ---------- Outils ----------
  function countState(st, who) {
    const size = JSON.stringify(st).length;
    stats.states += 1;
    stats.bytes += size;
    if (size > stats.maxState) {
      stats.maxState = size;
      stats.maxStateWhere = `${who}, ${st.mode ?? 'menu'} / ${st.phase}`;
    }
    if (size > 1000 && JSON.stringify(st).includes('base64')) stats.base64InState += 1;
  }

  function emit(socket, event, payload, who) {
    const start = Date.now();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'pas de réponse' }), 10000);
      socket.emit(event, payload, (ack) => {
        clearTimeout(timer);
        stats.acks.push(Date.now() - start);
        if (!ack?.ok) stats.errors[ack?.error ?? '?'] = (stats.errors[ack?.error ?? '?'] ?? 0) + 1;
        resolve(ack ?? {});
      });
    });
  }
}

function waitFor(check, timeoutMs, label = 'condition') {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      if (await check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`Délai dépassé : ${label}`));
      setTimeout(tick, 100);
    };
    tick();
  });
}

function makePhoto() {
  // PNG 80×80 de bruit (≈ 20 Ko, comme une photo de profil compressée par le téléphone).
  const w = 80;
  const raw = Buffer.alloc((w * 3 + 1) * w);
  for (let i = 0; i < raw.length; i++) raw[i] = i % (w * 3 + 1) === 0 ? 0 : Math.floor(Math.random() * 256);
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function rand(a, b) {
  return a + Math.floor(Math.random() * (b - a));
}
function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
