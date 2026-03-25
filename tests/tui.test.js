import { describe, it, expect } from 'vitest';
import { colorize, InputHistory } from '../server/tui.js';

describe('colorize', () => {
  it('wraps join events in green', () => {
    expect(colorize('join', '[join] Alice')).toBe('{green-fg}[join] Alice{/green-fg}');
  });

  it('wraps kill events in red', () => {
    expect(colorize('kill', '[kill] A killed B')).toBe('{red-fg}[kill] A killed B{/red-fg}');
  });

  it('wraps lua events in cyan', () => {
    expect(colorize('lua', '[lua] output')).toBe('{cyan-fg}[lua] output{/cyan-fg}');
  });

  it('wraps chat events in base00 (ANSI 11)', () => {
    expect(colorize('chat', '[chat] hi')).toBe('{11-fg}[chat] hi{/11-fg}');
  });

  it('wraps ws-error in bold red', () => {
    expect(colorize('ws-error', '[ws] error')).toBe('{red-fg}{bold}[ws] error{/bold}{/red-fg}');
  });

  it('uses terminal default for info events', () => {
    expect(colorize('info', 'Server listening')).toBe('Server listening');
  });

  it('defaults to white for unknown events', () => {
    expect(colorize('unknown', 'text')).toBe('{white-fg}text{/white-fg}');
  });

  it('escapes curly braces to prevent tag injection', () => {
    expect(colorize('lua', '{1, 2}')).toBe('{cyan-fg}{open}1, 2}{/cyan-fg}');
  });
});

describe('InputHistory', () => {
  it('starts empty', () => {
    const h = new InputHistory();
    expect(h.up()).toBe('');
  });

  it('recalls added entries with up()', () => {
    const h = new InputHistory();
    h.add('cmd1');
    h.add('cmd2');
    expect(h.up()).toBe('cmd2');
    expect(h.up()).toBe('cmd1');
  });

  it('navigates forward with down()', () => {
    const h = new InputHistory();
    h.add('cmd1');
    h.add('cmd2');
    h.up(); // cmd2
    h.up(); // cmd1
    expect(h.down()).toBe('cmd2');
  });

  it('returns empty string past the end', () => {
    const h = new InputHistory();
    h.add('cmd1');
    h.up(); // cmd1
    h.down(); // past end
    expect(h.down()).toBe('');
  });

  it('deduplicates consecutive entries', () => {
    const h = new InputHistory();
    h.add('same');
    h.add('same');
    h.add('same');
    expect(h.entries).toHaveLength(1);
  });

  it('resets index to end', () => {
    const h = new InputHistory();
    h.add('cmd1');
    h.up(); // cmd1
    h.reset();
    expect(h.up()).toBe('cmd1');
  });

  it('respects maxSize', () => {
    const h = new InputHistory(3);
    h.add('a');
    h.add('b');
    h.add('c');
    h.add('d');
    expect(h.entries).toEqual(['b', 'c', 'd']);
  });
});
