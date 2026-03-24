import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT || '8080', 10);
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

function broadcast(sender, message) {
  const data = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [ws] of players) {
    if (ws !== sender && ws.readyState === 1) {
      ws.send(data);
    }
  }
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

  // Send welcome to the new player
  const existingPlayers = [...players.values()].filter(p => p.id !== id);
  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    color,
    name,
    players: existingPlayers,
  }));

  // Announce to others
  broadcast(ws, { type: 'join', id, color, name });

  ws.on('message', (data) => {
    // Relay verbatim to all other clients
    broadcast(ws, data.toString());
  });

  ws.on('close', () => {
    players.delete(ws);
    broadcast(null, { type: 'leave', id });
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Spacewar server listening on:`);
  console.log(`  Local:  http://localhost:${PORT}`);

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
