import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
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
 * Runs a command on a Markdown document with a selection marked by « and »
 * (or | for a cursor) and returns the result in the same notation.
 */
function run(command, marked, ...args) {
  const cursor = marked.indexOf('|');
  const from = cursor !== -1 ? cursor : marked.indexOf('«');
  const to = cursor !== -1 ? cursor : marked.indexOf('»') - 1;
  const doc = marked.replace(/[«»|]/g, '');
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: languageSupport('markdown'),
  });
  ensureSyntaxTree(state, doc.length, 5000);
  const spec = command(state, ...args);
  if (spec === null) return null;
  const next = state.update(spec).state;
  const { from: a, to: b } = next.selection.main;
  const text = next.doc.toString();
  return a === b ? `${text.slice(0, a)}|${text.slice(a)}` : `${text.slice(0, a)}«${text.slice(a, b)}»${text.slice(b)}`;
}

test('bold wraps the selection and unwraps it again', () => {
  assert.equal(run(toggleBold, 'say «hi» now'), 'say **«hi»** now');
  assert.equal(run(toggleBold, 'say **«hi»** now'), 'say «hi» now');
  assert.equal(run(toggleBold, 'say «**hi**» now'), 'say «hi» now');
});

test('bold with no selection inserts a pair and puts the cursor inside', () => {
  assert.equal(run(toggleBold, 'a | b'), 'a **|** b');
  assert.equal(run(toggleBold, 'a **|** b'), 'a | b');
});

test('italic and bold tell their stars apart', () => {
  assert.equal(run(toggleItalic, '**«hi»**'), '***«hi»***');
  assert.equal(run(toggleItalic, '***«hi»***'), '**«hi»**');
  assert.equal(run(toggleBold, '*«hi»*'), '***«hi»***');
  assert.equal(run(toggleBold, '***«hi»***'), '*«hi»*');
  assert.equal(run(toggleItalic, '*«hi»*'), '«hi»');
});

test('underscore emphasis unwraps too', () => {
  assert.equal(run(toggleItalic, '_«a»_'), '«a»');
  assert.equal(run(toggleItalic, '«_a_»'), '«a»');
  assert.equal(run(toggleBold, '__«a»__'), '«a»');
});

test('a selection over two separate emphases is wrapped, never stripped at its ends', () => {
  assert.equal(run(toggleItalic, '«*a* and *b*»'), '*«*a* and *b*»*');
  assert.equal(run(toggleBold, '«**a** and **b**»'), '**«**a** and **b**»**');
  assert.equal(run(toggleInlineCode, '«`a` and `b`»'), '`` «`a` and `b`» ``');
});

test('inline code wraps and unwraps with backticks', () => {
  assert.equal(run(toggleInlineCode, 'run «ls» now'), 'run `«ls»` now');
  assert.equal(run(toggleInlineCode, 'run `«ls»` now'), 'run «ls» now');
});

test('setHeading sets, changes and removes the level, skips blank lines and keeps list and quote marks', () => {
  assert.equal(run(setHeading, 'Ti|tle', 2), '## Ti|tle');
  assert.equal(run(setHeading, '## Ti|tle', 4), '#### Ti|tle');
  assert.equal(run(setHeading, '### Ti|tle', 0), 'Ti|tle');
  assert.equal(run(setHeading, '«one\ntwo»', 1), '# «one\n# two»');
  assert.equal(run(setHeading, '# Ti|tle', 1), null);
  assert.equal(run(setHeading, '«a\n\n- b\n> c»', 2), '## «a\n\n- ## b\n> ## c»');
});

test('a selection that ends at the start of a line leaves that line out', () => {
  assert.equal(run(toggleBulletList, '«a\nb\n»c'), '- «a\n- b\n»c');
  assert.equal(run(toggleQuote, '«a\n»b'), '> «a\n»b');
  assert.equal(run(setHeading, '«a\n»b', 1), '# «a\n»b');
});

test('the bulleted list toggles, and converts a numbered list', () => {
  assert.equal(run(toggleBulletList, '«a\nb»'), '- «a\n- b»');
  assert.equal(run(toggleBulletList, '«- a\n- b»'), '«a\nb»');
  assert.equal(run(toggleBulletList, '«1. a\n2. b»'), '«- a\n- b»');
  assert.equal(run(toggleBulletList, '«- a\nb»'), '«- a\n- b»');
  assert.equal(run(toggleBulletList, '«a\n\nb»'), '- «a\n\n- b»');
  assert.equal(run(toggleBulletList, '  it|em'), '  - it|em');
});

