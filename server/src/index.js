import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { deck } from './deck.js';
import { calculateScores, comparisons } from './scoring.js';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'https://oddlogic.netlify.app,http://localhost:5173,http://localhost:8080')
  .split(',').map(s => s.trim()).filter(Boolean);
const io = new Server(server, { cors: { origin: allowedOrigins } });
const rooms = new Map();
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const clean = value => String(value ?? '').trim().slice(0, 80);

app.get('/', (_req, res) => res.json({ app: 'Odd Logic Server', status: 'ok' }));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function createCode() {
  let code;
  do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); }
  while (rooms.has(code));
  return code;
}

function view(room, playerId) {
  const showAnswers = ['reveal', 'voting', 'results', 'finished'].includes(room.phase);
  return {
    code: room.code,
    me: playerId,
    phase: room.phase,
    round: room.round,
    totalRounds: room.totalRounds,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score,
      connected: !!p.socketId, ready: room.ready.has(p.id),
      answered: room.answers.has(p.id)
    })),
    readyCount: room.ready.size,
    myReady: room.ready.has(playerId),
    cards: room.cards,
    answers: showAnswers ? Object.fromEntries(room.answers) : undefined,
    comparisons: ['voting', 'results'].includes(room.phase) ? comparisons(room) : [],
    myAnswer: room.answers.get(playerId) || null
  };
}

function sendState(room) {
  room.touched = Date.now();
  for (const p of room.players) {
    const socket = io.sockets.sockets.get(p.socketId);
    if (socket) socket.emit('state', view(room, p.id));
  }
}
function sendError(socket, message, ack) {
  socket.emit('game-error', message);
  if (typeof ack === 'function') ack({ ok: false, error: message });
}
function currentRoom(socket) { return rooms.get(socket.data.code); }
function playerFromSocket(room, socket) {
  return room?.players.find(p => p.id === socket.data.playerId && p.socketId === socket.id);
}
function detach(socket) {
  const old = currentRoom(socket);
  const p = playerFromSocket(old, socket);
  if (p) { p.socketId = null; old.ready.delete(p.id); sendState(old); }
  if (old) socket.leave(old.code);
  socket.data.code = undefined;
  socket.data.playerId = undefined;
}
function enter(socket, room, player) {
  detach(socket);
  // Se questo giocatore rientra da un altro dispositivo, disconnetti la vecchia sessione logica.
  const previous = io.sockets.sockets.get(player.socketId);
  if (previous && previous.id !== socket.id) {
    previous.data.code = undefined;
    previous.data.playerId = undefined;
    previous.leave(room.code);
    previous.emit('game-error', 'Hai effettuato l’accesso da un altro dispositivo.');
  }
  player.socketId = socket.id;
  socket.data.code = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
  socket.emit('session', { code: room.code, token: player.token });
  sendState(room);
}
function startRound(room) {
  room.cards = deck[room.round % deck.length];
  room.answers.clear();
  room.votes.clear();
  room.ready.clear();
  room.phase = 'playing';
}
function finishVotesIfReady(room) {
  if (room.phase !== 'voting') return;
  const items = comparisons(room);
  if (!items.every(c => Object.values(c.votes).every(v => v !== null))) return;
  const gains = calculateScores(room);
  for (const p of room.players) p.score += gains[p.id];
  room.phase = 'results';
  room.ready.clear();
}
function advanceWhenEverybodyReady(room) {
  if (room.ready.size !== room.players.length) return;
  if (room.players.some(p => !p.socketId)) return;
  if (room.phase === 'lobby') {
    if (room.players.length < MIN_PLAYERS) return;
    room.round = 0;
    startRound(room);
  } else if (room.phase === 'reveal') {
    room.ready.clear();
    room.phase = 'voting';
    finishVotesIfReady(room); // Avanza subito se non ci sono coppie comuni.
  } else if (room.phase === 'results') {
    room.ready.clear();
    room.round++;
    if (room.round >= room.totalRounds) room.phase = 'finished';
    else startRound(room);
  } else if (room.phase === 'finished') {
    for (const p of room.players) p.score = 0;
    room.round = 0;
    room.answers.clear();
    room.votes.clear();
    room.ready.clear();
    room.cards = [];
    room.phase = 'lobby';
  }
}

