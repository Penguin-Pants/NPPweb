import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutlinePanel, OUTLINE } from '../src/outline-panel.js';
import { readChoice } from '../src/stored-choice.js';

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

test('the stored panel state is open unless closed is stored, and open when storage is blocked', () => {
  const read = (storage) => readChoice({ ...OUTLINE, getStorage: () => storage });
  assert.equal(read(fakeStorage()), 'open');
  assert.equal(read(fakeStorage({ 'pn.outline': 'closed' })), 'closed');
  assert.equal(read(fakeStorage({ 'pn.outline': 'sideways' })), 'open');
  assert.equal(read(throwingStorage), 'open');
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
