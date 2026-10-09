import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { migrate, openDatabase } from '../src/db.js';

let dir;
const open = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pn-db-'));
});

afterEach(async () => {
  for (const db of open.splice(0)) if (db.isOpen) db.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

function openTracked(dataDir) {
  const db = openDatabase(dataDir);
  open.push(db);
  return db;
}

const tableNames = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);

test('a fresh folder gets notepad.db at user_version 1 with the three tables', () => {
  const dataDir = join(dir, 'nested', 'data');
  const db = openTracked(dataDir);
  assert.ok(existsSync(join(dataDir, 'notepad.db')));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.deepEqual(tableNames(db), ['documents', 'sessions', 'settings']);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sessions'").all();
  assert.ok(indexes.some((row) => row.name === 'sessions_expires_at'));
});

test('documents get default content, version and language', () => {
  const db = openTracked(dir);
  db.prepare('INSERT INTO documents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('a', 'n', 1, 1);
  const row = db.prepare('SELECT content, version, language FROM documents').get();
  assert.deepEqual({ ...row }, { content: '', version: 1, language: null });
});

test('pragmas are set on open', () => {
  const db = openTracked(dir);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('a second open is a no-op and keeps data', () => {
  const first = openTracked(dir);
  first.prepare("INSERT INTO settings (key, value) VALUES ('k', 'v')").run();
  first.close();
  const second = openTracked(dir);
  assert.equal(second.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(second.prepare("SELECT value FROM settings WHERE key = 'k'").get().value, 'v');
});

test('a failing migration rolls back every pending migration', () => {
  const db = openTracked(dir);
  const migrations = ['SELECT 1', 'CREATE TABLE extra (id INTEGER)', 'NOT VALID SQL'];
  assert.throws(() => migrate(db, migrations));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.ok(!tableNames(db).includes('extra'));
});

test('migrate applies only the migrations after user_version', () => {
  const db = openTracked(dir);
  migrate(db, ['SELECT 1', 'CREATE TABLE extra (id INTEGER)']);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.ok(tableNames(db).includes('extra'));
});
