import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, validateNewPassword, verifyPassword } from '../src/auth/password.js';

test('a hash verifies its own password and uses the scrypt format', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.match(stored, /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
});

test('a wrong password does not verify', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('two hashes of one password differ', async () => {
  assert.notEqual(await hashPassword('same password here'), await hashPassword('same password here'));
});

test('malformed stored values return false', async () => {
  const stored = await hashPassword('correct horse battery');
  const [, n, r, p, salt, hash] = stored.split('$');
  const malformed = [
    '',
    'not a hash',
    `bcrypt$${n}$${r}$${p}$${salt}$${hash}`,
    `scrypt$${n}$${r}$${p}$${salt}`,
    `scrypt$1000$${r}$${p}$${salt}$${hash}`,
    `scrypt$abc$${r}$${p}$${salt}$${hash}`,
    `scrypt$${n}$${r}$${p}$${salt}$${hash.slice(0, -4)}`,
    `scrypt$${n}$${r}$${p}$${salt}$${hash}$extra`,
    null,
    undefined,
  ];
  for (const value of malformed) {
    assert.equal(await verifyPassword('correct horse battery', value), false, String(value));
  }
});

test('a non-string password does not verify', async () => {
  const stored = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword(undefined, stored), false);
  assert.equal(await verifyPassword(12345678901234, stored), false);
});

test('new passwords need 12 to 256 characters', () => {
  assert.equal(validateNewPassword('a'.repeat(11)), false);
  assert.equal(validateNewPassword('a'.repeat(12)), true);
  assert.equal(validateNewPassword('a'.repeat(256)), true);
  assert.equal(validateNewPassword('a'.repeat(257)), false);
  assert.equal(validateNewPassword(undefined), false);
  assert.equal(validateNewPassword(123456789012), false);
});

test('password length counts characters, not UTF-16 units', () => {
  assert.equal(validateNewPassword('😀'.repeat(11)), false);
  assert.equal(validateNewPassword('😀'.repeat(12)), true);
  assert.equal(validateNewPassword('😀'.repeat(256)), true);
});
