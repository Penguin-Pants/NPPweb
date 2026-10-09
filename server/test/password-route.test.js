import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTestApp, login, ORIGIN, PASSWORD } from './helpers.js';

const NEW_PASSWORD = 'a-brand-new-password';
let ctx;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(() => ctx.close());

const changePassword = (cookie, payload) =>
  ctx.app.inject({ method: 'POST', url: '/api/password', headers: { cookie, origin: ORIGIN }, payload });
const loginStatus = async (password) =>
  (await ctx.app.inject({ method: 'POST', url: '/api/login', headers: { origin: ORIGIN }, payload: { password } }))
    .statusCode;
const sessionStatus = async (cookie) =>
  (await ctx.app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).statusCode;

test('after a change the old password fails and the new one works', async () => {
  const cookie = await login(ctx.app);
  const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(res.statusCode, 204);
  assert.equal(await loginStatus(PASSWORD), 401);
  assert.equal(await loginStatus(NEW_PASSWORD), 204);
});

test('a change signs out other sessions and keeps the current one', async () => {
  const other = await login(ctx.app);
  const current = await login(ctx.app);
  await changePassword(current, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(await sessionStatus(other), 401);
  assert.equal(await sessionStatus(current), 200);
});

test('a wrong current password returns 400 and changes nothing', async () => {
  const other = await login(ctx.app);
  const cookie = await login(ctx.app);
  for (const currentPassword of ['not-the-password', undefined]) {
    const res = await changePassword(cookie, { currentPassword, newPassword: NEW_PASSWORD });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'wrong_current_password' });
  }
  assert.equal(await sessionStatus(other), 200);
  assert.equal(await loginStatus(PASSWORD), 204);
});

test('a weak new password returns 400 and changes nothing', async () => {
  const cookie = await login(ctx.app);
  for (const newPassword of ['a'.repeat(11), 'a'.repeat(257), undefined, 123456789012]) {
    const res = await changePassword(cookie, { currentPassword: PASSWORD, newPassword });
    assert.equal(res.statusCode, 400, String(newPassword));
    assert.deepEqual(res.json(), { error: 'weak_password' });
  }
  assert.equal(await loginStatus(PASSWORD), 204);
});

test('the new password still works after a restart with OWNER_PASSWORD still set', async () => {
  assert.equal(ctx.config.ownerPassword, PASSWORD);
  const cookie = await login(ctx.app);
  await changePassword(cookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
  await ctx.restart();
  assert.equal(await loginStatus(PASSWORD), 401);
  assert.equal(await loginStatus(NEW_PASSWORD), 204);
  assert.equal(await sessionStatus(cookie), 200);
});
