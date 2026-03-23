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

function makeShip() {
  return { x: 400, y: 300, angle: 0, vx: 0, vy: 0, radius: 15, thrust: 0.15, turnSpeed: 0.05, friction: 0.995, color: '#0ff' };
}

function makeCanvas() {
  return { width: 800, height: 600 };
}

describe('createLuaContext', () => {
  let ship, canvas, output, luaCtx;

  beforeEach(() => {
    ship = makeShip();
    canvas = makeCanvas();
    output = vi.fn();
    luaCtx = createLuaContext(fengari, ship, canvas, output);
  });

  it('initializes successfully', () => {
    expect(luaCtx.isReady).toBe(true);
  });

  it('returns a not-ready context when fengari is null', () => {
    const ctx = createLuaContext(null, ship, canvas, output);
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

  describe('reset', () => {
    it('clears onUpdate and re-exposes ship', () => {
      luaCtx.runLua('function onUpdate(dt) end');
      expect(luaCtx.hasOnUpdate).toBe(true);
      luaCtx.reset(ship);
      expect(luaCtx.hasOnUpdate).toBe(false);
    });
  });
});
