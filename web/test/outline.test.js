import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutline, formatCounts } from '../src/outline.js';

function fakeDoc() {
  return {
    createElement(tag) {
      const listeners = {};
      const node = {
        tag,
        children: [],
        attrs: {},
        className: '',
        textContent: '',
        hidden: false,
        append: (...items) => node.children.push(...items),
        replaceChildren: (...items) => (node.children = items),
        setAttribute: (key, value) => (node.attrs[key] = value),
        removeAttribute: (key) => delete node.attrs[key],
        addEventListener: (type, handler) => (listeners[type] = handler),
        click: () => listeners.click?.(),
      };
      return node;
    },
  };
}

function setup() {
  const doc = fakeDoc();
  const element = doc.createElement('div');
  const selected = [];
  const outline = createOutline({ element, onSelect: (pos) => selected.push(pos), doc });
  const [message, list] = element.children;
  const entries = () => list.children.map((item) => item.children[0]);
  return { outline, message, list, entries, selected };
}

const HEADINGS = [
  { level: 1, text: 'One', from: 0 },
  { level: 3, text: 'Deep', from: 10 },
  { level: 2, text: '', from: 20 },
];

test('headings show in order, indented by level, and an empty heading gets a label (OUT-1)', () => {
  const { outline, message, list, entries } = setup();
  outline.show(HEADINGS);
  assert.equal(message.hidden, true);
  assert.equal(list.hidden, false);
  assert.deepEqual(
    entries().map((e) => [e.textContent, e.className]),
    [
      ['One', 'outline-entry outline-l1'],
      ['Deep', 'outline-entry outline-l3'],
      ['(empty heading)', 'outline-entry outline-l2'],
    ],
  );
});

test('a click on an entry selects its heading position (OUT-3)', () => {
  const { outline, entries, selected } = setup();
  outline.show(HEADINGS);
  entries()[1].click();
  assert.deepEqual(selected, [10]);
});

test('the entry of the section that holds the cursor is marked current (OUT-4)', () => {
  const { outline, entries } = setup();
  outline.show(HEADINGS);
  outline.setActive(15);
  assert.deepEqual(entries().map((e) => e.attrs['aria-current'] ?? null), [null, 'location', null]);
  outline.setActive(25);
  assert.deepEqual(entries().map((e) => e.attrs['aria-current'] ?? null), [null, null, 'location']);
  outline.setActive(0);
  assert.deepEqual(entries().map((e) => e.attrs['aria-current'] ?? null), ['location', null, null]);
});

test('the panel explains a non-Markdown tab, a Markdown tab without headings and shows nothing with no tab (OUT-6)', () => {
  const { outline, message, list } = setup();
  outline.show(null);
  assert.equal(message.hidden, false);
  assert.equal(message.textContent, 'Outline is available for Markdown documents.');
  assert.equal(list.hidden, true);
  outline.show([]);
  assert.equal(message.textContent, 'No headings.');
  outline.show(undefined);
  assert.equal(message.hidden, true);
  assert.equal(list.hidden, true);
});

test('formatCounts uses singular and plural forms', () => {
  assert.equal(formatCounts({ words: 1, characters: 1 }), '1 word · 1 character');
  assert.equal(formatCounts({ words: 0, characters: 12 }), '0 words · 12 characters');
  assert.equal(formatCounts({ words: 1234, characters: 56789 }), '1,234 words · 56,789 characters');
});
