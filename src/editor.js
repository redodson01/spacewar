import { loadReplHistory, saveReplHistory, loadScript, saveScript, MAX_REPL_HISTORY } from './storage.js';

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

export function createEditor({ editor, scriptArea, outputDiv, hintDiv, replInput, exampleSelect, runBtn, resetBtn, clearBtn }, luaCtx, ship, resetShipFn) {
  let editorOpen = false;
  let lastEditorFocus = null;

  function toggleEditor() {
    editorOpen = !editorOpen;
    editor.classList.toggle('open', editorOpen);
    if (editorOpen) {
      (lastEditorFocus || replInput).focus();
    } else {
      document.activeElement.blur();
    }
  }

  const MAX_OUTPUT_LINES = 500;

  function appendOutput(text, isError) {
    const line = document.createElement('div');
    if (isError) line.className = 'output-error';
    line.textContent = text;
    outputDiv.appendChild(line);
    while (outputDiv.children.length > MAX_OUTPUT_LINES) {
      outputDiv.removeChild(outputDiv.firstChild);
    }
    outputDiv.scrollTop = outputDiv.scrollHeight;
  }

  // Global keyboard shortcuts
  window.addEventListener('keydown', e => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      toggleEditor();
    }
    if (e.code === 'Escape' && editorOpen) {
      e.preventDefault();
      toggleEditor();
    }
    if (e.code === 'Enter' && (e.ctrlKey || e.metaKey) && editorOpen) {
      e.preventDefault();
      luaCtx.runLua(scriptArea.value);
    }
    if ((e.ctrlKey || e.metaKey) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'ArrowUp' && editorOpen) {
        scriptArea.focus();
        lastEditorFocus = scriptArea;
      } else if (e.code === 'ArrowDown' && editorOpen) {
        replInput.focus();
        lastEditorFocus = replInput;
      } else if (e.code === 'ArrowRight') {
        if (!editorOpen) toggleEditor();
        else (lastEditorFocus || replInput).focus();
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
    if ((e.ctrlKey || e.metaKey) && ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    if (e.code === 'Tab') {
      e.preventDefault();
      const start = scriptArea.selectionStart;
      scriptArea.value = scriptArea.value.substring(0, start) + '  ' + scriptArea.value.substring(scriptArea.selectionEnd);
      scriptArea.selectionStart = scriptArea.selectionEnd = start + 2;
    }
    e.stopPropagation();
  });
  scriptArea.addEventListener('keyup', e => e.stopPropagation());

  // REPL input — restore history from localStorage
  const replHistory = loadReplHistory();
  let replHistoryIdx = replHistory.length;
  let historyTimeout = null;
  function debouncedSaveHistory() {
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => saveReplHistory(replHistory), 300);
  }

  replInput.addEventListener('keydown', e => {
    if (e.code === 'Backquote' || e.code === 'Escape') return;
    if ((e.ctrlKey || e.metaKey) && ['Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
    if (e.code === 'Enter') {
      e.preventDefault();
      const line = replInput.value.trim();
      if (line) {
        if (replHistory[replHistory.length - 1] !== line) {
          replHistory.push(line);
          if (replHistory.length > MAX_REPL_HISTORY) {
            replHistory.splice(0, replHistory.length - MAX_REPL_HISTORY);
          }
          debouncedSaveHistory();
        }
        replHistoryIdx = replHistory.length;
        luaCtx.runLuaREPL(line);
      }
      replInput.value = '';
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      if (replHistoryIdx > 0) {
        replHistoryIdx--;
        replInput.value = replHistory[replHistoryIdx];
      }
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      if (replHistoryIdx < replHistory.length - 1) {
        replHistoryIdx++;
        replInput.value = replHistory[replHistoryIdx];
      } else {
        replHistoryIdx = replHistory.length;
        replInput.value = '';
      }
    }
    e.stopPropagation();
  });
  replInput.addEventListener('keyup', e => e.stopPropagation());

  // Buttons
  runBtn.addEventListener('click', () => luaCtx.runLua(scriptArea.value));
  resetBtn.addEventListener('click', () => {
    resetShipFn();
    luaCtx.reset(ship);
    appendOutput('Ship reset to defaults.');
  });
  clearBtn.addEventListener('click', () => { outputDiv.innerHTML = ''; });

  // Examples dropdown
  exampleSelect.addEventListener('change', function () {
    if (this.value && EXAMPLES[this.value]) {
      scriptArea.value = EXAMPLES[this.value];
      saveScript(scriptArea.value);
      this.value = '';
    }
  });

  // Hide hint after a few seconds
  setTimeout(() => { hintDiv.style.transition = 'opacity 1s'; hintDiv.style.opacity = '0'; }, 5000);

  return { toggleEditor, appendOutput };
}
