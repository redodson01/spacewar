import { describe, it, expect } from 'vitest';
import { checkShipProjectileCollision } from '../src/collision.js';

function makeShip(x = 400, y = 300, radius = 15) {
  return { x, y, radius };
}

function makeProjectile(x, y, radius = 2) {
  return { x, y, radius, vx: 0, vy: 0, age: 0, lifetime: 2, color: '#ff0' };
}

describe('checkShipProjectileCollision', () => {
  it('returns -1 when no projectiles', () => {
    expect(checkShipProjectileCollision(makeShip(), [])).toBe(-1);
  });

  it('returns -1 when projectile is far away', () => {
    const projectiles = [makeProjectile(100, 100)];
    expect(checkShipProjectileCollision(makeShip(), projectiles)).toBe(-1);
  });

  it('returns the index when projectile overlaps ship', () => {
    const ship = makeShip(400, 300, 15);
    const projectiles = [makeProjectile(410, 300, 2)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(0);
  });

  it('returns the first matching index', () => {
    const ship = makeShip(400, 300, 15);
    const projectiles = [
      makeProjectile(100, 100), // miss
      makeProjectile(405, 300), // hit
      makeProjectile(400, 300), // also hit, but later
    ];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(1);
  });

  it('detects collision at boundary distance', () => {
    const ship = makeShip(400, 300, 15);
    // distance = 16, combined radii = 15 + 2 = 17 → hit
    const projectiles = [makeProjectile(416, 300, 2)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(0);
  });

  it('misses when just outside combined radii', () => {
    const ship = makeShip(400, 300, 15);
    // distance = 18, combined radii = 15 + 2 = 17 → miss
    const projectiles = [makeProjectile(418, 300, 2)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(-1);
  });
});
