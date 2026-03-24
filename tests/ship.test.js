import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG_DEFAULTS, RESPAWN_DELAY, createShip, resetShip, updateShip, destroyShip, tickRespawn } from '../src/ship.js';

describe('createShip', () => {
  it('creates a ship with id, position, and color', () => {
    const ship = createShip(0, 400, 300, '#f00');
    expect(ship.id).toBe(0);
    expect(ship.state.x).toBe(400);
    expect(ship.state.y).toBe(300);
    expect(ship.config.color).toBe('#f00');
    expect(ship.spawnX).toBe(400);
    expect(ship.spawnY).toBe(300);
  });

  it('uses default color when not specified', () => {
    const ship = createShip(0, 0, 0);
    expect(ship.config.color).toBe('#0ff');
  });

  it('applies config defaults', () => {
    const ship = createShip(0, 0, 0);
    expect(ship.config.thrust).toBe(0.15);
    expect(ship.config.turnSpeed).toBe(0.05);
    expect(ship.config.friction).toBe(0.995);
    expect(ship.config.radius).toBe(20);
    expect(ship.config.fireCooldown).toBe(0.25);
  });

  it('applies state defaults', () => {
    const ship = createShip(0, 100, 200);
    expect(ship.state.vx).toBe(0);
    expect(ship.state.vy).toBe(0);
    expect(ship.state.destroyed).toBe(false);
    expect(ship.state.respawnTimer).toBe(0);
    expect(ship.state.thrusting).toBe(false);
    expect(ship.state.fireCooldownTimer).toBe(0);
  });
});

describe('resetShip', () => {
  it('restores state and recenters at spawn', () => {
    const ship = createShip(0, 400, 300, '#f0f');
    ship.state.vx = 10;
    ship.state.vy = -5;
    ship.state.x = 0;
    ship.state.y = 0;
    ship.state.destroyed = true;

    resetShip(ship);

    expect(ship.state.x).toBe(400);
    expect(ship.state.y).toBe(300);
    expect(ship.state.vx).toBe(0);
    expect(ship.state.vy).toBe(0);
    expect(ship.state.destroyed).toBe(false);
  });

  it('preserves config across reset', () => {
    const ship = createShip(0, 400, 300, '#f0f');
    ship.config.thrust = 0.5;
    ship.config.turnSpeed = 0.1;
    ship.config.friction = 0.99;
    ship.config.fireCooldown = 0.1;
    ship.config.radius = 30;
    ship.config.showName = true;
    ship.config.controlScheme = 1;
    ship.config.explosionParticles = 50;

    resetShip(ship);

    expect(ship.config.color).toBe('#f0f');
    expect(ship.config.thrust).toBe(0.5);
    expect(ship.config.turnSpeed).toBe(0.1);
    expect(ship.config.friction).toBe(0.99);
    expect(ship.config.fireCooldown).toBe(0.1);
    expect(ship.config.radius).toBe(30);
    expect(ship.config.showName).toBe(true);
    expect(ship.config.controlScheme).toBe(1);
    expect(ship.config.explosionParticles).toBe(50);
  });

  it('preserves identity across reset', () => {
    const ship = createShip(1, 400, 300);
    ship.state.x = 0;
    ship.state.y = 0;
    resetShip(ship);
    expect(ship.id).toBe(1);
    expect(ship.spawnX).toBe(400);
    expect(ship.spawnY).toBe(300);
  });

  it('restores spawnAngle when set', () => {
    const ship = createShip(0, 400, 300);
    ship.spawnAngle = Math.PI;
    ship.state.angle = 0.5;
    resetShip(ship);
    expect(ship.state.angle).toBe(Math.PI);
  });
});

describe('destroyShip', () => {
  it('marks the ship as destroyed with a respawn timer', () => {
    const ship = createShip(0, 400, 300);
    destroyShip(ship);
    expect(ship.state.destroyed).toBe(true);
    expect(ship.state.respawnTimer).toBe(RESPAWN_DELAY);
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
    expect(ship.state.respawnTimer).toBeCloseTo(RESPAWN_DELAY - 0.5);
    expect(ship.state.destroyed).toBe(true);
  });

  it('resets the ship at its spawn point when timer expires', () => {
    const ship = createShip(0, 400, 300);
    ship.state.x = 100;
    ship.state.y = 100;
    destroyShip(ship);
    const result = tickRespawn(ship, RESPAWN_DELAY + 0.1);
    expect(result).toBe(true);
    expect(ship.state.destroyed).toBe(false);
    expect(ship.state.x).toBe(400);
    expect(ship.state.y).toBe(300);
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
    const prevX = ship.state.x;
    const prevY = ship.state.y;
    updateShip(ship, {}, W, H);
    expect(ship.state.x).toBe(prevX);
    expect(ship.state.y).toBe(prevY);
  });

  it('applies thrust in the facing direction', () => {
    ship.state.angle = 0;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.state.vx).toBeGreaterThan(0);
    expect(ship.state.vy).toBeCloseTo(0, 10);
  });

  it('sets thrusting flag', () => {
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.state.thrusting).toBe(true);
    updateShip(ship, {}, W, H);
    expect(ship.state.thrusting).toBe(false);
  });

  it('turns left', () => {
    const prevAngle = ship.state.angle;
    updateShip(ship, { left: true }, W, H);
    expect(ship.state.angle).toBeLessThan(prevAngle);
  });

  it('turns right', () => {
    const prevAngle = ship.state.angle;
    updateShip(ship, { right: true }, W, H);
    expect(ship.state.angle).toBeGreaterThan(prevAngle);
  });

  it('applies friction to slow down', () => {
    ship.state.vx = 10;
    ship.state.vy = 10;
    updateShip(ship, {}, W, H);
    expect(ship.state.vx).toBeLessThan(10);
    expect(ship.state.vy).toBeLessThan(10);
    expect(ship.state.vx).toBeCloseTo(10 * CONFIG_DEFAULTS.friction, 10);
  });

  it('wraps around the left edge', () => {
    ship.state.x = -1;
    ship.state.vx = 0;
    updateShip(ship, {}, W, H);
    expect(ship.state.x).toBe(W);
  });

  it('wraps around the right edge', () => {
    ship.state.x = W + 1;
    ship.state.vx = 0;
    updateShip(ship, {}, W, H);
    expect(ship.state.x).toBe(0);
  });

  it('wraps around the top edge', () => {
    ship.state.y = -1;
    ship.state.vy = 0;
    updateShip(ship, {}, W, H);
    expect(ship.state.y).toBe(H);
  });

  it('wraps around the bottom edge', () => {
    ship.state.y = H + 1;
    ship.state.vy = 0;
    updateShip(ship, {}, W, H);
    expect(ship.state.y).toBe(0);
  });

  it('respects custom thrust value', () => {
    ship.state.angle = 0;
    ship.config.thrust = 0.5;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.state.vx).toBeCloseTo(0.5 * ship.config.friction, 10);
  });

  it('respects custom turnSpeed value', () => {
    ship.config.turnSpeed = 0.2;
    const prevAngle = ship.state.angle;
    updateShip(ship, { left: true }, W, H);
    expect(ship.state.angle).toBeCloseTo(prevAngle - 0.2, 10);
  });

  it('is a no-op when destroyed', () => {
    ship.state.vx = 5;
    ship.state.destroyed = true;
    const prevX = ship.state.x;
    updateShip(ship, { thrust: true }, W, H);
    expect(ship.state.x).toBe(prevX);
  });
});
