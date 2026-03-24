import { describe, it, expect } from 'vitest';
import { createInterpolator } from '../src/net.js';

function makeShip(id = 0) {
  return {
    id,
    config: { radius: 20, color: '#f00' },
    state: { x: 0, y: 0, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false },
  };
}

describe('createInterpolator', () => {
  it('snaps to first received state', () => {
    const interp = createInterpolator();
    const ship = makeShip();
    interp.onState(0, { x: 100, y: 200, angle: 1, vx: 5, vy: 3, thrusting: true, destroyed: false });
    interp.apply(ship, 0.05);
    expect(ship.state.x).toBe(100);
    expect(ship.state.y).toBe(200);
    expect(ship.state.angle).toBe(1);
    expect(ship.state.thrusting).toBe(true);
  });

  it('interpolates between two states', () => {
    const interp = createInterpolator();
    const ship = makeShip();
    interp.onState(0, { x: 0, y: 0, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.apply(ship, 1); // advance to t=1
    interp.onState(0, { x: 100, y: 200, angle: 1, vx: 10, vy: 20, thrusting: true, destroyed: false });
    interp.apply(ship, 0.025); // half of 0.05s window → t=0.5
    expect(ship.state.x).toBeCloseTo(50);
    expect(ship.state.y).toBeCloseTo(100);
  });

  it('snaps position when wrapping (delta > half world)', () => {
    const interp = createInterpolator();
    const ship = makeShip();
    interp.onState(0, { x: 1900, y: 500, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.apply(ship, 1);
    interp.onState(0, { x: 20, y: 500, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.apply(ship, 0.025); // half window
    // Should snap, not lerp across the world
    expect(ship.state.x).toBe(20);
  });

  it('interpolates angle via shortest path', () => {
    const interp = createInterpolator();
    const ship = makeShip();
    interp.onState(0, { x: 0, y: 0, angle: 3, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.apply(ship, 1);
    interp.onState(0, { x: 0, y: 0, angle: -3, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.apply(ship, 0.025);
    // 3 to -3 is a delta of -6, but shortest path is ~0.28 (via ±PI)
    // Should interpolate the short way, not sweep 6 radians
    expect(Math.abs(ship.state.angle)).toBeGreaterThan(2.5);
  });

  it('removes state for a ship', () => {
    const interp = createInterpolator();
    const ship = makeShip();
    interp.onState(0, { x: 100, y: 200, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false });
    interp.remove(0);
    ship.state.x = 999;
    interp.apply(ship, 0.05);
    expect(ship.state.x).toBe(999); // unchanged, no state to apply
  });
});
