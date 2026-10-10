import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createDropdown } from '../src/dropdown.js';

// Minimal fakes. Each element has a document order, so compareDocumentPosition works.
function fakeDoc() {
  const listeners = {};
  const doc = {
    activeElement: null,
    body: { name: 'body' },
    addEventListener: (type, handler) => (listeners[type] ??= []).push(handler),
    dispatch(type, event) {
      for (const handler of listeners[type] ?? []) handler(event);
    },
  };
  return doc;
}

let order = 0;
function fakeEl(doc, name, { inDialog = false } = {}) {
  const listeners = {};
  const el = {
    name,
    order: (order += 1),
    attrs: {},
    hidden: true,
    setAttribute: (key, value) => (el.attrs[key] = value),
    addEventListener: (type, handler) => (listeners[type] ??= []).push(handler),
    fire: (type, event = {}) => Promise.all((listeners[type] ?? []).map((handler) => handler(event))),
    focus: () => (doc.activeElement = el),
    closest: (selector) => (selector === 'dialog' && inDialog ? {} : null),
    compareDocumentPosition: (other) => (other.order > el.order ? 4 : 2),
  };
  return el;
}

function setup({ onOpen } = {}) {
  const doc = fakeDoc();
  const button = fakeEl(doc, 'button');
  const panel = fakeEl(doc, 'panel');
  const items = [fakeEl(doc, 'item0'), fakeEl(doc, 'other0'), fakeEl(doc, 'item1'), fakeEl(doc, 'item2')];
  const inside = new Set([button, panel, ...items]);
  const root = { ...fakeEl(doc, 'root'), contains: (node) => inside.has(node) };
  const itemList = [items[0], items[2], items[3]];
  const dropdown = createDropdown({ root, button, panel, items: () => itemList, onOpen, doc });
  const key = (target, k) => {
    const event = { key: k, target, prevented: false, preventDefault: () => (event.prevented = true) };
    return event;
  };
  return { doc, button, panel, items, itemList, root, dropdown, key };
}

const open = [];
afterEach(() => {
  for (const dropdown of open.splice(0)) dropdown.close();
});

test('the button opens and closes the panel and sets aria-expanded', async () => {
  let opened = 0;
  const { button, panel, dropdown } = setup({ onOpen: () => (opened += 1) });
  open.push(dropdown);
  await button.fire('click');
  assert.equal(panel.hidden, false);
  assert.equal(button.attrs['aria-expanded'], 'true');
  assert.equal(opened, 1);
  await button.fire('click');
  assert.equal(panel.hidden, true);
  assert.equal(button.attrs['aria-expanded'], 'false');
});

test('a press outside closes it, a press inside or in a dialog does not', () => {
  const { doc, items, dropdown } = setup();
  open.push(dropdown);
  dropdown.open();
  doc.dispatch('pointerdown', { target: items[0] });
  assert.equal(dropdown.isOpen(), true);
  doc.dispatch('pointerdown', { target: fakeEl(doc, 'dialog button', { inDialog: true }) });
  assert.equal(dropdown.isOpen(), true);
  doc.dispatch('pointerdown', { target: fakeEl(doc, 'tab') });
  assert.equal(dropdown.isOpen(), false);
});

test('Escape closes it from anywhere and returns the focus only from the panel or nowhere', () => {
  const { doc, button, items, dropdown, key } = setup();
  open.push(dropdown);
  dropdown.open();
  items[0].focus();
  const fromPanel = key(items[0], 'Escape');
  doc.dispatch('keydown', fromPanel);
  assert.equal(dropdown.isOpen(), false);
  assert.equal(fromPanel.prevented, true);
  assert.equal(doc.activeElement, button);

  dropdown.open();
  doc.activeElement = doc.body;
  doc.dispatch('keydown', key(doc.body, 'Escape'));
  assert.equal(dropdown.isOpen(), false);
  assert.equal(doc.activeElement, button);

  const editor = fakeEl(doc, 'editor');
  dropdown.open();
  editor.focus();
  doc.dispatch('keydown', key(editor, 'Escape'));
  assert.equal(dropdown.isOpen(), false);
  assert.equal(doc.activeElement, editor);
});

