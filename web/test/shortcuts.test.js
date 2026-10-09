import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortcutFor } from '../src/shortcuts.js';

const key = (code, mods = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

test('Ctrl shortcuts on Windows and Linux', () => {
  const expected = { KeyN: 'new', KeyW: 'close', KeyS: 'save', KeyF: 'find', KeyH: 'replace' };
  for (const [code, action] of Object.entries(expected)) {
    assert.equal(shortcutFor(key(code, { ctrlKey: true }), false), action, code);
  }
});

test('Cmd shortcuts on macOS, and Ctrl does nothing there', () => {
  assert.equal(shortcutFor(key('KeyS', { metaKey: true }), true), 'save');
  assert.equal(shortcutFor(key('KeyN', { metaKey: true }), true), 'new');
  assert.equal(shortcutFor(key('KeyS', { ctrlKey: true }), true), null);
  assert.equal(shortcutFor(key('KeyS', { metaKey: true }), false), null);
});

test('Alt+N and Alt+W work on every platform, matched by key position', () => {
  for (const mac of [false, true]) {
    assert.equal(shortcutFor(key('KeyN', { altKey: true }), mac), 'new');
    assert.equal(shortcutFor(key('KeyW', { altKey: true }), mac), 'close');
    assert.equal(shortcutFor(key('KeyS', { altKey: true }), mac), null);
  }
});

test('Shift, AltGr and other keys are left alone', () => {
  assert.equal(shortcutFor(key('KeyN', { ctrlKey: true, shiftKey: true }), false), null);
  assert.equal(shortcutFor(key('KeyN', { altKey: true, shiftKey: true }), false), null);
  assert.equal(shortcutFor(key('KeyN', { ctrlKey: true, altKey: true }), false), null);
  assert.equal(shortcutFor(key('KeyT', { ctrlKey: true }), false), null);
  assert.equal(shortcutFor(key('KeyN'), false), null);
});
