export const SHIP_DEFAULTS = {
  angle: -Math.PI / 2,
  vx: 0,
  vy: 0,
  radius: 15,
  thrust: 0.15,
  turnSpeed: 0.05,
  friction: 0.995,
  color: '#0ff',
  fireCooldown: 0.25,
  fireCooldownTimer: 0,
  destroyed: false,
  respawnTimer: 0,
};

export function createShip(centerX, centerY) {
  return { x: centerX, y: centerY, ...SHIP_DEFAULTS };
}

export function resetShip(ship, centerX, centerY) {
  Object.assign(ship, SHIP_DEFAULTS, { x: centerX, y: centerY });
}

export const RESPAWN_DELAY = 2.0;

export function destroyShip(ship) {
  ship.destroyed = true;
  ship.respawnTimer = RESPAWN_DELAY;
}

export function tickRespawn(ship, dt, centerX, centerY) {
  if (!ship.destroyed) return false;
  ship.respawnTimer -= dt;
  if (ship.respawnTimer <= 0) {
    resetShip(ship, centerX, centerY);
    return true;
  }
  return false;
}

export function updateShip(ship, keys, canvasWidth, canvasHeight) {
  if (ship.destroyed) return;
  if (keys['ArrowLeft'] || keys['KeyA']) ship.angle -= ship.turnSpeed;
  if (keys['ArrowRight'] || keys['KeyD']) ship.angle += ship.turnSpeed;

  if (keys['ArrowUp'] || keys['KeyW']) {
    ship.vx += Math.cos(ship.angle) * ship.thrust;
    ship.vy += Math.sin(ship.angle) * ship.thrust;
  }

  ship.vx *= ship.friction;
  ship.vy *= ship.friction;
  ship.x += ship.vx;
  ship.y += ship.vy;

  if (ship.x < 0) ship.x = canvasWidth;
  if (ship.x > canvasWidth) ship.x = 0;
  if (ship.y < 0) ship.y = canvasHeight;
  if (ship.y > canvasHeight) ship.y = 0;
}

export function drawShip(ctx, ship, keys) {
  if (ship.destroyed) return;
  const { x, y, angle, radius, color } = ship;
  const nose  = { x: x + Math.cos(angle) * radius,       y: y + Math.sin(angle) * radius };
  const left  = { x: x + Math.cos(angle + 2.4) * radius, y: y + Math.sin(angle + 2.4) * radius };
  const right = { x: x + Math.cos(angle - 2.4) * radius, y: y + Math.sin(angle - 2.4) * radius };

  ctx.beginPath();
  ctx.moveTo(nose.x, nose.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  if (keys['ArrowUp'] || keys['KeyW']) {
    const tail = { x: x - Math.cos(angle) * radius * 1.3, y: y - Math.sin(angle) * radius * 1.3 };
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tail.x, tail.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fillStyle = `hsl(${30 + Math.random() * 20}, 100%, ${50 + Math.random() * 20}%)`;
    ctx.fill();
  }
}
