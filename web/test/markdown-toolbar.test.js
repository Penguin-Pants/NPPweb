import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { run, toggleBold } from '../src/markdown-commands.js';
import { createToolbar } from '../src/markdown-toolbar.js';

function fakeDoc() {
  return {
    activeElement: null,
    body: {},
    addEventListener() {},
    createElement(tag) {
      const listeners = {};
      const node = {
        tag,
        children: [],
        attrs: {},
        value: '',
        textContent: '',
        title: '',
        className: '',
        append: (...items) => node.children.push(...items),
        setAttribute: (key, value) => (node.attrs[key] = value),
        addEventListener: (type, handler) => (listeners[type] = handler),
        fire: (type, event = { preventDefault() {} }) => listeners[type]?.(event),
        focus() {},
      };
      return node;
    },
  };
}

/** A view stand-in: dispatch applies the transaction. */
function fakeView(doc, from, to) {
  const view = {
    state: EditorState.create({ doc, selection: EditorSelection.single(from, to) }),
    focused: false,
    dispatch: (tr) => (view.state = tr.state),
    focus: () => (view.focused = true),
  };
  return view;
}

function setup(view) {
  const doc = fakeDoc();
  const element = doc.createElement('div');
  createToolbar({ element, getView: () => view, modName: 'Ctrl', doc });
  const [heading, ...buttons] = element.children;
  const [headingButton, headingMenu] = heading.children;
  const button = (name) => buttons.find((b) => b.attrs['aria-label'] === name);
  const level = (label) => headingMenu.children.find((item) => item.textContent === label);
  return { headingButton, headingMenu, buttons, button, level };
}

test('the toolbar has a heading menu and the eight format buttons with names and tooltips', () => {
  const { headingButton, headingMenu, buttons, button } = setup(null);
  assert.equal(headingButton.textContent, 'Heading');
  assert.equal(headingMenu.attrs['aria-label'], 'Heading level');
  assert.equal(headingMenu.hidden, true);
  assert.deepEqual(
    headingMenu.children.map((item) => item.textContent),
    ['Normal text', ...[1, 2, 3, 4, 5, 6].map((n) => `Heading ${n}`)],
  );
  assert.deepEqual(
    buttons.map((b) => b.attrs['aria-label']),
    ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link', 'Quote', 'Inline code', 'Code block'],
  );
  assert.equal(button('Bold').title, 'Bold (Ctrl+B)');
  assert.equal(button('Link').title, 'Link (Ctrl+K)');
  assert.equal(button('Quote').title, 'Quote');
});

test('a button applies its command to the view and gives the focus back', () => {
  const view = fakeView('word', 0, 4);
  const { button } = setup(view);
  button('Italic').fire('click');
  assert.equal(view.state.doc.toString(), '*word*');
  assert.equal(view.focused, true);
});

test('a button press keeps the editor focus, and does nothing with no view', () => {
  let prevented = false;
  const { button } = setup(null);
  button('Bold').fire('mousedown', { preventDefault: () => (prevented = true) });
  assert.equal(prevented, true);
  button('Bold').fire('click');
});

test('a heading menu item sets the level and closes the menu', () => {
  const view = fakeView('## Title', 0, 0);
  const { headingButton, headingMenu, level } = setup(view);
  headingButton.fire('click');
  assert.equal(headingMenu.hidden, false);
  level('Heading 3').fire('click');
  assert.equal(view.state.doc.toString(), '### Title');
  assert.equal(headingMenu.hidden, true);
  assert.equal(view.focused, true);
  level('Normal text').fire('click');
  assert.equal(view.state.doc.toString(), 'Title');
});

test('run dispatches a command and returns false when it changes nothing', () => {
  const view = fakeView('a', 0, 1);
  assert.equal(run(toggleBold)(view), true);
  assert.equal(view.state.doc.toString(), '**a**');
  assert.equal(run(() => null)(view), false);
  assert.equal(view.state.doc.toString(), '**a**');
});
