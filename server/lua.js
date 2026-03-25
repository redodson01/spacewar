// Unified server-side Lua engine — the single source of truth.
// Both the server REPL and client editor send commands here.
// onUpdate runs at 60Hz in the server game loop.

import * as fengariLib from 'fengari';
import * as interop from 'fengari-interop';
import { CONFIG_DEFAULTS, STATE_DEFAULTS } from '../src/ship.js';

const fengari = {
  lua: fengariLib.lua,
  lauxlib: fengariLib.lauxlib,
  lualib: fengariLib.lualib,
  interop,
  to_luastring: fengariLib.to_luastring,
  to_jsstring: fengariLib.to_jsstring,
};

const CONFIG_KEYS = new Set(Object.keys(CONFIG_DEFAULTS));
const STATE_KEYS = new Set(Object.keys(STATE_DEFAULTS));

function createShipProxy(ship, onConfigChange, onStateChange) {
  return new Proxy(ship, {
    get(target, prop) {
      if (CONFIG_KEYS.has(prop)) return target.config[prop];
      if (STATE_KEYS.has(prop)) return target.state[prop];
      return target[prop];
    },
    set(target, prop, value) {
      if (CONFIG_KEYS.has(prop)) {
        target.config[prop] = value;
        if (onConfigChange) onConfigChange();
        return true;
      }
      if (STATE_KEYS.has(prop)) {
        target.state[prop] = value;
        if (onStateChange) onStateChange(target.id, prop, value);
        return true;
      }
      target[prop] = value;
      return true;
    },
  });
}

