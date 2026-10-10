import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { collectVisual } from '../src/markdown-visual.js';

// A last line "end" holds the cursor, so the lines under test are not revealed.
function specsFor(body, { selection, from, to } = {}) {
  const doc = `${body}\n\nend`;
  const state = EditorState.create({
    doc,
    selection: selection ?? EditorSelection.cursor(doc.length),
    extensions: languageSupport('markdown'),
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  const specs = collectVisual(state, from ?? 0, to ?? doc.length);
  const text = (spec) => doc.slice(spec.from, spec.to);
  return {
    doc,
    hidden: specs.filter((s) => s.kind === 'hide').map(text),
    marks: specs.filter((s) => s.kind === 'mark').map((s) => ({ cls: s.cls, text: text(s), ...(s.href && { href: s.href }) })),
    lines: specs.filter((s) => s.kind === 'line').map((s) => ({ line: doc.slice(s.from).split('\n', 1)[0], cls: s.cls })),
    widgets: specs.filter((s) => !['hide', 'mark', 'line'].includes(s.kind)).map(({ kind, from: a, to: b, ...rest }) => ({ kind, text: doc.slice(a, b), ...rest })),
  };
}

test('headings hide their marks and style the line', () => {
  const atx = specsFor('## Title');
  assert.deepEqual(atx.hidden, ['## ']);
  assert.deepEqual(atx.lines, [{ line: '## Title', cls: 'cm-md-h2' }]);
  const setext = specsFor('Title\n===');
  assert.deepEqual(setext.hidden, ['===']);
  assert.deepEqual(setext.lines, [
    { line: 'Title', cls: 'cm-md-h1' },
    { line: '===', cls: 'cm-md-setext-underline' },
  ]);
});

test('bold, italic, strikethrough and inline code hide their marks and keep their style', () => {
  const { hidden, marks } = specsFor('a **b** *c* ~~d~~ `e`');
  assert.deepEqual(hidden, ['**', '**', '*', '*', '~~', '~~', '`', '`']);
  assert.deepEqual(marks, [
    { cls: 'cm-md-strong', text: '**b**' },
    { cls: 'cm-md-em', text: '*c*' },
    { cls: 'cm-md-strike', text: '~~d~~' },
    { cls: 'cm-md-inline-code', text: '`e`' },
  ]);
});

test('a link shows only its text, styled, with its URL as data', () => {
  const { hidden, marks } = specsFor('see [the docs](https://x.y "Title") now');
  assert.deepEqual(hidden, ['[', '](https://x.y "Title")']);
  assert.deepEqual(marks, [{ cls: 'cm-md-link', text: 'the docs', href: 'https://x.y' }]);
});

test('autolinks and bare URLs are links', () => {
  const angle = specsFor('<https://a.b>');
  assert.deepEqual(angle.hidden, ['<', '>']);
  assert.deepEqual(angle.marks, [{ cls: 'cm-md-link', text: 'https://a.b', href: 'https://a.b' }]);
  const bare = specsFor('go to https://c.d/e now');
  assert.deepEqual(bare.marks, [{ cls: 'cm-md-link', text: 'https://c.d/e', href: 'https://c.d/e' }]);
});

test('an image becomes one image widget with its alt text and URL', () => {
  const { hidden, widgets } = specsFor('![a cat](https://img.example/cat.png)');
  assert.deepEqual(hidden, []);
  assert.deepEqual(widgets, [{ kind: 'image', text: '![a cat](https://img.example/cat.png)', alt: 'a cat', url: 'https://img.example/cat.png' }]);
});

test('bullets become a dot, tasks a checkbox, numbers stay', () => {
  const { hidden, marks, widgets } = specsFor('- item\n- [x] done\n- [ ] open\n\n1. one');
  assert.deepEqual(hidden, ['- ', '- ']);
  assert.deepEqual(widgets, [
    { kind: 'bullet', text: '-' },
    { kind: 'task', text: '[x]', checked: true },
    { kind: 'task', text: '[ ]', checked: false },
  ]);
  assert.deepEqual(marks, [{ cls: 'cm-md-list-number', text: '1.' }]);
});

test('quotes and rules hide their marks and style the line', () => {
  const quote = specsFor('> quoted');
  assert.deepEqual(quote.hidden, ['> ']);
  assert.deepEqual(quote.lines, [{ line: '> quoted', cls: 'cm-md-quote' }]);
  const rule = specsFor('para\n\n---');
  assert.deepEqual(rule.hidden, ['---']);
  assert.deepEqual(rule.lines, [{ line: '---', cls: 'cm-md-hr' }]);
});

test('tables style rows, dim the pipes and hide the delimiter row', () => {
  const { hidden, marks, lines } = specsFor('| a | b |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(hidden, ['|---|---|']);
  assert.deepEqual(lines, [
    { line: '| a | b |', cls: 'cm-md-table cm-md-table-header' },
    { line: '|---|---|', cls: 'cm-md-table cm-md-table-delimiter' },
    { line: '| 1 | 2 |', cls: 'cm-md-table' },
  ]);
  assert.equal(marks.filter((m) => m.cls === 'cm-md-table-pipe').length, 6);
});

test('fenced code styles its lines and hides the fences', () => {
  const { hidden, lines } = specsFor('```python\nx = 1\n```');
  assert.deepEqual(hidden, ['```python', '```']);
  assert.deepEqual(lines, [
    { line: '```python', cls: 'cm-md-codeblock cm-md-fence' },
    { line: 'x = 1', cls: 'cm-md-codeblock' },
    { line: '```', cls: 'cm-md-codeblock cm-md-fence' },
  ]);
});

test('a backslash escape hides the backslash', () => {
  assert.deepEqual(specsFor('a \\*b\\* c').hidden, ['\\', '\\']);
});

test('raw HTML is left as source text (MDV-8)', () => {
  for (const body of ['a <b onclick="x()">bold</b> c', '<div>\nraw <img src=x onerror=alert(1)>\n</div>']) {
    const { hidden, marks, widgets } = specsFor(body);
    assert.deepEqual({ hidden, marks, widgets }, { hidden: [], marks: [], widgets: [] }, body);
  }
});

test('lines that the cursor or selection touch show their marks (MDV-5)', () => {
  const doc = '# One\n**two**\n# Three\n\nend';
  const cursorOnOne = specsFor('# One\n**two**\n# Three', { selection: EditorSelection.cursor(2) });
  assert.deepEqual(cursorOnOne.hidden, ['**', '**', '# ']);
  assert.deepEqual(cursorOnOne.lines.map((l) => l.cls), ['cm-md-h1', 'cm-md-h1']);
  const acrossTwo = specsFor('# One\n**two**\n# Three', { selection: EditorSelection.range(2, doc.indexOf('two')) });
  assert.deepEqual(acrossTwo.hidden, ['# ']);
});

test('only the given range is collected', () => {
  const body = '# First\n\nplain\n\n# Second';
  const { hidden } = specsFor(body, { from: 0, to: 7 });
  assert.deepEqual(hidden, ['# ']);
});
