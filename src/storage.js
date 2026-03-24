const PREFIX = 'spacewar:';
export const MAX_REPL_HISTORY = 200;

export function loadReplHistory() {
  try {
    const data = localStorage.getItem(PREFIX + 'repl-history');
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_REPL_HISTORY);
  } catch { /* ignore corrupted data */ }
  return [];
}

export function saveReplHistory(history) {
  try {
    localStorage.setItem(
      PREFIX + 'repl-history',
      JSON.stringify(history.slice(-MAX_REPL_HISTORY))
    );
  } catch { /* ignore quota errors */ }
}

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

export function loadChatHistory() {
  try {
    const data = localStorage.getItem(PREFIX + 'chat-history');
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) return parsed.slice(-MAX_REPL_HISTORY);
  } catch { /* ignore corrupted data */ }
  return [];
}

export function saveChatHistory(history) {
  try {
    localStorage.setItem(
      PREFIX + 'chat-history',
      JSON.stringify(history.slice(-MAX_REPL_HISTORY))
    );
  } catch { /* ignore quota errors */ }
}

export function clearAll() {
  try {
    localStorage.removeItem(PREFIX + 'repl-history');
    localStorage.removeItem(PREFIX + 'script');
    localStorage.removeItem(PREFIX + 'chat-history');
  } catch { /* ignore errors */ }
}
