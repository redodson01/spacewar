// Server TUI — dashboard with colored log, player list, stats, and Lua REPL.
// Uses neo-blessed for terminal widget management.

import blessed from 'neo-blessed';

// --- Color mapping for log events ---

// Solarized ANSI mapping: 0=base02, 2=green, 3=yellow, 4=blue, 5=magenta,
// 6=cyan, 11=base00 (muted text), 14=base1 (secondary)
const EVENT_COLORS = {
  join:      'green',
  leave:     'yellow',
  kill:      'red',
  collision: 'red',
  chat:      11,       // base00 — muted but readable on light and dark
  lua:       'cyan',
  ai:        'magenta',
  'ws-error':'red',
  tunnel:    'blue',
  info:      null,     // use terminal default
};

export function colorize(event, text) {
  const escaped = text.replace(/\{/g, '{open}');
  const color = EVENT_COLORS[event];
  if (color === null) return escaped; // no color wrapping — use terminal default
  if (color === undefined) return `{white-fg}${escaped}{/white-fg}`; // unknown events
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

  // Use ANSI color numbers for Solarized compatibility.
  const BORDER = 14;  // base1 — medium gray, works on light and dark
  const ACCENT = 'cyan';
  const PAD = { left: 1 };

  // Layout constants (all in terminal rows/cols)
  const INFO_H = 4;    // border + 2 content lines + border
  const INPUT_H = 3;   // border + 1 input line + border
  const STATS_H = 5;   // border + 3 content lines + border
  const RIGHT_W = 30;  // fixed column width for right panels

  // Row layout:  info(4) | log/players/stats(fill) | input(3)
  // Col layout:  log(fill) gap(1) right-panels(RIGHT_W)

  // Server info (top, persistent)
  const infoBox = blessed.box({
    parent: screen,
    label: ` {${ACCENT}-fg}Server{/${ACCENT}-fg} `,
    tags: true,
    top: 0,
    left: 0,
    width: '100%',
    height: INFO_H,
    padding: PAD,
    border: { type: 'line' },
    style: { border: { fg: BORDER } },
  });

  // Log panel (left)
  const logBox = blessed.log({
    parent: screen,
    label: ' Log ',
    top: INFO_H,
    left: 0,
    right: RIGHT_W + 1, // 1 col gap before right panels
    bottom: INPUT_H,
    padding: PAD,
    border: { type: 'line' },
    style: { border: { fg: BORDER }, label: { fg: ACCENT } },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { style: { bg: BORDER } },
    mouse: true,
  });

  // Player list (right-top — fills above stats)
  const playerBox = blessed.box({
    parent: screen,
    label: ' Players ',
    top: INFO_H,
    right: 0,
    width: RIGHT_W,
    bottom: INPUT_H + STATS_H,
    padding: PAD,
    border: { type: 'line' },
    style: { border: { fg: BORDER }, label: { fg: ACCENT } },
    tags: true,
  });

  // Stats panel (right-bottom — fixed height)
  const statsBox = blessed.box({
    parent: screen,
    label: ' Stats ',
    right: 0,
    width: RIGHT_W,
    height: STATS_H,
    bottom: INPUT_H,
    padding: PAD,
    border: { type: 'line' },
    style: { border: { fg: BORDER }, label: { fg: ACCENT } },
    tags: true,
  });

  // Input line (bottom)
  const inputBox = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: INPUT_H,
    border: { type: 'line' },
    style: { border: { fg: BORDER } },
    label: ` {${ACCENT}-fg}Lua{/${ACCENT}-fg} `,
    tags: true,
    inputOnFocus: true,
  });

  // --- Input handling ---
  const history = new InputHistory();
  let currentInput = '';

  function activateInput() {
    inputBox.setValue('> ');
    inputBox.focus();
    inputBox.readInput(() => {});
    screen.render();
  }

  inputBox.on('submit', (value) => {
    const line = (value || '').replace(/^> /, '').trim();
    if (line) {
      history.add(line);
      onInput(line);
    }
    setTimeout(activateInput, 0);
  });

  inputBox.on('cancel', () => {
    setTimeout(activateInput, 0);
  });

  inputBox.key('up', () => {
    const cur = inputBox.getValue().replace(/^> /, '').trim();
    if (cur && history.index === history.entries.length) {
      currentInput = cur;
    }
    inputBox.setValue('> ' + history.up());
    screen.render();
  });

  inputBox.key('down', () => {
    const next = history.down();
    inputBox.setValue('> ' + (next || currentInput));
    if (history.index === history.entries.length) currentInput = '';
    screen.render();
  });

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
    playerBox.setContent(playerLines.join('\n') || '{14-fg}No players{/14-fg}');

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

  function setInfo(lines) {
    infoBox.setContent(lines.join('\n'));
    const h = lines.length + 2; // borders + content
    infoBox.height = h;
    logBox.top = h;
    playerBox.top = h;
    screen.render();
  }

  return { log, error, updateStatus, setInfo };
}
