export function createInputManager(editorInputIds) {
  const keys = {};

  function onKeyDown(e) {
    if (editorInputIds.includes(e.target.id)) return;
    if (e.ctrlKey || e.metaKey) return;
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

  return { keys, attach, detach };
}
