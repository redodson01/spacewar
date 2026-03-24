export const CONFIG_DEFAULTS = {
  color: '#0ff',
  radius: 20,
  thrust: 0.15,
  turnSpeed: 0.05,
  friction: 0.995,
  fireCooldown: 0.25,
  showName: false,
  explosionParticles: 25,
};

export const STATE_DEFAULTS = {
  x: 0,
  y: 0,
  angle: -Math.PI / 2,
  vx: 0,
  vy: 0,
  thrusting: false,
  destroyed: false,
  respawnTimer: 0,
  invulnerableTimer: 0,
  fireCooldownTimer: 0,
};

export const RESPAWN_DELAY = 2.0;
export const INVULNERABLE_DURATION = 2.0;

export function createShip(id, x, y, color = CONFIG_DEFAULTS.color) {
  return {
    id,
    name: null,
    config: { ...CONFIG_DEFAULTS, color },
    state: { ...STATE_DEFAULTS, x, y },
    spawnX: x,
    spawnY: y,
    spawnAngle: undefined,
    isLocal: false,
    isAI: false,
    controlBinding: undefined,
  };
}

export function resetShip(ship) {
  Object.assign(ship.state, STATE_DEFAULTS, {
    x: ship.spawnX,
    y: ship.spawnY,
    invulnerableTimer: INVULNERABLE_DURATION,
  });
  if (ship.spawnAngle !== undefined) ship.state.angle = ship.spawnAngle;
}

export function destroyShip(ship) {
  ship.state.destroyed = true;
  ship.state.respawnTimer = RESPAWN_DELAY;
}

export function tickRespawn(ship, dt) {
  if (!ship.state.destroyed) return false;
  ship.state.respawnTimer -= dt;
  if (ship.state.respawnTimer <= 0) {
    resetShip(ship);
    return true;
  }
  return false;
}

export function tickInvulnerable(ship, dt) {
  if (ship.state.invulnerableTimer > 0) {
    ship.state.invulnerableTimer = Math.max(0, ship.state.invulnerableTimer - dt);
  }
}

export function updateShip(ship, actions, canvasWidth, canvasHeight, dt = 1 / 60) {
  const s = ship.state;
  const c = ship.config;
  if (s.destroyed) return;
  const scale = dt * 60; // normalize to 60fps reference rate
  s.thrusting = !!actions.thrust;
  if (actions.left) s.angle -= c.turnSpeed * scale;
  if (actions.right) s.angle += c.turnSpeed * scale;

  if (actions.thrust) {
    s.vx += Math.cos(s.angle) * c.thrust * scale;
    s.vy += Math.sin(s.angle) * c.thrust * scale;
  }

  s.vx *= Math.pow(c.friction, scale);
  s.vy *= Math.pow(c.friction, scale);
  s.x += s.vx * scale;
  s.y += s.vy * scale;

  if (s.x < 0) s.x = canvasWidth;
  if (s.x > canvasWidth) s.x = 0;
  if (s.y < 0) s.y = canvasHeight;
  if (s.y > canvasHeight) s.y = 0;
}

export function drawShip(ctx, ship) {
  const s = ship.state;
  const c = ship.config;
  if (s.destroyed) return;
  const { x, y, angle } = s;
  const { radius, color } = c;
  const nose  = { x: x + Math.cos(angle) * radius,       y: y + Math.sin(angle) * radius };
  const left  = { x: x + Math.cos(angle + 2.4) * radius, y: y + Math.sin(angle + 2.4) * radius };
  const right = { x: x + Math.cos(angle - 2.4) * radius, y: y + Math.sin(angle - 2.4) * radius };

  // Colored glow pulse while invulnerable
  if (s.invulnerableTimer > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(s.invulnerableTimer * Math.PI * 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 + pulse * 12;
  } else {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }

  ctx.beginPath();
  ctx.moveTo(nose.x, nose.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  if (s.thrusting) {
    ctx.shadowColor = '#f80';
    const tail = { x: x - Math.cos(angle) * radius * 1.3, y: y - Math.sin(angle) * radius * 1.3 };
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tail.x, tail.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fillStyle = `hsl(${30 + Math.random() * 20}, 100%, ${50 + Math.random() * 20}%)`;
    ctx.fill();
  }

  ctx.shadowBlur = 0;

  if (ship.name && c.showName) {
    ctx.fillStyle = color;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ship.name, x, y - radius - 10);
  }
}
