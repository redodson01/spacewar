import { createShip, resetShip, updateShip, drawShip, destroyShip, tickRespawn } from './ship.js';
import { createInputManager, PLAYER_BINDINGS, getActions } from './input.js';
import { createStars, resizeStars, drawStars } from './stars.js';
import { createProjectiles, fireProjectile, updateProjectiles, drawProjectiles, tickFireCooldown } from './projectiles.js';
import { createExplosions, spawnExplosion, updateExplosions, drawExplosions } from './explosions.js';
import { checkShipProjectileCollision, checkShipShipCollision } from './collision.js';
import { createLuaContext } from './lua-integration.js';
import { createEditor } from './editor.js';

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game objects
const PLAYER_COLORS = ['#f00', '#00f'];

const ships = [
  createShip(0, canvas.width / 4, canvas.height / 2, PLAYER_COLORS[0]),
  createShip(1, 3 * canvas.width / 4, canvas.height / 2, PLAYER_COLORS[1]),
];
// Face each other at start
ships[0].angle = ships[0].spawnAngle = 0;        // P1 faces right
ships[1].angle = ships[1].spawnAngle = Math.PI;  // P2 faces left

const stars = createStars(canvas.width, canvas.height);
const projectiles = createProjectiles();
const explosions = createExplosions();
const input = createInputManager(['script-input', 'repl-input']);
input.attach(window);

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

// Editor needs appendOutput for Lua context, but Lua context needs appendOutput too.
// Create a forwarding function, then wire it up after editor is created.
let appendOutput = (text, isError) => {
  // Fallback before editor is ready
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
  explosions.length = 0;
}, () => input.clear());
appendOutput = editorAPI.appendOutput;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  resizeStars(stars, canvas.width, canvas.height);
  luaCtx.updateScreen();
});

// Game loop
let lastTime = 0;
let firstFrame = true;

function gameLoop(time) {
  const dt = lastTime ? (time - lastTime) / 1000 : 0;
  lastTime = time;

  // Recenter ships on first frame in case canvas wasn't sized at init
  if (firstFrame) {
    firstFrame = false;
    if (canvas.width > 0) {
      ships[0].x = ships[0].spawnX = canvas.width / 4;
      ships[0].y = ships[0].spawnY = canvas.height / 2;
      ships[1].x = ships[1].spawnX = 3 * canvas.width / 4;
      ships[1].y = ships[1].spawnY = canvas.height / 2;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars(ctx, stars);

  // Update each ship from its player's controls
  for (let i = 0; i < ships.length; i++) {
    const ship = ships[i];
    const actions = getActions(input.keys, PLAYER_BINDINGS[i]);

    tickRespawn(ship, dt);
    updateShip(ship, actions, canvas.width, canvas.height);
    tickFireCooldown(ship, dt);
    if (actions.fire && !ship.destroyed) {
      fireProjectile(projectiles, ship);
    }
  }

  updateProjectiles(projectiles, dt, canvas.width, canvas.height);

  // Collision: any projectile can destroy any ship
  for (const ship of ships) {
    if (!ship.destroyed) {
      const hitIdx = checkShipProjectileCollision(ship, projectiles);
      if (hitIdx >= 0) {
        spawnExplosion(explosions, ship.x, ship.y, ship.color);
        projectiles.splice(hitIdx, 1);
        destroyShip(ship);
      }
    }
  }

  // Ship-ship collision: both explode
  if (checkShipShipCollision(ships[0], ships[1])) {
    for (const ship of ships) {
      spawnExplosion(explosions, ship.x, ship.y, ship.color);
      destroyShip(ship);
    }
  }

  luaCtx.callLuaUpdate(dt);
  updateExplosions(explosions, dt);
  drawExplosions(ctx, explosions);
  drawProjectiles(ctx, projectiles);
  for (const ship of ships) {
    drawShip(ctx, ship);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
