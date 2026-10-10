import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { exportContent, exportFileName, exportFormats } from '../src/export.js';
import { languageSupport } from '../src/languages.js';

test('Markdown offers md, txt, html and pdf, other types their original source and txt (EXP-2)', () => {
  const ids = (name, language) => exportFormats(name, language).map((format) => format.id);
  assert.deepEqual(exportFormats('notes.md', 'markdown'), [
    { id: 'md', label: 'Markdown (.md)' },
    { id: 'txt', label: 'Plain text (.txt)' },
    { id: 'html', label: 'Web page (.html)' },
    { id: 'pdf', label: 'PDF (print dialog)' },
  ]);
  assert.deepEqual(ids('notes', 'markdown'), ['md', 'txt', 'html', 'pdf']);
  assert.deepEqual(exportFormats('app.py', 'python'), [
    { id: 'source', label: 'Original (.py)' },
    { id: 'txt', label: 'Plain text (.txt)' },
  ]);
  assert.deepEqual(exportFormats('page.html', 'html')[0], { id: 'source', label: 'Original (.html)' });
  assert.deepEqual(exportFormats('scan.pdf', 'plain')[0], { id: 'source', label: 'Original (.pdf)' });
  assert.deepEqual(ids('Untitled 3', 'plain'), ['txt']);
  assert.deepEqual(ids('read.txt', 'plain'), ['txt']);
  assert.deepEqual(exportFormats('Data.JSON', 'json')[0], { id: 'source', label: 'Original (.JSON)' });
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
  assert.equal(exportContent({ name: 'a.py', format: 'source', state: py }).content, 'x = 1  # **not markdown**');
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

test('a non-Markdown tab exports its own source, also when it is named .html or .pdf (EXP-2)', () => {
  assert.deepEqual(exportContent({ name: 'page.html', format: 'source', state: stateOf('<h1>Hi</h1>', 'html') }), {
    fileName: 'page.html',
    type: 'text/html;charset=utf-8',
    content: '<h1>Hi</h1>',
  });
  assert.deepEqual(exportContent({ name: 'a/scan.pdf', format: 'source', state: stateOf('# x', 'plain') }), {
    fileName: 'a_scan.pdf',
    type: 'text/plain;charset=utf-8',
    content: '# x',
  });
});

test('the PDF page is titled with the name without its extension, so the saved file is name.pdf (EXP-5, EXP-6)', () => {
  const result = exportContent({ name: 'report.v2.md', format: 'pdf', state: stateOf('# T', 'markdown') });
  assert.match(result.content, /<title>report\.v2<\/title>/);
  assert.match(result.content, /<h1>T<\/h1>/);
});
