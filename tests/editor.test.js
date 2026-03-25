import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveScript } from '../src/storage.js';
import { createEditor, EXAMPLES } from '../src/editor.js';

function makeDOM() {
  document.body.innerHTML = `
    <div id="editor"></div>
    <textarea id="script-input">default content</textarea>
    <select id="example-select">
      <option value="">Load example...</option>
      <option value="color">Change ship color</option>
    </select>
    <button id="run-btn"></button>
    <button id="clear-btn"></button>
    <button id="clear-data-btn"></button>
  `;
  return {
    editor: document.getElementById('editor'),
    scriptArea: document.getElementById('script-input'),
    exampleSelect: document.getElementById('example-select'),
    runBtn: document.getElementById('run-btn'),
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
    createEditor(elements, makeLuaCtx(), vi.fn());
    expect(elements.scriptArea.value).toBe('restored content');
  });

  it('preserves default textarea content when no script is saved', () => {
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), vi.fn());
    expect(elements.scriptArea.value).toBe('default content');
  });

  it('saves script when example is loaded', () => {
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), vi.fn());

    elements.exampleSelect.value = 'color';
    elements.exampleSelect.dispatchEvent(new Event('change'));

    expect(localStorage.getItem('spacewar:script')).toBe(EXAMPLES.color);
  });

  it('auto-saves script on input after debounce', () => {
    vi.useFakeTimers();
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), vi.fn());

    elements.scriptArea.value = 'edited content';
    elements.scriptArea.dispatchEvent(new Event('input'));

    expect(localStorage.getItem('spacewar:script')).toBeNull();

    vi.advanceTimersByTime(500);
    expect(localStorage.getItem('spacewar:script')).toBe('edited content');

    vi.useRealTimers();
  });

  it('clears saved data when clear data button is clicked', () => {
    saveScript('some script');
    const elements = makeDOM();
    createEditor(elements, makeLuaCtx(), vi.fn());

    elements.clearDataBtn.click();

    expect(localStorage.getItem('spacewar:script')).toBeNull();
  });
});
