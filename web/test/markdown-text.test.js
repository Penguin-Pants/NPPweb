import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { countText, createCounter, headings, renderedText } from '../src/markdown-text.js';

function treeOf(text) {
  const state = EditorState.create({ doc: text, extensions: languageSupport('markdown') });
  return ensureSyntaxTree(state, text.length, 5000);
}
const render = (text, from, to) => renderedText(text, treeOf(text), from, to);

test('headings, setext underlines and rules lose their marks (EXP-3)', () => {
  assert.equal(render('# Title\n\n## Sub ##'), 'Title\n\nSub');
  assert.equal(render('Title\n===\n\nnext'), 'Title\n\nnext');
  assert.equal(render('x\n\n---\n\ny'), 'x\n\n\n\ny');
});

test('emphasis, strikethrough, inline code, quotes and escapes lose their marks', () => {
  assert.equal(render('**b** *i* ~~s~~ `c` and \\*star\\*'), 'b i s c and *star*');
  assert.equal(render('> one\n> two'), 'one\ntwo');
});

test('code fences go and the code stays', () => {
  assert.equal(render('before\n\n```js\nx = 1\ny = 2\n```\n\nafter'), 'before\n\nx = 1\ny = 2\n\nafter');
});

test('links become their text, images their alt text, and [text] without a target stays', () => {
  assert.equal(render('[text](https://u "t"), [ref][r], <https://a.b> and https://c.d\n\n[r]: https://r'), 'text, ref, https://a.b and https://c.d\n\n[r]: https://r');
  assert.equal(render('see [sic] here'), 'see [sic] here');
  assert.equal(render('![a cat](cat.png)'), 'a cat');
});

test('list and task markers stay', () => {
  assert.equal(render('- a\n- [x] b\n1. c'), '- a\n- [x] b\n1. c');
});

test('table cells are separated by tabs and the delimiter row goes', () => {
  assert.equal(render('| a | **b** |\n|---|---|\n| 1 | 2 |'), 'a\tb\n1\t2');
});

test('entities become characters, unknown ones stay, raw HTML stays', () => {
  assert.equal(render('&amp; &lt; &#65; &#x42; &copy; &bogus;'), '& < A B © &bogus;');
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
});

test('headings lists each heading with its level, plain text and position (OUT-1, OUT-5)', () => {
  const text = '# One\n\n## **Two** [x](u)\n\nThree\n---\n\n```\n# not a heading\n```\n\n###### Six';
  assert.deepEqual(headings(text, treeOf(text)), [
    { level: 1, text: 'One', from: 0 },
    { level: 2, text: 'Two x', from: 7 },
    { level: 2, text: 'Three', from: text.indexOf('Three') },
    { level: 6, text: 'Six', from: text.indexOf('######') },
  ]);
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
