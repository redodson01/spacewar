import { describe, it, expect } from 'vitest';
import { createExplosions, spawnExplosion, updateExplosions } from '../src/explosions.js';

describe('createExplosions', () => {
  it('returns an empty array', () => {
    expect(createExplosions()).toEqual([]);
  });
});

describe('spawnExplosion', () => {
  it('adds 20-30 particles', () => {
    const explosions = createExplosions();
    spawnExplosion(explosions, 100, 200, '#0ff');
    expect(explosions.length).toBeGreaterThanOrEqual(20);
    expect(explosions.length).toBeLessThanOrEqual(30);
  });

  it('creates particles at the given position', () => {
    const explosions = createExplosions();
    spawnExplosion(explosions, 100, 200, '#0ff');
    for (const p of explosions) {
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    }
  });

  it('creates particles with required properties', () => {
    const explosions = createExplosions();
    spawnExplosion(explosions, 100, 200, '#f00');
    const p = explosions[0];
    expect(p).toHaveProperty('x');
    expect(p).toHaveProperty('y');
    expect(p).toHaveProperty('vx');
    expect(p).toHaveProperty('vy');
    expect(p).toHaveProperty('age', 0);
    expect(p).toHaveProperty('lifetime');
    expect(p).toHaveProperty('radius');
    expect(p).toHaveProperty('color', '#f00');
    expect(p).toHaveProperty('opacity', 1);
  });
});

describe('updateExplosions', () => {
  it('moves particles by their velocity', () => {
    const explosions = [{ x: 10, y: 20, vx: 2, vy: -1, age: 0, lifetime: 1, radius: 1, color: '#fff', opacity: 1 }];
    updateExplosions(explosions, 0.016);
    expect(explosions[0].x).toBe(12);
    expect(explosions[0].y).toBe(19);
  });

  it('increments age by dt', () => {
    const explosions = [{ x: 0, y: 0, vx: 0, vy: 0, age: 0, lifetime: 1, radius: 1, color: '#fff', opacity: 1 }];
    updateExplosions(explosions, 0.1);
    expect(explosions[0].age).toBeCloseTo(0.1);
  });

  it('fades opacity as particle ages', () => {
    const explosions = [{ x: 0, y: 0, vx: 0, vy: 0, age: 0, lifetime: 1, radius: 1, color: '#fff', opacity: 1 }];
    updateExplosions(explosions, 0.5);
    expect(explosions[0].opacity).toBeCloseTo(0.5);
  });

  it('removes expired particles', () => {
    const explosions = [{ x: 0, y: 0, vx: 0, vy: 0, age: 0.9, lifetime: 1, radius: 1, color: '#fff', opacity: 1 }];
    updateExplosions(explosions, 0.2);
    expect(explosions).toHaveLength(0);
  });

  it('keeps live particles', () => {
    const explosions = [{ x: 0, y: 0, vx: 0, vy: 0, age: 0, lifetime: 1, radius: 1, color: '#fff', opacity: 1 }];
    updateExplosions(explosions, 0.1);
    expect(explosions).toHaveLength(1);
  });
});
