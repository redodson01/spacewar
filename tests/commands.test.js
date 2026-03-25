import { describe, it, expect, vi } from 'vitest';
import { registerCommand, runCommand, getCommands } from '../src/commands.js';

function makeCtx(overrides = {}) {
  return {
    chat: { addMessage: vi.fn() },
    luaCtx: { runLuaREPL: vi.fn() },
    net: { sendNameChange: vi.fn() },
    networkMode: false,
    isHost: true,
    localShip: { id: 0, name: 'Player 1', config: { color: '#dc322f' } },
    appendOutput: vi.fn(),
    saveName: vi.fn(),
    toggleLatency: vi.fn(() => true),
    ...overrides,
  };
}

describe('command registry', () => {
  it('returns false for unknown commands', () => {
    const ctx = makeCtx();
    expect(runCommand('nonexistent', '', ctx)).toBe(false);
  });

  it('returns true for known commands', () => {
    const ctx = makeCtx();
    expect(runCommand('help', '', ctx)).toBe(true);
  });

  it('lists registered commands', () => {
    const names = getCommands();
    expect(names).toContain('help');
    expect(names).toContain('name');
    expect(names).toContain('ai');
    expect(names).toContain('removeai');
    expect(names).toContain('speed');
    expect(names).toContain('latency');
  });
});

describe('built-in commands', () => {
  it('/help adds messages to chat', () => {
    const ctx = makeCtx();
    runCommand('help', '', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalled();
  });

  it('/name sets the player name', () => {
    const ctx = makeCtx();
    runCommand('name', 'Alice', ctx);
    expect(ctx.localShip.name).toBe('Alice');
    expect(ctx.saveName).toHaveBeenCalledWith('Alice');
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Name set to "Alice".');
  });

  it('/name shows usage when no name given', () => {
    const ctx = makeCtx();
    runCommand('name', '', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /name <new name>');
  });

  it('/name sends nameChange in network mode', () => {
    const ctx = makeCtx({ networkMode: true });
    runCommand('name', 'Bob', ctx);
    expect(ctx.net.sendNameChange).toHaveBeenCalledWith(0, 'Bob');
  });

  it('/ai executes addAI() via Lua', () => {
    const ctx = makeCtx();
    runCommand('ai', '', ctx);
    expect(ctx.luaCtx.runLuaREPL).toHaveBeenCalledWith('addAI()');
  });

  it('/removeai executes removeAI with argument', () => {
    const ctx = makeCtx();
    runCommand('removeai', '3', ctx);
    expect(ctx.luaCtx.runLuaREPL).toHaveBeenCalledWith('removeAI(3)');
  });

  it('/speed executes speed() via Lua', () => {
    const ctx = makeCtx();
    runCommand('speed', '2', ctx);
    expect(ctx.luaCtx.runLuaREPL).toHaveBeenCalledWith('speed(2)');
  });

  it('/latency toggles latency display', () => {
    const ctx = makeCtx();
    runCommand('latency', '', ctx);
    expect(ctx.toggleLatency).toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Latency display on.');
  });

  it('host-only commands are blocked for non-hosts', () => {
    const ctx = makeCtx({ networkMode: true, isHost: false });
    runCommand('ai', '', ctx);
    expect(ctx.luaCtx.runLuaREPL).not.toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', '/ai is host-only.');
  });

  it('host-only commands work for host in network mode', () => {
    const ctx = makeCtx({ networkMode: true, isHost: true });
    runCommand('ai', '', ctx);
    expect(ctx.luaCtx.runLuaREPL).toHaveBeenCalledWith('addAI()');
  });
});

describe('custom commands', () => {
  it('can register and run custom commands', () => {
    const handler = vi.fn();
    registerCommand('test-custom', { handler });
    const ctx = makeCtx();
    expect(runCommand('test-custom', 'arg1', ctx)).toBe(true);
    expect(handler).toHaveBeenCalledWith('arg1', ctx);
  });
});
