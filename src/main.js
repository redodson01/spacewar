import { createShip, resetShip, updateShip, drawShip, destroyShip, tickRespawn, tickInvulnerable } from './ship.js';
import { createInputManager, PLAYER_BINDINGS, getActions, getNetworkActions } from './input.js';
import { createStars, drawStars } from './stars.js';
import { PROJECTILE_DEFAULTS, createProjectiles, fireProjectile, updateProjectiles, drawProjectiles, tickFireCooldown } from './projectiles.js';
import { createExplosions, spawnExplosion, updateExplosions, drawExplosions } from './explosions.js';
import { checkShipProjectileCollision, checkShipShipCollision } from './collision.js';
import { createLuaContext } from './lua-integration.js';
import { createEditor } from './editor.js';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_COLORS, SPAWN_POSITIONS, setWorldSize } from './world.js';
import { createLeaderboard } from './leaderboard.js';
import { createChat } from './chat.js';
import { createNetClient, createInterpolator } from './net.js';
import { loadName, saveName, loadChatHistory, saveChatHistory } from './storage.js';

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
const input = createInputManager(['script-input', 'repl-input', 'chat-input']);
input.attach(window);
const leaderboard = createLeaderboard();
const chat = createChat();

// Networking
const net = createNetClient();
const interpolator = createInterpolator();
let networkMode = false;

function makeShip(id) {
  const spawn = SPAWN_POSITIONS[id];
  const ship = createShip(id, spawn.x, spawn.y, PLAYER_COLORS[id]);
  ship.spawnAngle = spawn.angle;
  ship.state.angle = spawn.angle;
  return ship;
}

// Initialize local 2-player mode (default)
function initLocalMode() {
  ships.length = 0;
  ships.push(makeShip(0), makeShip(1));
  for (const s of ships) {
    s.isLocal = true;
    s.name = `Player ${s.id + 1}`;
    leaderboard.addPlayer(s.id, s.name, s.config.color);
  }
}

initLocalMode();
// Show hints after a short delay so they don't get cleared by network connect
setTimeout(() => { if (!networkMode) showHelpInChat(); }, 2500);

// Editor DOM elements
const elements = {
  editor: document.getElementById('editor'),
  scriptArea: document.getElementById('script-input'),
  outputDiv: document.getElementById('output'),
  hintDiv: null,
  replInput: document.getElementById('repl-input'),
  exampleSelect: document.getElementById('example-select'),
  runBtn: document.getElementById('run-btn'),
  resetBtn: document.getElementById('reset-btn'),
  clearBtn: document.getElementById('clear-btn'),
  clearDataBtn: document.getElementById('clear-data-btn'),
  canvas,
};

// Lua integration — use fengari from CDN global if available
const fengari = (typeof globalThis.fengari !== 'undefined') ? globalThis.fengari : null;

let appendOutput = (text, isError) => {
  if (isError) console.error(text);
  else console.log(text);
};

let luaCtx;
try {
  luaCtx = createLuaContext(fengari, ships, projectiles, explosions, canvas, (text, isError) => appendOutput(text, isError));
} catch (e) {
  console.error('Lua init failed:', e);
  luaCtx = createLuaContext(null, ships, projectiles, explosions, canvas, (text, isError) => appendOutput(text, isError));
}

const editorAPI = createEditor(elements, luaCtx, ships[0], () => {
  for (const ship of ships) {
    resetShip(ship);
  }
  projectiles.length = 0;
  explosions.length = 0;
}, () => input.clear(), () => !networkMode || net.localId === 0);
appendOutput = editorAPI.appendOutput;

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
  if (!ship) return;
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
  const hint = '#586e75'; // Solarized base01
  if (networkMode) {
    chat.addMessage('', hint, 'WASD / Arrows + Space to shoot | Enter to chat | /help for help');
    if (net.localId === 0) {
      chat.addMessage('', hint, 'Host: ` for editor | /command to run Lua');
    }
  } else {
    chat.addMessage('', hint, 'P1: WASD + Space | P2: Arrows + / | ` for editor');
  }
}