test('Escape in a dialog or while closed does nothing', () => {
  const { doc, dropdown, key } = setup();
  open.push(dropdown);
  const closedEvent = key(doc.body, 'Escape');
  doc.dispatch('keydown', closedEvent);
  assert.equal(closedEvent.prevented, false);
  dropdown.open();
  doc.dispatch('keydown', key(fakeEl(doc, 'field', { inDialog: true }), 'Escape'));
  assert.equal(dropdown.isOpen(), true);
});

test('ArrowDown on the closed button opens it after onOpen and focuses the first item', async () => {
  let loaded = false;
  const { button, root, itemList, dropdown, key, doc } = setup({
    onOpen: () => new Promise((resolve) => setImmediate(() => resolve((loaded = true)))),
  });
  open.push(dropdown);
  button.focus();
  await root.fire('keydown', key(button, 'ArrowDown'));
  assert.equal(loaded, true);
  assert.equal(dropdown.isOpen(), true);
  assert.equal(doc.activeElement, itemList[0]);
});

test('arrow keys wrap around the items', async () => {
  const { root, itemList, dropdown, key, doc } = setup();
  open.push(dropdown);
  dropdown.open();
  itemList[2].focus();
  await root.fire('keydown', key(itemList[2], 'ArrowDown'));
  assert.equal(doc.activeElement, itemList[0]);
  await root.fire('keydown', key(itemList[0], 'ArrowUp'));
  assert.equal(doc.activeElement, itemList[2]);
});

test('from another control in the panel, arrows go to the next or previous item', async () => {
  const { root, items, itemList, dropdown, key, doc } = setup();
  open.push(dropdown);
  dropdown.open();
  items[1].focus(); // between item0 and item1, like a Rename button
  await root.fire('keydown', key(items[1], 'ArrowDown'));
  assert.equal(doc.activeElement, itemList[1]);
  items[1].focus();
  await root.fire('keydown', key(items[1], 'ArrowUp'));
  assert.equal(doc.activeElement, itemList[0]);
});

test('ArrowUp from the button goes to the last item', async () => {
  const { button, root, itemList, dropdown, key, doc } = setup();
  open.push(dropdown);
  button.focus();
  await root.fire('keydown', key(button, 'ArrowUp'));
  assert.equal(doc.activeElement, itemList[2]);
});

test('arrows with no items do nothing', async () => {
  const doc = fakeDoc();
  const button = fakeEl(doc, 'button');
  const panel = fakeEl(doc, 'panel');
  const root = { ...fakeEl(doc, 'root'), contains: () => true };
  const dropdown = createDropdown({ root, button, panel, items: () => [], doc });
  open.push(dropdown);
  button.focus();
  await root.fire('keydown', { key: 'ArrowDown', target: button, preventDefault() {} });
  assert.equal(dropdown.isOpen(), true);
  assert.equal(doc.activeElement, button);
});

test('opening one dropdown closes the other', () => {
  const first = setup();
  const second = setup();
  open.push(first.dropdown, second.dropdown);
  first.dropdown.open();
  second.dropdown.open();
  assert.equal(first.dropdown.isOpen(), false);
  assert.equal(first.button.attrs['aria-expanded'], 'false');
  assert.equal(second.dropdown.isOpen(), true);
});

test('a click outside closes it too, as the Enter key on another button makes one without a press (LAY-4)', () => {
  const { doc, items, dropdown } = setup();
  open.push(dropdown);
  dropdown.open();
  doc.dispatch('click', { target: items[0] });
  doc.dispatch('click', { target: fakeEl(doc, 'dialog button', { inDialog: true }) });
  assert.equal(dropdown.isOpen(), true);
  doc.dispatch('click', { target: fakeEl(doc, 'New') });
  assert.equal(dropdown.isOpen(), false);
});

test('an arrow-key open that Escape closes before the list arrives leaves the focus alone', async () => {
  let finish;
  const { doc, root, button, dropdown, key } = setup({ onOpen: () => new Promise((resolve) => (finish = resolve)) });
  open.push(dropdown);
  button.focus();
  const opening = root.fire('keydown', key(button, 'ArrowDown'));
  doc.dispatch('keydown', key(button, 'Escape'));
  finish();
  await opening;
  assert.equal(dropdown.isOpen(), false);
  assert.equal(doc.activeElement, button);
});
