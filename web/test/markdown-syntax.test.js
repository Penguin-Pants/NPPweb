import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { decodeEntity, FENCE, linkTarget, referenceDefinitions } from '../src/markdown-syntax.js';

test('decodeEntity knows named and numeric entities and returns null for others', () => {
  assert.equal(decodeEntity('&amp;'), '&');
  assert.equal(decodeEntity('&copy;'), '©');
  assert.equal(decodeEntity('&#65;'), 'A');
  assert.equal(decodeEntity('&#x1F600;'), '😀');
  assert.equal(decodeEntity('&bogus;'), null);
  assert.equal(decodeEntity('&#0;'), null);
  assert.equal(decodeEntity('&#x110000;'), null);
});

test('FENCE matches backtick and tilde fences, also indented', () => {
  for (const line of ['```', '~~~', '   ```js', '```python x']) assert.ok(FENCE.test(line), line);
  for (const line of ['``', 'code ```', '~~']) assert.ok(!FENCE.test(line), line);
});

test('linkTarget strips angle brackets, escapes and entities, and adds mailto and https', () => {
  assert.equal(linkTarget(' <https://x.y/a b> '), 'https://x.y/a b');
  assert.equal(linkTarget('https://x.y/a\\_b\\(c\\)'), 'https://x.y/a_b(c)');
  assert.equal(linkTarget('https://x.y/?a=1&amp;b=2'), 'https://x.y/?a=1&b=2');
  assert.equal(linkTarget('me@x.y'), 'mailto:me@x.y');
  assert.equal(linkTarget('www.x.y'), 'https://www.x.y');
  assert.equal(linkTarget('mailto:me@x.y'), 'mailto:me@x.y');
});

test('referenceDefinitions maps normalized labels to URLs, first one wins, also in quotes and lists', () => {
  const text = '[A  B]: https://one\n[a b]: https://two\n\n> [q]: <https://q.example>\n\n- item\n\n  [l]: https://l.example';
  const state = EditorState.create({ doc: text, extensions: languageSupport('markdown') });
  const tree = ensureSyntaxTree(state, text.length, 5000);
  const slice = (from, to) => text.slice(from, to);
  const defs = referenceDefinitions(tree, slice);
  assert.equal(defs.get('a b'), 'https://one');
  assert.equal(defs.get('q'), 'https://q.example');
  assert.equal(defs.get('l'), 'https://l.example');
  assert.equal(referenceDefinitions(tree, slice), defs);
});
