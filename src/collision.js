export function checkShipShipCollision(shipA, shipB) {
  if (shipA.state.destroyed || shipB.state.destroyed) return false;
  const dx = shipA.state.x - shipB.state.x;
  const dy = shipA.state.y - shipB.state.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < shipA.config.radius + shipB.config.radius;
}

export function checkShipProjectileCollision(ship, projectiles) {
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p.ownerId === ship.id) continue; // no self-fire
    const dx = ship.state.x - p.x;
    const dy = ship.state.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ship.config.radius + p.radius) {
      return i;
    }
  }
  return -1;
}