io.on('connection', socket => {
  socket.on('create', (payload = {}, ack) => {
    const name = clean(payload?.name).slice(0, 30);
    if (!name) return sendError(socket, 'Inserisci un nickname.', ack);
    const room = {
      code: createCode(), phase: 'lobby', round: 0, totalRounds: 5,
      players: [], cards: [], answers: new Map(), votes: new Map(), ready: new Set(), touched: Date.now()
    };
    const p = { id: crypto.randomUUID(), name, token: crypto.randomUUID(), socketId: null, score: 0 };
    room.players.push(p);
    rooms.set(room.code, room);
    enter(socket, room, p);
    if (typeof ack === 'function') ack({ ok: true, code: room.code });
  });
  socket.on('join', (payload = {}, ack) => {
    const code = clean(payload?.code).toUpperCase();
    const room = rooms.get(code);
    if (!room) return sendError(socket, 'Stanza non trovata. Verifica il codice oppure crea una nuova stanza.', ack);
    let p = payload.token ? room.players.find(v => v.token === payload.token) : null;
    if (!p) {
      if (room.phase !== 'lobby') return sendError(socket, 'La partita è già iniziata.', ack);
      if (room.players.length >= MAX_PLAYERS) return sendError(socket, 'Stanza piena (massimo 6 persone).', ack);
      const name = clean(payload.name).slice(0, 30);
      if (!name) return sendError(socket, 'Inserisci un nickname.', ack);
      if (room.players.some(v => v.name.toLowerCase() === name.toLowerCase()))
        return sendError(socket, 'Nickname già utilizzato.', ack);
      p = { id: crypto.randomUUID(), name, token: crypto.randomUUID(), socketId: null, score: 0 };
      room.players.push(p);
    }
    enter(socket, room, p);
    if (typeof ack === 'function') ack({ ok: true, code: room.code });
  });
  socket.on('ready', (_payload, ack) => {
    const room = currentRoom(socket);
    const p = playerFromSocket(room, socket);
    if (!p || !['lobby', 'reveal', 'results', 'finished'].includes(room.phase)) return;
    if (room.phase === 'lobby' && room.players.length < MIN_PLAYERS)
      return sendError(socket, `Servono almeno ${MIN_PLAYERS} giocatori.`, ack);
    room.ready.add(p.id);
    advanceWhenEverybodyReady(room);
    sendState(room);
    if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('answer', (payload = {}, ack) => {
    const room = currentRoom(socket);
    const p = playerFromSocket(room, socket);
    if (!p || room.phase !== 'playing' || room.answers.has(p.id)) return;
    const pairs = payload.pairs;
    if (!Array.isArray(pairs) || pairs.length !== 2) return sendError(socket, 'Servono due coppie.', ack);
    const cards = pairs.flatMap(pair => Array.isArray(pair.cards) ? pair.cards : []);
    if (cards.length !== 4 || new Set(cards).size !== 4 ||
      !cards.every(x => Number.isInteger(x) && x >= 0 && x < 5) ||
      pairs.some(pair => !Array.isArray(pair.cards) || pair.cards.length !== 2 || !clean(pair.reason)))
      return sendError(socket, 'Risposta non valida.', ack);
    room.answers.set(p.id, {
      pairs: pairs.map(pair => ({ cards: pair.cards, reason: clean(pair.reason) })),
      odd: [0, 1, 2, 3, 4].find(i => !cards.includes(i))
    });
    if (room.answers.size === room.players.length) {
      room.phase = 'reveal';
      room.ready.clear();
    }
    sendState(room);
    if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('vote', (payload = {}, ack) => {
    const room = currentRoom(socket);
    const p = playerFromSocket(room, socket);
    if (!p || room.phase !== 'voting' || typeof payload.value !== 'boolean') return;
    const c = comparisons(room).find(c => c.key === payload.key);
    if (!c || p.id === c.aId || p.id === c.bId) return sendError(socket, 'Non puoi votare questa coppia.', ack);
    room.votes.set(c.key + '|' + p.id, payload.value);
    finishVotesIfReady(room);
    sendState(room);
    if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('disconnect', () => {
    const room = currentRoom(socket);
    const p = playerFromSocket(room, socket);
    if (p) { p.socketId = null; room.ready.delete(p.id); sendState(room); }
  });
});

// Le stanze inattive vengono eliminate dopo due ore (nessun database).
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.players.every(p => !p.socketId) && now - room.touched > 2 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 15 * 60 * 1000).unref();

const port = Number(process.env.PORT) || 3001;
server.listen(port, '0.0.0.0', () => console.log(`Odd Logic server avviato sulla porta ${port}`));
