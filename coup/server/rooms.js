const { Game } = require('./game');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const code = generateCode();
  const game = new Game(code);
  rooms.set(code, game);
  return game;
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

function removeRoom(code) {
  rooms.delete(code);
}

// Periodically clean up empty/stale rooms so memory doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of rooms.entries()) {
    const noOneConnected = game.players.length === 0 || game.players.every((p) => !p.connected);
    const stale = now - game.createdAt > 1000 * 60 * 60 * 6; // 6 hours
    if (noOneConnected && (game.phase !== 'lobby' || stale)) {
      rooms.delete(code);
    } else if (game.players.length === 0) {
      rooms.delete(code);
    }
  }
}, 1000 * 60 * 10);

module.exports = { createRoom, getRoom, removeRoom, rooms };
