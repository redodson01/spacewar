import { describe, it, expect, beforeEach } from 'vitest';
import { PROJECTILE_DEFAULTS, createProjectiles, fireProjectile, updateProjectiles, tickFireCooldown } from '../src/projectiles.js';

function makeShip() {
  return { id: 0, x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 20, fireCooldown: 0.25, fireCooldownTimer: 0, color: '#0ff' };
}

describe('createProjectiles', () => {
  it('returns an empty array', () => {
    const p = createProjectiles();
    expect(p).toEqual([]);
  });
});

describe('fireProjectile', () => {
  let ship, projectiles;

  beforeEach(() => {
    ship = makeShip();
    projectiles = createProjectiles();
  });

  it('spawns a projectile at the ship nose', () => {
    ship.angle = 0;
    fireProjectile(projectiles, ship);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0].x).toBeCloseTo(ship.x + ship.radius);
    expect(projectiles[0].y).toBeCloseTo(ship.y);
  });

  it('sets projectile velocity from ship angle and speed', () => {
    ship.angle = 0;
    ship.vx = 1;
    ship.vy = 0;
    fireProjectile(projectiles, ship);
    expect(projectiles[0].vx).toBeCloseTo(1 + PROJECTILE_DEFAULTS.speed);
    expect(projectiles[0].vy).toBeCloseTo(0);
  });

  it('tags projectile with ownerId from ship', () => {
    fireProjectile(projectiles, ship);
    expect(projectiles[0].ownerId).toBe(0);
  });

  it('uses ship color for projectile', () => {
    ship.color = '#f0f';
    fireProjectile(projectiles, ship);
    expect(projectiles[0].color).toBe('#f0f');
  });

  it('resets the ship fire cooldown timer', () => {
    fireProjectile(projectiles, ship);
    expect(ship.fireCooldownTimer).toBe(ship.fireCooldown);
  });

  it('returns true on successful fire', () => {
    expect(fireProjectile(projectiles, ship)).toBe(true);
  });

  it('returns false when on cooldown', () => {
    ship.fireCooldownTimer = 0.1;
    expect(fireProjectile(projectiles, ship)).toBe(false);
  });

  it('does not add a projectile when on cooldown', () => {
    ship.fireCooldownTimer = 0.1;
    fireProjectile(projectiles, ship);
    expect(projectiles).toHaveLength(0);
  });
});

describe('tickFireCooldown', () => {
  it('decrements the timer by dt', () => {
    const ship = makeShip();
    ship.fireCooldownTimer = 0.25;
    tickFireCooldown(ship, 0.1);
    expect(ship.fireCooldownTimer).toBeCloseTo(0.15);
  });

  it('does not go below zero', () => {
    const ship = makeShip();
    ship.fireCooldownTimer = 0.05;
    tickFireCooldown(ship, 0.1);
    expect(ship.fireCooldownTimer).toBe(0);
  });
});

describe('updateProjectiles', () => {
  const W = 800;
  const H = 600;

  it('moves projectiles by their velocity', () => {
    const projectiles = [{ x: 100, y: 100, vx: 5, vy: -3, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles[0].x).toBe(105);
    expect(projectiles[0].y).toBe(97);
  });

  it('increments age by dt', () => {
    const projectiles = [{ x: 100, y: 100, vx: 0, vy: 0, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.5, W, H);
    expect(projectiles[0].age).toBeCloseTo(0.5);
  });

  it('removes projectiles that exceed lifetime', () => {
    const projectiles = [{ x: 100, y: 100, vx: 0, vy: 0, age: 1.9, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.2, W, H);
    expect(projectiles).toHaveLength(0);
  });

  it('removes projectiles that leave the left edge', () => {
    const projectiles = [{ x: -1, y: 100, vx: -5, vy: 0, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles).toHaveLength(0);
  });

  it('removes projectiles that leave the right edge', () => {
    const projectiles = [{ x: W + 1, y: 100, vx: 5, vy: 0, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles).toHaveLength(0);
  });

  it('removes projectiles that leave the top edge', () => {
    const projectiles = [{ x: 100, y: -1, vx: 0, vy: -5, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles).toHaveLength(0);
  });

  it('removes projectiles that leave the bottom edge', () => {
    const projectiles = [{ x: 100, y: H + 1, vx: 0, vy: 5, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles).toHaveLength(0);
  });

  it('keeps projectiles within bounds and lifetime', () => {
    const projectiles = [{ x: 100, y: 100, vx: 1, vy: 1, age: 0, lifetime: 2, radius: 2, color: '#ff0' }];
    updateProjectiles(projectiles, 0.016, W, H);
    expect(projectiles).toHaveLength(1);
  });
});
