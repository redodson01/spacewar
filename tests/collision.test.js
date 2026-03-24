import { describe, it, expect } from 'vitest';
import { checkShipShipCollision, checkShipProjectileCollision } from '../src/collision.js';

function makeShip(x = 400, y = 300, radius = 20, id = 0) {
  return { id, config: { radius }, state: { x, y, destroyed: false } };
}

function makeProjectile(x, y, radius = 4, ownerId = 99) {
  return { x, y, radius, vx: 0, vy: 0, age: 0, lifetime: 2, color: '#ff0', ownerId };
}

describe('checkShipShipCollision', () => {
  it('returns true when ships overlap', () => {
    const a = makeShip(400, 300, 15);
    const b = makeShip(420, 300, 15);
    expect(checkShipShipCollision(a, b)).toBe(true);
  });

  it('returns false when ships are far apart', () => {
    const a = makeShip(100, 300, 15);
    const b = makeShip(400, 300, 15);
    expect(checkShipShipCollision(a, b)).toBe(false);
  });

  it('returns false when either ship is destroyed', () => {
    const a = makeShip(400, 300, 15);
    const b = makeShip(410, 300, 15);
    a.state.destroyed = true;
    expect(checkShipShipCollision(a, b)).toBe(false);
  });

  it('detects collision at boundary distance', () => {
    const a = makeShip(400, 300, 15);
    const b = makeShip(429, 300, 15);
    expect(checkShipShipCollision(a, b)).toBe(true);
  });

  it('misses when just outside combined radii', () => {
    const a = makeShip(400, 300, 15);
    const b = makeShip(431, 300, 15);
    expect(checkShipShipCollision(a, b)).toBe(false);
  });
});

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
      makeProjectile(100, 100),
      makeProjectile(405, 300),
      makeProjectile(400, 300),
    ];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(1);
  });

  it('detects collision at boundary distance', () => {
    const ship = makeShip(400, 300, 15);
    const projectiles = [makeProjectile(418, 300, 4)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(0);
  });

  it('misses when just outside combined radii', () => {
    const ship = makeShip(400, 300, 15);
    const projectiles = [makeProjectile(420, 300, 4)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(-1);
  });

  it('ignores projectiles owned by the ship (no self-fire)', () => {
    const ship = makeShip(400, 300, 15, 0);
    const projectiles = [makeProjectile(410, 300, 4, 0)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(-1);
  });

  it('hits with projectiles from other ships', () => {
    const ship = makeShip(400, 300, 15, 0);
    const projectiles = [makeProjectile(410, 300, 4, 1)];
    expect(checkShipProjectileCollision(ship, projectiles)).toBe(0);
  });
});
