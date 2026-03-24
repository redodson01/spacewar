import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { createInterface } from 'readline';
import { WebSocketServer } from 'ws';
import { createServerLua, createShip as createLuaShip } from './lua.js';
import { getAIActions } from '../src/ai.js';
import { PROJECTILE_DEFAULTS } from '../src/projectiles.js';

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

const COLORS = ['#dc322f', '#859900', '#268bd2', '#b58900', '#2aa198', '#d33682', '#cb4b16', '#6c71c4'];
const MAX_PLAYERS = 8;

// Player management
const players = new Map(); // ws -> { id, color, name }
const aiIds = new Map(); // aiId -> ownerWs ('server' for server-spawned AI)

// Spawn positions (same formula as client world.js)
function computeSpawnPositions(w, h) {
  const positions = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const angle = (i / MAX_PLAYERS) * Math.PI * 2 - Math.PI / 2;
    positions.push({
      x: w / 2 + Math.cos(angle) * w * 0.35,
      y: h / 2 + Math.sin(angle) * h * 0.35,
      angle: angle + Math.PI,
    });
  }
  return positions;
}
const SPAWN_POSITIONS = computeSpawnPositions(WORLD_WIDTH, WORLD_HEIGHT);

// Server-side ship tracking (for Lua context)
const ships = [];

function nextId() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (![...players.values()].some(p => p.id === i) && !aiIds.has(i) && !ships.find(s => s.id === i)) return i;
  }
  return -1;
}

function findOrCreateShip(id) {
  let ship = ships.find(s => s.id === id);
  if (!ship) {
    const spawn = SPAWN_POSITIONS[id] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, angle: 0 };
    ship = createLuaShip(id, spawn.x, spawn.y, COLORS[id]);
    ship.state.angle = spawn.angle;
    ships.push(ship);
  }
  return ship;
}

function removeShip(id) {
  const idx = ships.findIndex(s => s.id === id);
  if (idx >= 0) ships.splice(idx, 1);
}

const scores = new Map(); // id -> score
let lastLuaUpdate = null;

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

// --- Server Lua context ---
const serverLua = createServerLua(ships, {
  onStateWrite(id, prop, value) {
    // Broadcast state override to all clients
    broadcastAll({ type: 'stateOverride', targetId: id, [prop]: value });
  },
  onAddAI() {
    let id = -1;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (![...players.values()].some(p => p.id === i) && !aiIds.has(i) && !ships.find(s => s.id === i)) {
        id = i; break;
      }
    }
    if (id < 0) return -1;
    const spawn = SPAWN_POSITIONS[id] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, angle: 0 };
    const ship = createLuaShip(id, spawn.x, spawn.y, COLORS[id]);
    ship.state.angle = spawn.angle;
    ship.name = `Bot ${id + 1}`;
    ship.isAI = true;
    ships.push(ship);
    aiIds.set(id, 'server');
    scores.set(id, 0);
    broadcastAll({ type: 'join', id, name: ship.name });
    return id;
  },
  onRemoveAI(id) {
    removeShip(id);
    aiIds.delete(id);
    scores.delete(id);
    broadcastAll({ type: 'leave', id });
  },
  onNameChange(id, newName) {
    broadcastAll({ type: 'nameChange', playerId: id, newName });
  },
});

serverLua.exposeScreen(WORLD_WIDTH, WORLD_HEIGHT);

// --- Server-side AI game loop ---
const serverProjectiles = []; // projectiles for AI dodging awareness
const INVULNERABLE_DURATION = 2.0;
const SEND_INTERVAL = 50; // 20Hz
const lastAISendTimes = new Map();

