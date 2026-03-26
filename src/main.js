import { createShip, resetShip, updateShip, drawShip, destroyShip, tickRespawn, tickInvulnerable } from './ship.js';
import { createInputManager, PLAYER_BINDINGS, getActions, getNetworkActions } from './input.js';
import { createStars, drawStars } from './stars.js';
import { PROJECTILE_DEFAULTS, createProjectiles, fireProjectile, updateProjectiles, drawProjectiles, tickFireCooldown } from './projectiles.js';
import { createExplosions, spawnExplosion, updateExplosions, drawExplosions } from './explosions.js';
import { checkShipProjectileCollision, checkShipShipCollision } from './collision.js';
import { createLuaContext } from './lua-integration.js';
import { createEditor } from './editor.js';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_COLORS, SPAWN_POSITIONS, MAX_PLAYERS, setWorldSize } from './world.js';
import { getAIActions } from './ai.js';
import { createLeaderboard } from './leaderboard.js';
import { createChat } from './chat.js';
import { createNetClient, createInterpolator } from './net.js';
import { loadName, saveName, loadChatHistory, saveChatHistory } from './storage.js';
import { runCommand } from './commands.js';

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game objects
const ships = [];
let stars = createStars(WORLD_WIDTH, WORLD_HEIGHT);
const projectiles = createProjectiles();
const explosions = createExplosions();
const input = createInputManager(['script-input', 'chat-input']);
input.attach(window);
const leaderboard = createLeaderboard();
const chat = createChat();

// Networking
const net = createNetClient();
const interpolator = createInterpolator();
let networkMode = false;
let gameSpeed = 1.0;

function makeShip(id) {
  const spawn = SPAWN_POSITIONS[id];
  const ship = createShip(id, spawn.x, spawn.y, PLAYER_COLORS[id]);
  ship.spawnAngle = spawn.angle;
  ship.state.angle = spawn.angle;
  return ship;
}

// Initialize local mode (single player by default, P2 joins on Slash)
function initLocalMode() {
  ships.length = 0;
  const p1 = makeShip(0);
  p1.isLocal = true;
  p1.controlBinding = 0;
  p1.name = 'Player 1';
  ships.push(p1);
  leaderboard.addPlayer(p1.id, p1.name, p1.config.color);
}

let p2Joined = false;
function joinP2() {
  if (p2Joined || networkMode) return;
  let id = -1;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!ships.find(s => s.id === i)) { id = i; break; }
  }
  if (id < 0) return;
  p2Joined = true;
  const p2 = makeShip(id);
  p2.isLocal = true;
  p2.controlBinding = 1;
  p2.name = 'Player 2';
  ships.push(p2);
  leaderboard.addPlayer(p2.id, p2.name, p2.config.color);
  luaCtx.reset();
  chat.addMessage('', '#586e75', 'Player 2 joined!');
}

function startGame() {
  if (!networkMode) {
    initLocalMode();
    showHelpInChat();
  }
  requestAnimationFrame(gameLoop);
}

// Editor DOM elements
const elements = {
  editor: document.getElementById('editor'),
  scriptArea: document.getElementById('script-input'),
  exampleSelect: document.getElementById('example-select'),
  runBtn: document.getElementById('run-btn'),
  clearBtn: document.getElementById('clear-btn'),
  clearDataBtn: document.getElementById('clear-data-btn'),
};

// Lua integration — use fengari from CDN global if available
const fengari = (typeof globalThis.fengari !== 'undefined') ? globalThis.fengari : null;

const appendOutput = (text, isError) => {
  if (text.startsWith('> ')) return; // skip REPL echo lines
  const color = isError ? '#dc322f' : '#2aa198';
  chat.addMessage('', color, text);
  if (networkMode && net.isConnected) {
    net.sendChat('', color, text, 'lua');
  }
};

