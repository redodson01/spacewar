// Shared ship proxy — presents ship.config and ship.state properties
// as flat fields on the ship object for use by Lua scripts.

import { CONFIG_DEFAULTS, STATE_DEFAULTS } from './ship.js';

const CONFIG_KEYS = new Set(Object.keys(CONFIG_DEFAULTS));
const STATE_KEYS = new Set(Object.keys(STATE_DEFAULTS));

export function createShipProxy(ship, { onConfigChange, onStateChange } = {}) {
  return new Proxy(ship, {
    get(target, prop) {
      if (CONFIG_KEYS.has(prop)) return target.config[prop];
      if (STATE_KEYS.has(prop)) return target.state[prop];
      return target[prop];
    },
    set(target, prop, value) {
      if (CONFIG_KEYS.has(prop)) {
        target.config[prop] = value;
        if (onConfigChange) onConfigChange();
        return true;
      }
      if (STATE_KEYS.has(prop)) {
        target.state[prop] = value;
        if (onStateChange) onStateChange(target.id, prop, value);
        return true;
      }
      target[prop] = value;
      return true;
    },
  });
}
