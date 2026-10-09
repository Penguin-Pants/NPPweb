// Server-side sessions (TD-4).

/** @param {import('node:sqlite').DatabaseSync} db */
export function deleteAllSessions(db) {
  db.prepare('DELETE FROM sessions').run();
}
