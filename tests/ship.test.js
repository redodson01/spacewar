import { describe, it, expect, beforeEach } from 'vitest';
import { SHIP_DEFAULTS, RESPAWN_DELAY, createShip, resetShip, updateShip, destroyShip, tickRespawn } from '../src/ship.js';

describe('createShip', () => {
  it('creates a ship with id, position, and color', () => {
    const ship = createShip(0, 400, 300, '#f00');
    expect(ship.id).toBe(0);
    expect(ship.x).toBe(400);
    expect(ship.y).toBe(300);
    expect(ship.color).toBe('#f00');
    expect(ship.spawnX).toBe(400);
    expect(ship.spawnY).toBe(300);
  });

  it('uses default color when not specified', () => {
    const ship = createShip(0, 0, 0);
    expect(ship.color).toBe('#0ff');
  });

  it('applies default values', () => {
    const ship = createShip(0, 0, 0);
    expect(ship.thrust).toBe(0.15);
    expect(ship.turnSpeed).toBe(0.05);
    expect(ship.friction).toBe(0.995);
    expect(ship.radius).toBe(20);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
    expect(ship.fireCooldown).toBe(0.25);
    expect(ship.fireCooldownTimer).toBe(0);
    expect(ship.destroyed).toBe(false);
    expect(ship.respawnTimer).toBe(0);
    expect(ship.thrusting).toBe(false);
  });
});

describe('resetShip', () => {
  it('restores defaults and recenters', () => {
    const ship = createShip(0, 400, 300, '#f0f');
    ship.thrust = 999;
    ship.vx = 10;
    ship.vy = -5;
    ship.x = 0;
    ship.y = 0;

    resetShip(ship, 500, 400);

    expect(ship.x).toBe(500);
    expect(ship.y).toBe(400);
    expect(ship.thrust).toBe(SHIP_DEFAULTS.thrust);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
  });

  it('preserves ship color', () => {
    const ship = createShip(0, 400, 300, '#f0f');
    resetShip(ship, 400, 300);
    expect(ship.color).toBe('#f0f');
  });

  it('preserves ship id and spawn position', () => {
    const ship = createShip(1, 400, 300);
    ship.x = 0;
    ship.y = 0;
    resetShip(ship, 400, 300);
    expect(ship.id).toBe(1);
    expect(ship.spawnX).toBe(400);
    expect(ship.spawnY).toBe(300);
  });

  it('restores spawnAngle when set', () => {
    const ship = createShip(0, 400, 300);
    ship.angle = ship.spawnAngle = Math.PI;
    ship.angle = 0.5; // changed during play
    resetShip(ship, 400, 300);
    expect(ship.angle).toBe(Math.PI);
  });
});

describe('destroyShip', () => {
  it('marks the ship as destroyed with a respawn timer', () => {
    const ship = createShip(0, 400, 300);
    destroyShip(ship);
    expect(ship.destroyed).toBe(true);
    expect(ship.respawnTimer).toBe(RESPAWN_DELAY);
  });
});

describe('tickRespawn', () => {
  it('is a no-op when not destroyed', () => {
    const ship = createShip(0, 400, 300);
    expect(tickRespawn(ship, 0.5)).toBe(false);
  });

  it('decrements the timer when destroyed', () => {
    const ship = createShip(0, 400, 300);
    destroyShip(ship);
    tickRespawn(ship, 0.5);
    expect(ship.respawnTimer).toBeCloseTo(RESPAWN_DELAY - 0.5);
    expect(ship.destroyed).toBe(true);
  });

  it('resets the ship at its spawn point when timer expires', () => {
    const ship = createShip(0, 400, 300);
    ship.x = 100;
    ship.y = 100;
    destroyShip(ship);
    const result = tickRespawn(ship, RESPAWN_DELAY + 0.1);
    expect(result).toBe(true);
    expect(ship.destroyed).toBe(false);
    expect(ship.x).toBe(400);
    expect(ship.y).toBe(300);
  });
});

describe('updateShip', () => {
  let ship;
  const W = 800;
  const H = 600;

  beforeEach(() => {
    ship = createShip(0, W / 2, H / 2);
  });

  it('does not move without input', () => {
    const prevX = ship.x;
    const prevY = ship.y;
    updateShip(ship, {}, W, H);
    expect(ship.x).toBe(prevX);
    expect(ship.y).toBe(prevY);
  });

  it('applies thrust in the facing direction', () => {
    ship.angle = 0;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.vy).toBeCloseTo(0, 10);
  });

  it('sets thrusting flag', () => {
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.thrusting).toBe(true);
    updateShip(ship, {}, W, H);
    expect(ship.thrusting).toBe(false);
  });

  it('turns left', () => {
    const prevAngle = ship.angle;
    updateShip(ship, { left: true }, W, H);
    expect(ship.angle).toBeLessThan(prevAngle);
  });

  it('turns right', () => {
    const prevAngle = ship.angle;
    updateShip(ship, { right: true }, W, H);
    expect(ship.angle).toBeGreaterThan(prevAngle);
  });

  it('applies friction to slow down', () => {
    ship.vx = 10;
    ship.vy = 10;
    updateShip(ship, {}, W, H);
    expect(ship.vx).toBeLessThan(10);
    expect(ship.vy).toBeLessThan(10);
    expect(ship.vx).toBeCloseTo(10 * SHIP_DEFAULTS.friction, 10);
  });

  it('wraps around the left edge', () => {
    ship.x = -1;
    ship.vx = 0;
    updateShip(ship, {}, W, H);
    expect(ship.x).toBe(W);
  });

  it('wraps around the right edge', () => {
    ship.x = W + 1;
    ship.vx = 0;
    updateShip(ship, {}, W, H);
    expect(ship.x).toBe(0);
  });

  it('wraps around the top edge', () => {
    ship.y = -1;
    ship.vy = 0;
    updateShip(ship, {}, W, H);
    expect(ship.y).toBe(H);
  });

  it('wraps around the bottom edge', () => {
    ship.y = H + 1;
    ship.vy = 0;
    updateShip(ship, {}, W, H);
    expect(ship.y).toBe(0);
  });

  it('respects custom thrust value', () => {
    ship.angle = 0;
    ship.thrust = 0.5;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.vx).toBeCloseTo(0.5 * ship.friction, 10);
  });

  it('respects custom turnSpeed value', () => {
    ship.turnSpeed = 0.2;
    const prevAngle = ship.angle;
    updateShip(ship, { left: true }, W, H);
    expect(ship.angle).toBeCloseTo(prevAngle - 0.2, 10);
  });

  it('is a no-op when destroyed', () => {
    ship.vx = 5;
    ship.destroyed = true;
    const prevX = ship.x;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.x).toBe(prevX);
  });
});
