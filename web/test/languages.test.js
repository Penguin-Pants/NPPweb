import assert from 'node:assert/strict';
import { test } from 'node:test';
import { language } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { detectLanguage, LANGUAGES, languageSupport, resolveLanguage } from '../src/languages.js';

const EXPECTED = {
  'a.md': 'markdown',
  'a.markdown': 'markdown',
  'a.json': 'json',
  'a.html': 'html',
  'a.htm': 'html',
  'a.css': 'css',
  'a.js': 'javascript',
  'a.mjs': 'javascript',
  'a.cjs': 'javascript',
  'a.ts': 'typescript',
  'a.mts': 'typescript',
  'a.cts': 'typescript',
  'a.py': 'python',
  'a.sql': 'sql',
  'a.yaml': 'yaml',
  'a.yml': 'yaml',
  'a.sh': 'shell',
  'a.bash': 'shell',
  'a.zsh': 'shell',
};

test('the 11 languages are listed in order with labels', () => {
  assert.deepEqual(
    LANGUAGES.map((entry) => entry.id),
    ['plain', 'markdown', 'json', 'html', 'css', 'javascript', 'typescript', 'python', 'sql', 'yaml', 'shell'],
  );
  for (const entry of LANGUAGES) assert.ok(entry.label.length > 0);
});

test('each listed extension selects its language', () => {
  for (const [name, id] of Object.entries(EXPECTED)) assert.equal(detectLanguage(name), id, name);
});

test('extensions match in any case', () => {
  assert.equal(detectLanguage('README.MD'), 'markdown');
  assert.equal(detectLanguage('Script.Py'), 'python');
  assert.equal(detectLanguage('STYLE.CSS'), 'css');
});

test('unknown or missing extensions select plain text (EDGE-9)', () => {
  for (const name of ['notes', 'notes.txt', 'Untitled 1', 'archive.tar.gz', 'a.py.bak', 'a.', '', 'a.constructor', 'a.__proto__', 'a.toString']) {
    assert.equal(detectLanguage(name), 'plain', name);
  }
});

test('only the last extension counts', () => {
  assert.equal(detectLanguage('backup.txt.py'), 'python');
  assert.equal(detectLanguage('dir.v2/a.json'), 'json');
});

test('an override wins over the extension', () => {
  assert.equal(resolveLanguage('a.py', 'sql'), 'sql');
  assert.equal(resolveLanguage('notes', 'markdown'), 'markdown');
  assert.equal(resolveLanguage('a.py', 'plain'), 'plain');
});

test('a null or unknown override falls back to the extension', () => {
  assert.equal(resolveLanguage('a.py', null), 'python');
  assert.equal(resolveLanguage('a.py', undefined), 'python');
  assert.equal(resolveLanguage('a.py', 'rust'), 'python');
});

test('each language loads its parser', () => {
  const parserName = (id) => EditorState.create({ extensions: languageSupport(id) }).facet(language)?.name ?? null;
  assert.equal(parserName('plain'), null);
  for (const id of ['markdown', 'json', 'html', 'css', 'javascript', 'typescript', 'python', 'sql', 'yaml', 'shell']) {
    assert.equal(parserName(id), id, id);
  }
});
