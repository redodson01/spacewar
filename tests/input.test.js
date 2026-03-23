import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInputManager } from '../src/input.js';

function fireKey(win, type, code, opts = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, ...opts });
  Object.defineProperty(event, 'target', { value: { id: opts.targetId || '' } });
  win.dispatchEvent(event);
}

describe('createInputManager', () => {
  let input;

  beforeEach(() => {
    input = createInputManager(['script-input', 'repl-input']);
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

  it('ignores keydown from REPL input', () => {
    fireKey(window, 'keydown', 'KeyA', { targetId: 'repl-input' });
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
});
