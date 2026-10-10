import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { migrate, openDatabase } from '../src/db.js';
import { migrations } from '../src/migrations.js';

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

test('a fresh folder gets notepad.db at the latest user_version with the three tables', () => {
  const dataDir = join(dir, 'nested', 'data');
  const db = openTracked(dataDir);
  assert.ok(existsSync(join(dataDir, 'notepad.db')));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, migrations.length);
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
  assert.equal(second.prepare('PRAGMA user_version').get().user_version, migrations.length);
  assert.equal(second.prepare("SELECT value FROM settings WHERE key = 'k'").get().value, 'v');
});

test('a failing migration rolls back every pending migration', () => {
  const db = openTracked(dir);
  assert.throws(() => migrate(db, [...migrations, 'CREATE TABLE extra (id INTEGER)', 'NOT VALID SQL']));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, migrations.length);
  assert.ok(!tableNames(db).includes('extra'));
});

test('migrate applies only the migrations after user_version', () => {
  const db = openTracked(dir);
  migrate(db, [...migrations, 'CREATE TABLE extra (id INTEGER)']);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, migrations.length + 1);
  assert.ok(tableNames(db).includes('extra'));
});

// Migration 2 (MIG-1, WS-1, TD-22).
const columns = (db) => db.prepare('PRAGMA table_info(documents)').all().map((row) => row.name);

test('a version 1 database upgrades to 2 and every old document is in Personal', () => {
  const db = new DatabaseSync(join(dir, 'v1.db'));
  open.push(db);
  migrate(db, migrations.slice(0, 1));
  const insert = db.prepare('INSERT INTO documents (id, name, created_at, updated_at) VALUES (?, ?, 1, 1)');
  insert.run('a', 'notes.md');
  insert.run('b', 'Untitled 1');
  migrate(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  const rows = db.prepare('SELECT id, workspace FROM documents ORDER BY id').all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { id: 'a', workspace: 'personal' },
    { id: 'b', workspace: 'personal' },
  ]);
});

test('the workspace column accepts only personal and work', () => {
  const db = openTracked(dir);
  db.prepare('INSERT INTO documents (id, name, created_at, updated_at) VALUES (?, ?, 1, 1)').run('a', 'n');
  db.prepare("UPDATE documents SET workspace = 'work' WHERE id = 'a'").run();
  assert.equal(db.prepare('SELECT workspace FROM documents').get().workspace, 'work');
  assert.throws(() => db.prepare("UPDATE documents SET workspace = 'other' WHERE id = 'a'").run(), /CHECK/);
});

test('a fresh database has the workspace column and its list index', () => {
  const db = openTracked(dir);
  assert.ok(columns(db).includes('workspace'));
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'documents'").all();
  assert.ok(indexes.some((row) => row.name === 'documents_workspace_updated'));
});
