import { describe, it, expect, beforeEach } from 'vitest';
import { loadReplHistory, saveReplHistory, loadScript, saveScript, clearAll } from '../src/storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('REPL history', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadReplHistory()).toEqual([]);
  });

  it('persists and loads history', () => {
    saveReplHistory(['ship.x', 'ship.color = "#f00"']);
    expect(loadReplHistory()).toEqual(['ship.x', 'ship.color = "#f00"']);
  });

  it('caps history at 200 entries on save', () => {
    const large = Array.from({ length: 300 }, (_, i) => `cmd${i}`);
    saveReplHistory(large);
    const loaded = loadReplHistory();
    expect(loaded).toHaveLength(200);
    expect(loaded[0]).toBe('cmd100');
    expect(loaded[199]).toBe('cmd299');
  });

  it('handles corrupted data gracefully', () => {
    localStorage.setItem('spacewar:repl-history', 'not-json');
    expect(loadReplHistory()).toEqual([]);
  });

  it('handles non-array JSON gracefully', () => {
    localStorage.setItem('spacewar:repl-history', '{"a":1}');
    expect(loadReplHistory()).toEqual([]);
  });
});

describe('script content', () => {
  it('returns null when nothing is stored', () => {
    expect(loadScript()).toBeNull();
  });

  it('persists and loads script content', () => {
    saveScript('ship.color = "#ff0"');
    expect(loadScript()).toBe('ship.color = "#ff0"');
  });

  it('handles empty string', () => {
    saveScript('');
    expect(loadScript()).toBe('');
  });
});

describe('clearAll', () => {
  it('removes both history and script from localStorage', () => {
    saveReplHistory(['cmd1', 'cmd2']);
    saveScript('some script');
    clearAll();
    expect(loadReplHistory()).toEqual([]);
    expect(loadScript()).toBeNull();
  });
});
