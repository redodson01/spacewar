import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createNetClient } from '../src/net.js';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    MockWebSocket.instances.push(this);
  }

  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }

  // Test helpers
  _simulateOpen() { if (this.onopen) this.onopen(); }
  _simulateMessage(msg) { if (this.onmessage) this.onmessage({ data: JSON.stringify(msg) }); }
  _simulateError() { if (this.onerror) this.onerror(new Error('fail')); }
  _simulateClose(code, reason) { this.readyState = 3; if (this.onclose) this.onclose({ code: code || 1000, reason }); }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  // Provide window.location for connect URL building
  if (!window.location.protocol || window.location.protocol === 'about:') {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'ws:', host: 'localhost:8080' },
      writable: true,
      configurable: true,
    });
  }
});

function getLastWS() {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe('createNetClient', () => {
  describe('connect', () => {
    it('resolves with welcome data on successful connect', async () => {
      const client = createNetClient();
      const promise = client.connect('Alice');

      const ws = getLastWS();
      ws._simulateOpen();
      ws._simulateMessage({
        type: 'welcome', id: 0, name: 'Alice',
        players: [], scores: [],
        worldWidth: 1920, worldHeight: 1080, luaConfig: null,
      });

      const result = await promise;
      expect(result.id).toBe(0);
      expect(result.name).toBe('Alice');
      expect(result.worldWidth).toBe(1920);
      expect(client.localId).toBe(0);
      expect(client.isConnected).toBe(true);
    });

    it('resolves null on connection error', async () => {
      const client = createNetClient();
      const promise = client.connect('Bob');

      const ws = getLastWS();
      ws._simulateError();

      const result = await promise;
      expect(result).toBeNull();
    });

    it('resolves with error object when server is full (code 4000)', async () => {
      const client = createNetClient();
      const promise = client.connect('Full');

      const ws = getLastWS();
      ws._simulateClose(4000, 'Game is full');

      const result = await promise;
      expect(result.error).toBe('Game is full');
    });

    it('includes name in WebSocket URL', async () => {
      const client = createNetClient();
      client.connect('Test Player');

      const ws = getLastWS();
      expect(ws.url).toContain('name=Test%20Player');
    });

    it('resolves null on timeout', async () => {
      vi.useFakeTimers();
      const client = createNetClient();
      const promise = client.connect('Slow');

      vi.advanceTimersByTime(2001);

      const result = await promise;
      expect(result).toBeNull();
      vi.useRealTimers();
    });
  });

  describe('send methods', () => {
    let client, ws;

    beforeEach(async () => {
      client = createNetClient();
      const promise = client.connect('Sender');
      ws = getLastWS();
      ws._simulateOpen();
      ws._simulateMessage({
        type: 'welcome', id: 2, name: 'Sender',
        players: [], scores: [],
        worldWidth: 1920, worldHeight: 1080, luaConfig: null,
      });
      await promise;
    });

    it('sendState sends throttled state messages', () => {
      const ship = {
        id: 2,
        state: { x: 10, y: 20, angle: 0.5, vx: 1, vy: 2, thrusting: true, destroyed: false },
      };
      client.sendState(ship, 0); // interval=0 to bypass throttle
      const msg = ws.sent.find(m => m.type === 'state');
      expect(msg).toBeTruthy();
      expect(msg.id).toBe(2);
      expect(msg.x).toBe(10);
    });

    it('sendFire sends fire message with ship state', () => {
      const ship = { id: 2, state: { x: 50, y: 60, angle: 1.0, vx: 5, vy: 6 } };
      client.sendFire(ship);
      const msg = ws.sent.find(m => m.type === 'fire');
      expect(msg.id).toBe(2);
      expect(msg.x).toBe(50);
      expect(msg.angle).toBe(1.0);
    });

    it('sendDeath sends death message', () => {
      const ship = { id: 2, state: { x: 10, y: 20 } };
      client.sendDeath(ship, 3, 'projectile');
      const msg = ws.sent.find(m => m.type === 'death');
      expect(msg.killerId).toBe(3);
      expect(msg.cause).toBe('projectile');
    });

    it('sendChat sends chat message with optional kind', () => {
      client.sendChat('Alice', '#f00', 'hello', 'lua');
      const msg = ws.sent.find(m => m.type === 'chat');
      expect(msg.name).toBe('Alice');
      expect(msg.text).toBe('hello');
      expect(msg.kind).toBe('lua');
    });

    it('sendNameChange sends name change message', () => {
      client.sendNameChange(2, 'NewName');
      const msg = ws.sent.find(m => m.type === 'nameChange');
      expect(msg.playerId).toBe(2);
      expect(msg.newName).toBe('NewName');
    });

    it('sendLuaExec sends lua execution request', () => {
      client.sendLuaExec('print("hi")', 'repl');
      const msg = ws.sent.find(m => m.type === 'luaExec');
      expect(msg.code).toBe('print("hi")');
      expect(msg.mode).toBe('repl');
    });

    it('sendAIJoin sends AI join message', () => {
      client.sendAIJoin(5, 'Bot 6');
      const msg = ws.sent.find(m => m.type === 'aiJoin');
      expect(msg.aiId).toBe(5);
      expect(msg.name).toBe('Bot 6');
    });

    it('sendAILeave sends AI leave message', () => {
      client.sendAILeave(5);
      const msg = ws.sent.find(m => m.type === 'aiLeave');
      expect(msg.aiId).toBe(5);
    });

    it('sendColorChange sends color change message', () => {
      client.sendColorChange('#ff0');
      const msg = ws.sent.find(m => m.type === 'colorChange');
      expect(msg.color).toBe('#ff0');
    });

    it('sendSetGameSpeed sends speed change message', () => {
      client.sendSetGameSpeed(2.5);
      const msg = ws.sent.find(m => m.type === 'setGameSpeed');
      expect(msg.speed).toBe(2.5);
    });

    it('auto-injects localId when msg has no id', () => {
      client.sendChat('X', '#f00', 'test');
      const msg = ws.sent.find(m => m.type === 'chat');
      expect(msg.id).toBe(2);
    });

    it('does not send when disconnected', () => {
      ws.close();
      client.sendChat('X', '#f00', 'test');
      // Only messages before close should be in sent
      const chatAfter = ws.sent.filter(m => m.type === 'chat' && m.text === 'test');
      expect(chatAfter).toHaveLength(0);
    });
  });

  describe('callbacks', () => {
    let client, ws;

    beforeEach(async () => {
      client = createNetClient();
      const promise = client.connect('Listener');
      ws = getLastWS();
      ws._simulateOpen();
      ws._simulateMessage({
        type: 'welcome', id: 1, name: 'Listener',
        players: [], scores: [],
        worldWidth: 1920, worldHeight: 1080, luaConfig: null,
      });
      await promise;
    });

    it('dispatches join callback', () => {
      const cb = vi.fn();
      client.onJoin(cb);
      ws._simulateMessage({ type: 'join', id: 3, name: 'New' });
      expect(cb).toHaveBeenCalledWith(3, 'New');
    });

    it('dispatches leave callback', () => {
      const cb = vi.fn();
      client.onLeave(cb);
      ws._simulateMessage({ type: 'leave', id: 3 });
      expect(cb).toHaveBeenCalledWith(3);
    });

    it('dispatches state callback', () => {
      const cb = vi.fn();
      client.onState(cb);
      const state = { type: 'state', id: 3, x: 1, y: 2, angle: 0, vx: 0, vy: 0 };
      ws._simulateMessage(state);
      expect(cb).toHaveBeenCalledWith(3, expect.objectContaining({ x: 1 }));
    });

    it('dispatches fire callback', () => {
      const cb = vi.fn();
      client.onFire(cb);
      ws._simulateMessage({ type: 'fire', id: 3, x: 10, y: 20, angle: 1 });
      expect(cb).toHaveBeenCalledWith(3, expect.objectContaining({ x: 10 }));
    });

    it('dispatches death callback', () => {
      const cb = vi.fn();
      client.onDeath(cb);
      ws._simulateMessage({ type: 'death', id: 3, x: 10, y: 20, killerId: 1, cause: 'projectile' });
      expect(cb).toHaveBeenCalledWith(3, 10, 20, 1, 'projectile');
    });

    it('dispatches scores callback', () => {
      const cb = vi.fn();
      client.onScores(cb);
      ws._simulateMessage({ type: 'scores', scores: [{ id: 0, score: 5 }] });
      expect(cb).toHaveBeenCalledWith([{ id: 0, score: 5 }]);
    });

    it('dispatches chat callback', () => {
      const cb = vi.fn();
      client.onChat(cb);
      ws._simulateMessage({ type: 'chat', name: 'A', color: '#f00', text: 'hi' });
      expect(cb).toHaveBeenCalledWith('A', '#f00', 'hi');
    });

    it('dispatches nameChange callback', () => {
      const cb = vi.fn();
      client.onNameChange(cb);
      ws._simulateMessage({ type: 'nameChange', playerId: 3, newName: 'Neo' });
      expect(cb).toHaveBeenCalledWith(3, 'Neo');
    });

    it('dispatches gameSpeed callback', () => {
      const cb = vi.fn();
      client.onGameSpeed(cb);
      ws._simulateMessage({ type: 'gameSpeed', speed: 2.0 });
      expect(cb).toHaveBeenCalledWith(2.0);
    });

    it('dispatches luaOutput callback', () => {
      const cb = vi.fn();
      client.onLuaOutput(cb);
      ws._simulateMessage({ type: 'luaOutput', text: '42', isError: false });
      expect(cb).toHaveBeenCalledWith('42', false);
    });

    it('dispatches latency callback', () => {
      const cb = vi.fn();
      client.onLatency(cb);
      ws._simulateMessage({ type: 'latency', id: 2, rtt: 50 });
      expect(cb).toHaveBeenCalledWith(2, 50);
    });

    it('responds to ping with pong', () => {
      ws._simulateMessage({ type: 'ping', t: 12345 });
      const pong = ws.sent.find(m => m.type === 'pong');
      expect(pong).toBeTruthy();
      expect(pong.t).toBe(12345);
    });

    it('does not throw when callback is not registered', () => {
      // All callbacks null — should not throw
      expect(() => {
        ws._simulateMessage({ type: 'join', id: 5, name: 'Ghost' });
        ws._simulateMessage({ type: 'leave', id: 5 });
        ws._simulateMessage({ type: 'scores', scores: [] });
      }).not.toThrow();
    });
  });
});
