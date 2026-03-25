// Structured server logger. Formats events as [prefix] messages.
// Optionally routes output through a sink (e.g., TUI) instead of console.

export function createLogger(sink = null) {
  function log(event, data = {}) {
    const line = formatLine(event, data);
    if (!line) return;
    if (sink) sink.log(event, line);
    else console.log(line);
  }

  function error(event, data = {}) {
    const line = formatLine(event, data);
    if (!line) return;
    if (sink) sink.error(event, line);
    else console.error(line);
  }

  return { log, error };
}

export function formatLine(event, data) {
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
