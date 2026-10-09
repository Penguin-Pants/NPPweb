// Document storage (BUILD_PLAN.md section 2.6).
import { randomUUID } from 'node:crypto';
import { transaction } from '../db.js';

const UNTITLED = /^Untitled (\d+)$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * @typedef {object} DocumentMeta
 * @property {string} id
 * @property {string} name
 * @property {number} version Counts content changes only (TD-6).
 * @property {string | null} language Manual override. null = auto.
 * @property {number} updatedAt Unix ms.
 */

/** @returns {DocumentMeta} */
const toMeta = (row) => ({
  id: row.id,
  name: row.name,
  version: row.version,
  language: row.language,
  updatedAt: row.updated_at,
});

/**
 * Returns the trimmed name, or null when it breaks the name rule:
 * 1 to 255 characters after trimming and no control characters.
 * @param {unknown} value
 */
export function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  const length = [...name].length;
  return length >= 1 && length <= 255 && !CONTROL_CHARS.test(name) ? name : null;
}

/**
 * Newest first. No content.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function listDocuments(db) {
  return db
    .prepare('SELECT id, name, version, language, updated_at FROM documents ORDER BY updated_at DESC, rowid DESC')
    .all()
    .map(toMeta);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ name?: string, content: string, now: number }} input name must already be normalized.
 * @returns {DocumentMeta}
 */
export function createDocument(db, { name, content, now }) {
  return transaction(db, () => {
    const id = randomUUID();
    const finalName = name ?? nextUntitledName(db);
    db.prepare('INSERT INTO documents (id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      finalName,
      content,
      now,
      now,
    );
    return { id, name: finalName, version: 1, language: null, updatedAt: now };
  });
}

// N = 1 + the highest N among names "Untitled N". Runs inside the insert transaction.
function nextUntitledName(db) {
  let highest = 0;
  for (const { name } of db.prepare("SELECT name FROM documents WHERE name LIKE 'Untitled %'").all()) {
    const n = Number(UNTITLED.exec(name)?.[1]);
    if (Number.isSafeInteger(n) && n > highest) highest = n;
  }
  return `Untitled ${highest + 1}`;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {(DocumentMeta & { content: string }) | undefined}
 */
export function getDocument(db, id) {
  const row = db
    .prepare('SELECT id, name, content, version, language, updated_at FROM documents WHERE id = ?')
    .get(id);
  return row && { ...toMeta(row), content: row.content };
}
