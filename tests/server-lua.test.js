import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServerLua, createShip } from '../server/lua.js';

describe('createShip', () => {
  it('creates a ship with identity, config, state, and spawn properties', () => {
    const ship = createShip(0, 100, 200, '#f00');
    expect(ship.id).toBe(0);
    expect(ship.config.color).toBe('#f00');
    expect(ship.state.x).toBe(100);
    expect(ship.state.y).toBe(200);
    expect(ship.spawnX).toBe(100);
    expect(ship.spawnY).toBe(200);
    expect(ship.isAI).toBe(false);
  });
});

describe('createServerLua', () => {
  let ships, callbacks, lua;

  beforeEach(() => {
    ships = [createShip(0, 400, 300, '#f00')];
    ships[0].name = 'TestBot';
    ships[0].isAI = true;
    callbacks = {
      onStateWrite: vi.fn(),
      onAddAI: vi.fn(() => -1),
      onRemoveAI: vi.fn(),
      onNameChange: vi.fn(),
    };
    lua = createServerLua(ships, callbacks);
    lua.exposeScreen(1920, 1080);
  });

  it('executes simple expressions', () => {
    const result = lua.execute('1 + 2');
    expect(result.output).toContain('3');
  });

  it('reports errors', () => {
    const result = lua.execute('if if if');
    expect(result.output[0]).toContain('Error:');
  });

  it('reads ship config via proxy', () => {
    const result = lua.execute('ship1.color');
    expect(result.output).toContain('#f00');
  });

  it('reads ship state via proxy', () => {
    const result = lua.execute('ship1.x');
    expect(result.output).toContain('400.0');
  });

  it('writes config and marks dirty', () => {
    const result = lua.execute('ship1.color = "#0f0"');
    expect(result.configDirty).toBe(true);
    expect(ships[0].config.color).toBe('#0f0');
  });

  it('writes state and calls onStateWrite', () => {
    lua.execute('ship1.x = 500');
    expect(callbacks.onStateWrite).toHaveBeenCalledWith(0, 'x', 500);
    expect(ships[0].state.x).toBe(500);
  });

  it('config is not dirty for state writes', () => {
    const result = lua.execute('ship1.x = 500');
    expect(result.configDirty).toBe(false);
  });

  it('print outputs to result', () => {
    const result = lua.execute('print("hello")');
    expect(result.output).toContain('hello');
  });

  it('help returns output', () => {
    const result = lua.execute('help()');
    expect(result.output[0]).toContain('Spacewar Server Lua API');
  });

  it('setName calls callback', () => {
    lua.execute('setName(1, "NewName")');
    expect(callbacks.onNameChange).toHaveBeenCalledWith(0, 'NewName');
    expect(ships[0].name).toBe('NewName');
  });
});