setInterval(() => {
  const dt = 1 / 60; // 60Hz tick to match client frame rate

  for (const ship of ships) {
    if (!ship.isAI || aiIds.get(ship.id) !== 'server') continue;

    // Respawn logic
    if (ship.state.destroyed) {
      ship.state.respawnTimer -= dt;
      if (ship.state.respawnTimer <= 0) {
        const spawn = SPAWN_POSITIONS[ship.id] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, angle: 0 };
        Object.assign(ship.state, {
          x: spawn.x, y: spawn.y, angle: spawn.angle,
          vx: 0, vy: 0, destroyed: false, respawnTimer: 0,
          invulnerableTimer: INVULNERABLE_DURATION, fireCooldownTimer: 0, thrusting: false,
        });
        broadcastAll({ type: 'respawn', id: ship.id, x: ship.state.x, y: ship.state.y });
      }
      continue;
    }

    // Invulnerability
    if (ship.state.invulnerableTimer > 0) {
      ship.state.invulnerableTimer = Math.max(0, ship.state.invulnerableTimer - dt);
    }

    // AI decision
    const actions = getAIActions(ship, ships, serverProjectiles, WORLD_WIDTH, WORLD_HEIGHT);
    const s = ship.state;
    const c = ship.config;

    s.thrusting = !!actions.thrust;
    if (actions.left) s.angle -= c.turnSpeed;
    if (actions.right) s.angle += c.turnSpeed;
    if (actions.thrust) {
      s.vx += Math.cos(s.angle) * c.thrust;
      s.vy += Math.sin(s.angle) * c.thrust;
    }
    s.vx *= c.friction;
    s.vy *= c.friction;
    s.x += s.vx;
    s.y += s.vy;
    if (s.x < 0) s.x = WORLD_WIDTH;
    if (s.x > WORLD_WIDTH) s.x = 0;
    if (s.y < 0) s.y = WORLD_HEIGHT;
    if (s.y > WORLD_HEIGHT) s.y = 0;

    // Fire
    s.fireCooldownTimer = Math.max(0, s.fireCooldownTimer - dt);
    if (actions.fire && s.fireCooldownTimer <= 0) {
      s.fireCooldownTimer = c.fireCooldown;
      broadcastAll({
        type: 'fire', id: ship.id,
        x: s.x, y: s.y, angle: s.angle, vx: s.vx, vy: s.vy,
      });
      // Also add to server projectiles for AI dodging
      serverProjectiles.push({
        x: s.x + Math.cos(s.angle) * c.radius,
        y: s.y + Math.sin(s.angle) * c.radius,
        vx: s.vx + Math.cos(s.angle) * PROJECTILE_DEFAULTS.speed,
        vy: s.vy + Math.sin(s.angle) * PROJECTILE_DEFAULTS.speed,
        age: 0, ownerId: ship.id,
      });
    }

    // Send state at 20Hz
    const now = Date.now();
    const lastTime = lastAISendTimes.get(ship.id) || 0;
    if (now - lastTime >= SEND_INTERVAL) {
      lastAISendTimes.set(ship.id, now);
      broadcastAll({
        type: 'state', id: ship.id,
        x: s.x, y: s.y, angle: s.angle,
        vx: s.vx, vy: s.vy,
        thrusting: s.thrusting, destroyed: s.destroyed,
      });
    }
  }

  // Update server projectiles
  for (let i = serverProjectiles.length - 1; i >= 0; i--) {
    const p = serverProjectiles[i];
    p.x += p.vx; p.y += p.vy; p.age += dt;
    if (p.age > 4 || p.x < 0 || p.x > WORLD_WIDTH || p.y < 0 || p.y > WORLD_HEIGHT) {
      serverProjectiles.splice(i, 1);
    }
  }

  // Collision detection for server AI ships
  for (const ship of ships) {
    if (!ship.isAI || aiIds.get(ship.id) !== 'server') continue;
    if (ship.state.destroyed || ship.state.invulnerableTimer > 0) continue;

    for (let i = 0; i < serverProjectiles.length; i++) {
      const p = serverProjectiles[i];
      if (p.ownerId === ship.id) continue; // no self-fire
      const dx = ship.state.x - p.x;
      const dy = ship.state.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < ship.config.radius + 4) {
        // Hit!
        ship.state.destroyed = true;
        ship.state.respawnTimer = 2.0;
        serverProjectiles.splice(i, 1);
        broadcastAll({
          type: 'death', id: ship.id,
          x: ship.state.x, y: ship.state.y,
          killerId: p.ownerId, cause: 'projectile',
        });
        // Score
        if (scores.has(p.ownerId)) {
          scores.set(p.ownerId, scores.get(p.ownerId) + 1);
        }
        broadcastScores();
        const killer = ships.find(s => s.id === p.ownerId);
        console.log(`[kill] ${killer?.name || 'Player ' + (p.ownerId + 1)} killed ${ship.name || 'Bot ' + (ship.id + 1)}`);
        break;
      }
    }
  }

  // Ship-ship collision for server AI
  for (const ship of ships) {
    if (!ship.isAI || aiIds.get(ship.id) !== 'server') continue;
    if (ship.state.destroyed || ship.state.invulnerableTimer > 0) continue;

    for (const other of ships) {
      if (other === ship || other.state.destroyed || other.state.invulnerableTimer > 0) continue;
      const dx = ship.state.x - other.state.x;
      const dy = ship.state.y - other.state.y;
      if (Math.sqrt(dx * dx + dy * dy) < ship.config.radius + (other.config?.radius || 20)) {
        ship.state.destroyed = true;
        ship.state.respawnTimer = 2.0;
        broadcastAll({
          type: 'death', id: ship.id,
          x: ship.state.x, y: ship.state.y,
          killerId: null, cause: 'collision',
        });
        if (scores.has(ship.id)) {
          scores.set(ship.id, scores.get(ship.id) - 1);
        }
        broadcastScores();
        break;
      }
    }
  }
}, 1000 / 60); // 60Hz

