import { describe, it, expect, beforeEach } from 'vitest';
import { loadScript, saveScript, clearAll } from '../src/storage.js';

beforeEach(() => {
  localStorage.clear();
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
  it('removes all spacewar keys from localStorage', () => {
    saveScript('some script');
    clearAll();
    expect(loadScript()).toBeNull();
  });
});
