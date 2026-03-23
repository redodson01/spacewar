import { describe, it, expect } from 'vitest';
import { createStars, resizeStars } from '../src/stars.js';

describe('createStars', () => {
  it('creates the requested number of stars', () => {
    const stars = createStars(800, 600, 50);
    expect(stars).toHaveLength(50);
  });

  it('defaults to 200 stars', () => {
    const stars = createStars(800, 600);
    expect(stars).toHaveLength(200);
  });

  it('creates stars within bounds', () => {
    const stars = createStars(800, 600, 100);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(800);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(600);
    }
  });

  it('creates stars with valid size and brightness', () => {
    const stars = createStars(800, 600, 100);
    for (const star of stars) {
      expect(star.size).toBeGreaterThan(0);
      expect(star.brightness).toBeGreaterThanOrEqual(0);
      expect(star.brightness).toBeLessThan(1);
    }
  });
});

describe('resizeStars', () => {
  it('repositions stars within new bounds', () => {
    const stars = createStars(800, 600, 50);
    resizeStars(stars, 1920, 1080);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(1920);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThan(1080);
    }
  });

  it('preserves star count', () => {
    const stars = createStars(800, 600, 50);
    resizeStars(stars, 1920, 1080);
    expect(stars).toHaveLength(50);
  });
});
