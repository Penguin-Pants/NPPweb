// Thin wrapper around node:sqlite (TD-3). Callers use prepare, exec and close,
// which better-sqlite3 also provides, so a swap stays local to this file.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.js';

/**
 * Opens dataDir/notepad.db, creating the folder if needed, and runs migrations.
 * @param {string} dataDir
 */
export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'notepad.db'));
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

/**
 * Applies the migrations after PRAGMA user_version in one transaction.
 * @param {DatabaseSync} db
 * @param {string[]} [list]
 */
export function migrate(db, list = migrations) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current >= list.length) return;
  transaction(db, () => {
    for (const sql of list.slice(current)) db.exec(sql);
    db.exec(`PRAGMA user_version = ${list.length}`);
  });
}

/**
 * Runs fn inside BEGIN IMMEDIATE ... COMMIT. Rolls back if fn throws.
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} fn
 * @returns {T}
 */
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
