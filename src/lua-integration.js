// Lua integration — thin relay to server in network mode, local Fengari in local mode.
//
// In network mode: runLua/runLuaREPL send code to the server for execution.
// Output comes back via luaOutput messages. onUpdate runs on the server at 60Hz.
//
// In local mode: runs a local Fengari VM (same as before) for offline single-player.

import { fireProjectile } from './projectiles.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './world.js';
import { createShipProxy } from './ship-proxy.js';

// --- Network mode: thin relay ---

function createNetworkLuaContext(net, appendOutput) {
  // Wire up luaOutput from server
  net.onLuaOutput((text, isError) => {
    appendOutput(text, isError);
  });

  return {
    isReady: true,
    hasOnUpdate: false, // server tracks this
    runLua(code) { net.sendLuaExec(code, 'run'); },
    runLuaREPL(line) { net.sendLuaExec(line, 'repl'); },
    callLuaUpdate(_dt) {}, // server handles onUpdate
    reset() { net.sendLuaExec('__reset__', 'reset'); },
    refreshShips() {}, // server tracks ships; no client-side action needed
    setOnShipUpdate() {},
    setOnNameChange() {},
    setOnAIAdd() {},
    setOnAIRemove() {},
    setGameSpeedAccessors() {},
    broadcastShipUpdates() {},
  };
}

// --- Local mode: full Fengari VM ---

