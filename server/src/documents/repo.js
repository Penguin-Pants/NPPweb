// Document storage (BUILD_PLAN.md section 2.6). Every query names the
// workspace (v3 TD-24): a document of the other workspace reads as missing.
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
 * @param {string} workspace
 */
export function listDocuments(db, workspace) {
  return db
    .prepare(
      'SELECT id, name, version, language, updated_at FROM documents WHERE workspace = ? ORDER BY updated_at DESC, rowid DESC',
    )
    .all(workspace)
    .map(toMeta);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ workspace: string, name?: string, content: string, language?: string | null, now: number }} input
 *   name must already be normalized and language validated. No language = auto.
 * @returns {DocumentMeta}
 */
export function createDocument(db, { workspace, name, content, language = null, now }) {
  return transaction(db, () => {
    const id = randomUUID();
    const finalName = name ?? nextUntitledName(db, workspace);
    db.prepare(
      'INSERT INTO documents (id, workspace, name, content, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, workspace, finalName, encodeContent(content), language, now, now);
    return { id, name: finalName, version: 1, language, updatedAt: now };
  });
}

// N = 1 + the highest N among names "Untitled N" in the workspace (TD-25).
// Runs inside the insert transaction.
function nextUntitledName(db, workspace) {
  let highest = 0;
  const rows = db.prepare("SELECT name FROM documents WHERE workspace = ? AND name LIKE 'Untitled %'").all(workspace);
  for (const { name } of rows) {
    const n = Number(UNTITLED.exec(name)?.[1]);
    if (Number.isSafeInteger(n) && n > highest) highest = n;
  }
  return `Untitled ${highest + 1}`;
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} workspace
 * @param {string} id
 * @returns {(DocumentMeta & { content: string }) | undefined}
 */
export function getDocument(db, workspace, id) {
  const row = db
    .prepare('SELECT id, name, content, version, language, updated_at FROM documents WHERE id = ? AND workspace = ?')
    .get(id, workspace);
  return row && { ...toMeta(row), content: decodeContent(row.content) };
}

/**
 * Saves content only when the stored version still equals expectedVersion.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ workspace: string, id: string, content: string, expectedVersion: number, now: number }} input
 * @returns {{ ok: true, version: number, updatedAt: number } | { ok: false, currentVersion: number | null }}
 *   currentVersion is null when the document does not exist in the workspace.
 */
export function saveContent(db, { workspace, id, content, expectedVersion, now }) {
  const { changes } = db
    .prepare(
      'UPDATE documents SET content = ?, version = version + 1, updated_at = ? WHERE id = ? AND workspace = ? AND version = ?',
    )
    .run(encodeContent(content), now, id, workspace, expectedVersion);
  if (changes === 1) return { ok: true, version: expectedVersion + 1, updatedAt: now };
  const row = db.prepare('SELECT version FROM documents WHERE id = ? AND workspace = ?').get(id, workspace);
  return { ok: false, currentVersion: row?.version ?? null };
}

/**
 * Applies a rename and/or a language override. Only a rename changes
 * updated_at (section 2.6). Neither changes version (TD-6).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} workspace
 * @param {string} id
 * @param {{ name?: string, language?: string | null }} changes Already validated.
 * @param {number} now
 * @returns {DocumentMeta | undefined} undefined when the document does not exist in the workspace.
 */
export function updateMeta(db, workspace, id, { name, language }, now) {
  return transaction(db, () => {
    if (!db.prepare('SELECT 1 FROM documents WHERE id = ? AND workspace = ?').get(id, workspace)) return undefined;
    if (name !== undefined) db.prepare('UPDATE documents SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
    if (language !== undefined) db.prepare('UPDATE documents SET language = ? WHERE id = ?').run(language, id);
    const row = db.prepare('SELECT id, name, version, language, updated_at FROM documents WHERE id = ?').get(id);
    return row && toMeta(row);
  });
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} workspace
 * @param {string} id
 * @returns {boolean} false when the document does not exist in the workspace.
 */
export function deleteDocument(db, workspace, id) {
  return db.prepare('DELETE FROM documents WHERE id = ? AND workspace = ?').run(id, workspace).changes === 1;
}
