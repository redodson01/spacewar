import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import http from 'http';
import WebSocket from 'ws';

const PORT = 18923 + Math.floor(Math.random() * 1000);
const ROOT = join(import.meta.dirname, '..');
let serverProcess;

function connectWS(name) {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${PORT}` + (name ? `?name=${encodeURIComponent(name)}` : '');
    const ws = new WebSocket(url);
    // Buffer all messages from connection start so waitForMessage never misses early messages
    ws._buffer = [];
    ws.on('message', (raw) => ws._buffer.push(JSON.parse(raw.toString())));
    const timeout = setTimeout(() => { ws.close(); reject(new Error('connect timeout')); }, 3000);
    ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

function waitForMessage(ws, type, timeout = 2000) {
  // Check buffer first for messages that arrived before this call
  const buffered = ws._buffer.find(m => m.type === type);
  if (buffered) return Promise.resolve(buffered);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
    const origLen = ws._buffer.length;
    const poll = setInterval(() => {
      const msg = ws._buffer.slice(origLen).find(m => m.type === type);
      if (msg) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve(msg);
      }
    }, 10);
  });
}

function collectMessages(ws) {
  // Return the live buffer — messages are already being collected
  return ws._buffer;
}

beforeAll(async () => {
  serverProcess = spawn('node', [join(ROOT, 'server/index.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Wait for server to start listening
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server start timeout')), 5000);
    serverProcess.stdout.on('data', () => { clearTimeout(timeout); resolve(); });
    serverProcess.stderr.on('data', () => { clearTimeout(timeout); resolve(); });
    // Also try connecting in a poll as fallback (non-TTY mode may not print to stdout immediately)
    const poll = setInterval(async () => {
      try {
        const ws = await connectWS();
        ws.close();
        clearInterval(poll);
        clearTimeout(timeout);
        resolve();
      } catch { /* retry */ }
    }, 200);
  });
}, 10000);

afterAll(() => {
  if (serverProcess) serverProcess.kill();
});

describe('HTTP server', () => {
  it('serves index.html at /', async () => {
    const res = await fetch(`http://localhost:${PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    const text = await res.text();
    expect(text).toContain('<html');
  });

  it('returns 404 for missing files', async () => {
    const res = await fetch(`http://localhost:${PORT}/nonexistent.xyz`);
    expect(res.status).toBe(404);
  });

  it('blocks path traversal', async () => {
    // Use raw http.get to avoid URL normalization that fetch performs
    const status = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: 'localhost', port: PORT, path: '/../../../etc/passwd' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
    });
    expect([403, 404]).toContain(status);
  });
});

