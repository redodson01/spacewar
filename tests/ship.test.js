import { describe, it, expect, beforeEach } from 'vitest';
import { SHIP_DEFAULTS, createShip, resetShip, updateShip } from '../src/ship.js';

describe('createShip', () => {
  it('creates a ship at the given center position', () => {
    const ship = createShip(400, 300);
    expect(ship.x).toBe(400);
    expect(ship.y).toBe(300);
  });

  it('applies default values', () => {
    const ship = createShip(0, 0);
    expect(ship.color).toBe('#0ff');
    expect(ship.thrust).toBe(0.15);
    expect(ship.turnSpeed).toBe(0.05);
    expect(ship.friction).toBe(0.995);
    expect(ship.radius).toBe(15);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
  });
});

describe('resetShip', () => {
  it('restores defaults and recenters', () => {
    const ship = createShip(400, 300);
    ship.color = '#f00';
    ship.thrust = 999;
    ship.vx = 10;
    ship.vy = -5;
    ship.x = 0;
    ship.y = 0;

    resetShip(ship, 500, 400);

    expect(ship.x).toBe(500);
    expect(ship.y).toBe(400);
    expect(ship.color).toBe(SHIP_DEFAULTS.color);
    expect(ship.thrust).toBe(SHIP_DEFAULTS.thrust);
    expect(ship.vx).toBe(0);
    expect(ship.vy).toBe(0);
  });
});

describe('updateShip', () => {
  let ship;
  const W = 800;
  const H = 600;

  beforeEach(() => {
    ship = createShip(W / 2, H / 2);
  });

  it('does not move without input', () => {
    const prevX = ship.x;
    const prevY = ship.y;
    updateShip(ship, {}, W, H);
    // Ship should stay put (no velocity, no thrust)
    expect(ship.x).toBe(prevX);
    expect(ship.y).toBe(prevY);
  });

  it('applies thrust in the facing direction', () => {
    ship.angle = 0; // facing right
    updateShip(ship, { ArrowUp: true }, W, H);
    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.vy).toBeCloseTo(0, 10);
  });

  it('turns left when ArrowLeft is pressed', () => {
    const prevAngle = ship.angle;
    updateShip(ship, { ArrowLeft: true }, W, H);
    expect(ship.angle).toBeLessThan(prevAngle);
  });

  it('turns right when ArrowRight is pressed', () => {
    const prevAngle = ship.angle;
    updateShip(ship, { ArrowRight: true }, W, H);
    expect(ship.angle).toBeGreaterThan(prevAngle);
  });

  it('supports WASD controls', () => {
    ship.angle = 0;
    updateShip(ship, { KeyW: true }, W, H);
    expect(ship.vx).toBeGreaterThan(0);

    const ship2 = createShip(W / 2, H / 2);
    const prevAngle = ship2.angle;
    updateShip(ship2, { KeyA: true }, W, H);
    expect(ship2.angle).toBeLessThan(prevAngle);

    const ship3 = createShip(W / 2, H / 2);
    const prevAngle3 = ship3.angle;
    updateShip(ship3, { KeyD: true }, W, H);
    expect(ship3.angle).toBeGreaterThan(prevAngle3);
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
    updateShip(ship, { ArrowUp: true }, W, H);
    expect(ship.vx).toBeCloseTo(0.5 * ship.friction, 10);
  });

  it('respects custom turnSpeed value', () => {
    ship.turnSpeed = 0.2;
    const prevAngle = ship.angle;
    updateShip(ship, { ArrowLeft: true }, W, H);
    expect(ship.angle).toBeCloseTo(prevAngle - 0.2, 10);
  });
});
