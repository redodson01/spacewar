import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInputManager, PLAYER_BINDINGS, getActions } from '../src/input.js';

function fireKey(win, type, code, opts = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, ...opts });
  Object.defineProperty(event, 'target', { value: { id: opts.targetId || '' } });
  win.dispatchEvent(event);
}

describe('createInputManager', () => {
  let input;

  beforeEach(() => {
    input = createInputManager(['script-input', 'chat-input']);
    input.attach(window);
  });

  afterEach(() => {
    input.detach(window);
  });

  it('tracks key down state', () => {
    fireKey(window, 'keydown', 'ArrowUp');
    expect(input.keys['ArrowUp']).toBe(true);
  });

  it('clears key on key up', () => {
    fireKey(window, 'keydown', 'ArrowUp');
    fireKey(window, 'keyup', 'ArrowUp');
    expect(input.keys['ArrowUp']).toBe(false);
  });

  it('ignores keydown from editor input elements', () => {
    fireKey(window, 'keydown', 'KeyA', { targetId: 'script-input' });
    expect(input.keys['KeyA']).toBeUndefined();
  });

  it('ignores keydown from chat input', () => {
    fireKey(window, 'keydown', 'KeyA', { targetId: 'chat-input' });
    expect(input.keys['KeyA']).toBeUndefined();
  });

  it('ignores keydown when modifier key is held', () => {
    fireKey(window, 'keydown', 'ArrowUp', { metaKey: true });
    expect(input.keys['ArrowUp']).toBeUndefined();
  });

  it('clears key on keyup even when modifier is held', () => {
    fireKey(window, 'keydown', 'ArrowUp');
    expect(input.keys['ArrowUp']).toBe(true);
    fireKey(window, 'keyup', 'ArrowUp', { metaKey: true });
    expect(input.keys['ArrowUp']).toBe(false);
  });

  it('stops tracking after detach', () => {
    input.detach(window);
    fireKey(window, 'keydown', 'ArrowUp');
    expect(input.keys['ArrowUp']).toBeUndefined();
  });

  it('clears all keys on clear()', () => {
    fireKey(window, 'keydown', 'ArrowUp');
    fireKey(window, 'keydown', 'Space');
    expect(input.keys['ArrowUp']).toBe(true);
    expect(input.keys['Space']).toBe(true);
    input.clear();
    expect(input.keys['ArrowUp']).toBe(false);
    expect(input.keys['Space']).toBe(false);
  });
});

describe('PLAYER_BINDINGS', () => {
  it('defines bindings for two players', () => {
    expect(PLAYER_BINDINGS).toHaveLength(2);
  });

  it('player 1 uses WASD + Space', () => {
    expect(PLAYER_BINDINGS[0]).toEqual({ thrust: 'KeyW', left: 'KeyA', right: 'KeyD', fire: 'Space' });
  });

  it('player 2 uses Arrows + Slash', () => {
    expect(PLAYER_BINDINGS[1]).toEqual({ thrust: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Slash' });
  });
});

describe('getActions', () => {
  it('maps key states through bindings', () => {
    const keys = { KeyW: true, KeyA: false, KeyD: true, Space: true };
    const actions = getActions(keys, PLAYER_BINDINGS[0]);
    expect(actions).toEqual({ thrust: true, left: false, right: true, fire: true });
  });

  it('returns false for unpressed keys', () => {
    const actions = getActions({}, PLAYER_BINDINGS[0]);
    expect(actions).toEqual({ thrust: false, left: false, right: false, fire: false });
  });

  it('works with player 2 bindings', () => {
    const keys = { ArrowUp: true, ArrowLeft: true, Slash: true };
    const actions = getActions(keys, PLAYER_BINDINGS[1]);
    expect(actions.thrust).toBe(true);
    expect(actions.left).toBe(true);
    expect(actions.fire).toBe(true);
  });
});
