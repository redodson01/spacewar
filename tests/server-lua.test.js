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
  let ships, projectiles, callbacks, lua;

  beforeEach(() => {
    ships = [createShip(0, 400, 300, '#f00')];
    ships[0].name = 'TestBot';
    ships[0].isAI = true;
    projectiles = [];
    callbacks = {
      onStateWrite: vi.fn(),
      onAddAI: vi.fn(() => -1),
      onRemoveAI: vi.fn(),
      onNameChange: vi.fn(),
      onSetSpeed: vi.fn(),
      onGetSpeed: vi.fn(() => 1.0),
      onShoot: vi.fn(),
      onOutput: vi.fn(),
      getWorldWidth: () => 1920,
      getWorldHeight: () => 1080,
    };
    lua = createServerLua(ships, projectiles, callbacks);
    lua.exposeScreen(1920, 1080);
  });

  it('executes simple expressions via REPL', () => {
    const result = lua.runLuaREPL('1 + 2');
    expect(result.output).toContain('3');
  });

  it('reports errors', () => {
    const result = lua.runLuaREPL('if if if');
    expect(result.output.some(l => l.includes('Error:'))).toBe(true);
  });

  it('reads ship config via proxy', () => {
    const result = lua.runLuaREPL('ship1.color');
    expect(result.output).toContain('#f00');
  });

  it('reads ship state via proxy', () => {
    const result = lua.runLuaREPL('ship1.x');
    expect(result.output).toContain('400.0');
  });

  it('writes config and marks dirty', () => {
    const result = lua.runLuaREPL('ship1.color = "#0f0"');
    expect(result.configDirty).toBe(true);
    expect(ships[0].config.color).toBe('#0f0');
  });

  it('writes state and calls onStateWrite', () => {
    lua.runLuaREPL('ship1.x = 500');
    expect(callbacks.onStateWrite).toHaveBeenCalledWith(0, 'x', 500);
    expect(ships[0].state.x).toBe(500);
  });

  it('config is not dirty for state writes', () => {
    const result = lua.runLuaREPL('ship1.x = 500');
    expect(result.configDirty).toBe(false);
  });

  it('print outputs to result', () => {
    const result = lua.runLuaREPL('print("hello")');
    expect(result.output).toContain('hello');
  });

  it('help returns output', () => {
    const result = lua.runLuaREPL('help()');
    expect(result.output.some(l => l.includes('Spacewar Lua API'))).toBe(true);
  });

  it('setName calls callback', () => {
    lua.runLuaREPL('setName(1, "NewName")');
    expect(callbacks.onNameChange).toHaveBeenCalledWith(0, 'NewName');
    expect(ships[0].name).toBe('NewName');
  });

  it('runLua detects onUpdate', () => {
    expect(lua.hasOnUpdate).toBe(false);
    lua.runLua('function onUpdate(dt) end');
    expect(lua.hasOnUpdate).toBe(true);
  });

  it('callLuaUpdate runs onUpdate', () => {
    lua.runLua('function onUpdate(dt) print(dt) end');
    const result = lua.callLuaUpdate(0.016);
    expect(result).toHaveProperty('configDirty');
  });
});
