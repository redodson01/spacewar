export function createExplosions() {
  return [];
}

export function spawnExplosion(explosions, x, y, color) {
  const count = 20 + Math.floor(Math.random() * 11); // 20-30
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
      radius: 1 + Math.random() * 2,
      color,
      opacity: 1,
    });
  }
}

export function updateExplosions(explosions, dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const p = explosions[i];
    p.x += p.vx;
    p.y += p.vy;
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
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = prevAlpha;
}
