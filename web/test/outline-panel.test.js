import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutlinePanel } from '../src/outline-panel.js';

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
    panel: { hidden: true },
    toggle: {
      setAttribute: (name, value) => (attrs[name] = value),
      addEventListener: (type, handler) => type === 'click' && (onClick = handler),
      click: () => onClick(),
      attrs,
    },
  };
}

test('the panel is open on the first visit', () => {
  const { panel, toggle } = fakeElements();
  const outline = createOutlinePanel({ getStorage: () => fakeStorage(), panel, toggle });
  assert.equal(outline.isOpen(), true);
  assert.equal(panel.hidden, false);
  assert.equal(toggle.attrs['aria-expanded'], 'true');
});

test('a stored closed state hides the panel', () => {
  const { panel, toggle } = fakeElements();
  const outline = createOutlinePanel({ getStorage: () => fakeStorage({ 'pn.outline': 'closed' }), panel, toggle });
  assert.equal(outline.isOpen(), false);
  assert.equal(panel.hidden, true);
  assert.equal(toggle.attrs['aria-expanded'], 'false');
});

test('an unknown stored value counts as open', () => {
  const { panel, toggle } = fakeElements();
  createOutlinePanel({ getStorage: () => fakeStorage({ 'pn.outline': 'sideways' }), panel, toggle });
  assert.equal(panel.hidden, false);
});

test('a click on the toggle switches the panel and stores the state', () => {
  const storage = fakeStorage();
  const { panel, toggle } = fakeElements();
  const outline = createOutlinePanel({ getStorage: () => storage, panel, toggle });
  toggle.click();
  assert.equal(outline.isOpen(), false);
  assert.equal(panel.hidden, true);
  assert.equal(toggle.attrs['aria-expanded'], 'false');
  assert.equal(storage.data.get('pn.outline'), 'closed');
  toggle.click();
  assert.equal(panel.hidden, false);
  assert.equal(storage.data.get('pn.outline'), 'open');
});

test('blocked storage keeps the panel open and the toggle still works', () => {
  const { panel, toggle } = fakeElements();
  const outline = createOutlinePanel({ getStorage: () => throwingStorage, panel, toggle });
  assert.equal(outline.isOpen(), true);
  toggle.click();
  assert.equal(panel.hidden, true);
});
