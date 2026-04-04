const PREFIX = 'spacewar:';
const MAX_HISTORY = 200;

export function loadScript() {
  try {
    return localStorage.getItem(PREFIX + 'script');
  } catch { return null; }
}

export function saveScript(content) {
  try {
    localStorage.setItem(PREFIX + 'script', content);
  } catch { /* ignore quota errors */ }
}

export function loadName(playerId = null) {
  try {
    const key = playerId !== null ? PREFIX + 'name:' + playerId : PREFIX + 'name';
    return localStorage.getItem(key);
  } catch { return null; }
}

export function saveName(name, playerId = null) {
  try {
    const key = playerId !== null ? PREFIX + 'name:' + playerId : PREFIX + 'name';
    localStorage.setItem(key, name);
  } catch { /* ignore quota errors */ }
}

export function loadHistory(mode) {
  try {
    const key = PREFIX + 'history:' + mode;
    let data = localStorage.getItem(key);
    // Migrate legacy chat history
    if (!data && mode === 'chat') {
      data = localStorage.getItem(PREFIX + 'chat-history');
      if (data) {
        localStorage.setItem(key, data);
        localStorage.removeItem(PREFIX + 'chat-history');
      }
    }
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_HISTORY);
  } catch { /* ignore corrupted data */ }
  return [];
}

export function saveHistory(mode, history) {
  try {
    localStorage.setItem(
      PREFIX + 'history:' + mode,
      JSON.stringify(history.slice(-MAX_HISTORY))
    );
  } catch { /* ignore quota errors */ }
}

export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* ignore errors */ }
}
