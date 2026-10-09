import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { start } from '../src/index.js';

const OWNER_PASSWORD = 'index-test-password';
let dataDir;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'pn-index-'));
});

afterEach(() => rm(dataDir, { recursive: true, force: true, maxRetries: 5 }));

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`start opens the database, serves /healthz and exits 0 on ${signal}`, async () => {
    let exited;
    const exitCode = new Promise((resolve) => (exited = resolve));
    const env = { PORT: '0', DATA_DIR: dataDir, OWNER_PASSWORD };
    const app = await start({ env, exit: exited, logger: false });
    assert.ok(existsSync(join(dataDir, 'notepad.db')));
    const { port } = app.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    process.emit(signal);
    assert.equal(await exitCode, 0);
    assert.equal(app.server.listening, false);
  });
}

test('start exits 1 on a config error', async (t) => {
  t.mock.method(console, 'error', () => {});
  const codes = [];
  const env = { PORT: 'abc', DATA_DIR: dataDir, OWNER_PASSWORD };
  const app = await start({ env, exit: (code) => codes.push(code), logger: false });
  assert.equal(app, undefined);
  assert.deepEqual(codes, [1]);
});

test('start in production without a volume path exits 1 with the message', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const codes = [];
  const env = { NODE_ENV: 'production', OWNER_PASSWORD };
  const app = await start({ env, exit: (code) => codes.push(code), logger: false });
  assert.equal(app, undefined);
  assert.deepEqual(codes, [1]);
  assert.equal(errors.mock.calls[0].arguments[0], 'No persistent volume configured. Attach a Railway volume.');
});

test('start exits 1 when no password is configured', async () => {
  const codes = [];
  const app = await start({ env: { PORT: '0', DATA_DIR: dataDir }, exit: (code) => codes.push(code), logger: false });
  assert.equal(app, undefined);
  assert.deepEqual(codes, [1]);
});

test('start deletes expired sessions before it listens', async () => {
  const { openDatabase } = await import('../src/db.js');
  const db = openDatabase(dataDir);
  const insert = db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, 0, ?)');
  insert.run('expired', 1);
  insert.run('current', Date.now() + 60_000);
  db.close();
  let exited;
  const exitCode = new Promise((resolve) => (exited = resolve));
  await start({ env: { PORT: '0', DATA_DIR: dataDir, OWNER_PASSWORD }, exit: exited, logger: false });
  process.emit('SIGTERM');
  await exitCode;
  const after = openDatabase(dataDir);
  const left = after.prepare('SELECT token_hash FROM sessions').all().map((row) => row.token_hash);
  after.close();
  assert.deepEqual(left, ['current']);
});
