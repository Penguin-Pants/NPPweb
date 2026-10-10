import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';
import { decodeEntity, linkTarget, normalizeLabel, referenceDefinitions } from '../src/markdown-syntax.js';

test('decodeEntity knows named and numeric entities and returns null for others', () => {
  assert.equal(decodeEntity('&amp;'), '&');
  assert.equal(decodeEntity('&copy;'), '©');
  assert.equal(decodeEntity('&#65;'), 'A');
  assert.equal(decodeEntity('&#x1F600;'), '😀');
  assert.equal(decodeEntity('&bogus;'), null);
  assert.equal(decodeEntity('&eacute;'), 'é', 'every HTML named entity, not only common ones');
  assert.equal(decodeEntity('&NotSquareSupersetEqual;'), '⋣');
  assert.equal(decodeEntity('&constructor;'), null, 'object keys are not entities');
  assert.equal(decodeEntity('&#0;'), '\uFFFD', 'CommonMark: U+0000 and invalid code points become U+FFFD');
  assert.equal(decodeEntity('&#x110000;'), '\uFFFD');
  assert.equal(decodeEntity('&#xD800;'), '\uFFFD');
  assert.equal(decodeEntity('&#12345678;'), null, 'CommonMark: at most 7 decimal digits');
  assert.equal(decodeEntity('&#x1234567;'), null, 'CommonMark: at most 6 hex digits');
});


test('linkTarget strips angle brackets, escapes and entities, and adds mailto and https', () => {
  assert.equal(linkTarget(' <https://x.y/a b> '), 'https://x.y/a b');
  assert.equal(linkTarget('https://x.y/a\\_b\\(c\\)'), 'https://x.y/a_b(c)');
  assert.equal(linkTarget('https://x.y/?a=1&amp;b=2'), 'https://x.y/?a=1&b=2');
  assert.equal(linkTarget('me@x.y'), 'mailto:me@x.y');
  assert.equal(linkTarget('www.x.y'), 'https://www.x.y');
  assert.equal(linkTarget('mailto:me@x.y'), 'mailto:me@x.y');
  assert.equal(linkTarget('//x.y/a'), 'https://x.y/a', 'a protocol-relative URL opens with https');
});

test('referenceDefinitions maps normalized labels to URLs, first one wins, also in quotes and lists', () => {
  const text = '[A  B]: https://one\n[a b]: https://two\n\n> [q]: <https://q.example>\n\n- item\n\n  [l]: https://l.example';
  const state = EditorState.create({ doc: text, extensions: languageSupport('markdown') });
  const tree = ensureSyntaxTree(state, text.length, 5000);
  const slice = (from, to) => text.slice(from, to);
  const defs = referenceDefinitions(tree, slice);
  assert.equal(defs.get(normalizeLabel('a b')), 'https://one');
  assert.equal(defs.get(normalizeLabel('q')), 'https://q.example');
  assert.equal(defs.get(normalizeLabel('L')), 'https://l.example');
  assert.equal(referenceDefinitions(tree, slice), defs);
});

test('normalizeLabel folds case as CommonMark does, so [ẞ] matches [SS]', () => {
  assert.equal(normalizeLabel('[ẞ]'), normalizeLabel('[SS]'));
  assert.equal(normalizeLabel('[  Foo\n bar ]'), normalizeLabel('[FOO BAR]'));
  assert.notEqual(normalizeLabel('[a]'), normalizeLabel('[b]'));
});
