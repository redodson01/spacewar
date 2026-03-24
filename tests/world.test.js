import { describe, it, expect } from 'vitest';
import { WORLD_WIDTH, WORLD_HEIGHT, PLAYER_COLORS, SPAWN_POSITIONS, MAX_PLAYERS } from '../src/world.js';

describe('world constants', () => {
  it('defines world dimensions', () => {
    expect(WORLD_WIDTH).toBe(1920);
    expect(WORLD_HEIGHT).toBe(1080);
  });

  it('supports 8 players', () => {
    expect(MAX_PLAYERS).toBe(8);
  });

  it('defines 8 player colors', () => {
    expect(PLAYER_COLORS).toHaveLength(8);
    expect(PLAYER_COLORS[0]).toBe('#dc322f'); // red
    expect(PLAYER_COLORS[4]).toBe('#2aa198'); // cyan
    expect(PLAYER_COLORS[7]).toBe('#6c71c4'); // violet
  });

  it('defines 8 spawn positions within world bounds', () => {
    expect(SPAWN_POSITIONS).toHaveLength(8);
    for (const spawn of SPAWN_POSITIONS) {
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(WORLD_WIDTH);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.y).toBeLessThan(WORLD_HEIGHT);
      expect(spawn.angle).toBeDefined();
    }
  });
});
