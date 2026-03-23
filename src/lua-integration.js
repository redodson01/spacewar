export function createLuaContext(fengari, ship, canvas, appendOutput) {
  if (!fengari) {
    return {
      isReady: false,
      hasOnUpdate: false,
      runLua(_code) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      runLuaREPL(_line) { appendOutput('Lua not available — is fengari-web loaded?', true); },
      callLuaUpdate(_dt) {},
      updateScreen() {},
      reset(_newShip) {},
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
  // Pre-cache frequently used Lua strings to avoid allocations in hot paths
  const LUA_ON_UPDATE = toLua("onUpdate");
  const LUA_SHIP = toLua("ship");
  const LUA_PRINT = toLua("print");

  // NOTE: luaopen_js gives Lua scripts access to JS globals via the js interop
  // module. This is acceptable for local single-player scripting but must be
  // restricted before running untrusted scripts (e.g., multiplayer).
  lauxlib.luaL_requiref(L, toLua("js"), interop.luaopen_js, 1);
  lua.lua_pop(L, 1);

  const ctx = {
    isReady: true,
    hasOnUpdate: false,

    runLua(code) {
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, LUA_ON_UPDATE);
      ctx.hasOnUpdate = false;

      lauxlib.luaL_dostring(L, toLua(
        `screen = { width = ${canvas.width}, height = ${canvas.height} }`
      ));

      interop.push(L, ship);
      lua.lua_setglobal(L, LUA_SHIP);

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
    },

    updateScreen() {
      lauxlib.luaL_dostring(L, toLua(
        `screen = { width = ${canvas.width}, height = ${canvas.height} }`
      ));
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

    reset(newShip) {
      ctx.hasOnUpdate = false;
      lua.lua_pushnil(L);
      lua.lua_setglobal(L, LUA_ON_UPDATE);
      interop.push(L, newShip);
      lua.lua_setglobal(L, LUA_SHIP);
    },
  };

  // Initial API exposure
  interop.push(L, ship);
  lua.lua_setglobal(L, LUA_SHIP);

  lauxlib.luaL_dostring(L, toLua(
    `screen = { width = ${canvas.width}, height = ${canvas.height} }`
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

  return ctx;
}
