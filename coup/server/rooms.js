const { Game } = require('./game');
const { logEvent } = require('./logger');

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

function createRoom({ fullLog = true, victoryTarget = 1 } = {}) {
  const code = generateCode();
  const game = new Game(code);
  game.logMode = fullLog ? 'full' : 'off';
  const parsed = parseInt(victoryTarget, 10);
  game.victoryTarget = Number.isFinite(parsed) ? Math.min(3, Math.max(1, parsed)) : 1;
  rooms.set(code, game);
  logEvent(code, `Room created (mode=${game.logMode}, victoryTarget=${game.victoryTarget}).`);
  return game;
}

function getRoom(code) {
  return rooms.get((code || '').toUpperCase());
}

function removeRoom(code) {
  if (rooms.delete(code)) {
    logEvent(code, 'Room removed (cleaned up).');
  }
}

// Periodically clean up empty/stale rooms so memory doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of rooms.entries()) {
    const noOneConnected = game.players.length === 0 || game.players.every((p) => !p.connected);
    const stale = now - game.createdAt > 1000 * 60 * 60 * 6; // 6 hours
    if (noOneConnected && (game.phase !== 'lobby' || stale)) {
      removeRoom(code);
    } else if (game.players.length === 0) {
      removeRoom(code);
    }
  }
}, 1000 * 60 * 10);

module.exports = { createRoom, getRoom, removeRoom, rooms };
