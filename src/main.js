import { createShip, resetShip, updateShip, drawShip, destroyShip, tickRespawn } from './ship.js';
import { createInputManager } from './input.js';
import { createStars, resizeStars, drawStars } from './stars.js';
import { createProjectiles, fireProjectile, updateProjectiles, drawProjectiles, tickFireCooldown } from './projectiles.js';
import { createExplosions, spawnExplosion, updateExplosions, drawExplosions } from './explosions.js';
import { checkShipProjectileCollision } from './collision.js';
import { createLuaContext } from './lua-integration.js';
import { createEditor } from './editor.js';

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game objects
const ship = createShip(canvas.width / 2, canvas.height / 2);
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
  luaCtx = createLuaContext(fengari, ship, projectiles, explosions, canvas, (text, isError) => appendOutput(text, isError));
} catch (e) {
  console.error('Lua init failed:', e);
  luaCtx = createLuaContext(null, ship, projectiles, explosions, canvas, (text, isError) => appendOutput(text, isError));
}

const editorAPI = createEditor(elements, luaCtx, ship, () => {
  resetShip(ship, canvas.width / 2, canvas.height / 2);
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

  // Recenter ship on first frame in case canvas wasn't sized at init
  if (firstFrame) {
    firstFrame = false;
    if (ship.x === 0 && ship.y === 0 && canvas.width > 0) {
      ship.x = canvas.width / 2;
      ship.y = canvas.height / 2;
    }
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawStars(ctx, stars);
  tickRespawn(ship, dt, canvas.width / 2, canvas.height / 2);
  updateShip(ship, input.keys, canvas.width, canvas.height);
  tickFireCooldown(ship, dt);
  if (input.keys['Space'] && !ship.destroyed) {
    fireProjectile(projectiles, ship);
  }
  updateProjectiles(projectiles, dt, canvas.width, canvas.height);

  if (!ship.destroyed) {
    const hitIdx = checkShipProjectileCollision(ship, projectiles);
    if (hitIdx >= 0) {
      spawnExplosion(explosions, ship.x, ship.y, ship.color);
      projectiles.splice(hitIdx, 1);
      destroyShip(ship);
    }
  }

  luaCtx.callLuaUpdate(dt);
  updateExplosions(explosions, dt);
  drawExplosions(ctx, explosions);
  drawProjectiles(ctx, projectiles);
  drawShip(ctx, ship, input.keys);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
