import { describe, it, expect } from 'vitest';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_COLORS, SPAWN_POSITIONS } from '../src/world.js';

describe('world constants', () => {
  it('defines world dimensions', () => {
    expect(WORLD_WIDTH).toBe(1920);
    expect(WORLD_HEIGHT).toBe(1080);
  });

  it('defines 4 player colors', () => {
    expect(PLAYER_COLORS).toHaveLength(4);
    expect(PLAYER_COLORS).toEqual(['#f00', '#0f0', '#00f', '#ff0']);
  });

  it('defines 4 spawn positions within world bounds', () => {
    expect(SPAWN_POSITIONS).toHaveLength(4);
    for (const spawn of SPAWN_POSITIONS) {
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(WORLD_WIDTH);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.y).toBeLessThan(WORLD_HEIGHT);
      expect(spawn.angle).toBeDefined();
    }
  });
});
