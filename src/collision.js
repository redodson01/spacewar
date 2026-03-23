export function checkShipProjectileCollision(ship, projectiles) {
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ship.radius + p.radius) {
      return i;
    }
  }
  return -1;
}
