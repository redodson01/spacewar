import { createShip, resetShip, updateShip, drawShip, destroyShip, tickRespawn, tickInvulnerable } from './ship.js';
import { createInputManager, PLAYER_BINDINGS, getActions } from './input.js';
import { createStars, drawStars } from './stars.js';
import { PROJECTILE_DEFAULTS, createProjectiles, fireProjectile, updateProjectiles, drawProjectiles, tickFireCooldown } from './projectiles.js';
import { createExplosions, spawnExplosion, updateExplosions, drawExplosions } from './explosions.js';
import { checkShipProjectileCollision, checkShipShipCollision } from './collision.js';
import { createLuaContext } from './lua-integration.js';
import { createEditor } from './editor.js';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_COLORS, SPAWN_POSITIONS } from './world.js';
import { createLeaderboard } from './leaderboard.js';
import { createNetClient, createInterpolator } from './net.js';

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game objects
const ships = [];
const stars = createStars(WORLD_WIDTH, WORLD_HEIGHT);
const projectiles = createProjectiles();
const explosions = createExplosions();
const input = createInputManager(['script-input', 'repl-input']);
input.attach(window);
const leaderboard = createLeaderboard();

// Networking
const net = createNetClient();
const interpolator = createInterpolator();
let networkMode = false;

function makeShip(id) {
  const spawn = SPAWN_POSITIONS[id];
  const ship = createShip(id, spawn.x, spawn.y, PLAYER_COLORS[id]);
  ship.angle = ship.spawnAngle = spawn.angle;
  return ship;
}

// Initialize local 2-player mode (default)
function initLocalMode() {
  ships.length = 0;
  ships.push(makeShip(0), makeShip(1));
  for (const s of ships) {
    s.isLocal = true;
    s.name = `Player ${s.id + 1}`;
    leaderboard.addPlayer(s.id, s.name, s.color);
  }
}

initLocalMode();

// Editor DOM elements
const elements = {
  editor: document.getElementById('editor'),
  scriptArea: document.getElementById('script-input'),
  outputDiv: document.getElementById('output'),
  hintDiv: document.getElementById('hint'),
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
    resetShip(ship, ship.spawnX, ship.spawnY);
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

net.onJoin((id, _color, name) => {
  if (ships.find(s => s.id === id)) return;
  const ship = makeShip(id);
  ship.isLocal = false;
  ship.name = name;
  ships.push(ship);
  leaderboard.addPlayer(id, name, PLAYER_COLORS[id]);
  luaCtx.reset();
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
    x: data.x + Math.cos(data.angle) * ship.radius,
    y: data.y + Math.sin(data.angle) * ship.radius,
    vx: data.vx + Math.cos(data.angle) * PROJECTILE_DEFAULTS.speed,
    vy: data.vy + Math.sin(data.angle) * PROJECTILE_DEFAULTS.speed,
    age: 0,
    lifetime: PROJECTILE_DEFAULTS.lifetime,
    radius: PROJECTILE_DEFAULTS.radius,
    color: data.color,
    ownerId: id,
  });
});

net.onHit((targetId, killerId, _x, _y, _color) => {
  // Another client says we got hit by a projectile
  const ship = ships.find(s => s.id === targetId && s.isLocal);
  if (ship && !ship.destroyed) {
    spawnExplosion(explosions, ship.x, ship.y, ship.color);
    destroyShip(ship);
    net.sendDeath(ship, killerId);
  }
});

net.onScores((scoreList) => {
  leaderboard.setScores(scoreList);
});

net.onDeath((id, x, y, color) => {
  const ship = ships.find(s => s.id === id);
  if (ship && !ship.destroyed) {
    spawnExplosion(explosions, x, y, color);
    destroyShip(ship);
    interpolator.remove(id);
  }
});

net.onRespawn((id, x, y) => {
  const ship = ships.find(s => s.id === id);
  if (ship) {
    resetShip(ship, x, y);
    interpolator.remove(id);
  }
});

// Try to connect — if it works, switch to network mode
const playerName = prompt('Enter your name:');
net.connect(playerName || 'Player').then((welcome) => {
  if (!welcome) return;

  networkMode = true;

  // Rebuild ships and leaderboard for network mode
  ships.length = 0;
  projectiles.length = 0;
  explosions.length = 0;
  leaderboard.clear();

  const localShip = makeShip(welcome.id);
  localShip.isLocal = true;
  localShip.name = welcome.name;
  ships.push(localShip);

  for (const p of welcome.players) {
    const ship = makeShip(p.id); // makeShip uses PLAYER_COLORS[id]
    ship.isLocal = false;
    ship.name = p.name;
    ships.push(ship);
  }

  leaderboard.addPlayer(welcome.id, welcome.name, PLAYER_COLORS[welcome.id]);
  for (const p of welcome.players) {
    leaderboard.addPlayer(p.id, p.name, PLAYER_COLORS[p.id]);
  }
  if (welcome.scores) leaderboard.setScores(welcome.scores);

  luaCtx.reset();
  elements.hintDiv.textContent = 'WASD + Space | ` for editor';
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
  ctx.strokeStyle = '#333';
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
      // Local ship: read from keyboard
      const bindings = networkMode ? PLAYER_BINDINGS[0] : PLAYER_BINDINGS[i];
      const actions = getActions(input.keys, bindings);

      const respawned = tickRespawn(ship, dt);
      if (networkMode && respawned) net.sendRespawn(ship);

      updateShip(ship, actions, WORLD_WIDTH, WORLD_HEIGHT);
      tickFireCooldown(ship, dt);
      if (actions.fire && !ship.destroyed) {
        if (fireProjectile(projectiles, ship)) {
          if (networkMode) net.sendFire(ship);
        }
      }
      if (networkMode) net.sendState(ship);
    } else {
      // Remote ship: apply interpolated state from network
      interpolator.apply(ship, dt);
    }
    tickInvulnerable(ship, dt);
  }

  updateProjectiles(projectiles, dt, WORLD_WIDTH, WORLD_HEIGHT);

  // Collision: projectiles vs all ships
  for (const ship of ships) {
    if (!ship.destroyed && ship.invulnerableTimer <= 0) {
      const hitIdx = checkShipProjectileCollision(ship, projectiles);
      if (hitIdx >= 0) {
        const killerId = projectiles[hitIdx].ownerId;
        spawnExplosion(explosions, ship.x, ship.y, ship.color);
        projectiles.splice(hitIdx, 1);
        destroyShip(ship);
        if (networkMode) {
          if (ship.isLocal) net.sendDeath(ship, killerId);
          else net.sendHit(ship, killerId);
        } else {
          leaderboard.recordKill(killerId);
        }
      }
    }
  }

  // Ship-ship collision: all pairs
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      if (ships[i].invulnerableTimer <= 0 && ships[j].invulnerableTimer <= 0 && checkShipShipCollision(ships[i], ships[j])) {
        spawnExplosion(explosions, ships[i].x, ships[i].y, ships[i].color);
        spawnExplosion(explosions, ships[j].x, ships[j].y, ships[j].color);
        destroyShip(ships[i]);
        destroyShip(ships[j]);
        if (networkMode) {
          if (ships[i].isLocal) net.sendDeath(ships[i]);
          else net.sendHit(ships[i], null);
          if (ships[j].isLocal) net.sendDeath(ships[j]);
          else net.sendHit(ships[j], null);
        } else {
          leaderboard.recordCollision(ships[i].id, ships[j].id);
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

  // Leaderboard in world space
  leaderboard.draw(ctx);

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
