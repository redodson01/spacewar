import { describe, it, expect, vi } from 'vitest';
import { registerCommand, runCommand, getCommands } from '../src/commands.js';

function makeCtx(overrides = {}) {
  return {
    chat: { addMessage: vi.fn() },
    net: { sendNameChange: vi.fn(), sendColorChange: vi.fn() },
    networkMode: false,
    isHost: true,
    localShip: { id: 0, name: 'Player 1', config: { color: '#dc322f' } },
    leaderboard: { updateName: vi.fn(), updateColor: vi.fn() },
    saveName: vi.fn(),
    addAI: vi.fn(() => 1),
    removeAI: vi.fn(() => true),
    getGameSpeed: vi.fn(() => 1.0),
    setGameSpeed: vi.fn((v) => v),
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
    expect(names).toContain('color');
    expect(names).toContain('ai');
    expect(names).toContain('removeai');
    expect(names).toContain('speed');
  });
});

describe('built-in commands', () => {
  it('/help adds messages to chat', () => {
    const ctx = makeCtx();
    runCommand('help', '', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalled();
  });

  it('/help mentions all four input surfaces', () => {
    const ctx = makeCtx();
    runCommand('help', '', ctx);
    const allText = ctx.chat.addMessage.mock.calls.map(c => c[2]).join(' ');
    expect(allText).toContain('/');
    expect(allText).toContain(':');
    expect(allText).toContain('`');
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

  it('/color sets the ship color', () => {
    const ctx = makeCtx();
    runCommand('color', '#ff0', ctx);
    expect(ctx.localShip.config.color).toBe('#ff0');
    expect(ctx.leaderboard.updateColor).toHaveBeenCalledWith(0, '#ff0');
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#ff0', 'Color set to "#ff0".');
  });

  it('/color accepts 6-digit hex', () => {
    const ctx = makeCtx();
    runCommand('color', '#ff00ff', ctx);
    expect(ctx.localShip.config.color).toBe('#ff00ff');
  });

  it('/color shows usage for invalid hex', () => {
    const ctx = makeCtx();
    runCommand('color', 'red', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /color <hex color> (e.g. /color #ff0)');
    expect(ctx.localShip.config.color).toBe('#dc322f'); // unchanged
  });

  it('/color shows usage when no argument given', () => {
    const ctx = makeCtx();
    runCommand('color', '', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /color <hex color> (e.g. /color #ff0)');
  });

  it('/color sends colorChange in network mode', () => {
    const ctx = makeCtx({ networkMode: true });
    runCommand('color', '#0ff', ctx);
    expect(ctx.net.sendColorChange).toHaveBeenCalledWith('#0ff');
  });

  it('/ai calls addAI and shows feedback', () => {
    const ctx = makeCtx();
    runCommand('ai', '', ctx);
    expect(ctx.addAI).toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Bot 2 added.');
  });

  it('/ai shows error when no free slots', () => {
    const ctx = makeCtx({ addAI: vi.fn(() => -1) });
    runCommand('ai', '', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'No free slots.');
  });

  it('/removeai calls removeAI and shows feedback', () => {
    const ctx = makeCtx();
    runCommand('removeai', '3', ctx);
    expect(ctx.removeAI).toHaveBeenCalledWith(3);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Bot 3 removed.');
  });

  it('/removeai shows error for non-AI player', () => {
    const ctx = makeCtx({ removeAI: vi.fn(() => false) });
    runCommand('removeai', '3', ctx);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Player 3 is not an AI.');
  });

  it('/removeai shows usage when no argument given', () => {
    const ctx = makeCtx();
    runCommand('removeai', '', ctx);
    expect(ctx.removeAI).not.toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /removeai <ship number>');
  });

  it('/removeai rejects non-numeric argument', () => {
    const ctx = makeCtx();
    runCommand('removeai', 'abc', ctx);
    expect(ctx.removeAI).not.toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /removeai <ship number>');
  });

  it('/speed shows current speed when no argument given', () => {
    const ctx = makeCtx({ getGameSpeed: vi.fn(() => 2.0) });
    runCommand('speed', '', ctx);
    expect(ctx.getGameSpeed).toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Game speed: 2x');
  });

  it('/speed sets game speed and shows feedback', () => {
    const ctx = makeCtx();
    runCommand('speed', '2', ctx);
    expect(ctx.setGameSpeed).toHaveBeenCalledWith(2);
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#2aa198', 'Game speed set to 2x.');
  });

  it('/speed rejects non-numeric argument', () => {
    const ctx = makeCtx();
    runCommand('speed', 'foo', ctx);
    expect(ctx.setGameSpeed).not.toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', 'Usage: /speed [multiplier]');
  });

  it('host-only commands are blocked for non-hosts', () => {
    const ctx = makeCtx({ networkMode: true, isHost: false });
    runCommand('ai', '', ctx);
    expect(ctx.addAI).not.toHaveBeenCalled();
    expect(ctx.chat.addMessage).toHaveBeenCalledWith('', '#dc322f', '/ai is host-only.');
  });

  it('host-only commands work for host in network mode', () => {
    const ctx = makeCtx({ networkMode: true, isHost: true });
    runCommand('ai', '', ctx);
    expect(ctx.addAI).toHaveBeenCalled();
  });

  it('/color is available to non-hosts', () => {
    const ctx = makeCtx({ networkMode: true, isHost: false });
    runCommand('color', '#ff0', ctx);
    expect(ctx.localShip.config.color).toBe('#ff0');
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
