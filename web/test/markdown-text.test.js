import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { countText, createCounter, createSummary, renderedText } from '../src/markdown-text.js';

function treeOf(text) {
  const state = EditorState.create({ doc: text, extensions: languageSupport('markdown') });
  return ensureSyntaxTree(state, text.length, 5000);
}
const render = (text, from, to) => renderedText(text, treeOf(text), from, to);

test('headings, setext underlines and rules lose their marks (EXP-3)', () => {
  assert.equal(render('# Title\n\n## Sub ##'), 'Title\n\nSub');
  assert.equal(render('Title\n===\n\nnext'), 'Title\n\nnext');
  assert.equal(render('x\n\n---\n\ny'), 'x\n\n\n\ny');
  assert.equal(render('  #   T ##  \n\nTitle\n  ===  '), 'T\n\nTitle');
  assert.equal(render('> # T\n\n> Title\n> ==='), 'T\n\nTitle');
  assert.equal(render('- # T'), '- T');
});

test('emphasis, strikethrough, inline code, quotes and escapes lose their marks', () => {
  assert.equal(render('**b** *i* ~~s~~ `c` and \\*star\\*'), 'b i s c and *star*');
  assert.equal(render('> one\n> two'), 'one\ntwo');
  assert.equal(render('a ` b ` c `  ` d `` `x` ``'), 'a b c    d `x`', 'one padding space goes from each side of code');
  assert.equal(render('one  \ntwo\\\nthree'), 'one\ntwo\nthree', 'hard breaks lose their spaces or backslash');
});

test('code fences go and the code stays', () => {
  assert.equal(render('before\n\n```js\nx = 1\ny = 2\n```\n\nafter'), 'before\n\nx = 1\ny = 2\n\nafter');
  assert.equal(render('```\n```'), '');
  assert.equal(render('```\ncode\n~~~'), 'code\n~~~', 'an unclosed fence keeps a last line that only looks like a fence');
  assert.equal(render('  ```\n  code\n  ```'), '  code', 'indentation before a fence goes with it');
  assert.equal(render('- ```\n  code\n  ```\n- b'), '- code\n- b', 'a fence in a list item');
});

test('quote marks go inside code blocks and HTML blocks too', () => {
  assert.equal(render('> ```\n> code\n> ```'), 'code');
  assert.equal(render('> ```python\n> a = 1\n> b = 2\n> ```\n\nafter'), 'a = 1\nb = 2\n\nafter');
  assert.equal(render('> <div>\n> x'), '<div>\nx');
  assert.equal(render('>\tx'), 'x');
});

test('links become their text, images their alt text, and [text] without a target stays', () => {
  assert.equal(render('[text](https://u "t"), [ref][r], <https://a.b> and https://c.d\n\n[r]: https://r'), 'text, ref, https://a.b and https://c.d\n\n[r]: https://r');
  assert.equal(render('see [sic] here'), 'see [sic] here');
  assert.equal(render('[r][] and [r]\n\n[r]: https://x'), 'r and r\n\n[r]: https://x');
  assert.equal(render('![a cat](cat.png)'), 'a cat');
});

test('list and task markers stay', () => {
  assert.equal(render('- a\n- [x] b\n1. c'), '- a\n- [x] b\n1. c');
});

test('table cells are separated by tabs and the delimiter row goes', () => {
  assert.equal(render('| a | **b** |\n|---|---|\n| 1 | 2 |'), 'a\tb\n1\t2');
  assert.equal(render('| a |  | c |\n|---|---|---|\n| 1 | | 3 |'), 'a\t\tc\n1\t\t3', 'an empty cell keeps its column');
  assert.equal(render('a | b\n--|--\nc | d\ne'), 'a\tb\nc\td\ne', 'rows without outer pipes');
  assert.equal(render('| a |\n|---|\n| |'), 'a\n', 'a row with no cell text');
  assert.equal(render('> | a | b |\n> |---|---|\n> | 1 | 2 |'), 'a\tb\n1\t2');
});

test('entities become characters, unknown ones stay, raw HTML stays', () => {
  assert.equal(render('&amp; &lt; &#65; &#x42; &copy; &bogus;'), '& < A B © &bogus;');
  assert.equal(render('&eacute; &hearts; &constructor;'), 'é ♥ &constructor;');
  assert.equal(render('<b>raw</b> text'), '<b>raw</b> text');
});

