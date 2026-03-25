import { loadScript, saveScript, clearAll } from './storage.js';

export const EXAMPLES = {
  color: `-- Change the ship color
ship.color = "#ff0"
print("Ship is now yellow!")`,

  speed: `-- Speed demon mode
ship.thrust = 0.4
ship.turnSpeed = 0.1
ship.friction = 0.98
print("Speed demon activated!")`,

  rainbow: `-- Rainbow color cycling
local t = 0
function onUpdate(dt)
  t = t + dt * 2
  local r = math.floor(math.sin(t) * 127 + 128)
  local g = math.floor(math.sin(t + 2.094) * 127 + 128)
  local b = math.floor(math.sin(t + 4.189) * 127 + 128)
  ship.color = string.format("#%02x%02x%02x", r, g, b)
end
print("Rainbow mode! Fly around.")`,

  autofire: `-- Auto-fire while moving fast
function onUpdate(dt)
  local speed = math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy)
  if speed > 1 then
    shoot()
  end
end
print("Auto-fire when moving fast!")`,

  orbit: `-- Auto-orbit around screen center
local t = 0
function onUpdate(dt)
  t = t + dt * 0.8
  ship.x = screen.width / 2 + math.cos(t) * 200
  ship.y = screen.height / 2 + math.sin(t) * 200
  ship.angle = t + math.pi / 2
end
print("Orbiting...")`,
};

export function createEditor({ editor, scriptArea, exampleSelect, runBtn, clearBtn, clearDataBtn }, luaCtx, clearInputFn, canOpenEditor = () => true) {
  let editorOpen = false;

  function toggleEditor() {
    editorOpen = !editorOpen;
    editor.classList.toggle('open', editorOpen);
    if (editorOpen) {
      clearInputFn();
      scriptArea.focus();
    } else {
      document.activeElement.blur();
    }
  }

  // Global keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      if (editorOpen || canOpenEditor()) toggleEditor();
    }
    if (e.code === 'Escape' && editorOpen) {
      e.preventDefault();
      toggleEditor();
    }
    if (e.code === 'Enter' && (e.ctrlKey || e.metaKey) && editorOpen) {
      e.preventDefault();
      luaCtx.runLua(scriptArea.value);
    }
    if ((e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'ArrowUp' && editorOpen) {
        scriptArea.focus();
      } else if (e.code === 'ArrowRight') {
        if (!editorOpen && canOpenEditor()) toggleEditor();
        else if (editorOpen) scriptArea.focus();
      } else if (e.code === 'ArrowLeft') {
        document.activeElement.blur();
        if (editorOpen) toggleEditor();
      }
    }
  });

  // Restore saved script content
  const savedScript = loadScript();
  if (savedScript !== null) {
    scriptArea.value = savedScript;
  }

  // Auto-save script content on changes (debounced)
  let saveTimeout = null;
  scriptArea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveScript(scriptArea.value), 500);
  });

  // Script textarea
  scriptArea.addEventListener('keydown', e => {
    if (e.code === 'Backquote' || e.code === 'Escape') return;
    if ((e.ctrlKey || e.metaKey) && ['Enter', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    if (e.code === 'Tab') {
      e.preventDefault();
      const start = scriptArea.selectionStart;
      scriptArea.value = scriptArea.value.substring(0, start) + '  ' + scriptArea.value.substring(scriptArea.selectionEnd);
      scriptArea.selectionStart = scriptArea.selectionEnd = start + 2;
    }
    e.stopPropagation();
  });
  scriptArea.addEventListener('keyup', e => e.stopPropagation());

  // Prevent editor buttons from stealing keyboard focus
  for (const btn of [runBtn, clearBtn, clearDataBtn]) {
    btn.addEventListener('mousedown', e => e.preventDefault());
  }

  // Buttons
  runBtn.addEventListener('click', () => luaCtx.runLua(scriptArea.value));
  clearBtn.addEventListener('click', () => { scriptArea.value = ''; });
  clearDataBtn.addEventListener('click', () => {
    clearAll();
  });

  // Examples dropdown
  exampleSelect.addEventListener('change', function () {
    if (this.value && EXAMPLES[this.value]) {
      scriptArea.value = EXAMPLES[this.value];
      saveScript(scriptArea.value);
      this.value = '';
    }
  });

  return { toggleEditor };
}
