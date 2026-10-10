import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
let outDir;

before(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'pn-build-'));
  await promisify(execFile)(process.execPath, [join(rootDir, 'scripts', 'build-web.js'), outDir]);
});

after(() => rm(outDir, { recursive: true, force: true }));

test('build writes each entry bundle with a sourcemap and copies the static files', async () => {
  assert.deepEqual((await readdir(outDir)).sort(), [
    'THIRD-PARTY-NOTICES.txt',
    'chunks',
    'icons',
    'index.html',
    'login.html',
    'login.js',
    'login.js.map',
    'main.js',
    'main.js.map',
    'manifest.webmanifest',
    'mermaid-frame.js',
    'mermaid-frame.js.map',
    'styles.css',
    'theme-init.js',
    'theme-init.js.map',
  ]);
});

test('build copies the HTML pages and stylesheet unchanged', async () => {
  const icons = (await readdir(join(rootDir, 'web', 'icons'))).map((name) => `icons/${name}`);
  for (const name of ['index.html', 'login.html', 'styles.css', 'manifest.webmanifest', ...icons]) {
    assert.deepEqual(await readFile(join(outDir, name)), await readFile(join(rootDir, 'web', name)), name);
  }
});

test('the theme-init bundle runs as a classic script, sets the theme, outline and workspace state and adds no globals', async () => {
  const { runInNewContext } = await import('node:vm');
  const code = await readFile(join(outDir, 'theme-init.js'), 'utf8');
  for (const [theme, outline, workspace] of [[null, null, null], ['light', 'closed', 'work']]) {
    const stored = { 'pn.theme': theme, 'pn.outline': outline, 'pn.workspace': workspace };
    const sandbox = {
      document: { title: 'Margin', documentElement: { dataset: { page: 'app' } } },
      localStorage: { getItem: (key) => stored[key] },
    };
    runInNewContext(code, sandbox);
    assert.deepEqual(Object.keys(sandbox).sort(), ['document', 'localStorage']);
    assert.equal(sandbox.document.documentElement.dataset.theme, theme ?? 'dark');
    assert.equal(sandbox.document.documentElement.dataset.outline, outline ?? 'open');
    assert.equal(sandbox.document.documentElement.dataset.workspace, workspace ?? 'personal');
    assert.equal(sandbox.document.title, workspace === 'work' ? 'Work - Margin' : 'Personal - Margin');
  }
});

test('on the sign-in page the theme-init bundle keeps the title (TD-29)', async () => {
  const { runInNewContext } = await import('node:vm');
  const code = await readFile(join(outDir, 'theme-init.js'), 'utf8');
  const sandbox = {
    document: { title: 'Sign in - Margin', documentElement: { dataset: {} } },
    localStorage: { getItem: (key) => (key === 'pn.workspace' ? 'work' : null) },
  };
  runInNewContext(code, sandbox);
  assert.equal(sandbox.document.title, 'Sign in - Margin');
});

test('Mermaid is only in the diagram frame, and the login page loads no chunk (MDV-13, NFR-4)', async () => {
  const main = await readFile(join(outDir, 'main.js'), 'utf8');
  const frame = await readFile(join(outDir, 'mermaid-frame.js'), 'utf8');
  const login = await readFile(join(outDir, 'login.js'), 'utf8');
  assert.match(main, /mermaid-frame\.js/);
  assert.doesNotMatch(main, /mermaid-js|flowchart-v2|dompurify/i);
  assert.match(frame + (await readAllChunks()), /flowchart-v2/);
  assert.doesNotMatch(login, /chunks\//);
});

async function readAllChunks() {
  const names = (await readdir(join(outDir, 'chunks'))).filter((file) => file.endsWith('.js'));
  return (await Promise.all(names.map((name) => readFile(join(outDir, 'chunks', name), 'utf8')))).join('\n');
}

// The licenses that C6 names. khroma states MIT in its license file only.
const ALLOWED = new Set(['MIT', 'BSD-3-Clause', 'Apache-2.0', 'AGPL-3.0', 'ISC', 'Unlicense', 'BlueOak-1.0.0']);
const LICENSE_FILE_ONLY = new Map([['khroma', 'MIT']]);

test('the notices file holds the license of each bundled package, and each license is allowed (C6)', async () => {
  const text = await readFile(join(outDir, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
  const sections = text.split(/\n-{72}\n/);
  const names = sections.map((section) => section.split(' ', 1)[0].trim());
  for (const name of ['@codemirror/state', '@lezer/markdown', 'character-entities', 'mermaid', 'dompurify', 'd3-shape']) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(!names.includes('elkjs'));
  for (const section of sections) {
    const name = section.split(' ', 1)[0].trim();
    const license = /^License: (.+)$/m.exec(section)?.[1];
    const options = (LICENSE_FILE_ONLY.get(name) ?? license ?? '').replace(/[()]/g, '').split(' OR ');
    assert.ok(options.some((option) => ALLOWED.has(option)), `${name}: ${license}`);
    const body = section.slice(section.indexOf('\n\n') + 2);
    assert.match(body, /copyright|public domain/i, `${name} has its license text`);
  }
});

test('no bundle holds the ELK layout, which is EPL-2.0 (MDV-13, C6)', async () => {
  const chunks = await readdir(join(outDir, 'chunks'));
  assert.ok(chunks.some((name) => name.endsWith('.js')));
  for (const name of [...chunks.filter((file) => file.endsWith('.js')).map((file) => join('chunks', file)), 'mermaid-frame.js']) {
    const code = await readFile(join(outDir, name), 'utf8');
    assert.doesNotMatch(code, /org\.eclipse\.elk/, name);
  }
});
