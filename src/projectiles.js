export const PROJECTILE_DEFAULTS = {
  speed: 7,
  lifetime: 1.5,
  radius: 2,
  color: '#ff0',
};

export function createProjectiles() {
  return [];
}

export function fireProjectile(projectiles, ship) {
  if (ship.fireCooldownTimer > 0) return false;

  const nose = {
    x: ship.x + Math.cos(ship.angle) * ship.radius,
    y: ship.y + Math.sin(ship.angle) * ship.radius,
  };

  projectiles.push({
    x: nose.x,
    y: nose.y,
    vx: ship.vx + Math.cos(ship.angle) * PROJECTILE_DEFAULTS.speed,
    vy: ship.vy + Math.sin(ship.angle) * PROJECTILE_DEFAULTS.speed,
    age: 0,
    lifetime: PROJECTILE_DEFAULTS.lifetime,
    radius: PROJECTILE_DEFAULTS.radius,
    color: PROJECTILE_DEFAULTS.color,
  });

  ship.fireCooldownTimer = ship.fireCooldown;
  return true;
}

export function tickFireCooldown(ship, dt) {
  ship.fireCooldownTimer = Math.max(0, ship.fireCooldownTimer - dt);
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
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
}
