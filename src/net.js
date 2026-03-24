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
    hit: null,
    death: null,
    respawn: null,
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
            resolve({ id: msg.id, color: msg.color, players: msg.players });
            break;
          case 'join':
            if (callbacks.join) callbacks.join(msg.id, msg.color);
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
          case 'hit':
            if (callbacks.hit) callbacks.hit(msg.targetId, msg.x, msg.y, msg.color);
            break;
          case 'death':
            if (callbacks.death) callbacks.death(msg.id, msg.x, msg.y, msg.color);
            break;
          case 'respawn':
            if (callbacks.respawn) callbacks.respawn(msg.id, msg.x, msg.y);
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
    send({
      type: 'state',
      x: ship.x,
      y: ship.y,
      angle: ship.angle,
      vx: ship.vx,
      vy: ship.vy,
      thrusting: ship.thrusting,
      destroyed: ship.destroyed,
    });
  }

  function sendFire(ship) {
    send({
      type: 'fire',
      x: ship.x,
      y: ship.y,
      angle: ship.angle,
      vx: ship.vx,
      vy: ship.vy,
      color: ship.color,
    });
  }

  function sendHit(targetShip) {
    send({ type: 'hit', targetId: targetShip.id, x: targetShip.x, y: targetShip.y, color: targetShip.color });
  }

  function sendDeath(ship) {
    send({ type: 'death', x: ship.x, y: ship.y, color: ship.color });
  }

  function sendRespawn(ship) {
    send({ type: 'respawn', x: ship.x, y: ship.y });
  }

  return {
    connect,
    disconnect,
    sendState,
    sendFire,
    sendHit,
    sendDeath,
    sendRespawn,
    get isConnected() { return connected; },
    get localId() { return localId; },
    onJoin(cb) { callbacks.join = cb; },
    onHit(cb) { callbacks.hit = cb; },
    onLeave(cb) { callbacks.leave = cb; },
    onState(cb) { callbacks.state = cb; },
    onFire(cb) { callbacks.fire = cb; },
    onDeath(cb) { callbacks.death = cb; },
    onRespawn(cb) { callbacks.respawn = cb; },
  };
}

// Interpolation helper for remote ships
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

    // Handle wrapping: if delta > half world, snap instead of lerp
    ship.x = lerp(prev.x, next.x, t);
    ship.y = lerp(prev.y, next.y, t);
    ship.angle = lerpAngle(prev.angle, next.angle, t);
    ship.vx = lerp(prev.vx, next.vx, t);
    ship.vy = lerp(prev.vy, next.vy, t);
    ship.thrusting = next.thrusting;
    ship.destroyed = next.destroyed;
  }

  function remove(id) {
    states.delete(id);
  }

  return { onState, apply, remove };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
