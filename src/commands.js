// Command registry for chat /commands.
// Each command has a handler and a hostOnly flag.
// Unknown /commands fall through to Lua REPL execution.

const commands = new Map();

export function registerCommand(name, { handler, hostOnly = false }) {
  commands.set(name, { handler, hostOnly });
}

export function runCommand(name, args, ctx) {
  const cmd = commands.get(name);
  if (!cmd) return false;
  if (cmd.hostOnly && ctx.networkMode && !ctx.isHost) {
    ctx.chat.addMessage('', '#dc322f', `/${name} is host-only.`);
    return true;
  }
  cmd.handler(args, ctx);
  return true;
}

export function getCommands() {
  return [...commands.keys()];
}

// --- Built-in commands ---

registerCommand('help', {
  handler(_args, ctx) {
    const hint = '#586e75';
    ctx.chat.addMessage('', hint, 'Controls: WASD / Arrows + Space to shoot');
    ctx.chat.addMessage('', hint, 'Enter to chat | ` to open script editor');
    ctx.chat.addMessage('', hint, 'Commands: /help /name /ai /removeai /speed');
    ctx.chat.addMessage('', hint, 'Lua: /ship.color="#ff0"  /help()  /speed(2)');
    if (!ctx.networkMode) {
      ctx.chat.addMessage('', hint, 'Press / to add Player 2 (local co-op)');
    } else if (ctx.isHost) {
      ctx.chat.addMessage('', hint, 'You are the host — /ai and /speed are available');
    }
  },
});

registerCommand('name', {
  handler(args, ctx) {
    const newName = args.trim();
    if (!newName) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /name <new name>');
      return;
    }
    if (ctx.localShip) {
      ctx.localShip.name = newName;
      if (ctx.net && ctx.networkMode) {
        ctx.net.sendNameChange(ctx.localShip.id, newName);
      }
      if (ctx.saveName) ctx.saveName(newName);
      ctx.chat.addMessage('', '#2aa198', `Name set to "${newName}".`);
    }
  },
});

registerCommand('ai', {
  hostOnly: true,
  handler(_args, ctx) {
    ctx.luaCtx.runLuaREPL('addAI()');
  },
});

registerCommand('removeai', {
  hostOnly: true,
  handler(args, ctx) {
    const num = args.trim();
    if (!num) {
      ctx.luaCtx.runLuaREPL('removeAI()');
    } else if (!isFinite(Number(num))) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /removeai [ship number]');
    } else {
      ctx.luaCtx.runLuaREPL(`removeAI(${Number(num)})`);
    }
  },
});

registerCommand('speed', {
  hostOnly: true,
  handler(args, ctx) {
    const val = args.trim();
    if (!val) {
      ctx.luaCtx.runLuaREPL('speed()');
    } else if (!isFinite(Number(val))) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /speed [multiplier]');
    } else {
      ctx.luaCtx.runLuaREPL(`speed(${Number(val)})`);
    }
  },
});
