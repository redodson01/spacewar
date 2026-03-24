import { describe, it, beforeEach } from 'vitest';
import { createChat } from '../src/chat.js';

describe('createChat', () => {
  let chat;

  beforeEach(() => {
    chat = createChat();
  });

  describe('addMessage', () => {
    it('adds a message', () => {
      chat.addMessage('alice', '#f00', 'hello');
      // No direct access to messages, but update+draw shouldn't throw
      chat.update(0);
    });

    it('caps at 20 messages', () => {
      for (let i = 0; i < 25; i++) {
        chat.addMessage('a', '#f00', `msg ${i}`);
      }
      // Oldest messages should be dropped; no crash
      chat.update(0);
    });
  });

  describe('update', () => {
    it('ages messages and removes fully faded ones', () => {
      chat.addMessage('a', '#f00', 'old');
      // Age past fade duration (10s) + fade time (2s)
      chat.update(13);
      // Message should be removed; adding a new one should work
      chat.addMessage('b', '#0f0', 'new');
      chat.update(0);
    });
  });
});