// Chat input handling
const chatBar = document.getElementById('chat-bar');
const chatInput = document.getElementById('chat-input');
let chatOpen = false;
const chatHistory = loadChatHistory();
let chatHistoryIdx = chatHistory.length;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !chatOpen && networkMode && e.target === document.body) {
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
      if (text === '/help') {
        showHelpInChat();
      } else if (text.startsWith('/')) {
        if (!networkMode || net.localId === 0) {
          // Run as Lua command — output goes to editor, chat, and network
          const origAppendOutput = appendOutput;
          const chatOutputs = [];
          appendOutput = (t, isError) => {
            origAppendOutput(t, isError);
            if (!t.startsWith('> ')) chatOutputs.push(t);
          };
          luaCtx.runLuaREPL(text.slice(1));
          appendOutput = origAppendOutput;
          for (const line of chatOutputs) {
            chat.addMessage('', '#2aa198', line);
            net.sendChat('', '#2aa198', line);
          }
        } else {
          chat.addMessage('', '#dc322f', 'Only the host can run /commands.');
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

// Broadcast Lua ship changes over network, and sync leaderboard colors locally
luaCtx.setOnShipUpdate((updates) => {
  for (const u of updates) leaderboard.updateColor(u.id, u.color);
  if (networkMode) net.sendLuaUpdate(updates);
});

// Try to connect — if it works, switch to network mode
net.connect().then((welcome) => {
  if (!welcome) return;

  // Resolve player name: check per-slot storage, then prompt
  const savedSlotName = loadName(welcome.id);
  let playerName;
  if (savedSlotName) {
    playerName = savedSlotName;
  } else {
    const savedGenericName = loadName();
    playerName = prompt('Enter your name:', savedGenericName || '');
  }
  playerName = playerName || 'Player';
  saveName(playerName, welcome.id);
  saveName(playerName); // also save as generic fallback

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

  // Send name update if different from server default
  if (playerName !== welcome.name) {
    net.sendNameChange(welcome.id, playerName);
  }

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

  luaCtx.reset();
  showHelpInChat();
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
  const dt = lastTime ? (time - lastTime) / 1000 : 0;
  lastTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  applyWorldTransform();
  drawWorldBorder();
  drawStars(ctx, stars);

  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];

    if (ship.isLocal) {
      const actions = networkMode
        ? getNetworkActions(input.keys)
        : getActions(input.keys, PLAYER_BINDINGS[i]);

      const respawned = tickRespawn(ship, dt);
      if (networkMode && respawned) net.sendRespawn(ship);

      updateShip(ship, actions, WORLD_WIDTH, WORLD_HEIGHT);
      tickFireCooldown(ship, dt);
      if (actions.fire && !ship.state.destroyed) {
        if (fireProjectile(projectiles, ship)) {
          if (networkMode) net.sendFire(ship);
        }
      }
      if (networkMode) net.sendState(ship);
    } else {
      interpolator.apply(ship, dt);
    }
    tickInvulnerable(ship, dt);
  }

  updateProjectiles(projectiles, dt, WORLD_WIDTH, WORLD_HEIGHT);

  // Collision: projectiles vs all ships
  for (const ship of ships) {
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

  // Ship-ship collision: all pairs
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const si = ships[i], sj = ships[j];
      if (si.state.invulnerableTimer <= 0 && sj.state.invulnerableTimer <= 0 && checkShipShipCollision(si, sj)) {
        spawnExplosion(explosions, si.state.x, si.state.y, si.config.color, si.config.explosionParticles);
        spawnExplosion(explosions, sj.state.x, sj.state.y, sj.config.color, sj.config.explosionParticles);
        destroyShip(si);
        destroyShip(sj);
        if (networkMode) {
          net.sendDeath(si, null, 'collision');
          net.sendDeath(sj, null, 'collision');
        } else {
          leaderboard.recordCollision(si.id, sj.id);
        }
      }
    }
  }

  luaCtx.callLuaUpdate(dt);
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

requestAnimationFrame(gameLoop);
