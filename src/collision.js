export function checkShipShipCollision(shipA, shipB) {
  if (shipA.destroyed || shipB.destroyed) return false;
  const dx = shipA.x - shipB.x;
  const dy = shipA.y - shipB.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < shipA.radius + shipB.radius;
}

export function checkShipProjectileCollision(ship, projectiles) {
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p.ownerId === ship.id) continue; // no self-fire
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ship.radius + p.radius) {
      return i;
    }
  }
  return -1;
}
