import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import {
  insertLink,
  setHeading,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleQuote,
} from '../src/markdown-commands.js';

/**
 * Runs a command on a document with a selection marked by [ and ] (or | for
 * a cursor) and returns the result in the same notation.
 */
function run(command, marked, ...args) {
  const cursor = marked.indexOf('|');
  const from = cursor !== -1 ? cursor : marked.indexOf('[');
  const to = cursor !== -1 ? cursor : marked.indexOf(']') - 1;
  const doc = marked.replace(/[[\]|]/g, '');
  const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) });
  const spec = command(state, ...args);
  if (spec === null) return null;
  const next = state.update(spec).state;
  const { from: a, to: b } = next.selection.main;
  const text = next.doc.toString();
  return a === b ? `${text.slice(0, a)}|${text.slice(a)}` : `${text.slice(0, a)}[${text.slice(a, b)}]${text.slice(b)}`;
}

test('bold wraps the selection and unwraps it again', () => {
  assert.equal(run(toggleBold, 'say [hi] now'), 'say **[hi]** now');
  assert.equal(run(toggleBold, 'say **[hi]** now'), 'say [hi] now');
  assert.equal(run(toggleBold, 'say [**hi**] now'), 'say [hi] now');
});

test('bold with no selection inserts a pair and puts the cursor inside', () => {
  assert.equal(run(toggleBold, 'a | b'), 'a **|** b');
  assert.equal(run(toggleBold, 'a **|** b'), 'a | b');
});

test('italic and bold tell their stars apart', () => {
  assert.equal(run(toggleItalic, '**[hi]**'), '***[hi]***');
  assert.equal(run(toggleItalic, '***[hi]***'), '**[hi]**');
  assert.equal(run(toggleBold, '*[hi]*'), '***[hi]***');
  assert.equal(run(toggleBold, '***[hi]***'), '*[hi]*');
  assert.equal(run(toggleItalic, '*[hi]*'), '[hi]');
});

test('inline code wraps and unwraps with backticks', () => {
  assert.equal(run(toggleInlineCode, 'run [ls] now'), 'run `[ls]` now');
  assert.equal(run(toggleInlineCode, 'run `[ls]` now'), 'run [ls] now');
});

test('setHeading sets, changes and removes the heading level of each selected line', () => {
  assert.equal(run(setHeading, 'Ti|tle', 2), '## Ti|tle');
  assert.equal(run(setHeading, '## Ti|tle', 4), '#### Ti|tle');
  assert.equal(run(setHeading, '### Ti|tle', 0), 'Ti|tle');
  assert.equal(run(setHeading, '[one\ntwo]', 1), '# [one\n# two]');
  assert.equal(run(setHeading, '# Ti|tle', 1), null);
});

test('the bulleted list toggles, and converts a numbered list', () => {
  assert.equal(run(toggleBulletList, '[a\nb]'), '- [a\n- b]');
  assert.equal(run(toggleBulletList, '[- a\n- b]'), '[a\nb]');
  assert.equal(run(toggleBulletList, '[1. a\n2. b]'), '[- a\n- b]');
  assert.equal(run(toggleBulletList, '[- a\nb]'), '[- a\n- b]');
  assert.equal(run(toggleBulletList, '[a\n\nb]'), '- [a\n\n- b]');
  assert.equal(run(toggleBulletList, '  it|em'), '  - it|em');
});

test('the numbered list numbers lines in order, toggles and converts bullets', () => {
  assert.equal(run(toggleNumberedList, '[a\nb\nc]'), '1. [a\n2. b\n3. c]');
  assert.equal(run(toggleNumberedList, '[1. a\n2. b]'), '[a\nb]');
  assert.equal(run(toggleNumberedList, '[- a\n* b]'), '[1. a\n2. b]');
});

test('the quote toggles on each selected line', () => {
  assert.equal(run(toggleQuote, '[a\nb]'), '> [a\n> b]');
  assert.equal(run(toggleQuote, '[> a\n>b]'), '[a\nb]');
});

test('insertLink wraps the selection and selects the URL to type over', () => {
  assert.equal(run(insertLink, 'see [docs] here'), 'see [docs]([https://]) here');
  assert.equal(run(insertLink, 'see | here'), 'see [link]([https://]) here');
});

test('the code block fences the selected lines and removes the fences again', () => {
  assert.equal(run(toggleCodeBlock, '[x = 1\ny = 2]'), '```\n[x = 1\ny = 2]\n```');
  assert.equal(run(toggleCodeBlock, '```\n[x = 1\ny = 2]\n```'), '[x = 1\ny = 2]');
  assert.equal(run(toggleCodeBlock, 'x |= 1'), '```\nx |= 1\n```');
});
