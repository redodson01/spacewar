// Server-side Lua context for the REPL.
// Maintains ship objects that mirror client state, supports config writes
// (broadcast via luaUpdate) and state writes (broadcast via stateOverride).

import * as fengariLib from 'fengari';
import * as interop from 'fengari-interop';

const fengari = {
  lua: fengariLib.lua,
  lauxlib: fengariLib.lauxlib,
  lualib: fengariLib.lualib,
  interop,
  to_luastring: fengariLib.to_luastring,
  to_jsstring: fengariLib.to_jsstring,
};

const CONFIG_KEYS = new Set(['color', 'radius', 'thrust', 'turnSpeed', 'friction', 'fireCooldown', 'showName', 'explosionParticles']);
const STATE_KEYS = new Set(['x', 'y', 'angle', 'vx', 'vy', 'thrusting', 'destroyed', 'respawnTimer', 'invulnerableTimer', 'fireCooldownTimer']);

const CONFIG_DEFAULTS = {
  color: '#0ff', radius: 20, thrust: 0.15, turnSpeed: 0.05,
  friction: 0.995, fireCooldown: 0.25, showName: false, explosionParticles: 25,
};

const STATE_DEFAULTS = {
  x: 0, y: 0, angle: 0, vx: 0, vy: 0, thrusting: false,
  destroyed: false, respawnTimer: 0, invulnerableTimer: 0, fireCooldownTimer: 0,
};

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

export function createServerLua(ships, callbacks) {
  const { lua, lauxlib, lualib, toLua, toJS } = {
    lua: fengari.lua,
    lauxlib: fengari.lauxlib,
    lualib: fengari.lualib,
    toLua: fengari.to_luastring,
    toJS: fengari.to_jsstring,
  };

  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);

  // Required for fengari-interop to push JS objects into Lua
  lauxlib.luaL_requiref(L, toLua("js"), fengari.interop.luaopen_js, 1);
  lua.lua_pop(L, 1);

  const LUA_SHIP = toLua("ship");
  const LUA_SHIP_GLOBALS = Array.from({ length: 8 }, (_, i) => toLua(`ship${i + 1}`));
  const LUA_PRINT = toLua("print");

  let configDirty = false;

  function onConfigChange() {
    configDirty = true;
  }

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

  // Output capture
  const output = [];

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

  // addAI
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

  // removeAI
  lua.lua_pushcfunction(L, function (L) {
    const shipNum = lua.lua_gettop(L) >= 1 ? lua.lua_tointeger(L, 1) : 0;
    if (shipNum < 1 || shipNum > 8) {
      output.push('Usage: removeAI(shipNum)');
      return 0;
    }
    const ship = ships.find(s => s.id === shipNum - 1);
    if (!ship || !ship.isAI) {
      output.push(`Player ${shipNum} is not an AI.`);
      return 0;
    }
    callbacks.onRemoveAI(ship.id);
    exposeShips();
    output.push(`Bot ${shipNum} removed.`);
    return 0;
  });
  lua.lua_setglobal(L, toLua("removeAI"));

  // setName
  lua.lua_pushcfunction(L, function (L) {
    if (lua.lua_gettop(L) < 2) {
      output.push('Usage: setName(shipNum, "name")');
      return 0;
    }
    const shipNum = lua.lua_tointeger(L, 1);
    const newName = toJS(lua.lua_tostring(L, 2));
    const ship = ships.find(s => s.id === shipNum - 1);
    if (ship) {
      ship.name = newName;
      callbacks.onNameChange(ship.id, newName);
      output.push(`Player ${shipNum} is now "${newName}".`);
    } else {
      output.push(`Player ${shipNum} not found.`);
    }
    return 0;
  });
  lua.lua_setglobal(L, toLua("setName"));

  // help
  lua.lua_pushcfunction(L, function () {
    output.push([
      '=== Spacewar Server Lua API ===',
      '',
      'GLOBALS',
      '  ship / ship1-ship8     Ship objects (read/write config + state)',
      '  screen.width/height    World dimensions',
      '',
      'SHIP CONFIG (persists, broadcasts to clients)',
      '  ship.color, ship.radius, ship.thrust, ship.turnSpeed,',
      '  ship.friction, ship.fireCooldown, ship.showName,',
      '  ship.explosionParticles',
      '',
      'SHIP STATE (live from clients, writes broadcast instantly)',
      '  ship.x, ship.y, ship.angle, ship.vx, ship.vy,',
      '  ship.destroyed, ship.thrusting',
      '',
      'FUNCTIONS',
      '  addAI()              Add an AI opponent',
      '  removeAI(n)          Remove AI player n',
      '  setName(n, name)     Rename player n',
      '  print(...)           Output to this console',
      '  help()               Show this reference',
    ].join('\n'));
    return 0;
  });
  lua.lua_setglobal(L, toLua("help"));

  return {
    execute(code) {
      output.length = 0;
      configDirty = false;

      exposeShips();

      // Try as expression first (like REPL)
      let status = lauxlib.luaL_loadstring(L, toLua('return ' + code));
      if (status !== lua.LUA_OK) {
        lua.lua_pop(L, 1);
        status = lauxlib.luaL_loadstring(L, toLua(code));
      }
      if (status !== lua.LUA_OK) {
        const errStr = lua.lua_tostring(L, -1);
        const err = errStr ? toJS(errStr) : 'unknown error';
        lua.lua_pop(L, 1);
        return { output: ['Error: ' + err], configDirty: false };
      }

      const base = lua.lua_gettop(L) - 1;
      status = lua.lua_pcall(L, 0, lua.LUA_MULTRET, 0);
      if (status !== lua.LUA_OK) {
        const errStr = lua.lua_tostring(L, -1);
        const err = errStr ? toJS(errStr) : 'unknown error';
        lua.lua_pop(L, 1);
        return { output: ['Error: ' + err], configDirty: false };
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

      return { output: [...output], configDirty };
    },

    exposeShips,
    exposeScreen,
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
