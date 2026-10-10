import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureSyntaxTree, language } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { detectLanguage, languageId, LANGUAGES, languageSupport, resolveLanguage } from '../src/languages.js';

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

test('languageSupport sets the languageId facet, and plain is the default', () => {
  assert.equal(EditorState.create({ extensions: languageSupport('markdown') }).facet(languageId), 'markdown');
  assert.equal(EditorState.create({ extensions: languageSupport('python') }).facet(languageId), 'python');
  assert.equal(EditorState.create({ extensions: languageSupport('nope') }).facet(languageId), 'plain');
  assert.equal(EditorState.create({}).facet(languageId), 'plain');
});

/** Node names from the outer tree down to the innermost node at pos. */
function namesAt(doc, pos) {
  const state = EditorState.create({ doc, extensions: languageSupport('markdown') });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  const names = [];
  for (let node = tree.resolveInner(pos, 1); node; node = node.parent) names.push(node.name);
  return names;
}

test('Markdown parses GitHub Flavored Markdown (MDV-4)', () => {
  const doc = '| a |\n|---|\n| 1 |\n\n- [x] done\n\n~~old~~\n';
  assert.ok(namesAt(doc, 2).includes('Table'));
  assert.ok(namesAt(doc, doc.indexOf('[x]') + 1).includes('Task'));
  assert.ok(namesAt(doc, doc.indexOf('old')).includes('Strikethrough'));
});

test('fenced code uses the language named by its info string (MDV-11)', () => {
  for (const [info, code, inner] of [
    ['python', 'x = 1', 'AssignStatement'],
    ['py', 'x = 1', 'AssignStatement'],
    ['sql', 'SELECT 1', 'Statement'],
    ['js', 'let a = 1', 'VariableDeclaration'],
    ['json', '{"a": 1}', 'Object'],
    ['bash', 'echo hi', 'variableName.standard'],
  ]) {
    const doc = `\`\`\`${info}\n${code}\n\`\`\`\n`;
    assert.ok(namesAt(doc, doc.indexOf(code) + 1).includes(inner), `${info}: ${namesAt(doc, doc.indexOf(code) + 1)}`);
  }
});

test('fenced code with an unknown or missing info string stays plain code text (MDV-11)', () => {
  for (const info of ['rust', '', 'markdown']) {
    const doc = `\`\`\`${info}\nfn main() {}\n\`\`\`\n`;
    assert.equal(namesAt(doc, doc.indexOf('fn') + 1)[0], 'CodeText', info);
  }
});
