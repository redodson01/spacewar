// Server TUI — dashboard with colored log, player list, stats, and Lua REPL.
// Uses neo-blessed for terminal widget management.

import blessed from 'neo-blessed';

// --- Color mapping for log events ---

const EVENT_COLORS = {
  join:      'green',
  leave:     'yellow',
  kill:      'red',
  collision: 'red',
  chat:      'gray',
  lua:       'cyan',
  ai:        'magenta',
  'ws-error':'red',
  tunnel:    'blue',
  info:      null, // use terminal default
};

export function colorize(event, text) {
  const escaped = text.replace(/\{/g, '{open}');
  const color = EVENT_COLORS[event];
  if (color === null) return escaped; // no color wrapping — use terminal default
  if (!color) return `{white-fg}${escaped}{/white-fg}`; // unknown events
  const bold = event === 'ws-error' ? '{bold}' : '';
  const unbold = bold ? '{/bold}' : '';
  return `{${color}-fg}${bold}${escaped}${unbold}{/${color}-fg}`;
}

// --- Input history for REPL ---

export class InputHistory {
  constructor(maxSize = 200) {
    this.entries = [];
    this.index = 0;
    this.maxSize = maxSize;
  }

  add(line) {
    if (line && this.entries[this.entries.length - 1] !== line) {
      this.entries.push(line);
      if (this.entries.length > this.maxSize) {
        this.entries.splice(0, this.entries.length - this.maxSize);
      }
    }
    this.index = this.entries.length;
  }

  up() {
    if (this.index > 0) this.index--;
    return this.entries[this.index] || '';
  }

  down() {
    if (this.index < this.entries.length) this.index++;
    return this.entries[this.index] || '';
  }

  reset() {
    this.index = this.entries.length;
  }
}

// --- TUI factory ---

export function createTUI({ getGameState, onInput, onExit }) {
  // Suppress neo-blessed tput warnings during screen init (e.g., Setulc parse errors)
  const origWrite = process.stderr.write;
  process.stderr.write = () => true;
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Spacewar Server',
    fullUnicode: true,
  });
  process.stderr.write = origWrite;

  // Use ANSI color names so the terminal's Solarized palette applies automatically.
  // ANSI 0=base02, 1=red, 2=green, 3=yellow, 4=blue, 5=magenta, 6=cyan, 7=base2

  // Log panel (left)
  const logBox = blessed.log({
    parent: screen,
    label: ' Log ',
    top: 0,
    left: 0,
    width: '75%',
    bottom: 3,
    border: { type: 'line' },
    style: {
      border: { fg: 'black' },
      label: { fg: 'cyan' },
    },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: 'black' } },
    mouse: true,
  });

  // Player list (right-top)
  const playerBox = blessed.box({
    parent: screen,
    label: ' Players ',
    top: 0,
    right: 0,
    width: '25%+1',
    height: '60%',
    border: { type: 'line' },
    style: {
      border: { fg: 'black' },
      label: { fg: 'cyan' },
    },
    tags: true,
  });

  // Stats panel (right-bottom)
  const statsBox = blessed.box({
    parent: screen,
    label: ' Stats ',
    right: 0,
    width: '25%+1',
    top: '60%',
    bottom: 3,
    border: { type: 'line' },
    style: {
      border: { fg: 'black' },
      label: { fg: 'cyan' },
    },
    tags: true,
  });

  // Input line (bottom)
  const inputBox = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: { type: 'line' },
    style: {
      border: { fg: 'black' },
    },
    label: ' lua> ',
    inputOnFocus: true,
  });

  // --- Input handling ---
  const history = new InputHistory();
  let currentInput = '';

  function activateInput() {
    inputBox.focus();
    inputBox.readInput(() => {});
  }

  inputBox.on('submit', (value) => {
    const line = (value || '').trim();
    if (line) {
      history.add(line);
      onInput(line);
    }
    inputBox.clearValue();
    screen.render();
    activateInput();
  });

  inputBox.on('cancel', () => {
    inputBox.clearValue();
    screen.render();
    activateInput();
  });

  inputBox.key('up', () => {
    if (inputBox.value && history.index === history.entries.length) {
      currentInput = inputBox.value;
    }
    const prev = history.up();
    inputBox.setValue(prev);
    screen.render();
  });

  inputBox.key('down', () => {
    const next = history.down();
    inputBox.setValue(next || currentInput);
    if (history.index === history.entries.length) currentInput = '';
    screen.render();
  });

  // --- Key bindings (on inputBox since it captures all keys while focused) ---
  inputBox.key(['C-c', 'C-d'], () => {
    screen.destroy();
    onExit();
  });

  screen.key(['pageup'], () => {
    logBox.scroll(-logBox.height);
    screen.render();
  });

  screen.key(['pagedown'], () => {
    logBox.scroll(logBox.height);
    screen.render();
  });

  // --- Status panel refresh ---
  function updateStatus() {
    const state = getGameState();

    // Player list
    const playerLines = [];
    for (const p of state.players) {
      const score = state.scores.find(([id]) => id === p.id);
      const pts = score ? score[1] : 0;
      const latency = state.latencies.find(([id]) => id === p.id);
      const ms = latency ? `${latency[1]}ms` : '';
      const tag = p.isAI ? '{magenta-fg}' : '{green-fg}';
      const endTag = p.isAI ? '{/magenta-fg}' : '{/green-fg}';
      playerLines.push(`${tag}${p.name || 'Player ' + (p.id + 1)}${endTag}  ${pts}  ${ms}`);
    }
    playerBox.setContent(playerLines.join('\n') || '{gray-fg}No players{/gray-fg}');

    // Stats
    const minutes = Math.floor(state.uptime / 60);
    const hours = Math.floor(minutes / 60);
    const m = minutes % 60;
    const uptime = hours > 0 ? `${hours}h ${m}m` : `${m}m`;
    const statsLines = [
      `Players: ${state.players.length}/${state.maxPlayers}`,
      `Speed:   ${state.gameSpeed}x`,
      `Uptime:  ${uptime}`,
    ];
    statsBox.setContent(statsLines.join('\n'));

    screen.render();
  }

  const refreshTimer = setInterval(updateStatus, 1000);

  // --- Logger sink interface ---
  function log(event, formattedLine) {
    logBox.log(colorize(event, formattedLine));
  }

  function error(event, formattedLine) {
    logBox.log(colorize(event, formattedLine));
  }

  // Initial render and focus
  screen.render();
  activateInput();

  // Clean up on destroy
  screen.on('destroy', () => {
    clearInterval(refreshTimer);
  });

  return { log, error, updateStatus };
}
