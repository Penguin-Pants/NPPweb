import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createTestApp, login, ORIGIN, PASSWORD } from './helpers.js';

const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
let ctx;

afterEach(() => ctx.close());

async function sampleResponses(app) {
  const cookie = await login(app);
  return {
    health: await app.inject({ method: 'GET', url: '/healthz' }),
    loginPage: await app.inject({ method: 'GET', url: '/login' }),
    redirect: await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } }),
    unauthorized: await app.inject({ method: 'GET', url: '/api/session' }),
    badOrigin: await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } }),
    staticFile: await app.inject({ method: 'GET', url: '/main.js', headers: { cookie } }),
    notFound: await app.inject({ method: 'GET', url: '/api/no-such-route', headers: { cookie } }),
    session: await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } }),
  };
}

test('every response carries the security headers and no HSTS outside production', async () => {
  ctx = await createTestApp();
  for (const [name, res] of Object.entries(await sampleResponses(ctx.app))) {
    assert.equal(res.headers['content-security-policy'], CSP, name);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', name);
    assert.equal(res.headers['referrer-policy'], 'no-referrer', name);
    assert.equal(res.headers['strict-transport-security'], undefined, name);
  }
});

test('every /api/ response has Cache-Control no-store', async () => {
  ctx = await createTestApp();
  const responses = await sampleResponses(ctx.app);
  assert.equal(responses.notFound.statusCode, 404);
  for (const name of ['unauthorized', 'badOrigin', 'notFound', 'session']) {
    assert.equal(responses[name].headers['cache-control'], 'no-store', name);
  }
  assert.notEqual(responses.staticFile.headers['cache-control'], 'no-store');
});

test('production adds HSTS and the Secure cookie flag', async () => {
  ctx = await createTestApp({ env: { NODE_ENV: 'production' } });
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin: ORIGIN },
    payload: { password: PASSWORD },
  });
  assert.equal(res.statusCode, 204);
  assert.match(res.headers['set-cookie'], /; Secure(;|$)/);
  assert.match(res.headers['set-cookie'], /; HttpOnly(;|$)/);
  assert.match(res.headers['set-cookie'], /; SameSite=Lax(;|$)/);
  for (const [name, response] of Object.entries(await sampleResponses(ctx.app))) {
    assert.equal(response.headers['strict-transport-security'], 'max-age=31536000', name);
  }
});