function createLocalLuaContext(fengari, ships, projectiles, explosions, appendOutput) {
  if (!fengari) {
    return {
      isReady: false,
      hasOnUpdate: false,
      runLua(_code) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      runLuaREPL(_line) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      callLuaUpdate(_dt) {},
      refreshShips() {},
      reset() {},
      setOnShipUpdate() {},
      setOnNameChange() {},
      setOnAIAdd() {},
      setOnAIRemove() {},
      setGameSpeedAccessors() {},
      broadcastShipUpdates() {},
    };
  }

  const lua     = fengari.lua;
  const lauxlib = fengari.lauxlib;
  const lualib  = fengari.lualib;
  const interop = fengari.interop;
  const toLua   = fengari.to_luastring;
  const toJS    = fengari.to_jsstring;

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const LUA_ON_UPDATE = toLua("onUpdate");
  const LUA_SHIP = toLua("ship");
  const LUA_SHIP_GLOBALS = [toLua("ship1"), toLua("ship2"), toLua("ship3"), toLua("ship4"), toLua("ship5"), toLua("ship6"), toLua("ship7"), toLua("ship8")];
  const LUA_PRINT = toLua("print");
  const LUA_PROJECTILES = toLua("projectiles");

  lauxlib.luaL_requiref(L, toLua("js"), interop.luaopen_js, 1);
  lua.lua_pop(L, 1);

  let onShipUpdate = null;
  let onNameChange = null;
  let onAIAdd = null;
  let onAIRemove = null;
  let getGameSpeed = () => 1.0;
  let setGameSpeed = () => {};

  function exposeShips() {
    if (ships.length === 0) return;
    interop.push(L, createShipProxy(ships[0]));
    lua.lua_setglobal(L, LUA_SHIP);
    for (const g of LUA_SHIP_GLOBALS) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, g);
    }
    for (const s of ships) {
      if (s.id >= 0 && s.id < 8) {
        interop.push(L, createShipProxy(s));
        lua.lua_setglobal(L, LUA_SHIP_GLOBALS[s.id]);
      }
    }
  }

  let lastConfigSnapshot = '';
  let lastBroadcastTime = 0;
  const BROADCAST_INTERVAL = 50;

  function broadcastShipUpdates(throttle = false) {
    if (!onShipUpdate) return;
    const updates = ships.map(s => ({ id: s.id, ...s.config }));
    if (throttle) {
      const snapshot = JSON.stringify(updates);
      if (snapshot === lastConfigSnapshot) return;
      const now = performance.now();
      if (now - lastBroadcastTime < BROADCAST_INTERVAL) return;
      lastConfigSnapshot = snapshot;
      lastBroadcastTime = now;
    }
    onShipUpdate(updates);
  }

  const ctx = {
    isReady: true,
    hasOnUpdate: false,

    runLua(code) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, LUA_ON_UPDATE);
      ctx.hasOnUpdate = false;
      lauxlib.luaL_dostring(L, toLua(`screen = { width = ${WORLD_WIDTH}, height = ${WORLD_HEIGHT} }`));
      exposeShips();
      const status = lauxlib.luaL_dostring(L, toLua(code));
      if (status !== lua.LUA_OK) {
        const err = toJS(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        appendOutput('Error: ' + err, true);
        return;
      }
      lua.lua_getglobal(L, LUA_ON_UPDATE);
      if (lua.lua_isfunction(L, -1)) ctx.hasOnUpdate = true;
      lua.lua_pop(L, 1);
      appendOutput('Script executed.');
      broadcastShipUpdates();
    },

    runLuaREPL(line) {
      appendOutput('> ' + line);
      let status = lauxlib.luaL_loadstring(L, toLua('return ' + line));
      if (status !== lua.LUA_OK) {
        lua.lua_pop(L, 1);
        status = lauxlib.luaL_loadstring(L, toLua(line));
      }
      if (status !== lua.LUA_OK) {
        const err = toJS(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        appendOutput('Error: ' + err, true);
        return;
      }
      const base = lua.lua_gettop(L) - 1;
      status = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
      if (status !== lua.LUA_OK) {
        const err = toJS(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        appendOutput('Error: ' + err, true);
        return;
      }
      const nresults = lua.lua_gettop(L) - base;
      if (nresults > 0) {
        const parts = [];
        for (let i = 1; i <= nresults; i++) {
          lauxlib.luaL_callmeta(L, base + i, toLua('__tostring'));
          if (lua.lua_isstring(L, -1)) {
            parts.push(toJS(lua.lua_tostring(L, -1)));
          } else {
            parts.push(toJS(lauxlib.luaL_tolstring(L, base + i)));
          }
          lua.lua_pop(L, 1);
        }
        appendOutput(parts.join('\t'));
        lua.lua_settop(L, base);
      }
      lua.lua_getglobal(L, LUA_ON_UPDATE);
      ctx.hasOnUpdate = lua.lua_isfunction(L, -1);
      lua.lua_pop(L, 1);
      broadcastShipUpdates();
    },

    callLuaUpdate(dt) {
      if (!ctx.hasOnUpdate) return;
      lua.lua_getglobal(L, LUA_ON_UPDATE);
      lua.lua_pushnumber(L, dt);
      const status = lua.lua_pcall(L, 1, 0, 0);
      if (status !== lua.LUA_OK) {
        const err = toJS(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        appendOutput('onUpdate error: ' + err, true);
        ctx.hasOnUpdate = false;
      }
      broadcastShipUpdates(true);
    },

    refreshShips() {
      exposeShips();
    },

    reset() {
      ctx.hasOnUpdate = false;
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, LUA_ON_UPDATE);
      exposeShips();
      projectiles.length = 0;
      interop.push(L, projectiles);
      lua.lua_setglobal(L, LUA_PROJECTILES);
      explosions.length = 0;
    },

    setOnShipUpdate(cb) { onShipUpdate = cb; },
    setOnNameChange(cb) { onNameChange = cb; },
    setOnAIAdd(cb) { onAIAdd = cb; },
    setOnAIRemove(cb) { onAIRemove = cb; },
    setGameSpeedAccessors(getter, setter) { getGameSpeed = getter; setGameSpeed = setter; },
    broadcastShipUpdates,
  };

  // Initial exposure
  exposeShips();
  lauxlib.luaL_dostring(L, toLua(`screen = { width = ${WORLD_WIDTH}, height = ${WORLD_HEIGHT} }`));

  // print
  lua.lua_pushcfunction(L, function (L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      lauxlib.luaL_tolstring(L, i);
      parts.push(toJS(lua.lua_tostring(L, -1)));
      lua.lua_pop(L, 1);
    }
    appendOutput(parts.join('\t'));
    return 0;
  });
  lua.lua_setglobal(L, LUA_PRINT);

  interop.push(L, projectiles);
  lua.lua_setglobal(L, LUA_PROJECTILES);

  // shoot
  lua.lua_pushcfunction(L, function () {
    if (ships[0] && !ships[0].state.destroyed) fireProjectile(projectiles, ships[0]);
    return 0;
  });
  lua.lua_setglobal(L, toLua("shoot"));

  // setName
  lua.lua_pushcfunction(L, function (L) {
    if (lua.lua_gettop(L) < 2) { appendOutput('Usage: setName(shipNum, "name")', true); return 0; }
    const shipNum = lua.lua_tointeger(L, 1);
    const newName = toJS(lua.lua_tostring(L, 2));
    const ship = ships.find(s => s.id === shipNum - 1);
    if (ship) {
      ship.name = newName;
      if (onNameChange) onNameChange(ship.id, newName);
      appendOutput(`Player ${shipNum} is now "${newName}".`);
    } else { appendOutput(`Player ${shipNum} not found.`, true); }
    return 0;
  });
  lua.lua_setglobal(L, toLua("setName"));

  // addAI
  lua.lua_pushcfunction(L, function () {
    if (onAIAdd) {
      const id = onAIAdd();
      if (id >= 0) { exposeShips(); appendOutput(`Bot ${id + 1} added.`); }
      else { appendOutput('No free slots.', true); }
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("addAI"));

  // removeAI
  lua.lua_pushcfunction(L, function (L) {
    const shipNum = lua.lua_gettop(L) >= 1 ? lua.lua_tointeger(L, 1) : 0;
    if (shipNum < 1 || shipNum > 8) { appendOutput('Usage: removeAI(shipNum)', true); return 0; }
    const ship = ships.find(s => s.id === shipNum - 1);
    if (!ship || !ship.isAI) { appendOutput(`Player ${shipNum} is not an AI.`, true); return 0; }
    if (onAIRemove) onAIRemove(ship.id);
    exposeShips();
    appendOutput(`Bot ${shipNum} removed.`);
    return 0;
  });
  lua.lua_setglobal(L, toLua("removeAI"));

  // speed
  lua.lua_pushcfunction(L, function (L) {
    if (lua.lua_gettop(L) >= 1) {
      const speed = Math.max(0.1, Math.min(10, lua.lua_tonumber(L, 1)));
      setGameSpeed(speed);
      appendOutput(`Game speed set to ${speed}x.`);
    } else {
      lua.lua_pushnumber(L, getGameSpeed());
      return 1;
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("speed"));

  // help
  lua.lua_pushcfunction(L, function () {
    appendOutput([
      '=== Spacewar Lua API ===',
      '',
      'GLOBALS',
      '  ship / ship1-ship8     Ship objects',
      '  projectiles            Active projectiles array',
      '  screen.width/height    World dimensions',
      '',
      'SHIP CONFIG (persists across respawn)',
      '  ship.color, ship.radius, ship.thrust, ship.turnSpeed,',
      '  ship.friction, ship.fireCooldown, ship.showName,',
      '  ship.explosionParticles',
      '',
      'SHIP STATE (resets on respawn)',
      '  ship.x, ship.y, ship.angle, ship.vx, ship.vy,',
      '  ship.destroyed, ship.thrusting',
      '',
      'FUNCTIONS',
      '  shoot()              Fire a projectile from your ship',
      '  addAI()              Add an AI opponent',
      '  removeAI(n)          Remove AI player n',
      '  setName(n, name)     Rename player n',
      '  speed() / speed(n)   Get/set game speed',
      '  print(...)           Output to console',
      '  help()               Show this reference',
      '',
      'CALLBACKS',
      '  function onUpdate(dt)  Called every frame',
    ].join('\n'));
    return 0;
  });
  lua.lua_setglobal(L, toLua("help"));

  return ctx;
}

// --- Factory: choose network or local based on connection ---

export function createLuaContext(fengari, ships, projectiles, explosions, appendOutput, net = null) {
  if (net && net.isConnected) {
    return createNetworkLuaContext(net, appendOutput);
  }
  return createLocalLuaContext(fengari, ships, projectiles, explosions, appendOutput);
}
