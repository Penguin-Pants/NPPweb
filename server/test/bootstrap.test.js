import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { ensurePassword } from '../src/auth/bootstrap.js';
import { hashPassword, readPasswordHash, storePasswordHash, verifyPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';

const OWNER = 'owner-password-from-railway';
const IN_APP = 'in-app-password-chosen-later';
let dir;
let db;
let lines;
const logger = {
  info: (msg) => lines.push({ level: 'info', msg }),
  warn: (msg) => lines.push({ level: 'warn', msg }),
  error: (msg) => lines.push({ level: 'error', msg }),
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pn-bootstrap-'));
  db = openDatabase(dir);
  lines = [];
});

afterEach(async () => {
  for (const { msg } of lines) {
    assert.ok(!msg.includes(OWNER) && !msg.includes(IN_APP) && !msg.includes('short-pw'), `log leaks a password: ${msg}`);
  }
  db.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

const config = (env) => loadConfig({ DATA_DIR: dir, ...env });
const addSession = () =>
  db.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, 0, 1)").run(String(Math.random()));
const sessionCount = () => db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;

test('reset stores OWNER_PASSWORD, deletes all sessions and warns', async () => {
  storePasswordHash(db, await hashPassword(IN_APP));
  addSession();
  addSession();
  await ensurePassword({ db, config: config({ OWNER_PASSWORD: OWNER, RESET_PASSWORD: 'true' }), logger });
  assert.equal(await verifyPassword(OWNER, readPasswordHash(db)), true);
  assert.equal(await verifyPassword(IN_APP, readPasswordHash(db)), false);
  assert.equal(sessionCount(), 0);
  assert.deepEqual(lines, [{ level: 'warn', msg: 'Password reset from OWNER_PASSWORD. Remove RESET_PASSWORD now.' }]);
});

test('reset without OWNER_PASSWORD fails and keeps the stored password', async () => {
  storePasswordHash(db, await hashPassword(IN_APP));
  addSession();
  await assert.rejects(
    ensurePassword({ db, config: config({ RESET_PASSWORD: '1' }), logger }),
    { message: 'RESET_PASSWORD needs OWNER_PASSWORD' },
  );
  assert.equal(await verifyPassword(IN_APP, readPasswordHash(db)), true);
  assert.equal(sessionCount(), 1);
});

test('a stored password wins over a different OWNER_PASSWORD and logs why', async () => {
  storePasswordHash(db, await hashPassword(IN_APP));
  addSession();
  await ensurePassword({ db, config: config({ OWNER_PASSWORD: OWNER }), logger });
  assert.equal(await verifyPassword(IN_APP, readPasswordHash(db)), true);
  assert.equal(await verifyPassword(OWNER, readPasswordHash(db)), false);
  assert.equal(sessionCount(), 1);
  assert.deepEqual(lines, [
    {
      level: 'warn',
      msg: 'OWNER_PASSWORD is ignored because an in-app password is in use. Use RESET_PASSWORD to restore it.',
    },
  ]);
});

test('a stored password with a matching or missing OWNER_PASSWORD logs nothing', async () => {
  storePasswordHash(db, await hashPassword(OWNER));
  await ensurePassword({ db, config: config({ OWNER_PASSWORD: OWNER }), logger });
  await ensurePassword({ db, config: config({}), logger });
  assert.equal(await verifyPassword(OWNER, readPasswordHash(db)), true);
  assert.deepEqual(lines, []);
});

test('with no stored password, OWNER_PASSWORD seeds it', async () => {
  await ensurePassword({ db, config: config({ OWNER_PASSWORD: OWNER }), logger });
  assert.equal(await verifyPassword(OWNER, readPasswordHash(db)), true);
  assert.deepEqual(lines, []);
});

test('a seed shorter than 12 characters is stored with a warning', async () => {
  await ensurePassword({ db, config: config({ OWNER_PASSWORD: 'short-pw' }), logger });
  assert.equal(await verifyPassword('short-pw', readPasswordHash(db)), true);
  assert.deepEqual(lines, [
    { level: 'warn', msg: 'OWNER_PASSWORD is shorter than 12 characters. Choose a longer password.' },
  ]);
});

test('with no stored password and no OWNER_PASSWORD, startup fails', async () => {
  await assert.rejects(ensurePassword({ db, config: config({}), logger }), {
    message: 'No password configured. Set OWNER_PASSWORD.',
  });
  assert.equal(readPasswordHash(db), null);
});
