export const PROJECTILE_DEFAULTS = {
  speed: 16,
  lifetime: 4,
  radius: 4,
  color: '#ff0',
};

export function createProjectiles() {
  return [];
}

export function fireProjectile(projectiles, ship) {
  const s = ship.state;
  const c = ship.config;
  if (s.fireCooldownTimer > 0) return false;

  const nose = {
    x: s.x + Math.cos(s.angle) * c.radius,
    y: s.y + Math.sin(s.angle) * c.radius,
  };

  projectiles.push({
    x: nose.x,
    y: nose.y,
    vx: s.vx + Math.cos(s.angle) * PROJECTILE_DEFAULTS.speed,
    vy: s.vy + Math.sin(s.angle) * PROJECTILE_DEFAULTS.speed,
    age: 0,
    lifetime: PROJECTILE_DEFAULTS.lifetime,
    radius: PROJECTILE_DEFAULTS.radius,
    color: c.color,
    ownerId: ship.id,
  });

  s.fireCooldownTimer = c.fireCooldown;
  return true;
}

export function tickFireCooldown(ship, dt) {
  ship.state.fireCooldownTimer = Math.max(0, ship.state.fireCooldownTimer - dt);
}

export function updateProjectiles(projectiles, dt, canvasWidth, canvasHeight) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.age += dt;

    if (p.age >= p.lifetime || p.x < 0 || p.x > canvasWidth || p.y < 0 || p.y > canvasHeight) {
      projectiles.splice(i, 1);
    }
  }
}

export function drawProjectiles(ctx, projectiles) {
  for (const p of projectiles) {
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}
