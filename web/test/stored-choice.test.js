import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStoredChoice, readChoice } from '../src/stored-choice.js';

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
const MODE = { key: 'pn.markdownMode', values: ['visual', 'raw'] };

test('readChoice gives the stored value, else the first value, also for blocked storage', () => {
  assert.equal(readChoice({ ...MODE, getStorage: () => fakeStorage({ 'pn.markdownMode': 'raw' }) }), 'raw');
  assert.equal(readChoice({ ...MODE, getStorage: () => fakeStorage({ 'pn.markdownMode': 'other' }) }), 'visual');
  assert.equal(readChoice({ ...MODE, getStorage: () => throwingStorage }), 'visual');
  assert.equal(
    readChoice({
      ...MODE,
      getStorage: () => {
        throw new Error('no storage');
      },
    }),
    'visual',
  );
});

test('the first value is the default (MDV-2, CNT-2)', () => {
  assert.equal(createStoredChoice({ ...MODE, getStorage: () => fakeStorage() }).get(), 'visual');
  assert.equal(
    createStoredChoice({ key: 'pn.countSyntax', values: ['excluded', 'included'], getStorage: () => fakeStorage() }).get(),
    'excluded',
  );
});

test('a stored second value is used, and an unknown value means the first', () => {
  assert.equal(createStoredChoice({ ...MODE, getStorage: () => fakeStorage({ 'pn.markdownMode': 'raw' }) }).get(), 'raw');
  assert.equal(createStoredChoice({ ...MODE, getStorage: () => fakeStorage({ 'pn.markdownMode': 'wysiwyg' }) }).get(), 'visual');
});

test('toggle switches the value, stores it and reports it', () => {
  const storage = fakeStorage();
  const seen = [];
  const choice = createStoredChoice({ ...MODE, getStorage: () => storage, onChange: (next) => seen.push(next) });
  assert.equal(choice.toggle(), 'raw');
  assert.equal(storage.data.get('pn.markdownMode'), 'raw');
  assert.equal(choice.toggle(), 'visual');
  assert.deepEqual(seen, ['raw', 'visual']);
});

test('blocked storage falls back to the first value and toggling still works', () => {
  const choice = createStoredChoice({ ...MODE, getStorage: () => throwingStorage });
  assert.equal(choice.get(), 'visual');
  assert.equal(choice.toggle(), 'raw');
  assert.equal(choice.get(), 'raw');
});
