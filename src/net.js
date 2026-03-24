export function createNetClient() {
  let ws = null;
  let localId = null;
  let connected = false;
  const lastSendTimes = new Map();
  const SEND_INTERVAL = 50; // 20Hz

  const callbacks = {
    join: null,
    leave: null,
    stateOverride: null,
    state: null,
    fire: null,
    death: null,
    respawn: null,
    scores: null,
    luaUpdate: null,
    chat: null,
    nameChange: null,
    gameSpeed: null,
  };

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

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
            resolve({ id: msg.id, name: msg.name, players: msg.players, scores: msg.scores, worldWidth: msg.worldWidth, worldHeight: msg.worldHeight, luaConfig: msg.luaConfig });
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
          case 'nameChange':
            if (callbacks.nameChange) callbacks.nameChange(msg.playerId, msg.newName);
            break;
          case 'stateOverride':
            if (callbacks.stateOverride) callbacks.stateOverride(msg.targetId, msg);
            break;
          case 'gameSpeed':
            if (callbacks.gameSpeed) callbacks.gameSpeed(msg.speed);
            break;
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      ws.onclose = (event) => {
        connected = false;
        clearTimeout(timeout);
        if (event.code === 4000) {
          resolve({ error: event.reason || 'Game is full' });
        }
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
      if (msg.id === undefined) msg.id = localId;
      ws.send(JSON.stringify(msg));
    }
  }

  function sendState(ship) {
    const now = performance.now();
    const lastTime = lastSendTimes.get(ship.id) || 0;
    if (now - lastTime < SEND_INTERVAL) return;
    lastSendTimes.set(ship.id, now);
    const s = ship.state;
    send({
      id: ship.id,
      type: 'state',
      x: s.x, y: s.y, angle: s.angle,
      vx: s.vx, vy: s.vy,
      thrusting: s.thrusting, destroyed: s.destroyed,
    });
  }

  function sendFire(ship) {
    const s = ship.state;
    send({
      id: ship.id, type: 'fire',
      x: s.x, y: s.y, angle: s.angle,
      vx: s.vx, vy: s.vy,
    });
  }

  function sendDeath(ship, killerId = null, cause = 'projectile') {
    send({ id: ship.id, type: 'death', x: ship.state.x, y: ship.state.y, killerId, cause });
  }

  function sendRespawn(ship) {
    send({ id: ship.id, type: 'respawn', x: ship.state.x, y: ship.state.y });
  }

  function sendAIJoin(id, name) {
    send({ type: 'aiJoin', aiId: id, name });
  }

  function sendAILeave(id) {
    send({ type: 'aiLeave', aiId: id });
  }

  function sendLuaUpdate(updates) {
    send({ type: 'luaUpdate', updates });
  }

  function sendChat(name, color, text) {
    send({ type: 'chat', name, color, text });
  }

  function sendNameChange(playerId, newName) {
    send({ type: 'nameChange', playerId, newName });
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
    sendNameChange,
    sendAIJoin,
    sendAILeave,
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
    onNameChange(cb) { callbacks.nameChange = cb; },
    onStateOverride(cb) { callbacks.stateOverride = cb; },
    onGameSpeed(cb) { callbacks.gameSpeed = cb; },
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
