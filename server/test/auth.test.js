import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { SESSION_TTL_MS } from '../src/auth/sessions.js';
import { createTestApp, login, ORIGIN, PASSWORD } from './helpers.js';

let ctx;
let now;

beforeEach(async () => {
  now = Date.UTC(2026, 0, 1);
  ctx = await createTestApp({ clock: () => now });
});

afterEach(() => ctx.close());

const sessionStatus = async (cookie) =>
  (await ctx.app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).statusCode;

test('the right password returns 204 and a session cookie with the required flags', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin: ORIGIN },
    payload: { password: PASSWORD },
  });
  assert.equal(res.statusCode, 204);
  const cookie = res.headers['set-cookie'];
  assert.match(cookie, /^pn_session=[A-Za-z0-9_-]{43};/);
  assert.match(cookie, /; Max-Age=2592000(;|$)/);
  assert.match(cookie, /; Path=\/(;|$)/);
  assert.match(cookie, /; HttpOnly(;|$)/);
  assert.match(cookie, /; SameSite=Lax(;|$)/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('the session cookie authenticates GET /api/session', async () => {
  const cookie = await login(ctx.app);
  const res = await ctx.app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authenticated: true });
});

test('the cookie holds a random token and the database holds only its hash', async () => {
  const cookie = await login(ctx.app);
  const token = cookie.split('=')[1];
  const rows = ctx.db.prepare('SELECT token_hash FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(await login(ctx.app), cookie);
});

test('a wrong password returns 401 invalid_credentials and no cookie', async () => {
  for (const payload of [{ password: 'wrong-password-here' }, {}, { password: 42 }]) {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/login', headers: { origin: ORIGIN }, payload });
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.json(), { error: 'invalid_credentials' });
    assert.equal(res.headers['set-cookie'], undefined);
  }
});

test('logout ends the session and clears the cookie', async () => {
  const cookie = await login(ctx.app);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/logout', headers: { cookie, origin: ORIGIN } });
  assert.equal(res.statusCode, 204);
  assert.match(res.headers['set-cookie'], /^pn_session=;/);
  assert.match(res.headers['set-cookie'], /Expires=Thu, 01 Jan 1970/);
  assert.equal(await sessionStatus(cookie), 401);
});

test('logout ends only the current session', async () => {
  const first = await login(ctx.app);
  const second = await login(ctx.app);
  await ctx.app.inject({ method: 'POST', url: '/api/logout', headers: { cookie: first, origin: ORIGIN } });
  assert.equal(await sessionStatus(second), 200);
});

test('a session is valid at 30 days minus 1 ms and invalid at 30 days plus 1 ms', async () => {
  assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * 60 * 1000);
  const start = now;
  const cookie = await login(ctx.app);
  now = start + SESSION_TTL_MS - 1;
  assert.equal(await sessionStatus(cookie), 200);
  now = start + SESSION_TTL_MS + 1;
  assert.equal(await sessionStatus(cookie), 401);
});

test('a session lifetime does not slide with use', async () => {
  const start = now;
  const cookie = await login(ctx.app);
  now = start + SESSION_TTL_MS / 2;
  assert.equal(await sessionStatus(cookie), 200);
  now = start + SESSION_TTL_MS + 1;
  assert.equal(await sessionStatus(cookie), 401);
});

test('an unknown session token returns 401', async () => {
  assert.equal(await sessionStatus('pn_session=not-a-real-token'), 401);
});
