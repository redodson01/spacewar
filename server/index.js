import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import { createInterface } from 'readline';
import { WebSocketServer } from 'ws';
import { createServerLua, createShip as createLuaShip } from './lua.js';
import { getAIActions } from '../src/ai.js';
import { updateShip, destroyShip, tickRespawn, tickInvulnerable } from '../src/ship.js';
import { PROJECTILE_DEFAULTS, fireProjectile, updateProjectiles, tickFireCooldown } from '../src/projectiles.js';
import { checkShipProjectileCollision, checkShipShipCollision } from '../src/collision.js';
import { computeSpawnPositions } from '../src/world.js';

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

// --- Server state ---
const serverProjectiles = [];
let serverGameSpeed = 1.0;
const playerLatencies = new Map(); // id -> rtt in ms

const serverLua = createServerLua(ships, serverProjectiles, {
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
    ship.spawnAngle = spawn.angle;
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
  onGetSpeed() { return serverGameSpeed; },
  onSetSpeed(speed) {
    serverGameSpeed = speed;
    broadcastAll({ type: 'gameSpeed', speed });
  },
  onShoot(ship) {
    if (fireProjectile(serverProjectiles, ship)) {
      const s = ship.state;
      broadcastAll({ type: 'fire', id: ship.id, x: s.x, y: s.y, angle: s.angle, vx: s.vx, vy: s.vy });
    }
  },
  onOutput(text, _isError) {
    console.log(`[lua] ${text}`);
  },
  getWorldWidth() { return WORLD_WIDTH; },
  getWorldHeight() { return WORLD_HEIGHT; },
});

serverLua.exposeScreen(WORLD_WIDTH, WORLD_HEIGHT);

// --- Server-side AI game loop (uses same modules as client) ---
const SEND_INTERVAL = 50; // 20Hz
const lastAISendTimes = new Map();

function isServerAI(ship) {
  return ship.isAI && aiIds.get(ship.id) === 'server';
}

let lastTickTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTickTime) / 1000, 0.05) * serverGameSpeed;
  lastTickTime = now;

  // Update server AI ships (same logic as client game loop)
  for (const ship of ships) {
    if (!isServerAI(ship)) continue;

    const respawned = tickRespawn(ship, dt);
    if (respawned) {
      broadcastAll({ type: 'respawn', id: ship.id, x: ship.state.x, y: ship.state.y });
    }

    const actions = getAIActions(ship, ships, serverProjectiles, WORLD_WIDTH, WORLD_HEIGHT);
    updateShip(ship, actions, WORLD_WIDTH, WORLD_HEIGHT, dt);
    tickFireCooldown(ship, dt);
    tickInvulnerable(ship, dt);

    if (actions.fire && !ship.state.destroyed) {
      if (fireProjectile(serverProjectiles, ship)) {
        const s = ship.state;
        broadcastAll({
          type: 'fire', id: ship.id,
          x: s.x, y: s.y, angle: s.angle, vx: s.vx, vy: s.vy,
        });
      }
    }

    // Send state at 20Hz
    const sendNow = Date.now();
    const lastTime = lastAISendTimes.get(ship.id) || 0;
    const scaledInterval = SEND_INTERVAL / Math.max(0.25, serverGameSpeed);
    if (sendNow - lastTime >= scaledInterval) {
      lastAISendTimes.set(ship.id, sendNow);
      const s = ship.state;
      broadcastAll({
        type: 'state', id: ship.id,
        x: s.x, y: s.y, angle: s.angle,
        vx: s.vx, vy: s.vy,
        thrusting: s.thrusting, destroyed: s.destroyed,
      });
    }
  }

  // Run Lua onUpdate callback
  const luaResult = serverLua.callLuaUpdate(dt);
  if (luaResult.configDirty) {
    const updates = ships.map(s => ({ id: s.id, ...s.config }));
    lastLuaUpdate = updates;
    broadcastAll({ type: 'luaUpdate', updates });
  }

  // Update projectiles (same function as client)
  updateProjectiles(serverProjectiles, dt, WORLD_WIDTH, WORLD_HEIGHT);

  // Collision: projectiles vs server AI ships (same function as client)
  for (const ship of ships) {
    if (!isServerAI(ship)) continue;
    if (!ship.state.destroyed && ship.state.invulnerableTimer <= 0) {
      const hitIdx = checkShipProjectileCollision(ship, serverProjectiles);
      if (hitIdx >= 0) {
        const killerId = serverProjectiles[hitIdx].ownerId;
        serverProjectiles.splice(hitIdx, 1);
        destroyShip(ship);
        broadcastAll({
          type: 'death', id: ship.id,
          x: ship.state.x, y: ship.state.y,
          killerId, cause: 'projectile',
        });
        if (scores.has(killerId)) {
          scores.set(killerId, scores.get(killerId) + 1);
        }
        broadcastScores();
        const killer = ships.find(s => s.id === killerId);
        console.log(`[kill] ${killer?.name || 'Player ' + (killerId + 1)} killed ${ship.name || 'Bot'}`);
      }
    }
  }

  // Ship-ship collision for server AI (same function as client)
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      if (!isServerAI(ships[i]) && !isServerAI(ships[j])) continue;
      if (ships[i].state.destroyed || ships[j].state.destroyed) continue;
      if (ships[i].state.invulnerableTimer > 0 || ships[j].state.invulnerableTimer > 0) continue;
      if (checkShipShipCollision(ships[i], ships[j])) {
        if (isServerAI(ships[i])) {
          destroyShip(ships[i]);
          broadcastAll({ type: 'death', id: ships[i].id, x: ships[i].state.x, y: ships[i].state.y, killerId: null, cause: 'collision' });
          if (scores.has(ships[i].id)) scores.set(ships[i].id, scores.get(ships[i].id) - 1);
        }
        if (isServerAI(ships[j])) {
          destroyShip(ships[j]);
          broadcastAll({ type: 'death', id: ships[j].id, x: ships[j].state.x, y: ships[j].state.y, killerId: null, cause: 'collision' });
          if (scores.has(ships[j].id)) scores.set(ships[j].id, scores.get(ships[j].id) - 1);
        }
        broadcastScores();
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

  // Latency measurement — ping every 2 seconds
  let pendingPingTime = null;
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      pendingPingTime = Date.now();
      ws.send(JSON.stringify({ type: 'ping', t: pendingPingTime }));
    }
  }, 2000);

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

      // Latency measurement
      if (msg.type === 'pong') {
        if (pendingPingTime) {
          const rtt = Date.now() - pendingPingTime;
          pendingPingTime = null;
          playerLatencies.set(id, rtt);
          broadcastAll({ type: 'latency', id, rtt });
        }
        return; // don't relay pong
      }

      // Handle Lua execution from client editor/REPL
      if (msg.type === 'luaExec') {
        if (msg.mode === 'reset') {
          serverLua.reset();
          return;
        }
        let result;
        if (msg.mode === 'run') {
          result = serverLua.runLua(msg.code);
        } else {
          result = serverLua.runLuaREPL(msg.code);
        }
        // Send output back to the requesting client
        for (const line of result.output) {
          ws.send(JSON.stringify({ type: 'luaOutput', text: line, isError: line.startsWith('Error:') }));
        }
        // Broadcast config changes
        if (result.configDirty) {
          const updates = ships.map(s => ({ id: s.id, ...s.config }));
          lastLuaUpdate = updates;
          broadcastAll({ type: 'luaUpdate', updates });
        }
        // Log to server console
        for (const line of result.output) {
          if (!line.startsWith('> ')) console.log(`[lua] ${line}`);
        }
        return; // don't relay luaExec to other clients
      }

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
            age: 0,
            lifetime: PROJECTILE_DEFAULTS.lifetime,
            radius: PROJECTILE_DEFAULTS.radius,
            ownerId: msg.id,
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
    clearInterval(pingInterval);
    playerLatencies.delete(id);
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

    const { output, configDirty } = serverLua.runLuaREPL(code);

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
