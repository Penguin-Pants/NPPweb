// Startup password bootstrap: seed, reset or refuse (decision D4, T06).
// Log lines never contain password values.
import { transaction } from '../db.js';
import { hashPassword, readPasswordHash, storePasswordHash, verifyPassword } from './password.js';
import { deleteAllSessions } from './sessions.js';

/**
 * Throws when the app must not start.
 * @param {object} options
 * @param {import('node:sqlite').DatabaseSync} options.db
 * @param {import('../config.js').Config} options.config
 * @param {{ warn: (msg: string) => void }} options.logger
 */
export async function ensurePassword({ db, config, logger }) {
  const { ownerPassword, resetPassword } = config;

  if (resetPassword) {
    if (!ownerPassword) throw new Error('RESET_PASSWORD needs OWNER_PASSWORD');
    const hash = await hashPassword(ownerPassword);
    transaction(db, () => {
      storePasswordHash(db, hash);
      deleteAllSessions(db);
    });
    logger.warn('Password reset from OWNER_PASSWORD. Remove RESET_PASSWORD now.');
    warnIfShort(ownerPassword, logger);
    return;
  }

  const stored = readPasswordHash(db);
  if (stored) {
    if (ownerPassword && !(await verifyPassword(ownerPassword, stored))) {
      logger.warn('OWNER_PASSWORD is ignored because an in-app password is in use. Use RESET_PASSWORD to restore it.');
    }
    return;
  }

  if (!ownerPassword) throw new Error('No password configured. Set OWNER_PASSWORD.');
  storePasswordHash(db, await hashPassword(ownerPassword));
  warnIfShort(ownerPassword, logger);
}

function warnIfShort(password, logger) {
  if ([...password].length < 12) {
    logger.warn('OWNER_PASSWORD is shorter than 12 characters. Choose a longer password.');
  }
}
