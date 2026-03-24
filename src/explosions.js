export function createExplosions() {
  return [];
}

export const EXPLOSION_DEFAULTS = {
  particles: 25,
};

export function spawnExplosion(explosions, x, y, color, particles = EXPLOSION_DEFAULTS.particles) {
  const count = Math.max(1, Math.floor(particles * 0.8)) + Math.floor(Math.random() * Math.max(1, Math.floor(particles * 0.4) + 1));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    explosions.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      lifetime: 0.4 + Math.random() * 0.4,
      radius: 2 + Math.random() * 2,
      color,
      opacity: 1,
    });
  }
}

export function updateExplosions(explosions, dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const p = explosions[i];
    const scale = dt * 60;
    p.x += p.vx * scale;
    p.y += p.vy * scale;
    p.age += dt;
    p.opacity = Math.max(0, 1 - p.age / p.lifetime);

    if (p.age >= p.lifetime) {
      explosions.splice(i, 1);
    }
  }
}

export function drawExplosions(ctx, explosions) {
  const prevAlpha = ctx.globalAlpha;
  for (const p of explosions) {
    ctx.globalAlpha = p.opacity;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = prevAlpha;
}
