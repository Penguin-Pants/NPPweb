import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { run, toggleBold } from '../src/markdown-commands.js';
import { createToolbar } from '../src/markdown-toolbar.js';

function fakeDoc() {
  return {
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
  const button = (name) => buttons.find((b) => b.attrs['aria-label'] === name);
  return { heading, buttons, button };
}

test('the toolbar has a heading select and the eight format buttons with names and tooltips', () => {
  const { heading, buttons, button } = setup(null);
  assert.equal(heading.attrs['aria-label'], 'Heading level');
  assert.deepEqual(
    heading.children.map((o) => [o.textContent, o.value]),
    [['Heading', ''], ['Normal text', '0'], ...[1, 2, 3, 4, 5, 6].map((n) => [`Heading ${n}`, String(n)])],
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

test('the heading select sets the level, then shows its placeholder again', () => {
  const view = fakeView('Title', 0, 0);
  const { heading } = setup(view);
  heading.value = '3';
  heading.fire('change');
  assert.equal(view.state.doc.toString(), '### Title');
  assert.equal(heading.value, '');
});

test('run dispatches a command and returns false when it changes nothing', () => {
  const view = fakeView('a', 0, 1);
  assert.equal(run(toggleBold)(view), true);
  assert.equal(view.state.doc.toString(), '**a**');
  assert.equal(run(() => null)(view), false);
  assert.equal(view.state.doc.toString(), '**a**');
});
