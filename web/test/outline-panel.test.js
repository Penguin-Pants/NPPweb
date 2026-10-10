import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutlinePanel, readOutlineOpen } from '../src/outline-panel.js';

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

function fakeElements() {
  const attrs = {};
  let onClick;
  return {
    root: { dataset: {} },
    toggle: {
      setAttribute: (name, value) => (attrs[name] = value),
      addEventListener: (type, handler) => type === 'click' && (onClick = handler),
      click: () => onClick(),
      attrs,
    },
  };
}

test('readOutlineOpen is true unless closed is stored, and true when storage is blocked', () => {
  assert.equal(readOutlineOpen(() => fakeStorage()), true);
  assert.equal(readOutlineOpen(() => fakeStorage({ 'pn.outline': 'closed' })), false);
  assert.equal(readOutlineOpen(() => fakeStorage({ 'pn.outline': 'sideways' })), true);
  assert.equal(readOutlineOpen(() => throwingStorage), true);
});

test('the panel is open on the first visit', () => {
  const { root, toggle } = fakeElements();
  createOutlinePanel({ getStorage: () => fakeStorage(), root, toggle });
  assert.equal(root.dataset.outline, 'open');
  assert.equal(toggle.attrs['aria-expanded'], 'true');
});

test('a stored closed state closes the panel', () => {
  const { root, toggle } = fakeElements();
  createOutlinePanel({ getStorage: () => fakeStorage({ 'pn.outline': 'closed' }), root, toggle });
  assert.equal(root.dataset.outline, 'closed');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
});

test('a click on the toggle switches the panel and stores the state', () => {
  const storage = fakeStorage();
  const { root, toggle } = fakeElements();
  createOutlinePanel({ getStorage: () => storage, root, toggle });
  toggle.click();
  assert.equal(root.dataset.outline, 'closed');
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  assert.equal(storage.data.get('pn.outline'), 'closed');
  toggle.click();
  assert.equal(root.dataset.outline, 'open');
  assert.equal(storage.data.get('pn.outline'), 'open');
});

test('blocked storage keeps the panel open and the toggle still works', () => {
  const { root, toggle } = fakeElements();
  createOutlinePanel({ getStorage: () => throwingStorage, root, toggle });
  assert.equal(root.dataset.outline, 'open');
  toggle.click();
  assert.equal(root.dataset.outline, 'closed');
});