test('a range renders only its part, and cut marks are dropped', () => {
  const text = 'a **bold** c';
  assert.equal(render(text, 2, 10), 'bold');
  assert.equal(render(text, 2, 6), 'bo');
  assert.equal(render(text, 0, 1), 'a');
});

test('countText counts word-like segments and user-perceived characters without line breaks (CNT-5)', () => {
  assert.deepEqual(countText(''), { words: 0, characters: 0 });
  assert.deepEqual(countText('Hello world'), { words: 2, characters: 11 });
  assert.deepEqual(countText('one\ntwo'), { words: 2, characters: 6 });
  assert.deepEqual(countText("don't stop"), { words: 2, characters: 10 });
  assert.deepEqual(countText('café 👍🏽 é'), { words: 2, characters: 8 });
  assert.deepEqual(countText('👍🏽'), { words: 0, characters: 1 });
  assert.deepEqual(countText('x\u06001'), { words: 1, characters: 2 }, 'a prepend mark joins the character after it');
});

const SAMPLE = [
  '# One',
  '',
  '## **Two** [x](u) [ref][r]',
  '',
  'Three',
  'over two lines',
  '---',
  '',
  '> quote with *em*',
  '> ```',
  '> # not a heading',
  '> ```',
  '',
  '- item `code`',
  '- [x] task',
  '',
  '  # Indented ##  ',
  '',
  '| a |  | c |',
  '|---|---|---|',
  '| 1 | **2** | 3 |',
  '',
  '<div>raw &amp;</div>',
  '',
  'café e\u0301 👍🏽 &eacute; line  ',
  'next\\',
  'end',
  '',
  '###### Six',
  '',
  '[r]: https://r.s',
].join('\n');

test('createSummary lists each heading with its level, plain text and position (OUT-1, OUT-5)', () => {
  assert.deepEqual(createSummary().all(SAMPLE, treeOf(SAMPLE)).headings, [
    { level: 1, text: 'One', from: 0 },
    { level: 2, text: 'Two x ref', from: 7 },
    { level: 2, text: 'Three over two lines', from: SAMPLE.indexOf('Three') },
    { level: 1, text: 'Indented', from: SAMPLE.indexOf('# Indented') },
    { level: 6, text: 'Six', from: SAMPLE.indexOf('######') },
  ]);
});

/** Edits that keep the cache in use: typing, a new block, a removed definition. */
const EDITS = [
  (text) => text.replace('Three', 'Three and more'),
  (text) => text.replace('end', 'end\n\n## Added'),
  (text) => text.replace('[r]: https://r.s', ''),
  (text) => `${text}\n\n[r]: https://other`,
  () => '',
];

test('createSummary counts the same as countText of renderedText, also after edits that reuse its cache (CNT-6, CNT-7)', () => {
  const summary = createSummary();
  let text = SAMPLE;
  for (const edit of [(t) => t, ...EDITS]) {
    text = edit(text);
    const tree = treeOf(text);
    assert.deepEqual(summary.all(text, tree).counts, countText(renderedText(text, tree)), JSON.stringify(text));
  }
});

test('createSummary counts a range the same as countText of renderedText of the range (CNT-3)', () => {
  const summary = createSummary();
  const tree = treeOf(SAMPLE);
  summary.all(SAMPLE, tree);
  for (let from = 0; from <= SAMPLE.length; from += 7) {
    for (let to = from; to <= SAMPLE.length; to += 11) {
      assert.deepEqual(summary.range(SAMPLE, tree, from, to), countText(renderedText(SAMPLE, tree, from, to)), `${from}-${to}`);
    }
  }
});

test('createCounter gives the same counts as countText, also after edits that reuse its cache (CNT-7)', () => {
  const count = createCounter();
  const texts = [
    'one line\ntwo words here\n\ncafé e\u0301 👍🏽',
    'one line\ntwo words here changed\n\ncafé e\u0301 👍🏽',
    'one line\nnew line\ntwo words here changed\n\ncafé e\u0301 👍🏽',
    'one line',
    '',
  ];
  for (const text of texts) assert.deepEqual(count(text), countText(text), JSON.stringify(text));
});
