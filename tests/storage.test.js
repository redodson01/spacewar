import { describe, it, expect, beforeEach } from 'vitest';
import { loadScript, saveScript, clearAll, loadHistory, saveHistory, loadChatHistory, saveChatHistory } from '../src/storage.js';

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

describe('per-mode history', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadHistory('chat')).toEqual([]);
    expect(loadHistory('command')).toEqual([]);
    expect(loadHistory('lua')).toEqual([]);
  });

  it('persists and loads history per mode independently', () => {
    saveHistory('chat', ['hello', 'world']);
    saveHistory('command', ['help']);
    saveHistory('lua', ['ship.color = "#ff0"']);
    expect(loadHistory('chat')).toEqual(['hello', 'world']);
    expect(loadHistory('command')).toEqual(['help']);
    expect(loadHistory('lua')).toEqual(['ship.color = "#ff0"']);
  });

  it('caps history at 200 entries', () => {
    const big = Array.from({ length: 250 }, (_, i) => `msg${i}`);
    saveHistory('chat', big);
    const loaded = loadHistory('chat');
    expect(loaded).toHaveLength(200);
    expect(loaded[0]).toBe('msg50');
  });

  it('migrates legacy chat-history on first load', () => {
    localStorage.setItem('spacewar:chat-history', JSON.stringify(['old1', 'old2']));
    expect(loadHistory('chat')).toEqual(['old1', 'old2']);
    // Legacy key should be removed after migration
    expect(localStorage.getItem('spacewar:chat-history')).toBeNull();
    // New key should exist
    expect(localStorage.getItem('spacewar:history:chat')).not.toBeNull();
  });

  it('does not migrate if new key already exists', () => {
    localStorage.setItem('spacewar:chat-history', JSON.stringify(['old']));
    localStorage.setItem('spacewar:history:chat', JSON.stringify(['new']));
    expect(loadHistory('chat')).toEqual(['new']);
    // Legacy key untouched
    expect(localStorage.getItem('spacewar:chat-history')).not.toBeNull();
  });

  it('deprecated loadChatHistory/saveChatHistory still work', () => {
    saveChatHistory(['a', 'b']);
    expect(loadChatHistory()).toEqual(['a', 'b']);
    expect(loadHistory('chat')).toEqual(['a', 'b']);
  });
});
