import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarkdownMode } from '../src/markdown-mode.js';

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

test('the mode is visual on the first visit (MDV-2)', () => {
  assert.equal(createMarkdownMode({ getStorage: () => fakeStorage() }).get(), 'visual');
});

test('a stored raw choice is used, and an unknown value means visual', () => {
  assert.equal(createMarkdownMode({ getStorage: () => fakeStorage({ 'pn.markdownMode': 'raw' }) }).get(), 'raw');
  assert.equal(createMarkdownMode({ getStorage: () => fakeStorage({ 'pn.markdownMode': 'wysiwyg' }) }).get(), 'visual');
});

test('toggle switches the mode, stores it and reports it', () => {
  const storage = fakeStorage();
  const seen = [];
  const mode = createMarkdownMode({ getStorage: () => storage, onChange: (next) => seen.push(next) });
  assert.equal(mode.toggle(), 'raw');
  assert.equal(storage.data.get('pn.markdownMode'), 'raw');
  assert.equal(mode.toggle(), 'visual');
  assert.deepEqual(seen, ['raw', 'visual']);
});

test('blocked storage falls back to visual and toggling still works', () => {
  const mode = createMarkdownMode({ getStorage: () => throwingStorage });
  assert.equal(mode.get(), 'visual');
  assert.equal(mode.toggle(), 'raw');
  assert.equal(mode.get(), 'raw');
});