describe('WebSocket server', () => {
  it('sends welcome message on connect with assigned id', async () => {
    const ws = await connectWS('TestPlayer');
    const welcome = await waitForMessage(ws, 'welcome');
    expect(welcome.id).toBeTypeOf('number');
    expect(welcome.name).toBe('TestPlayer');
    expect(welcome.worldWidth).toBeTypeOf('number');
    expect(welcome.worldHeight).toBeTypeOf('number');
    expect(welcome.players).toBeInstanceOf(Array);
    expect(welcome.scores).toBeInstanceOf(Array);
    ws.close();
  });

  it('uses default name when none provided', async () => {
    const ws = await connectWS();
    const welcome = await waitForMessage(ws, 'welcome');
    expect(welcome.name).toMatch(/^Player \d+$/);
    ws.close();
  });

  it('truncates names to 30 characters', async () => {
    const longName = 'A'.repeat(50);
    const ws = await connectWS(longName);
    const welcome = await waitForMessage(ws, 'welcome');
    expect(welcome.name.length).toBeLessThanOrEqual(30);
    ws.close();
  });

  it('notifies other clients on join/leave', async () => {
    const ws1 = await connectWS('First');
    await waitForMessage(ws1, 'welcome');
    const msgs1 = collectMessages(ws1);

    const ws2 = await connectWS('Second');
    await waitForMessage(ws2, 'welcome');

    // ws1 should get a join message for ws2
    await new Promise(r => setTimeout(r, 100));
    const joinMsg = msgs1.find(m => m.type === 'join' && m.name === 'Second');
    expect(joinMsg).toBeTruthy();

    // Now close ws2 and check for leave
    ws2.close();
    await new Promise(r => setTimeout(r, 200));
    const leaveMsg = msgs1.find(m => m.type === 'leave');
    expect(leaveMsg).toBeTruthy();

    ws1.close();
  });

  it('relays state messages between clients', async () => {
    const ws1 = await connectWS('P1');
    const w1 = await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('P2');
    await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    const msgs2 = collectMessages(ws2);

    ws1.send(JSON.stringify({ type: 'state', id: w1.id, x: 100, y: 200, angle: 1.5, vx: 10, vy: 20, thrusting: true, destroyed: false }));
    await new Promise(r => setTimeout(r, 100));

    const stateMsg = msgs2.find(m => m.type === 'state' && m.id === w1.id);
    expect(stateMsg).toBeTruthy();
    expect(stateMsg.x).toBe(100);

    ws1.close();
    ws2.close();
  });

  it('drops messages with spoofed ship IDs', async () => {
    const ws1 = await connectWS('P1');
    await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('P2');
    const w2 = await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    const msgs2 = collectMessages(ws2);

    // ws1 sends a state message claiming to be ws2's ID — should be dropped
    ws1.send(JSON.stringify({ type: 'state', id: w2.id, x: 999, y: 999, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false }));
    await new Promise(r => setTimeout(r, 200));

    const spoofed = msgs2.find(m => m.type === 'state' && m.id === w2.id);
    expect(spoofed).toBeUndefined();

    ws1.close();
    ws2.close();
  });

  it('enforces chat message length limit', async () => {
    const ws1 = await connectWS('P1');
    await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('P2');
    await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    const msgs2 = collectMessages(ws2);

    // Send a chat message over 200 chars — should be dropped
    ws1.send(JSON.stringify({ type: 'chat', name: 'P1', color: '#f00', text: 'x'.repeat(201) }));
    await new Promise(r => setTimeout(r, 200));

    const chatMsg = msgs2.find(m => m.type === 'chat');
    expect(chatMsg).toBeUndefined();

    ws1.close();
    ws2.close();
  });

  it('sends ping messages for latency measurement', async () => {
    const ws = await connectWS('PingTest');
    await waitForMessage(ws, 'welcome');

    // Server pings every 2s; wait for one
    const ping = await waitForMessage(ws, 'ping', 3000);
    expect(ping.t).toBeTypeOf('number');

    ws.close();
  });

  it('tracks scores on death events', async () => {
    const ws1 = await connectWS('Killer');
    const w1 = await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('Victim');
    const w2 = await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    const msgs1 = collectMessages(ws1);

    // ws2 reports its own death, killed by ws1
    ws2.send(JSON.stringify({ type: 'death', id: w2.id, x: 100, y: 100, killerId: w1.id, cause: 'projectile' }));
    await new Promise(r => setTimeout(r, 200));

    const scoresMsg = msgs1.find(m => m.type === 'scores');
    expect(scoresMsg).toBeTruthy();
    const killerScore = scoresMsg.scores.find(s => s.id === w1.id);
    expect(killerScore.score).toBe(1);

    ws1.close();
    ws2.close();
  });

  it('rate-limits clients that send too many messages', async () => {
    const ws1 = await connectWS('Flooder');
    const w1 = await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('Observer');
    await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    const msgs2 = collectMessages(ws2);

    // Send 150 messages rapidly (limit is 120/sec)
    for (let i = 0; i < 150; i++) {
      ws1.send(JSON.stringify({ type: 'state', id: w1.id, x: i, y: 0, angle: 0, vx: 0, vy: 0, thrusting: false, destroyed: false }));
    }
    await new Promise(r => setTimeout(r, 300));

    // Observer should receive fewer than 150 state messages (some were dropped)
    const stateMessages = msgs2.filter(m => m.type === 'state' && m.id === w1.id);
    expect(stateMessages.length).toBeLessThan(150);
    expect(stateMessages.length).toBeGreaterThan(0);

    ws1.close();
    ws2.close();
  });

  it('rejects gameSpeed messages from non-host clients', async () => {
    const ws1 = await connectWS('Host');
    await waitForMessage(ws1, 'welcome');
    const ws2 = await connectWS('NonHost');
    const w2 = await waitForMessage(ws2, 'welcome');
    await new Promise(r => setTimeout(r, 50));

    // Ensure ws2 is not the host (id !== 0)
    expect(w2.id).not.toBe(0);

    const msgs1 = collectMessages(ws1);

    // Non-host sends a gameSpeed message — should be dropped
    ws2.send(JSON.stringify({ type: 'gameSpeed', speed: 5.0 }));
    await new Promise(r => setTimeout(r, 200));

    const speedMsg = msgs1.find(m => m.type === 'gameSpeed');
    expect(speedMsg).toBeUndefined();

    ws1.close();
    ws2.close();
  });
});
