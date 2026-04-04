// Command registry for /commands in the command bar.
// Each command has a handler and a hostOnly flag.
// Commands are self-contained — they do not call Lua.

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
    ctx.chat.addMessage('', hint, 'Enter to chat | / for commands | : for Lua (host) | ` for editor (host)');
    ctx.chat.addMessage('', hint, 'Commands: /help /name /color /ai /removeai /speed');
    if (!ctx.networkMode) {
      ctx.chat.addMessage('', hint, 'Press . to add Player 2 (local co-op)');
    } else if (ctx.isHost) {
      ctx.chat.addMessage('', hint, 'You are the host — /ai, /removeai, /speed are available');
    }
  },
});

registerCommand('name', {
  handler(args, ctx) {
    const newName = args.trim().slice(0, 30);
    if (!newName) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /name <new name>');
      return;
    }
    if (ctx.localShip) {
      ctx.localShip.name = newName;
      if (ctx.leaderboard) ctx.leaderboard.updateName(ctx.localShip.id, newName);
      if (ctx.net && ctx.networkMode) {
        ctx.net.sendNameChange(ctx.localShip.id, newName);
      }
      if (ctx.saveName) ctx.saveName(newName);
      ctx.chat.addMessage('', '#2aa198', `Name set to "${newName}".`);
    }
  },
});

registerCommand('color', {
  handler(args, ctx) {
    const color = args.trim();
    if (!color || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /color <hex color> (e.g. /color #ff0)');
      return;
    }
    if (ctx.localShip) {
      ctx.localShip.config.color = color;
      if (ctx.leaderboard) ctx.leaderboard.updateColor(ctx.localShip.id, color);
      if (ctx.net && ctx.networkMode) {
        ctx.net.sendColorChange(color);
      }
      ctx.chat.addMessage('', color, `Color set to "${color}".`);
    }
  },
});

registerCommand('ai', {
  hostOnly: true,
  handler(_args, ctx) {
    if (ctx.addAI) {
      const id = ctx.addAI();
      if (id >= 0) {
        ctx.chat.addMessage('', '#2aa198', `Bot ${id + 1} added.`);
      } else {
        ctx.chat.addMessage('', '#dc322f', 'No free slots.');
      }
    }
  },
});

registerCommand('removeai', {
  hostOnly: true,
  handler(args, ctx) {
    const num = args.trim();
    if (!num) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /removeai <ship number>');
      return;
    }
    if (!isFinite(Number(num))) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /removeai <ship number>');
      return;
    }
    if (ctx.removeAI) {
      const removed = ctx.removeAI(Number(num));
      if (removed) {
        ctx.chat.addMessage('', '#2aa198', `Bot ${num} removed.`);
      } else {
        ctx.chat.addMessage('', '#dc322f', `Player ${num} is not an AI.`);
      }
    }
  },
});

registerCommand('speed', {
  hostOnly: true,
  handler(args, ctx) {
    const val = args.trim();
    if (!val) {
      if (ctx.getGameSpeed) {
        const speed = ctx.getGameSpeed();
        ctx.chat.addMessage('', '#2aa198', `Game speed: ${speed}x`);
      }
      return;
    }
    if (!isFinite(Number(val))) {
      ctx.chat.addMessage('', '#dc322f', 'Usage: /speed [multiplier]');
      return;
    }
    if (ctx.setGameSpeed) {
      const speed = ctx.setGameSpeed(Number(val));
      ctx.chat.addMessage('', '#2aa198', `Game speed set to ${speed}x.`);
    }
  },
});