export function createServerLua(ships, projectiles, callbacks) {
  const { lua, lauxlib, lualib, toLua, toJS } = {
    lua: fengari.lua,
    lauxlib: fengari.lauxlib,
    lualib: fengari.lualib,
    toLua: fengari.to_luastring,
    toJS: fengari.to_jsstring,
  };

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lauxlib.luaL_requiref(L, toLua("js"), fengari.interop.luaopen_js, 1);
  lua.lua_pop(L, 1);

  const LUA_ON_UPDATE = toLua("onUpdate");
  const LUA_SHIP = toLua("ship");
  const LUA_SHIP_GLOBALS = Array.from({ length: 8 }, (_, i) => toLua(`ship${i + 1}`));
  const LUA_PRINT = toLua("print");
  const LUA_PROJECTILES = toLua("projectiles");

  let configDirty = false;
  let hasOnUpdate = false;

  function onConfigChange() { configDirty = true; }

  function exposeShips() {
    if (ships.length > 0) {
      fengari.interop.push(L, createShipProxy(ships[0], onConfigChange, callbacks.onStateWrite));
      lua.lua_setglobal(L, LUA_SHIP);
    }
    for (const g of LUA_SHIP_GLOBALS) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, g);
    }
    for (const s of ships) {
      if (s.id >= 0 && s.id < 8) {
        fengari.interop.push(L, createShipProxy(s, onConfigChange, callbacks.onStateWrite));
        lua.lua_setglobal(L, LUA_SHIP_GLOBALS[s.id]);
      }
    }
  }

  function exposeScreen(w, h) {
    lauxlib.luaL_dostring(L, toLua(`screen = { width = ${w}, height = ${h} }`));
  }

  // Output capture — collected per execute call
  const output = [];

  // print()
  lua.lua_pushcfunction(L, function (L) {
    const n = lua.lua_gettop(L);
    const parts = [];
    for (let i = 1; i <= n; i++) {
      lauxlib.luaL_tolstring(L, i);
      parts.push(toJS(lua.lua_tostring(L, -1)));
      lua.lua_pop(L, 1);
    }
    output.push(parts.join('\t'));
    return 0;
  });
  lua.lua_setglobal(L, LUA_PRINT);

  // Expose projectiles array
  fengari.interop.push(L, projectiles);
  lua.lua_setglobal(L, LUA_PROJECTILES);

  // shoot() — fires from ship[0]
  lua.lua_pushcfunction(L, function () {
    if (ships.length > 0 && !ships[0].state.destroyed) {
      callbacks.onShoot(ships[0]);
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("shoot"));

  // addAI()
  lua.lua_pushcfunction(L, function () {
    const id = callbacks.onAddAI();
    if (id >= 0) {
      exposeShips();
      output.push(`Bot ${id + 1} added.`);
    } else {
      output.push('No free slots.');
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("addAI"));

  // removeAI(n)
  lua.lua_pushcfunction(L, function (L) {
    const shipNum = lua.lua_gettop(L) >= 1 ? lua.lua_tointeger(L, 1) : 0;
    if (shipNum < 1 || shipNum > 8) { output.push('Usage: removeAI(shipNum)'); return 0; }
    const ship = ships.find(s => s.id === shipNum - 1);
    if (!ship || !ship.isAI) { output.push(`Player ${shipNum} is not an AI.`); return 0; }
    callbacks.onRemoveAI(ship.id);
    exposeShips();
    output.push(`Bot ${shipNum} removed.`);
    return 0;
  });
  lua.lua_setglobal(L, toLua("removeAI"));

  // setName(n, name)
  lua.lua_pushcfunction(L, function (L) {
    if (lua.lua_gettop(L) < 2) { output.push('Usage: setName(shipNum, "name")'); return 0; }
    const shipNum = lua.lua_tointeger(L, 1);
    const newName = toJS(lua.lua_tostring(L, 2));
    const ship = ships.find(s => s.id === shipNum - 1);
    if (ship) {
      ship.name = newName;
      callbacks.onNameChange(ship.id, newName);
      output.push(`Player ${shipNum} is now "${newName}".`);
    } else { output.push(`Player ${shipNum} not found.`); }
    return 0;
  });
  lua.lua_setglobal(L, toLua("setName"));

  // speed() / speed(n)
  lua.lua_pushcfunction(L, function (L) {
    if (lua.lua_gettop(L) >= 1) {
      const speed = lua.lua_tonumber(L, 1);
      if (callbacks.onSetSpeed) callbacks.onSetSpeed(speed);
      output.push(`Game speed set to ${speed}x.`);
    } else {
      lua.lua_pushnumber(L, callbacks.onGetSpeed ? callbacks.onGetSpeed() : 1.0);
      return 1;
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("speed"));

  // help()
  lua.lua_pushcfunction(L, function () {
    output.push([
      '=== Spacewar Lua API ===',
      '',
      'GLOBALS',
      '  ship / ship1-ship8     Ship objects (read/write config + state)',
      '  projectiles            Active projectiles array',
      '  screen.width/height    World dimensions',
      '',
      'SHIP CONFIG (persists across respawn)',
      '  ship.color, ship.radius, ship.thrust, ship.turnSpeed,',
      '  ship.friction, ship.fireCooldown, ship.showName,',
      '  ship.explosionParticles',
      '',
      'SHIP STATE (live, writes broadcast instantly)',
      '  ship.x, ship.y, ship.angle, ship.vx, ship.vy,',
      '  ship.destroyed, ship.thrusting',
      '',
      'FUNCTIONS',
      '  shoot()              Fire a projectile from your ship',
      '  addAI()              Add an AI opponent',
      '  removeAI(n)          Remove AI player n',
      '  setName(n, name)     Rename player n',
      '  speed() / speed(n)   Get/set game speed (1=normal, 2=double, 0.5=half)',
      '  print(...)           Output to console',
      '  help()               Show this reference',
      '',
      'CALLBACKS',
      '  function onUpdate(dt)  Called every tick (~60Hz)',
    ].join('\n'));
    return 0;
  });
  lua.lua_setglobal(L, toLua("help"));

  // --- Execution methods ---

  function runLua(code) {
    output.length = 0;
    configDirty = false;

    // Reset onUpdate
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, LUA_ON_UPDATE);
    hasOnUpdate = false;

    exposeShips();
    exposeScreen(callbacks.getWorldWidth(), callbacks.getWorldHeight());

    const status = lauxlib.luaL_dostring(L, toLua(code));
    if (status !== lua.LUA_OK) {
      const errStr = lua.lua_tostring(L, -1);
      output.push('Error: ' + (errStr ? toJS(errStr) : 'unknown error'));
      lua.lua_pop(L, 1);
      return { output: [...output], configDirty: false };
    }

    // Check for onUpdate
    lua.lua_getglobal(L, LUA_ON_UPDATE);
    if (lua.lua_isfunction(L, -1)) hasOnUpdate = true;
    lua.lua_pop(L, 1);

    output.push('Script executed.');
    return { output: [...output], configDirty };
  }

  function runLuaREPL(line) {
    output.length = 0;
    configDirty = false;

    exposeShips();

    output.push('> ' + line);

    let status = lauxlib.luaL_loadstring(L, toLua('return ' + line));
    if (status !== lua.LUA_OK) {
      lua.lua_pop(L, 1);
      status = lauxlib.luaL_loadstring(L, toLua(line));
    }
    if (status !== lua.LUA_OK) {
      const errStr = lua.lua_tostring(L, -1);
      output.push('Error: ' + (errStr ? toJS(errStr) : 'unknown error'));
      lua.lua_pop(L, 1);
      return { output: [...output], configDirty: false };
    }

    const base = lua.lua_gettop(L) - 1;
    status = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
    if (status !== lua.LUA_OK) {
      const errStr = lua.lua_tostring(L, -1);
      output.push('Error: ' + (errStr ? toJS(errStr) : 'unknown error'));
      lua.lua_pop(L, 1);
      return { output: [...output], configDirty: false };
    }

    const nresults = lua.lua_gettop(L) - base;
    if (nresults > 0) {
      const parts = [];
      for (let i = 1; i <= nresults; i++) {
        lauxlib.luaL_tolstring(L, base + i);
        const s = lua.lua_tostring(L, -1);
        parts.push(s ? toJS(s) : '(nil)');
        lua.lua_pop(L, 1);
      }
      output.push(parts.join('\t'));
      lua.lua_settop(L, base);
    }

    // Check for onUpdate changes
    lua.lua_getglobal(L, LUA_ON_UPDATE);
    hasOnUpdate = lua.lua_isfunction(L, -1);
    lua.lua_pop(L, 1);

    return { output: [...output], configDirty };
  }

  function callLuaUpdate(dt) {
    if (!hasOnUpdate) return { configDirty: false };
    configDirty = false;

    lua.lua_getglobal(L, LUA_ON_UPDATE);
    lua.lua_pushnumber(L, dt);
    const status = lua.lua_pcall(L, 1, 0, 0);
    if (status !== lua.LUA_OK) {
      const errStr = lua.lua_tostring(L, -1);
      const err = errStr ? toJS(errStr) : 'unknown error';
      lua.lua_pop(L, 1);
      if (callbacks.onOutput) callbacks.onOutput('onUpdate error: ' + err, true);
      hasOnUpdate = false;
    }

    return { configDirty };
  }

  function reset() {
    hasOnUpdate = false;
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, LUA_ON_UPDATE);
    exposeShips();
    fengari.interop.push(L, projectiles);
    lua.lua_setglobal(L, LUA_PROJECTILES);
  }

  return {
    runLua,
    runLuaREPL,
    callLuaUpdate,
    reset,
    exposeShips,
    exposeScreen,
    get hasOnUpdate() { return hasOnUpdate; },
    get configDirty() { return configDirty; },
  };
}

export function createShip(id, x, y, color) {
  return {
    id,
    name: null,
    config: { ...CONFIG_DEFAULTS, color },
    state: { ...STATE_DEFAULTS, x, y },
    spawnX: x,
    spawnY: y,
    spawnAngle: undefined,
    isLocal: false,
    isAI: false,
  };
}