// Lua context — starts as local, swaps to network relay on connect
let luaImpl;
try {
  luaImpl = createLuaContext(fengari, ships, projectiles, explosions, (text, isError) => appendOutput(text, isError));
} catch (e) {
  console.error('Lua init failed:', e);
  luaImpl = createLuaContext(null, ships, projectiles, explosions, (text, isError) => appendOutput(text, isError));
}
// Wrapper so editor/chat can call methods that get redirected after network connect
const luaCtx = {
  get isReady() { return luaImpl.isReady; },
  get hasOnUpdate() { return luaImpl.hasOnUpdate; },
  runLua(code) { luaImpl.runLua(code); },
  runLuaREPL(line) { luaImpl.runLuaREPL(line); },
  callLuaUpdate(dt) { luaImpl.callLuaUpdate(dt); },
  reset() { luaImpl.reset(); },
  setOnShipUpdate(cb) { luaImpl.setOnShipUpdate(cb); },
  setOnNameChange(cb) { luaImpl.setOnNameChange(cb); },
  setOnAIAdd(cb) { luaImpl.setOnAIAdd(cb); },
  setOnAIRemove(cb) { luaImpl.setOnAIRemove(cb); },
  setGameSpeedAccessors(g, s) { luaImpl.setGameSpeedAccessors(g, s); },
  broadcastShipUpdates() { luaImpl.broadcastShipUpdates(); },
};

createEditor(elements, luaCtx, () => input.clear(), () => !networkMode || net.localId === 0);

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// --- Networking callbacks ---

net.onJoin((id, name) => {
  if (ships.find(s => s.id === id)) return;
  const ship = makeShip(id);
  ship.isLocal = false;
  ship.name = name;
  ships.push(ship);
  leaderboard.addPlayer(id, name, PLAYER_COLORS[id]);
  luaCtx.reset();
  // Lua host re-broadcasts config so the new player gets any overrides
  if (net.localId === 0) {
    luaCtx.broadcastShipUpdates();
  }
});

net.onLeave((id) => {
  const idx = ships.findIndex(s => s.id === id);
  if (idx >= 0) {
    ships.splice(idx, 1);
    interpolator.remove(id);
    leaderboard.removePlayer(id);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].ownerId === id) projectiles.splice(i, 1);
    }
    luaCtx.reset();
  }
});

net.onState((id, state) => {
  interpolator.onState(id, state);
});

net.onFire((id, data) => {
  const ship = ships.find(s => s.id === id);
  if (!ship || ship.state.destroyed) return;
  projectiles.push({
    x: data.x + Math.cos(data.angle) * ship.config.radius,
    y: data.y + Math.sin(data.angle) * ship.config.radius,
    vx: data.vx + Math.cos(data.angle) * PROJECTILE_DEFAULTS.speed,
    vy: data.vy + Math.sin(data.angle) * PROJECTILE_DEFAULTS.speed,
    age: 0,
    lifetime: PROJECTILE_DEFAULTS.lifetime,
    radius: PROJECTILE_DEFAULTS.radius,
    color: ship.config.color,
    ownerId: id,
  });
});

net.onStateOverride((targetId, msg) => {
  const ship = ships.find(s => s.id === targetId);
  if (!ship) return;
  const stateProps = ['x', 'y', 'angle', 'vx', 'vy', 'thrusting', 'destroyed', 'invulnerableTimer', 'fireCooldownTimer'];
  for (const prop of stateProps) {
    if (msg[prop] !== undefined) ship.state[prop] = msg[prop];
  }
});

net.onScores((scoreList) => {
  leaderboard.setScores(scoreList);
});

net.onDeath((id, x, y, _killerId, _cause) => {
  const ship = ships.find(s => s.id === id);
  if (ship && !ship.state.destroyed) {
    spawnExplosion(explosions, x, y, ship.config.color, ship.config.explosionParticles);
    destroyShip(ship);
    interpolator.remove(id);
  }
});