// --- HTTP server ---
const httpServer = createServer(async (req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;

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

// --- WebSocket server ---
const wss = new WebSocketServer({ server: httpServer });

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

  // Track ship on server
  const ship = findOrCreateShip(id);
  ship.name = name;

  console.log(`[join] ${name} (player ${id + 1})`);

  // Send welcome
  const existingPlayers = [...players.values()].filter(p => p.id !== id);
  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    name,
    players: [
      ...existingPlayers.map(p => ({ id: p.id, name: p.name })),
      ...[...aiIds.keys()].map(aiId => ({ id: aiId, name: ships.find(s => s.id === aiId)?.name || `Bot ${aiId + 1}`, isAI: true })),
    ],
    scores: [...scores.entries()].map(([sid, score]) => ({ id: sid, score })),
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    luaConfig: lastLuaUpdate,
  }));

  broadcast(ws, { type: 'join', id, name });

  ws.on('message', (raw) => {
    const str = raw.toString();
    broadcast(ws, str);

    try {
      const msg = JSON.parse(str);

      // Update server-side ship state from client state messages
      if (msg.type === 'state') {
        const s = ships.find(s => s.id === msg.id);
        if (s) {
          s.state.x = msg.x; s.state.y = msg.y; s.state.angle = msg.angle;
          s.state.vx = msg.vx; s.state.vy = msg.vy;
          s.state.thrusting = msg.thrusting; s.state.destroyed = msg.destroyed;
        }
      }

      // Track client projectiles for server AI dodging
      if (msg.type === 'fire') {
        const s = ships.find(s => s.id === msg.id);
        if (s) {
          serverProjectiles.push({
            x: msg.x + Math.cos(msg.angle) * (s.config?.radius || 20),
            y: msg.y + Math.sin(msg.angle) * (s.config?.radius || 20),
            vx: msg.vx + Math.cos(msg.angle) * PROJECTILE_DEFAULTS.speed,
            vy: msg.vy + Math.sin(msg.angle) * PROJECTILE_DEFAULTS.speed,
            age: 0, ownerId: msg.id,
          });
        }
      }

      if (msg.type === 'luaUpdate') {
        lastLuaUpdate = msg.updates;
        // Sync config to server ships
        for (const u of msg.updates) {
          const s = ships.find(s => s.id === u.id);
          if (s) {
            Object.assign(s.config, u);
            delete s.config.id;
          }
        }
      }

      if (msg.type === 'nameChange') {
        const player = players.get(ws);
        if (player && msg.playerId === player.id) {
          player.name = msg.newName;
        }
        const s = ships.find(s => s.id === msg.playerId);
        if (s) s.name = msg.newName;
      }

      if (msg.type === 'aiJoin') {
        aiIds.set(msg.aiId, ws);
        scores.set(msg.aiId, 0);
        findOrCreateShip(msg.aiId).name = msg.name;
        ships.find(s => s.id === msg.aiId).isAI = true;
        broadcast(ws, { type: 'join', id: msg.aiId, name: msg.name });
        console.log(`[ai] ${msg.name} added by ${players.get(ws)?.name}`);
      }

      if (msg.type === 'aiLeave') {
        aiIds.delete(msg.aiId);
        scores.delete(msg.aiId);
        removeShip(msg.aiId);
        broadcast(ws, { type: 'leave', id: msg.aiId });
      }

      if (msg.type === 'death') {
        // Skip scoring/logging for server-owned AI — handled by server game loop
        const isServerAI = aiIds.get(msg.id) === 'server';
        if (!isServerAI) {
          if (msg.cause === 'projectile' && msg.killerId != null && scores.has(msg.killerId)) {
            scores.set(msg.killerId, scores.get(msg.killerId) + 1);
          }
          if (msg.cause === 'collision' && msg.id != null && scores.has(msg.id)) {
            scores.set(msg.id, scores.get(msg.id) - 1);
          }
          broadcastScores();
          const victim = ships.find(s => s.id === msg.id);
          const killer = msg.killerId != null ? ships.find(s => s.id === msg.killerId) : null;
          if (victim) {
            if (killer) {
              console.log(`[kill] ${killer.name || 'Player ' + (killer.id + 1)} killed ${victim.name || 'Player ' + (victim.id + 1)}`);
            } else {
              console.log(`[collision] ${victim.name || 'Player ' + (victim.id + 1)} destroyed`);
            }
          }
        }
      }

      if (msg.type === 'chat') {
        const prefix = msg.name ? `${msg.name}: ` : '';
        console.log(`[chat] ${prefix}${msg.text}`);
      }
    } catch { /* ignore parse errors */ }
  });

  ws.on('close', () => {
    const playerInfo = players.get(ws);
    players.delete(ws);
    scores.delete(id);
    removeShip(id);
    broadcast(null, { type: 'leave', id });
    console.log(`[leave] ${playerInfo?.name || 'Player ' + (id + 1)}`);

    // Clean up AI ships owned by this connection
    for (const [aiId, owner] of aiIds) {
      if (owner === ws) {
        aiIds.delete(aiId);
        scores.delete(aiId);
        removeShip(aiId);
        broadcast(null, { type: 'leave', id: aiId });
      }
    }

    serverLua.exposeShips();
  });

  serverLua.exposeShips();
});

// --- REPL ---
httpServer.listen(PORT, () => {
  console.log(`Spacewar server listening on:`);
  console.log(`  Local:  http://localhost:${PORT}`);
  if (WORLD_WIDTH !== 1920 || WORLD_HEIGHT !== 1080) {
    console.log(`  World:  ${WORLD_WIDTH}x${WORLD_HEIGHT}`);
  }

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

  console.log(`\nType Lua commands below. help() for reference.\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const code = line.trim();
    if (!code) {
      rl.prompt();
      return;
    }

    const { output, configDirty } = serverLua.execute(code);

    for (const line of output) {
      console.log(line);
    }

    // Broadcast config changes to clients
    if (configDirty) {
      const updates = ships.map(s => ({ id: s.id, ...s.config }));
      lastLuaUpdate = updates;
      broadcastAll({ type: 'luaUpdate', updates });
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
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
