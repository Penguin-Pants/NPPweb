import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTheme, readTheme } from '../src/theme.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}
const throwingStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

test('the theme is dark when nothing is stored', () => {
  assert.equal(readTheme(() => fakeStorage()), 'dark');
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => fakeStorage(), root });
  assert.equal(theme.get(), 'dark');
  assert.equal(root.dataset.theme, 'dark');
});

test('a stored light choice is used', () => {
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => fakeStorage({ 'pn.theme': 'light' }), root });
  assert.equal(theme.get(), 'light');
  assert.equal(root.dataset.theme, 'light');
});

test('an unknown stored value falls back to dark', () => {
  assert.equal(readTheme(() => fakeStorage({ 'pn.theme': 'purple' })), 'dark');
});

test('blocked storage falls back to dark and toggling still works', () => {
  assert.equal(readTheme(() => throwingStorage), 'dark');
  assert.equal(
    readTheme(() => {
      throw new Error('no storage');
    }),
    'dark',
  );
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => throwingStorage, root });
  assert.equal(theme.toggle(), 'light');
  assert.equal(root.dataset.theme, 'light');
});

test('toggle switches the theme, stores it and reports it', () => {
  const storage = fakeStorage();
  const root = { dataset: {} };
  const changes = [];
  const theme = createTheme({ getStorage: () => storage, root, onChange: (value) => changes.push(value) });
  assert.equal(theme.toggle(), 'light');
  assert.equal(storage.data.get('pn.theme'), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(theme.toggle(), 'dark');
  assert.equal(storage.data.get('pn.theme'), 'dark');
  assert.deepEqual(changes, ['light', 'dark']);
});
