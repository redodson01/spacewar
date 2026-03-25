// Structured server logger. Formats events as [prefix] messages for console,
// with enough structure for a future TUI to consume programmatically.

export function createLogger() {
  function log(event, data = {}) {
    const line = formatLine(event, data);
    if (line) console.log(line);
  }

  function error(event, data = {}) {
    const line = formatLine(event, data);
    if (line) console.error(line);
  }

  return { log, error };
}

function formatLine(event, data) {
  switch (event) {
    case 'join':      return `[join] ${data.name} (player ${data.id + 1})`;
    case 'leave':     return `[leave] ${data.name}`;
    case 'kill':      return `[kill] ${data.killer} killed ${data.victim}`;
    case 'collision':  return `[collision] ${data.name} destroyed`;
    case 'chat':      return `[chat] ${data.name ? data.name + ': ' : ''}${data.text}`;
    case 'lua':       return `[lua] ${data.text}`;
    case 'ai':        return `[ai] ${data.text}`;
    case 'ws-error':  return `[ws] message handler error: ${data.error?.stack || data.error}`;
    case 'tunnel':    return `[tunnel] ${data.text}`;
    case 'info':      return data.text;
    default:          return `[${event}] ${JSON.stringify(data)}`;
  }
}
