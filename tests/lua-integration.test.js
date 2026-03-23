import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLuaContext } from '../src/lua-integration.js';
import * as fengariLib from 'fengari';
import * as interop from 'fengari-interop';

// Assemble fengari object matching the shape of the CDN global
const fengari = {
  lua: fengariLib.lua,
  lauxlib: fengariLib.lauxlib,
  lualib: fengariLib.lualib,
  interop,
  to_luastring: fengariLib.to_luastring,
  to_jsstring: fengariLib.to_jsstring,
};

function makeShip(id = 0) {
  return { id, x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 20, thrust: 0.15, turnSpeed: 0.05, friction: 0.995, color: '#f00', fireCooldown: 0.25, fireCooldownTimer: 0, destroyed: false, respawnTimer: 0 };
}

function makeCanvas() {
  return { width: 800, height: 600 };
}

describe('createLuaContext', () => {
  let ships, projectiles, explosions, canvas, output, luaCtx;

  beforeEach(() => {
    ships = [makeShip(0), makeShip(1)];
    ships[1].color = '#00f';
    projectiles = [];
    explosions = [];
    canvas = makeCanvas();
    output = vi.fn();
    luaCtx = createLuaContext(fengari, ships, projectiles, explosions, canvas, output);
  });

  it('initializes successfully', () => {
    expect(luaCtx.isReady).toBe(true);
  });

  it('returns a not-ready context when fengari is null', () => {
    const ctx = createLuaContext(null, ships, projectiles, explosions, canvas, output);
    expect(ctx.isReady).toBe(false);
  });

  describe('runLua', () => {
    it('executes a simple script', () => {
      luaCtx.runLua('x = 1 + 1');
      expect(output).toHaveBeenCalledWith('Script executed.');
    });

    it('reports syntax errors', () => {
      luaCtx.runLua('if if if');
      expect(output).toHaveBeenCalledWith(expect.stringContaining('Error:'), true);
    });

    it('detects onUpdate definition', () => {
      expect(luaCtx.hasOnUpdate).toBe(false);
      luaCtx.runLua('function onUpdate(dt) end');
      expect(luaCtx.hasOnUpdate).toBe(true);
    });

    it('clears onUpdate on new script without it', () => {
      luaCtx.runLua('function onUpdate(dt) end');
      expect(luaCtx.hasOnUpdate).toBe(true);
      luaCtx.runLua('x = 1');
      expect(luaCtx.hasOnUpdate).toBe(false);
    });
  });

  describe('runLuaREPL', () => {
    it('echoes the input line', () => {
      luaCtx.runLuaREPL('1 + 2');
      expect(output).toHaveBeenCalledWith('> 1 + 2');
    });

    it('auto-prints expression results', () => {
      luaCtx.runLuaREPL('1 + 2');
      expect(output).toHaveBeenCalledWith('3');
    });

    it('executes statements', () => {
      luaCtx.runLuaREPL('x = 42');
      luaCtx.runLuaREPL('x');
      expect(output).toHaveBeenCalledWith('42');
    });

    it('reports errors', () => {
      luaCtx.runLuaREPL('invalid(((');
      expect(output).toHaveBeenCalledWith(expect.stringContaining('Error:'), true);
    });
  });

  describe('print', () => {
    it('routes print() output to appendOutput', () => {
      luaCtx.runLua('print("hello")');
      expect(output).toHaveBeenCalledWith('hello');
    });

    it('handles multiple print arguments', () => {
      luaCtx.runLua('print("a", "b", "c")');
      expect(output).toHaveBeenCalledWith('a\tb\tc');
    });
  });

  describe('callLuaUpdate', () => {
    it('calls onUpdate with dt', () => {
      luaCtx.runLua('function onUpdate(dt) print(dt) end');
      luaCtx.callLuaUpdate(0.016);
      expect(output).toHaveBeenCalledWith('0.016');
    });

    it('does nothing without onUpdate', () => {
      output.mockClear();
      luaCtx.callLuaUpdate(0.016);
      expect(output).not.toHaveBeenCalled();
    });

    it('disables onUpdate after an error', () => {
      luaCtx.runLua('function onUpdate(dt) error("boom") end');
      luaCtx.callLuaUpdate(0.016);
      expect(output).toHaveBeenCalledWith(expect.stringContaining('boom'), true);
      expect(luaCtx.hasOnUpdate).toBe(false);
    });
  });

  describe('ship globals', () => {
    it('exposes ship as alias for ship1 (player 1)', () => {
      luaCtx.runLuaREPL('ship.color');
      expect(output).toHaveBeenCalledWith(ships[0].color);
    });

    it('exposes ship1 as player 1', () => {
      luaCtx.runLuaREPL('ship1.color');
      expect(output).toHaveBeenCalledWith(ships[0].color);
    });

    it('exposes ship2 as player 2', () => {
      luaCtx.runLuaREPL('ship2.color');
      expect(output).toHaveBeenCalledWith(ships[1].color);
    });

    it('can modify ship2 properties', () => {
      luaCtx.runLua('ship2.color = "#0f0"');
      expect(ships[1].color).toBe('#0f0');
    });

    it('reports world dimensions for screen size', () => {
      luaCtx.runLuaREPL('screen.width');
      expect(output).toHaveBeenCalledWith('1920');
    });
  });

  describe('shoot', () => {
    it('adds a projectile via shoot() in Lua', () => {
      luaCtx.runLua('shoot()');
      expect(projectiles).toHaveLength(1);
    });

    it('respects fire cooldown', () => {
      luaCtx.runLua('shoot(); shoot()');
      expect(projectiles).toHaveLength(1);
    });

    it('does not fire when ship is destroyed', () => {
      ships[0].destroyed = true;
      luaCtx.runLua('shoot()');
      expect(projectiles).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('clears onUpdate and re-exposes ships', () => {
      luaCtx.runLua('function onUpdate(dt) end');
      expect(luaCtx.hasOnUpdate).toBe(true);
      luaCtx.reset();
      expect(luaCtx.hasOnUpdate).toBe(false);
    });

    it('clears projectiles', () => {
      luaCtx.runLua('shoot()');
      expect(projectiles).toHaveLength(1);
      luaCtx.reset();
      expect(projectiles).toHaveLength(0);
    });

    it('clears explosions', () => {
      explosions.push({ x: 0, y: 0 });
      luaCtx.reset();
      expect(explosions).toHaveLength(0);
    });
  });
});
