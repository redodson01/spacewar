import { describe, it, expect } from 'vitest';
import { getAIActions } from '../src/ai.js';

function makeShip(id, x, y, angle = 0) {
  return {
    id,
    config: { radius: 20 },
    state: { x, y, angle, vx: 0, vy: 0, destroyed: false },
  };
}

describe('getAIActions', () => {
  const W = 1920, H = 1080;

  it('returns valid actions object', () => {
    const ship = makeShip(0, 400, 300);
    const target = makeShip(1, 800, 300);
    const actions = getAIActions(ship, [ship, target], [], W, H);
    expect(actions).toHaveProperty('thrust');
    expect(actions).toHaveProperty('left');
    expect(actions).toHaveProperty('right');
    expect(actions).toHaveProperty('fire');
  });

  it('returns neutral actions when no target', () => {
    const ship = makeShip(0, 400, 300);
    const actions = getAIActions(ship, [ship], [], W, H);
    expect(actions.thrust).toBe(false);
    expect(actions.fire).toBe(false);
  });

  it('returns neutral actions when destroyed', () => {
    const ship = makeShip(0, 400, 300);
    ship.state.destroyed = true;
    const target = makeShip(1, 800, 300);
    const actions = getAIActions(ship, [ship, target], [], W, H);
    expect(actions.thrust).toBe(false);
    expect(actions.fire).toBe(false);
  });

  it('fires when facing target', () => {
    const ship = makeShip(0, 400, 300, 0); // facing right
    const target = makeShip(1, 800, 300); // to the right
    const actions = getAIActions(ship, [ship, target], [], W, H);
    expect(actions.fire).toBe(true);
  });

  it('does not fire when facing away from target', () => {
    const ship = makeShip(0, 400, 300, Math.PI); // facing left
    const target = makeShip(1, 800, 300); // to the right
    const actions = getAIActions(ship, [ship, target], [], W, H);
    expect(actions.fire).toBe(false);
  });

  it('turns toward target', () => {
    const ship = makeShip(0, 400, 300, 0); // facing right
    const target = makeShip(1, 400, 100); // above
    const actions = getAIActions(ship, [ship, target], [], W, H);
    // Target is above (negative y), so ship needs to turn left (negative angle)
    expect(actions.left).toBe(true);
    expect(actions.right).toBe(false);
  });

  it('thrusts when far from target', () => {
    const ship = makeShip(0, 100, 300, 0);
    const target = makeShip(1, 900, 300);
    const actions = getAIActions(ship, [ship, target], [], W, H);
    expect(actions.thrust).toBe(true);
  });

  it('skips destroyed targets', () => {
    const ship = makeShip(0, 400, 300);
    const dead = makeShip(1, 500, 300);
    dead.state.destroyed = true;
    const actions = getAIActions(ship, [ship, dead], [], W, H);
    expect(actions.thrust).toBe(false); // no valid target
  });
});