net.onRespawn((id, x, y) => {
  const ship = ships.find(s => s.id === id);
  if (ship) {
    ship.spawnX = x;
    ship.spawnY = y;
    resetShip(ship);
    interpolator.remove(id);
  }
});

net.onLuaUpdate((updates) => {
  for (const u of updates) {
    const ship = ships.find(s => s.id === u.id);
    if (!ship) continue;
    Object.assign(ship.config, u);
    delete ship.config.id; // id is not a config property
    leaderboard.updateColor(u.id, u.color);
  }
});

net.onChat((name, color, text) => {
  chat.addMessage(name, color, text);
});

function showHelpInChat() {
  runCommand('help', '', { chat, luaCtx, net, networkMode, isHost: !networkMode || net.localId === 0 });
}

// P2 joins local game on first Slash press
window.addEventListener('keydown', (e) => {
  if (e.code === 'Slash' && !p2Joined && !networkMode && e.target === document.body) {
    joinP2();
  }
});

// Chat input handling
const chatBar = document.getElementById('chat-bar');
const chatInput = document.getElementById('chat-input');
let chatOpen = false;
const chatHistory = loadChatHistory();
let chatHistoryIdx = chatHistory.length;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !chatOpen && e.target === document.body) {
    e.preventDefault();
    chatOpen = true;
    chatBar.classList.add('open');
    chatInput.focus();
    input.clear();
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
      if (chatHistory[chatHistory.length - 1] !== text) {
        chatHistory.push(text);
        saveChatHistory(chatHistory);
      }
      chatHistoryIdx = chatHistory.length;
      if (text.startsWith('/')) {
        const spaceIdx = text.indexOf(' ', 1);
        const cmdName = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
        const cmdArgs = spaceIdx > 0 ? text.slice(spaceIdx + 1) : '';
        const localShip = ships.find(s => s.isLocal);
        const ctx = {
          chat, luaCtx, net, networkMode, leaderboard,
          isHost: !networkMode || net.localId === 0,
          localShip,
          saveName: (name) => saveName(name, localShip?.id),
        };
        if (!runCommand(cmdName, cmdArgs, ctx)) {
          // Not a registered command — treat as Lua REPL
          if (!networkMode || net.localId === 0) {
            luaCtx.runLuaREPL(text.slice(1));
          } else {
            chat.addMessage('', '#dc322f', 'Only the host can run Lua commands.');
          }
        }
      } else {
        const localShip = ships.find(s => s.isLocal);
        const name = localShip ? localShip.name : 'Player';
        const color = localShip ? localShip.config.color : '#839496';
        chat.addMessage(name, color, text);
        net.sendChat(name, color, text);
      }
    }
    chatInput.value = '';
    chatOpen = false;
    chatBar.classList.remove('open');
    chatInput.blur();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    chatInput.value = '';
    chatOpen = false;
    chatBar.classList.remove('open');
    chatInput.blur();
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    if (chatHistoryIdx > 0) {
      chatHistoryIdx--;
      chatInput.value = chatHistory[chatHistoryIdx];
    }
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (chatHistoryIdx < chatHistory.length - 1) {
      chatHistoryIdx++;
      chatInput.value = chatHistory[chatHistoryIdx];
    } else {
      chatHistoryIdx = chatHistory.length;
      chatInput.value = '';
    }
  }
  e.stopPropagation();
});
chatInput.addEventListener('keyup', (e) => e.stopPropagation());

net.onNameChange((playerId, newName) => {
  const ship = ships.find(s => s.id === playerId);
  if (ship) {
    ship.name = newName;
    leaderboard.updateName(ship.id, newName);
  }
});

luaCtx.setOnNameChange((playerId, newName) => {
  leaderboard.updateName(playerId, newName);
  const ship = ships.find(s => s.id === playerId);
  if (ship && ship.isLocal) {
    saveName(newName, playerId);
    saveName(newName);
  }
  if (networkMode) net.sendNameChange(playerId, newName);
});

