export function createInputManager(editorInputIds) {
  const keys = {};

  function onKeyDown(e) {
    if (editorInputIds.includes(e.target.id)) return;
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    keys[e.code] = true;
  }

  function onKeyUp(e) {
    if (editorInputIds.includes(e.target.id)) return;
    keys[e.code] = false;
  }

  function attach(win) {
    win.addEventListener('keydown', onKeyDown);
    win.addEventListener('keyup', onKeyUp);
  }

  function detach(win) {
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('keyup', onKeyUp);
  }

  function clear() {
    for (const key in keys) {
      keys[key] = false;
    }
  }

  return { keys, attach, detach, clear };
}

export const PLAYER_BINDINGS = [
  { thrust: 'KeyW', left: 'KeyA', right: 'KeyD', fire: 'Space' },
  { thrust: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Slash' },
];

export function getActions(keys, bindings) {
  return {
    thrust: !!keys[bindings.thrust],
    left: !!keys[bindings.left],
    right: !!keys[bindings.right],
    fire: !!keys[bindings.fire],
  };
}

export function getNetworkActions(keys) {
  return {
    thrust: !!keys['KeyW'] || !!keys['ArrowUp'],
    left: !!keys['KeyA'] || !!keys['ArrowLeft'],
    right: !!keys['KeyD'] || !!keys['ArrowRight'],
    fire: !!keys['Space'],
  };
}
