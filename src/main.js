import { createShip, updateShip, drawShip } from './ship.js';
import { createInputManager } from './input.js';
import { createStars, resizeStars, drawStars } from './stars.js';

// Canvas
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game objects
const ship = createShip(canvas.width / 2, canvas.height / 2);
const stars = createStars(canvas.width, canvas.height);
const input = createInputManager([]);
input.attach(window);

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  resizeStars(stars, canvas.width, canvas.height);
});

// Game loop
let lastTime = 0;

function gameLoop(time) {
  const dt = lastTime ? (time - lastTime) / 1000 : 0;
  lastTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawStars(ctx, stars);
  updateShip(ship, input.keys, canvas.width, canvas.height);
  drawShip(ctx, ship, input.keys);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
