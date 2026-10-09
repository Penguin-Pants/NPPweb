// Server-side sessions (TD-4). The cookie holds a random token. The database
// holds only its SHA-256 hash. Lifetime is fixed at 30 days from sign-in.
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'pn_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * @param {boolean} isProduction
 * @returns {import('@fastify/cookie').CookieSerializeOptions}
 */
export function sessionCookieOptions(isProduction) {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure: isProduction };
}

/**
 * Creates a session and returns its token.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} now Unix ms.
 */
export function createSession(db, now) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

/**
 * Returns true when the token belongs to a session that has not expired.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} token
 * @param {number} now Unix ms.
 */
export function isValidSession(db, token, now) {
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token));
  return row !== undefined && now < row.expires_at;
}

/** @param {import('node:sqlite').DatabaseSync} db @param {string} token */
export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** @param {import('node:sqlite').DatabaseSync} db */
export function deleteAllSessions(db) {
  db.prepare('DELETE FROM sessions').run();
}

/** Deletes every session except the one for token. */
export function deleteOtherSessions(db, token) {
  db.prepare('DELETE FROM sessions WHERE token_hash != ?').run(hashToken(token));
}

/** @param {import('node:sqlite').DatabaseSync} db @param {number} now Unix ms. */
export function purgeExpiredSessions(db, now) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
}
