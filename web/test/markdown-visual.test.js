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
  const specs = collectVisual(state, from ?? 0, to ?? doc.length).sort((x, y) => x.from - y.from || x.to - y.to);
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

/** Every spec that replaces text, with the text it covers. */
function replaced(body) {
  const doc = `${body}\n\nend`;
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(doc.length), extensions: languageSupport('markdown') });
  ensureSyntaxTree(state, doc.length, 5000);
  return collectVisual(state, 0, doc.length)
    .filter((s) => s.kind !== 'line' && s.kind !== 'mark')
    .map((s) => ({ ...s, text: doc.slice(s.from, s.to) }));
}

test('no hide or widget covers a line break, so the editor never breaks (review M11 1)', () => {
  for (const body of [
    '![a long\nalt](https://x.y/a.png)',
    '[link](https://x.y\n"title")',
    '[ref][la\nbel]\n\n[la bel]: https://u.v',
    '**bold\nacross**',
  ]) {
    for (const spec of replaced(body)) assert.ok(!spec.text.includes('\n'), `${JSON.stringify(body)}: ${JSON.stringify(spec)}`);
  }
});

test('hides never overlap: a heading or a fence inside a quote', () => {
  assert.deepEqual(specsFor('> # Title').hidden, ['> ', '# ']);
  const fenced = specsFor('> ```\n> code\n> ```');
  assert.deepEqual(fenced.hidden, ['> ', '```', '> ', '> ', '```']);
  for (const body of ['> # Title', '> ```\n> code\n> ```', '> - [x] task']) {
    const specs = replaced(body).sort((a, b) => a.from - b.from);
    for (let i = 1; i < specs.length; i += 1) assert.ok(specs[i].from >= specs[i - 1].to, `${body}: overlap`);
  }
});

test('closing heading marks hide with their space', () => {
  assert.deepEqual(specsFor('## Title ##').hidden, ['## ', ' ##']);
});

test('a [text] without a URL or a matching definition stays plain text', () => {
  const { hidden, marks } = specsFor('see [sic] now');
  assert.deepEqual({ hidden, marks }, { hidden: [], marks: [] });
});

test('reference links and images use the URL of their definition (MDV-7, MDV-14)', () => {
  const body = '[docs][d], [Docs][] and [docs] and ![pic][p]\n\n[d]: https://docs.example\n[Docs]: https://docs.example\n[p]: https://img.example/p.png';
  const { marks, widgets } = specsFor(body);
  assert.deepEqual(
    marks.filter((m) => m.cls === 'cm-md-link'),
    [
      { cls: 'cm-md-link', text: 'docs', href: 'https://docs.example' },
      { cls: 'cm-md-link', text: 'Docs', href: 'https://docs.example' },
      { cls: 'cm-md-link', text: 'docs', href: 'https://docs.example' },
    ],
  );
  assert.deepEqual(widgets.filter((w) => w.kind === 'image').map((w) => w.url), ['https://img.example/p.png']);
});

test('link targets are normalized: angle brackets, escapes, entities, mail and www', () => {
  const href = (body) => specsFor(body).marks.find((m) => m.cls === 'cm-md-link')?.href;
  assert.equal(href('[a](<https://x.y/a b>)'), 'https://x.y/a b');
  assert.equal(href('[b](https://x.y/a\\_b)'), 'https://x.y/a_b');
  assert.equal(href('[c](https://x.y/?a=1&amp;b=2)'), 'https://x.y/?a=1&b=2');
  assert.equal(href('<me@x.y>'), 'mailto:me@x.y');
  assert.equal(href('go www.example.com now'), 'https://www.example.com');
});

test('indented code styles its lines and hides nothing', () => {
  const { hidden, lines } = specsFor('para\n\n    code\n    more');
  assert.deepEqual(hidden, []);
  assert.deepEqual(lines.map((l) => l.cls), ['cm-md-codeblock', 'cm-md-codeblock']);
});

test('a long code block only adds line specs for the lines in the range (NFR-2)', () => {
  const body = `\`\`\`\n${Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n')}\n\`\`\``;
  const doc = `${body}\n\nend`;
  const state = EditorState.create({ doc, selection: EditorSelection.cursor(doc.length), extensions: languageSupport('markdown') });
  ensureSyntaxTree(state, doc.length, 5000);
  const from = doc.indexOf('line 1000');
  const specs = collectVisual(state, from, from + 30);
  const lineSpecs = specs.filter((s) => s.kind === 'line');
  assert.ok(lineSpecs.length > 0 && lineSpecs.length <= 4, `line specs: ${lineSpecs.length}`);
});
