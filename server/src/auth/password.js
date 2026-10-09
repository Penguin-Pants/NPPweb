// Password hashing with scrypt (TD-5, BUILD_PLAN.md section 2.9).
// Stored format: scrypt$N$r$p$salt$hash, with salt and hash in base64url.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAXMEM = 64 * 1024 * 1024;

/** @param {string} password */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/**
 * Returns false for a wrong password and for any malformed stored value.
 * @param {unknown} password
 * @param {unknown} stored
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (![n, r, p].every(Number.isSafeInteger) || salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await scryptAsync(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAXMEM });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * New passwords need 12 to 256 characters (Unicode code points).
 * @param {unknown} password
 */
export function validateNewPassword(password) {
  if (typeof password !== 'string') return false;
  const length = [...password].length;
  return length >= 12 && length <= 256;
}
