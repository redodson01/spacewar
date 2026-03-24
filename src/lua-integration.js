import { fireProjectile } from './projectiles.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from './world.js';
import { CONFIG_DEFAULTS, STATE_DEFAULTS } from './ship.js';

// Create a flat proxy over a structured ship so Lua scripts can use
// ship.color (maps to ship.config.color), ship.x (maps to ship.state.x), etc.
const CONFIG_KEYS = new Set(Object.keys(CONFIG_DEFAULTS));
const STATE_KEYS = new Set(Object.keys(STATE_DEFAULTS));

function createShipProxy(ship) {
  return new Proxy(ship, {
    get(target, prop) {
      if (CONFIG_KEYS.has(prop)) return target.config[prop];
      if (STATE_KEYS.has(prop)) return target.state[prop];
      return target[prop];
    },
    set(target, prop, value) {
      if (CONFIG_KEYS.has(prop)) { target.config[prop] = value; return true; }
      if (STATE_KEYS.has(prop)) { target.state[prop] = value; return true; }
      target[prop] = value;
      return true;
    },
  });
}

export function createLuaContext(fengari, ships, projectiles, explosions, canvas, appendOutput) {
  let onShipUpdate = null;

  if (!fengari) {
    return {
      isReady: false,
      hasOnUpdate: false,
      runLua(_code) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      runLuaREPL(_line) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      callLuaUpdate(_dt) {},
      reset() {},
      setOnShipUpdate(cb) { onShipUpdate = cb; },
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
  const LUA_SHIP_GLOBALS = [toLua("ship1"), toLua("ship2"), toLua("ship3"), toLua("ship4")];
  const LUA_PRINT = toLua("print");
  const LUA_SHOOT = toLua("shoot");
  const LUA_PROJECTILES = toLua("projectiles");

  lauxlib.luaL_requiref(L, toLua("js"), interop.luaopen_js, 1);
  lua.lua_pop(L, 1);

  function exposeShips() {
    // ship = local player (always ships[0] in the array)
    interop.push(L, createShipProxy(ships[0]));
    lua.lua_setglobal(L, LUA_SHIP);
    // Clear all numbered globals first
    for (const g of LUA_SHIP_GLOBALS) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, g);
    }
    // Set present ships by their ID
    for (const s of ships) {
      if (s.id >= 0 && s.id < 4) {
        interop.push(L, createShipProxy(s));
        lua.lua_setglobal(L, LUA_SHIP_GLOBALS[s.id]);
      }
    }
  }

  function broadcastShipUpdates() {
    if (onShipUpdate) {
      onShipUpdate(ships.map(s => ({
        id: s.id, ...s.config,
      })));
    }
  }

  const ctx = {
    isReady: true,
    hasOnUpdate: false,

    runLua(code) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, LUA_ON_UPDATE);
      ctx.hasOnUpdate = false;

      lauxlib.luaL_dostring(L, toLua(
        `screen = { width = ${WORLD_WIDTH}, height = ${WORLD_HEIGHT} }`
      ));

      exposeShips();

      const status = lauxlib.luaL_dostring(L, toLua(code));
      if (status !== lua.LUA_OK) {
        const err = toJS(lua.lua_tostring(L, -1));
        lua.lua_pop(L, 1);
        appendOutput('Error: ' + err, true);
        return;
      }

      lua.lua_getglobal(L, LUA_ON_UPDATE);
      if (lua.lua_isfunction(L, -1)) {
        ctx.hasOnUpdate = true;
      }
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
    broadcastShipUpdates,
  };

  // Initial API exposure
  exposeShips();

  lauxlib.luaL_dostring(L, toLua(
    `screen = { width = ${WORLD_WIDTH}, height = ${WORLD_HEIGHT} }`
  ));

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

  lua.lua_pushcfunction(L, function () {
    if (!ships[0].state.destroyed) fireProjectile(projectiles, ships[0]);
    return 0;
  });
  lua.lua_setglobal(L, LUA_SHOOT);

  const LUA_HELP = toLua("help");
  lua.lua_pushcfunction(L, function () {
    appendOutput([
      '=== Spacewar Lua API ===',
      '',
      'GLOBALS',
      '  ship / ship1      Player 1\'s ship (alias)',
      '  ship2 - ship4     Other players\' ships (nil if absent)',
      '  projectiles       Array of active projectiles',
      '  screen.width      World width (1920)',
      '  screen.height     World height (1080)',
      '',
      'SHIP CONFIG (persists across respawn)',
      '  ship.color             CSS color string',
      '  ship.radius            Ship size (default 20)',
      '  ship.thrust            Acceleration per frame (default 0.15)',
      '  ship.turnSpeed         Rotation per frame (default 0.05)',
      '  ship.friction          Velocity decay 0-1 (default 0.995)',
      '  ship.fireCooldown      Seconds between shots (default 0.25)',
      '  ship.showName          Show name above ship (default false)',
      '  ship.controlScheme     0=WASD, 1=arrows (default 0)',
      '  ship.explosionParticles  Particle count (default 25)',
      '',
      'SHIP STATE (resets on respawn)',
      '  ship.x, ship.y         Position',
      '  ship.angle              Facing angle in radians',
      '  ship.vx, ship.vy       Velocity',
      '  ship.destroyed          Whether ship is dead',
      '  ship.respawnTimer       Seconds until respawn',
      '  ship.invulnerableTimer  Seconds of invulnerability',
      '  ship.thrusting          Whether thrust is active',
      '',
      'FUNCTIONS',
      '  shoot()           Fire a projectile from your ship',
      '  print(...)        Output to this console',
      '  help()            Show this reference',
      '',
      'CALLBACKS',
      '  function onUpdate(dt)   Called every frame (dt in seconds)',
    ].join('\n'));
    return 0;
  });
  lua.lua_setglobal(L, LUA_HELP);

  return ctx;
}
