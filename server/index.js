import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT || '8080', 10);

function getArg(name, defaultVal) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? parseInt(process.argv[idx + 1], 10) : defaultVal;
}
const WORLD_WIDTH = getArg('--width', 1920);
const WORLD_HEIGHT = getArg('--height', 1080);
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const COLORS = ['#dc322f', '#859900', '#268bd2', '#b58900'];
const MAX_PLAYERS = 4;

// Player management
const players = new Map(); // ws -> { id, color, name }

function nextId() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (![...players.values()].some(p => p.id === i)) return i;
  }
  return -1;
}

const scores = new Map(); // id -> score
let lastLuaUpdate = null; // latest luaUpdate payload for new players

function broadcast(sender, message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws] of players) {
    if (ws !== sender && ws.readyState === 1) {
      ws.send(data);
    }
  }
}

function broadcastAll(message) {
  const data = JSON.stringify(message);
  for (const [ws] of players) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function broadcastScores() {
  broadcastAll({ type: 'scores', scores: [...scores.entries()].map(([id, score]) => ({ id, score })) });
}

// HTTP server — serve static files
const server = createServer(async (req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403);
    res.end();
    return;
  }

  const fullPath = join(ROOT, filePath);
  const ext = extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const id = nextId();
  if (id === -1) {
    ws.close(4000, 'Game is full');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const name = url.searchParams.get('name') || `Player ${id + 1}`;
  const color = COLORS[id];
  players.set(ws, { id, color, name });
  scores.set(id, 0);

  // Send welcome to the new player
  const existingPlayers = [...players.values()].filter(p => p.id !== id);
  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    name,
    players: existingPlayers.map(p => ({ id: p.id, name: p.name })),
    scores: [...scores.entries()].map(([sid, score]) => ({ id: sid, score })),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    luaConfig: lastLuaUpdate,
  }));

  // Announce to others
  broadcast(ws, { type: 'join', id, name });

  ws.on('message', (raw) => {
    const str = raw.toString();
    broadcast(ws, str);

    // Track scores from death events
    try {
      const msg = JSON.parse(str);
      if (msg.type === 'luaUpdate') {
        lastLuaUpdate = msg.updates;
      }
      if (msg.type === 'nameChange') {
        const player = players.get(ws);
        if (player && msg.playerId === player.id) {
          player.name = msg.newName;
        }
      }
      if (msg.type === 'death') {
        if (msg.cause === 'projectile' && msg.killerId != null && scores.has(msg.killerId)) {
          scores.set(msg.killerId, scores.get(msg.killerId) + 1);
        }
        if (msg.cause === 'collision' && msg.id != null && scores.has(msg.id)) {
          scores.set(msg.id, scores.get(msg.id) - 1);
        }
        broadcastScores();
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on('close', () => {
    players.delete(ws);
    scores.delete(id);
    broadcast(null, { type: 'leave', id });
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Spacewar server listening on:`);
  console.log(`  Local:  http://localhost:${PORT}`);
  if (WORLD_WIDTH !== 1920 || WORLD_HEIGHT !== 1080) {
    console.log(`  World:  ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
  }

  // Find LAN IP
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  LAN:    http://${net.address}:${PORT}`);
      }
    }
  }

  if (process.argv.includes('--tunnel')) {
    startTunnel();
  }
});

async function startTunnel() {
  try {
    const { startTunnel: start } = await import('untun');
    const tunnel = await start({ port: PORT });
    const url = await tunnel.getURL();
    console.log(`  Public: ${url}`);
  } catch (e) {
    console.error('Failed to start tunnel:', e.message);
    console.error('Install untun: npm install --save-dev untun');
  }
}
