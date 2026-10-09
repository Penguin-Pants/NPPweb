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
    'index.html',
    'login.html',
    'login.js',
    'login.js.map',
    'main.js',
    'main.js.map',
    'styles.css',
    'theme-init.js',
    'theme-init.js.map',
  ]);
});

test('build copies the HTML pages and stylesheet unchanged', async () => {
  for (const name of ['index.html', 'login.html', 'styles.css']) {
    assert.deepEqual(await readFile(join(outDir, name)), await readFile(join(rootDir, 'web', name)), name);
  }
});
