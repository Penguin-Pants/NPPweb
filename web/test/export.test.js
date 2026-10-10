import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { exportContent, exportFileName, exportFormats } from '../src/export.js';
import { languageSupport } from '../src/languages.js';

test('Markdown offers md, txt, html and pdf, other types their own extension and txt (EXP-2)', () => {
  assert.deepEqual(exportFormats('notes.md', 'markdown'), ['md', 'txt', 'html', 'pdf']);
  assert.deepEqual(exportFormats('notes', 'markdown'), ['md', 'txt', 'html', 'pdf']);
  assert.deepEqual(exportFormats('app.py', 'python'), ['py', 'txt']);
  assert.deepEqual(exportFormats('Untitled 3', 'plain'), ['txt']);
  assert.deepEqual(exportFormats('read.txt', 'plain'), ['txt']);
  assert.deepEqual(exportFormats('Data.JSON', 'json'), ['JSON', 'txt']);
});

test('the file name replaces or adds the extension and replaces invalid characters (EXP-6)', () => {
  assert.equal(exportFileName('notes.md', 'html'), 'notes.html');
  assert.equal(exportFileName('notes', 'md'), 'notes.md');
  assert.equal(exportFileName('a/b.md', 'md'), 'a_b.md');
  assert.equal(exportFileName('x:y*z?.md', 'txt'), 'x_y_z_.txt');
  assert.equal(exportFileName('report.v2.md', 'pdf'), 'report.v2.pdf');
  assert.equal(exportFileName('app.py', 'py'), 'app.py');
  assert.equal(exportFileName('<>', 'txt'), '__.txt');
});

function stateOf(text, language) {
  const state = EditorState.create({ doc: text, extensions: languageSupport(language) });
  ensureSyntaxTree(state, text.length, 5000);
  return state;
}

test('md and own-extension exports are the raw source, txt of Markdown is plain text (EXP-3)', () => {
  const md = stateOf('# Title\n\n**bold** and [link](https://x.y)', 'markdown');
  assert.deepEqual(exportContent({ name: 'n.md', format: 'md', state: md }), {
    fileName: 'n.md',
    type: 'text/markdown;charset=utf-8',
    content: '# Title\n\n**bold** and [link](https://x.y)',
  });
  assert.equal(exportContent({ name: 'n.md', format: 'txt', state: md }).content, 'Title\n\nbold and link');
  const py = stateOf('x = 1  # **not markdown**', 'python');
  assert.equal(exportContent({ name: 'a.py', format: 'py', state: py }).content, 'x = 1  # **not markdown**');
  assert.equal(exportContent({ name: 'a.py', format: 'txt', state: py }).content, 'x = 1  # **not markdown**');
});

test('html export is a whole page with the document name as title and diagrams inline (EXP-4, MDV-12)', () => {
  const text = '# T\n\n```mermaid\ngraph TD\n```\n\n```mermaid\ngraph TD\n```';
  const svg = '<svg id="diagram-3"><style>#diagram-3 .a{}</style><marker id="diagram-3_end"/></svg>';
  const result = exportContent({ name: 'a.md', format: 'html', state: stateOf(text, 'markdown'), diagrams: new Map([['graph TD', svg]]) });
  assert.equal(result.fileName, 'a.html');
  assert.equal(result.type, 'text/html;charset=utf-8');
  assert.match(result.content, /^<!doctype html>/);
  assert.match(result.content, /<title>a\.md<\/title>/);
  assert.match(result.content, /<h1>T<\/h1>/);
  const ids = [...result.content.matchAll(/<svg id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1], 'a diagram shown twice gets its own ids each time');
  assert.match(result.content, new RegExp(`#${ids[1]} \\.a`));
});
