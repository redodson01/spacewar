import { describe, it, expect, vi } from 'vitest';
import { createLogger, formatLine } from '../server/logger.js';

describe('formatLine', () => {
  it('formats join events', () => {
    expect(formatLine('join', { name: 'Alice', id: 0 })).toBe('[join] Alice (Player 1)');
  });

  it('formats leave events', () => {
    expect(formatLine('leave', { name: 'Bob' })).toBe('[leave] Bob');
  });

  it('formats kill events', () => {
    expect(formatLine('kill', { killer: 'Alice', victim: 'Bob' })).toBe('[kill] Alice killed Bob');
  });

  it('formats collision events', () => {
    expect(formatLine('collision', { name: 'Charlie' })).toBe('[collision] Charlie destroyed');
  });

  it('formats chat events with name', () => {
    expect(formatLine('chat', { name: 'Dave', text: 'hello' })).toBe('[chat] Dave: hello');
  });

  it('formats chat events without name', () => {
    expect(formatLine('chat', { name: '', text: 'system msg' })).toBe('[chat] system msg');
  });

  it('formats lua events', () => {
    expect(formatLine('lua', { text: 'Ship is yellow!' })).toBe('[lua] Ship is yellow!');
  });

  it('formats info events as raw text', () => {
    expect(formatLine('info', { text: 'Server listening' })).toBe('Server listening');
  });

  it('formats unknown events with JSON', () => {
    expect(formatLine('unknown', { foo: 1 })).toBe('[unknown] {"foo":1}');
  });
});

describe('createLogger', () => {
  it('logs to console when no sink', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger();
    logger.log('join', { name: 'Test', id: 0 });
    expect(spy).toHaveBeenCalledWith('[join] Test (Player 1)');
    spy.mockRestore();
  });

  it('routes to sink when provided', () => {
    const sink = { log: vi.fn(), error: vi.fn() };
    const logger = createLogger(sink);
    logger.log('kill', { killer: 'A', victim: 'B' });
    expect(sink.log).toHaveBeenCalledWith('kill', '[kill] A killed B', { killer: 'A', victim: 'B' });
  });

  it('routes errors to sink.error', () => {
    const sink = { log: vi.fn(), error: vi.fn() };
    const logger = createLogger(sink);
    logger.error('ws-error', { error: 'test error' });
    expect(sink.error).toHaveBeenCalledWith('ws-error', expect.stringContaining('test error'), { error: 'test error' });
  });
});
