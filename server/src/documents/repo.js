// Document storage (BUILD_PLAN.md section 2.6).
import { randomUUID } from 'node:crypto';
import { transaction } from '../db.js';

export const LANGUAGES = [
  'plain',
  'markdown',
  'json',
  'html',
  'css',
  'javascript',
  'typescript',
  'python',
  'sql',
  'yaml',
  'shell',
];

// node:sqlite (seen in Node 24.13) cuts a bound TEXT value at its first NUL
// character, so content is stored as UTF-8 bytes (a BLOB in the TEXT column).
const encodeContent = (text) => Buffer.from(text, 'utf8');
const decodeContent = (value) => (typeof value === 'string' ? value : Buffer.from(value).toString('utf8'));

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
      encodeContent(content),
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
  return row && { ...toMeta(row), content: decodeContent(row.content) };
}

/**
 * Saves content only when the stored version still equals expectedVersion.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ id: string, content: string, expectedVersion: number, now: number }} input
 * @returns {{ ok: true, version: number, updatedAt: number } | { ok: false, currentVersion: number | null }}
 *   currentVersion is null when the document does not exist.
 */
export function saveContent(db, { id, content, expectedVersion, now }) {
  const { changes } = db
    .prepare('UPDATE documents SET content = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
    .run(encodeContent(content), now, id, expectedVersion);
  if (changes === 1) return { ok: true, version: expectedVersion + 1, updatedAt: now };
  const row = db.prepare('SELECT version FROM documents WHERE id = ?').get(id);
  return { ok: false, currentVersion: row?.version ?? null };
}

/**
 * Applies a rename and/or a language override. Only a rename changes
 * updated_at (section 2.6). Neither changes version (TD-6).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @param {{ name?: string, language?: string | null }} changes Already validated.
 * @param {number} now
 * @returns {DocumentMeta | undefined} undefined when the document does not exist.
 */
export function updateMeta(db, id, { name, language }, now) {
  return transaction(db, () => {
    if (name !== undefined) db.prepare('UPDATE documents SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
    if (language !== undefined) db.prepare('UPDATE documents SET language = ? WHERE id = ?').run(language, id);
    const row = db.prepare('SELECT id, name, version, language, updated_at FROM documents WHERE id = ?').get(id);
    return row && toMeta(row);
  });
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {boolean} false when the document does not exist.
 */
export function deleteDocument(db, id) {
  return db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes === 1;
}