test('the numbered list numbers lines in order, toggles and converts bullets', () => {
  assert.equal(run(toggleNumberedList, '«a\nb\nc»'), '1. «a\n2. b\n3. c»');
  assert.equal(run(toggleNumberedList, '«1. a\n2. b»'), '«a\nb»');
  assert.equal(run(toggleNumberedList, '«- a\n* b»'), '«1. a\n2. b»');
});

test('the quote toggles on each selected line', () => {
  assert.equal(run(toggleQuote, '«a\nb»'), '> «a\n> b»');
  assert.equal(run(toggleQuote, '«> a\n>b»'), '«a\nb»');
});

test('insertLink wraps the selection and selects the URL to type over', () => {
  assert.equal(run(insertLink, 'see «docs» here'), 'see [docs](«https://») here');
  assert.equal(run(insertLink, 'see | here'), 'see [link](«https://») here');
});

test('insertLink inside a link removes the link and keeps its text', () => {
  assert.equal(run(insertLink, 'see [do|cs](https://x.y "t") here'), 'see «docs» here');
  assert.equal(run(insertLink, 'see [«docs»](https://x.y) here'), 'see «docs» here');
});

test('the code block fences the selected lines', () => {
  assert.equal(run(toggleCodeBlock, '«x = 1\ny = 2»'), '```\n«x = 1\ny = 2»\n```');
  assert.equal(run(toggleCodeBlock, 'x |= 1'), '```\nx |= 1\n```');
  assert.equal(run(toggleCodeBlock, '|'), '```\n|\n```');
  assert.equal(run(toggleCodeBlock, '|abc'), '```\n|abc\n```');
});

test('the code block removes the fences of the block that holds the cursor', () => {
  assert.equal(run(toggleCodeBlock, '```\nx = 1\ny |= 2\n```'), 'x = 1\ny |= 2');
  assert.equal(run(toggleCodeBlock, '```py\n«x = 1»\n```'), '«x = 1»');
});

test('the code block on a line between two blocks wraps that line only', () => {
  assert.equal(run(toggleCodeBlock, '```\na\n```\nmid|dle\n```\nb\n```'), '```\na\n```\n```\nmid|dle\n```\n```\nb\n```');
});

test('setHeading turns a setext heading into ATX or plain text, and drops closing hashes for plain text', () => {
  assert.equal(run(setHeading, 'Ti|tle\n===\n\nnext', 0), 'Ti|tle\n\nnext');
  assert.equal(run(setHeading, 'Ti|tle\n---', 3), '### Ti|tle');
  assert.equal(run(setHeading, 'Title\n=|==', 2), '## Title|');
  assert.equal(run(setHeading, '## Ti|tle ##', 0), 'Ti|tle');
  assert.equal(run(setHeading, '## Ti|tle ##', 3), '### Ti|tle ##');
});

test('the code block removes fences that the selection includes, also in a quote and when empty', () => {
  assert.equal(run(toggleCodeBlock, '«```\nx\n```\n»after'), '«x\n»after');
  assert.equal(run(toggleCodeBlock, '> ```\n> |x\n> ```'), '> |x');
  assert.equal(run(toggleCodeBlock, '`|``\n```\nafter'), '|after');
  assert.equal(run(toggleCodeBlock, '```\n|x'), '|x', 'an unclosed block has no closing fence to remove');
});

test('inline code picks a delimiter longer than any backtick run in the selection', () => {
  assert.equal(run(toggleInlineCode, '«a`b»'), '``«a`b»``');
  assert.equal(run(toggleInlineCode, '«`a»'), '`` «`a» ``');
});

test('marks that are not formatting in the syntax tree are never removed', () => {
  assert.equal(run(toggleBold, '`**«x»**`'), '`****«x»****`');
  assert.equal(run(toggleBold, '`**|**`'), '`****|****`');
  assert.equal(run(toggleInlineCode, '```\n`«x»`\n```'), '```\n``«x»``\n```');
});

test('list and quote commands find their marks after other container marks', () => {
  assert.equal(run(toggleBulletList, '> - it|em'), '> it|em');
  assert.equal(run(toggleNumberedList, '> - it|em'), '> 1. it|em');
  assert.equal(run(toggleBulletList, '> it|em'), '> - it|em');
  assert.equal(run(toggleQuote, '- > it|em'), '- it|em');
});
