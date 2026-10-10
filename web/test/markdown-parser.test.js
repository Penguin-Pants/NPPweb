// The editor's Markdown parser after each edit (NFR-2). The parse goes
// through CodeMirror with the app's own Markdown setup, code languages
// included, as in the editor.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { languageSupport } from '../src/languages.js';

const extensions = languageSupport('markdown');
const fullTree = (state) => ensureSyntaxTree(state, state.doc.length, 10_000);

/** Each node with its position, nested code languages included. */
function shape(tree) {
  const out = [];
  tree.iterate({ enter: (node) => void out.push(`${node.name}:${node.from}-${node.to}`) });
  return out.join(' ');
}

/** A small seeded random number generator, so a failure repeats. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    return (((seed ^ (seed >>> 15)) * (1 | seed)) >>> 0) / 4294967296;
  };
}

const BLOCKS = [
  (i) => `# Heading ${i}\n`,
  (i) => `Text ${i} with *em*, **strong** and \`code\`.\nsecond line\n`,
  () => '- a\n- b\n\n- c loose\n',
  () => '1. one\n2. two\n   - nested\n',
  (i) => `    indented code ${i}\n\n    more code\n`,
  (i) => '```js\nlet x = ' + i + ';\n\nlet y;\n```\n',
  (i) => `> quote ${i}\n> - list in quote\n>\n> more\n`,
  (i) => `<div>\nhtml ${i}\n</div>\n`,
  (i) => `| a | b |\n|---|---|\n| ${i} | y |\n`,
  (i) => `[ref${i}]: https://x.y/${i}\n`,
  () => '---\n',
  (i) => `Setext ${i}\n===\n`,
  (i) => `- [ ] task ${i}\n- [x] done\n`,
];
const INSERTS = ['\n', '\n\n', '# ', '- ', '```', '    ', '> ', '|', '**', 'text', '1. ', '---', '<div>', ' ', '\t', '[x] ', '===', '~~~'];

test('after each random edit, the tree equals a fresh parse of the same text', () => {
  let checks = 0;
  for (let seed = 1; seed <= 30; seed += 1) {
    const next = random(seed);
    let text = '';
    for (let i = 0, n = 20 + Math.floor(next() * 100); i < n; i += 1) text += BLOCKS[Math.floor(next() * BLOCKS.length)](i) + (next() < 0.8 ? '\n' : '');
    let state = EditorState.create({ doc: text, extensions });
    fullTree(state);
    for (let step = 0; step < 30; step += 1) {
      const length = state.doc.length;
      const from = next() < 0.5 ? state.doc.lineAt(Math.floor(next() * length)).from : Math.floor(next() * (length + 1));
      const to = Math.min(length, from + (next() < 0.4 ? Math.floor(next() * 12) : 0));
      const insert = next() < 0.85 ? INSERTS[Math.floor(next() * INSERTS.length)] : '';
      state = state.update({ changes: { from, to, insert } }).state;
      const fresh = EditorState.create({ doc: state.doc, extensions });
      assert.equal(shape(fullTree(state)), shape(fullTree(fresh)), `seed ${seed}, step ${step}: ${JSON.stringify(insert)} at ${from}, ${to - from} removed`);
      checks += 1;
    }
  }
  assert.equal(checks, 900);
});

test('an edit in 1 MB of dense Markdown parses again in a few milliseconds, at the start, middle and end', () => {
  // A top-level block every 40 bytes, as the dense perf document.
  const block = (i) =>
    `## Section ${i}\n\nSome **bold** text with a [link](https://example.com/${i}) and \`code\`, plus *emphasis* ${i}.\n\n` +
    `- item one\n- [x] task two\n\n\`\`\`js\nconst x${i} = ${i};\n\`\`\`\n\n| a | b |\n|---|---|\n| ${i} | y |\n\n`;
  let text = '';
  for (let i = 0; text.length < 1_040_000; i += 1) text += block(i);
  let state = EditorState.create({ doc: text, extensions });
  fullTree(state);
  for (const at of [15, Math.floor(text.length / 2), text.length - 500]) {
    const from = state.doc.lineAt(at).from;
    const start = performance.now();
    for (let key = 0; key < 50; key += 1) {
      state = state.update({ changes: { from: from + key, insert: 'x' } }).state;
      fullTree(state);
    }
    const perKey = (performance.now() - start) / 50;
    assert.ok(perKey < 10, `${perKey.toFixed(1)} ms per key at ${at}`);
  }
});

test('package.json allows only the @lezer/markdown version that the postinstall patch is made for', async () => {
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  const script = await readFile(new URL('../../scripts/patch-lezer-markdown.js', import.meta.url), 'utf8');
  const patched = /^const VERSION = '([^']+)';$/m.exec(script)?.[1];
  assert.ok(patched);
  // A range would let npm update install a version that the patch stops on.
  assert.equal(pkg.dependencies['@lezer/markdown'], patched);
});

test('the lockfile holds one copy of @lezer/markdown, the one the patch changes', async () => {
  const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  // A dependency that needs another version would get its own copy, which no patch reaches.
  const copies = Object.keys(lock.packages).filter((path) => path.endsWith('node_modules/@lezer/markdown'));
  assert.deepEqual(copies, ['node_modules/@lezer/markdown']);
});
