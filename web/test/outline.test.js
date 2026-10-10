import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutline, formatCounts } from '../src/outline.js';

function fakeDoc() {
  const doc = {
    activeElement: null,
    createElement(tag) {
      const listeners = {};
      const node = {
        tag,
        parent: null,
        children: [],
        attrs: {},
        className: '',
        textContent: '',
        hidden: false,
        append: (...items) => {
          for (const item of items) item.parent = node;
          node.children.push(...items);
        },
        remove: () => {
          node.parent.children = node.parent.children.filter((child) => child !== node);
          node.parent = null;
        },
        contains: (other) => {
          for (let item = other; item; item = item.parent) if (item === node) return true;
          return false;
        },
        setAttribute: (key, value) => (node.attrs[key] = value),
        removeAttribute: (key) => delete node.attrs[key],
        addEventListener: (type, handler) => (listeners[type] ??= []).push(handler),
        fire: (type, event = {}) => (listeners[type] ?? []).forEach((handler) => handler(event)),
        click: () => node.fire('click'),
        focus: () => {
          doc.activeElement = node;
          node.fire('focus');
        },
      };
      return node;
    },
  };
  return doc;
}

function setup() {
  const doc = fakeDoc();
  const outside = doc.createElement('textarea');
  const element = doc.createElement('div');
  const selected = [];
  const outline = createOutline({ element, onSelect: (pos) => selected.push(pos), doc });
  const [message, list] = element.children;
  const entries = () => list.children.map((item) => item.children[0]);
  return { doc, outline, message, list, entries, selected, outside };
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

test('no entry is current before the first heading (OUT-4)', () => {
  const { outline, entries } = setup();
  outline.show([{ level: 1, text: 'Late', from: 10 }]);
  outline.setActive(3);
  assert.equal(entries()[0].attrs['aria-current'], undefined);
});

test('map moves the entries with an edit, so a click before the next refresh finds the heading (OUT-3)', () => {
  const { outline, entries, selected } = setup();
  outline.show(HEADINGS);
  outline.map((pos) => (pos >= 5 ? pos + 3 : pos));
  entries()[1].click();
  assert.deepEqual(selected, [13]);
  outline.setActive(12);
  assert.deepEqual(entries().map((e) => e.attrs['aria-current'] ?? null), ['location', null, null]);
});

test('new headings reuse the entries in place, so focus stays and nothing flickers (NFR-5)', () => {
  const { doc, outline, entries } = setup();
  outline.show(HEADINGS);
  const before = entries();
  before[1].focus();
  outline.show([{ level: 1, text: 'One', from: 0 }, { level: 2, text: 'Deeper', from: 11 }, ...HEADINGS.slice(2), { level: 4, text: 'Four', from: 30 }]);
  const after = entries();
  assert.deepEqual(after.slice(0, 3), before);
  assert.deepEqual(
    after.map((e) => [e.textContent, e.className]),
    [
      ['One', 'outline-entry outline-l1'],
      ['Deeper', 'outline-entry outline-l2'],
      ['(empty heading)', 'outline-entry outline-l2'],
      ['Four', 'outline-entry outline-l4'],
    ],
  );
  assert.equal(doc.activeElement, before[1]);
  outline.show(HEADINGS.slice(0, 1));
  assert.deepEqual(entries(), before.slice(0, 1));
});

test('the list is one tab stop and the arrow keys, Home and End move between entries (NFR-5)', () => {
  const { doc, outline, list, entries, outside } = setup();
  outline.show(HEADINGS);
  const stops = () => entries().map((e) => e.attrs.tabindex);
  assert.deepEqual(stops(), ['0', '-1', '-1']);
  outside.focus();
  outline.setActive(15);
  assert.deepEqual(stops(), ['-1', '0', '-1'], 'the tab stop follows the current section');
  entries()[1].focus();
  const press = (key) => {
    let prevented = false;
    list.fire('keydown', { key, preventDefault: () => (prevented = true) });
    return prevented;
  };
  assert.equal(press('ArrowDown'), true);
  assert.equal(doc.activeElement, entries()[2]);
  assert.deepEqual(stops(), ['-1', '-1', '0']);
  press('ArrowDown');
  assert.equal(doc.activeElement, entries()[2]);
  press('Home');
  assert.equal(doc.activeElement, entries()[0]);
  press('ArrowUp');
  assert.equal(doc.activeElement, entries()[0]);
  press('End');
  assert.equal(doc.activeElement, entries()[2]);
  outline.setActive(0);
  assert.deepEqual(stops(), ['-1', '-1', '0'], 'the tab stop stays on the focused entry');
  assert.equal(press('a'), false);
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
