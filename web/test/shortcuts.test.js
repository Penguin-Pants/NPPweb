import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { setupShortcuts, shortcutFor } from '../src/shortcuts.js';

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

test('Cmd+W, Cmd+F and Cmd+H on macOS', () => {
  assert.equal(shortcutFor(key('KeyW', { metaKey: true }), true), 'close');
  assert.equal(shortcutFor(key('KeyF', { metaKey: true }), true), 'find');
  assert.equal(shortcutFor(key('KeyH', { metaKey: true }), true), 'replace');
});

describe('setupShortcuts', () => {
  let handler;
  let dialogOpen;
  let saved;

  beforeEach(() => {
    saved = globalThis.document;
    dialogOpen = false;
    globalThis.document = {
      addEventListener: (type, fn, options) => {
        assert.equal(type, 'keydown');
        assert.equal(options.capture, true);
        handler = fn;
      },
      querySelector: (selector) => (selector === 'dialog[open]' && dialogOpen ? {} : null),
    };
  });

  afterEach(() => {
    globalThis.document = saved;
  });

  const press = (code, mods = { ctrlKey: true }, extra = {}) => {
    const event = { ...key(code, mods), ...extra, defaultPrevented: false, stopped: false };
    event.preventDefault = () => (event.defaultPrevented = true);
    event.stopPropagation = () => (event.stopped = true);
    try {
      handler(event);
    } catch {
      // A failing action must still leave the key blocked.
    }
    return event;
  };

  const recorder = () => {
    const calls = [];
    const actions = Object.fromEntries(['new', 'close', 'save', 'find', 'replace'].map((name) => [name, () => calls.push(name)]));
    return { calls, actions };
  };

  test('each shortcut runs its action and is blocked from the browser', () => {
    const { calls, actions } = recorder();
    setupShortcuts(actions, false);
    for (const code of ['KeyN', 'KeyW', 'KeyS', 'KeyF', 'KeyH']) {
      const event = press(code);
      assert.equal(event.defaultPrevented, true, code);
      assert.equal(event.stopped, true, code);
    }
    assert.deepEqual(calls, ['new', 'close', 'save', 'find', 'replace']);
  });

  test('preventDefault runs before an action that throws', () => {
    setupShortcuts({ close: () => { throw new Error('boom'); } }, false);
    assert.equal(press('KeyW').defaultPrevented, true);
  });

  test('while a dialog is open, every shortcut is blocked but does nothing', () => {
    const { calls, actions } = recorder();
    setupShortcuts(actions, false);
    dialogOpen = true;
    for (const code of ['KeyN', 'KeyW', 'KeyS', 'KeyF', 'KeyH']) assert.equal(press(code).defaultPrevented, true, code);
    assert.equal(press('KeyN', { altKey: true }).defaultPrevented, true);
    assert.deepEqual(calls, []);
  });

  test('a held key runs its action once', () => {
    const { calls, actions } = recorder();
    setupShortcuts(actions, false);
    press('KeyN', { altKey: true });
    const repeated = press('KeyN', { altKey: true }, { repeat: true });
    assert.equal(repeated.defaultPrevented, true);
    assert.deepEqual(calls, ['new']);
  });

  test('other keys pass through untouched', () => {
    const { calls, actions } = recorder();
    setupShortcuts(actions, false);
    assert.equal(press('KeyZ').defaultPrevented, false);
    assert.deepEqual(calls, []);
  });
});