luaCtx.setOnAIAdd(() => {
  // Find lowest free ID
  let id = -1;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!ships.find(s => s.id === i)) { id = i; break; }
  }
  if (id < 0) return -1;
  const ship = makeShip(id);
  ship.isLocal = true;
  ship.isAI = true;
  ship.name = `Bot ${id + 1}`;
  ships.push(ship);
  leaderboard.addPlayer(id, ship.name, ship.config.color);
  if (networkMode) net.sendAIJoin(id, ship.name);
  return id;
});

luaCtx.setOnAIRemove((id) => {
  const idx = ships.findIndex(s => s.id === id);
  if (idx >= 0) {
    ships.splice(idx, 1);
    leaderboard.removePlayer(id);
    if (networkMode) net.sendAILeave(id);
  }
});

luaCtx.setGameSpeedAccessors(() => gameSpeed, (v) => { gameSpeed = v; });

net.onGameSpeed((speed) => { gameSpeed = speed; });

net.onLatency((id, rtt) => {
  leaderboard.updateLatency(id, rtt);
});

// Broadcast Lua ship changes over network, and sync leaderboard colors locally
luaCtx.setOnShipUpdate((updates) => {
  for (const u of updates) leaderboard.updateColor(u.id, u.color);
  if (networkMode) net.sendLuaUpdate(updates);
});

// Try connecting with saved name; prompt only after successful connection
const savedName = loadName() || '';

net.connect(savedName || undefined).then((welcome) => {
  if (!welcome) {
    startGame();
    return;
  }

  if (welcome.error) {
    ctx.fillStyle = '#839496';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(welcome.error, canvas.width / 2, canvas.height / 2);
    return;
  }

  // Resolve name: use server-assigned name, or prompt if it's a default
  let playerName = welcome.name;
  if (!savedName && playerName.startsWith('Player ')) {
    const prompted = prompt('Enter your name:', '');
    if (prompted) {
      playerName = prompted;
      net.sendNameChange(welcome.id, playerName);
    }
  }
  saveName(playerName, welcome.id);
  saveName(playerName);

  networkMode = true;

  // Apply server world size
  if (welcome.worldWidth && welcome.worldHeight) {
    setWorldSize(welcome.worldWidth, welcome.worldHeight);
    stars = createStars(WORLD_WIDTH, WORLD_HEIGHT);
  }

  // Rebuild ships and leaderboard for network mode
  ships.length = 0;
  projectiles.length = 0;
  explosions.length = 0;
  leaderboard.clear();

  const localShip = makeShip(welcome.id);
  localShip.isLocal = true;
  localShip.name = playerName;
  ships.push(localShip);

  for (const p of welcome.players) {
    const ship = makeShip(p.id);
    ship.isLocal = false;
    ship.name = p.name;
    ships.push(ship);
  }

  leaderboard.addPlayer(welcome.id, playerName, PLAYER_COLORS[welcome.id]);
  for (const p of welcome.players) {
    leaderboard.addPlayer(p.id, p.name, PLAYER_COLORS[p.id]);
  }
  if (welcome.scores) leaderboard.setScores(welcome.scores);

  // Apply stored Lua config overrides from server
  if (welcome.luaConfig) {
    for (const u of welcome.luaConfig) {
      const ship = ships.find(s => s.id === u.id);
      if (!ship) continue;
      Object.assign(ship.config, u);
      delete ship.config.id;
      leaderboard.updateColor(u.id, u.color);
    }
  }

  // Swap to network Lua relay — server is the authoritative Lua engine
  luaImpl = createLuaContext(fengari, ships, projectiles, explosions, (text, isError) => appendOutput(text, isError), net);

  showHelpInChat();
  startGame();
});

