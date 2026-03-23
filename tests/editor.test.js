import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveReplHistory, saveScript } from '../src/storage.js';
import { createEditor, EXAMPLES } from '../src/editor.js';

function makeDOM() {
  document.body.innerHTML = `
    <div id="editor"></div>
    <textarea id="script-input">default content</textarea>
    <div id="output"></div>
    <div id="hint"></div>
    <input id="repl-input" type="text">
    <select id="example-select">
      <option value="">Load example...</option>
      <option value="color">Change ship color</option>
    </select>
    <button id="run-btn"></button>
    <button id="reset-btn"></button>
    <button id="clear-btn"></button>
    <button id="clear-data-btn"></button>
  `;
  return {
    editor: document.getElementById('editor'),
    scriptArea: document.getElementById('script-input'),
    outputDiv: document.getElementById('output'),
    hintDiv: document.getElementById('hint'),
    replInput: document.getElementById('repl-input'),
    exampleSelect: document.getElementById('example-select'),
    runBtn: document.getElementById('run-btn'),
    resetBtn: document.getElementById('reset-btn'),
    clearBtn: document.getElementById('clear-btn'),
    clearDataBtn: document.getElementById('clear-data-btn'),
  };
}

function makeLuaCtx() {
  return {
    runLua: vi.fn(),
    runLuaREPL: vi.fn(),
    reset: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('editor storage integration', () => {
  it('restores saved script content on creation', () => {
    saveScript('restored content');
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());
    expect(elements.scriptArea.value).toBe('restored content');
  });

  it('preserves default textarea content when no script is saved', () => {
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());
    expect(elements.scriptArea.value).toBe('default content');
  });

  it('restores REPL history so arrow-up recalls last command', () => {
    saveReplHistory(['cmd1', 'cmd2']);
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());

    // Simulate ArrowUp
    elements.replInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true }));
    expect(elements.replInput.value).toBe('cmd2');
  });

  it('persists REPL command on Enter', () => {
    vi.useFakeTimers();
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());

    elements.replInput.value = 'test-cmd';
    elements.replInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    vi.advanceTimersByTime(300);

    const stored = JSON.parse(localStorage.getItem('spacewar:repl-history'));
    expect(stored).toContain('test-cmd');
    vi.useRealTimers();
  });

  it('skips consecutive duplicate REPL commands in history', () => {
    vi.useFakeTimers();
    const elements = makeDOM();
    const luaCtx = makeLuaCtx();
    createEditor(elements, luaCtx, {}, vi.fn(), vi.fn());

    for (let i = 0; i < 3; i++) {
      elements.replInput.value = 'same-cmd';
      elements.replInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    }
    vi.advanceTimersByTime(300);

    expect(luaCtx.runLuaREPL).toHaveBeenCalledTimes(3);
    const stored = JSON.parse(localStorage.getItem('spacewar:repl-history'));
    expect(stored.filter(c => c === 'same-cmd')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('saves script when example is loaded', () => {
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());

    elements.exampleSelect.value = 'color';
    elements.exampleSelect.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('spacewar:script')).toBe(EXAMPLES.color);
  });

  it('auto-saves script on input after debounce', () => {
    vi.useFakeTimers();
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());

    elements.scriptArea.value = 'edited content';
    elements.scriptArea.dispatchEvent(new Event('input'));

    expect(localStorage.getItem('spacewar:script')).toBeNull();

    vi.advanceTimersByTime(500);
    expect(localStorage.getItem('spacewar:script')).toBe('edited content');

    vi.useRealTimers();
  });

  it('clears saved data when clear data button is clicked', () => {
    saveReplHistory(['cmd1']);
    saveScript('some script');
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), {}, vi.fn(), vi.fn());

    elements.clearDataBtn.click();

    expect(localStorage.getItem('spacewar:repl-history')).toBeNull();
    expect(localStorage.getItem('spacewar:script')).toBeNull();
  });
});
