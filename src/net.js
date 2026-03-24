export function createNetClient() {
  let ws = null;
  let localId = null;
  let connected = false;
  let lastSendTime = 0;
  const SEND_INTERVAL = 50; // 20Hz

  const callbacks = {
    join: null,
    leave: null,
    state: null,
    fire: null,
    death: null,
    respawn: null,
    scores: null,
    luaUpdate: null,
    chat: null,
  };

  function connect(name) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}?name=${encodeURIComponent(name || '')}`;

    return new Promise((resolve) => {
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        if (!connected) {
          ws.close();
          resolve(null);
        }
      }, 2000);

      ws.onopen = () => {
        // Wait for welcome message before resolving
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'welcome':
            localId = msg.id;
            connected = true;
            clearTimeout(timeout);
            resolve({ id: msg.id, name: msg.name, players: msg.players, scores: msg.scores });
            break;
          case 'join':
            if (callbacks.join) callbacks.join(msg.id, msg.name);
            break;
          case 'leave':
            if (callbacks.leave) callbacks.leave(msg.id);
            break;
          case 'state':
            if (callbacks.state) callbacks.state(msg.id, msg);
            break;
          case 'fire':
            if (callbacks.fire) callbacks.fire(msg.id, msg);
            break;
          case 'death':
            if (callbacks.death) callbacks.death(msg.id, msg.x, msg.y, msg.killerId, msg.cause);
            break;
          case 'respawn':
            if (callbacks.respawn) callbacks.respawn(msg.id, msg.x, msg.y);
            break;
          case 'scores':
            if (callbacks.scores) callbacks.scores(msg.scores);
            break;
          case 'luaUpdate':
            if (callbacks.luaUpdate) callbacks.luaUpdate(msg.updates);
            break;
          case 'chat':
            if (callbacks.chat) callbacks.chat(msg.name, msg.color, msg.text);
            break;
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      ws.onclose = () => {
        connected = false;
        clearTimeout(timeout);
      };
    });
  }

  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    connected = false;
    localId = null;
  }

  function send(msg) {
    if (ws && connected) {
      msg.id = localId;
      ws.send(JSON.stringify(msg));
    }
  }

  function sendState(ship) {
    const now = performance.now();
    if (now - lastSendTime < SEND_INTERVAL) return;
    lastSendTime = now;
    const s = ship.state;
    send({
      type: 'state',
      x: s.x, y: s.y, angle: s.angle,
      vx: s.vx, vy: s.vy,
      thrusting: s.thrusting, destroyed: s.destroyed,
    });
  }

  function sendFire(ship) {
    const s = ship.state;
    send({
      type: 'fire',
      x: s.x, y: s.y, angle: s.angle,
      vx: s.vx, vy: s.vy,
    });
  }

  function sendDeath(ship, killerId = null, cause = 'projectile') {
    send({ type: 'death', x: ship.state.x, y: ship.state.y, killerId, cause });
  }

  function sendRespawn(ship) {
    send({ type: 'respawn', x: ship.state.x, y: ship.state.y });
  }

  function sendLuaUpdate(updates) {
    send({ type: 'luaUpdate', updates });
  }

  function sendChat(name, color, text) {
    send({ type: 'chat', name, color, text });
  }

  return {
    connect,
    disconnect,
    sendState,
    sendFire,
    sendDeath,
    sendRespawn,
    sendLuaUpdate,
    sendChat,
    get isConnected() { return connected; },
    get localId() { return localId; },
    onJoin(cb) { callbacks.join = cb; },
    onLeave(cb) { callbacks.leave = cb; },
    onScores(cb) { callbacks.scores = cb; },
    onLuaUpdate(cb) { callbacks.luaUpdate = cb; },
    onState(cb) { callbacks.state = cb; },
    onFire(cb) { callbacks.fire = cb; },
    onDeath(cb) { callbacks.death = cb; },
    onRespawn(cb) { callbacks.respawn = cb; },
    onChat(cb) { callbacks.chat = cb; },
  };
}

// Interpolation helper for remote ships
import { WORLD_WIDTH, WORLD_HEIGHT } from './world.js';

export function createInterpolator() {
  const states = new Map(); // id -> { prev, next, t }

  function onState(id, snapshot) {
    const entry = states.get(id);
    if (entry) {
      entry.prev = entry.next;
      entry.next = snapshot;
      entry.t = 0;
    } else {
      states.set(id, { prev: snapshot, next: snapshot, t: 1 });
    }
  }

  function apply(ship, dt) {
    const entry = states.get(ship.id);
    if (!entry) return;

    entry.t = Math.min(1, entry.t + dt / 0.05); // 0.05s = 20Hz window
    const { prev, next, t } = entry;
    const s = ship.state;

    s.x = lerpWrap(prev.x, next.x, t, WORLD_WIDTH);
    s.y = lerpWrap(prev.y, next.y, t, WORLD_HEIGHT);
    s.angle = lerpAngle(prev.angle, next.angle, t);
    s.vx = lerp(prev.vx, next.vx, t);
    s.vy = lerp(prev.vy, next.vy, t);
    s.thrusting = next.thrusting;
    s.destroyed = next.destroyed;
  }

  function remove(id) {
    states.delete(id);
  }

  return { onState, apply, remove };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpWrap(a, b, t, worldSize) {
  let diff = b - a;
  if (Math.abs(diff) > worldSize / 2) {
    return b;
  }
  return a + diff * t;
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