// Rendering transform: map world coordinates to canvas
function applyWorldTransform() {
  const scale = Math.min(canvas.width / WORLD_WIDTH, canvas.height / WORLD_HEIGHT);
  const offsetX = (canvas.width - WORLD_WIDTH * scale) / 2;
  const offsetY = (canvas.height - WORLD_HEIGHT * scale) / 2;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
}

function drawWorldBorder() {
  ctx.strokeStyle = '#073642';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
}

// Game loop
let lastTime = 0;

function gameLoop(time) {
  const rawDt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
  lastTime = time;
  const dt = rawDt * gameSpeed;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  applyWorldTransform();
  drawWorldBorder();
  drawStars(ctx, stars);

  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];

    if (ship.isLocal) {
      let actions;
      if (ship.isAI) {
        actions = getAIActions(ship, ships, projectiles, WORLD_WIDTH, WORLD_HEIGHT);
      } else if (networkMode) {
        actions = getNetworkActions(input.keys);
      } else {
        actions = getActions(input.keys, PLAYER_BINDINGS[ship.controlBinding || 0]);
      }

      const respawned = tickRespawn(ship, dt);
      if (networkMode && respawned) net.sendRespawn(ship);

      updateShip(ship, actions, WORLD_WIDTH, WORLD_HEIGHT, dt);
      tickFireCooldown(ship, dt);
      if (actions.fire && !ship.state.destroyed) {
        if (fireProjectile(projectiles, ship)) {
          if (networkMode) net.sendFire(ship);
        }
      }
      if (networkMode) net.sendState(ship, 50 / Math.max(0.25, gameSpeed));
    } else {
      interpolator.apply(ship, dt);
    }
    tickInvulnerable(ship, dt);
  }

  updateProjectiles(projectiles, dt, WORLD_WIDTH, WORLD_HEIGHT);

  // Collision: projectiles vs local ships only (each owner detects their own deaths)
  for (const ship of ships) {
    if (networkMode && !ship.isLocal) continue;
    if (!ship.state.destroyed && ship.state.invulnerableTimer <= 0) {
      const hitIdx = checkShipProjectileCollision(ship, projectiles);
      if (hitIdx >= 0) {
        const killerId = projectiles[hitIdx].ownerId;
        spawnExplosion(explosions, ship.state.x, ship.state.y, ship.config.color, ship.config.explosionParticles);
        projectiles.splice(hitIdx, 1);
        destroyShip(ship);
        if (networkMode) {
          net.sendDeath(ship, killerId, 'projectile');
        } else {
          leaderboard.recordKill(killerId);
        }
      }
    }
  }

  // Ship-ship collision: in network mode, only if at least one local ship involved
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const si = ships[i], sj = ships[j];
      if (networkMode && !si.isLocal && !sj.isLocal) continue;
      if (si.state.invulnerableTimer <= 0 && sj.state.invulnerableTimer <= 0 && checkShipShipCollision(si, sj)) {
        spawnExplosion(explosions, si.state.x, si.state.y, si.config.color, si.config.explosionParticles);
        spawnExplosion(explosions, sj.state.x, sj.state.y, sj.config.color, sj.config.explosionParticles);
        destroyShip(si);
        destroyShip(sj);
        if (networkMode) {
          if (si.isLocal) net.sendDeath(si, null, 'collision');
          if (sj.isLocal) net.sendDeath(sj, null, 'collision');
        } else {
          leaderboard.recordCollision(si.id, sj.id);
        }
      }
    }
  }

  if (!networkMode) luaCtx.callLuaUpdate(dt); // server handles onUpdate in network mode
  updateExplosions(explosions, dt);
  drawExplosions(ctx, explosions);
  drawProjectiles(ctx, projectiles);
  for (const ship of ships) {
    drawShip(ctx, ship);
  }

  // Chat and leaderboard in world space
  chat.update(dt);
  chat.draw(ctx, WORLD_WIDTH, WORLD_HEIGHT);
  leaderboard.draw(ctx);

  ctx.restore();

  requestAnimationFrame(gameLoop);
}
