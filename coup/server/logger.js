const fs = require('node:fs');
const path = require('node:path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const MAX_BUFFER_LINES = 5000;

const buffer = [];

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  // best-effort -- if this fails, appendFile below will just no-op via its own catch
}

// One line per event: [ISO timestamp] [room code] description.
// Kept in memory (for the /admin/logs viewer) and appended to disk. Both are
// best-effort -- a logging failure should never break the game itself.
function logEvent(code, description) {
  const line = `[${new Date().toISOString()}] [${code || '------'}] ${description}`;
  console.log(line);
  buffer.push(line);
  if (buffer.length > MAX_BUFFER_LINES) buffer.shift();
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

function getRecentLogs(limit = 2000) {
  return buffer.slice(-limit);
}

module.exports = { logEvent, getRecentLogs, LOG_FILE };
