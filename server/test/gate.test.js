import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestApp, login, ORIGIN } from './helpers.js';

let ctx;

before(async () => {
  ctx = await createTestApp();
  await ctx.app.ready();
});

after(() => ctx.close());

// The only routes that answer without a session (BUILD_PLAN.md section 2.9).
const PUBLIC = [
  ['GET', '/login'],
  ['GET', '/login.js'],
  ['GET', '/theme-init.js'],
  ['GET', '/styles.css'],
  ['GET', '/healthz'],
  ['GET', '/manifest.webmanifest'],
  ['GET', '/icons/icon-192.png'],
  ['GET', '/icons/icon-512.png'],
  ['GET', '/icons/icon-maskable-512.png'],
  ['POST', '/api/login'],
];
const isPublic = (method, url) =>
  PUBLIC.some(([m, u]) => (m === method || (m === 'GET' && method === 'HEAD')) && u === url);

// Concrete URLs for every registered route pattern.
function sweepTargets() {
  const targets = [];
  for (const { method, url } of ctx.app.registeredRoutes) {
    for (const m of [method].flat()) {
      if (url.endsWith('*')) {
        for (const file of ['', 'index.html', 'main.js', 'login.html', 'no-such-file.js']) {
          targets.push([m, url.replace('*', file)]);
        }
      } else {
        targets.push([m, url.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000')]);
      }
    }
  }
  return targets.filter(([method, url]) => !isPublic(method, url));
}

test('the route list covers the API and the static files', () => {
  const urls = new Set(ctx.app.registeredRoutes.map((route) => route.url));
  for (const url of ['/api/session', '/api/logout', '/api/login', '/healthz', '/login', '/*']) {
    assert.ok(urls.has(url), url);
  }
});

test('the API has no sign-up, user or account routes', () => {
  const apiRoutes = ctx.app.registeredRoutes
    .filter((route) => route.url.startsWith('/api/'))
    .map((route) => `${route.method} ${route.url}`)
    .sort();
  assert.deepEqual([...new Set(apiRoutes)], [
    'DELETE /api/documents/:id',
    'GET /api/documents',
    'GET /api/documents/:id',
    'GET /api/session',
    'HEAD /api/documents',
    'HEAD /api/documents/:id',
    'HEAD /api/session',
    'PATCH /api/documents/:id',
    'POST /api/documents',
    'POST /api/login',
    'POST /api/logout',
    'POST /api/password',
    'PUT /api/documents/:id/content',
  ]);
});

test('every non-public route returns 401 with no data and no session', async () => {
  const targets = sweepTargets();
  assert.ok(targets.length > 5);
  for (const [method, url] of targets) {
    const res = await ctx.app.inject({ method, url, headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
    if (method !== 'HEAD') assert.deepEqual(res.json(), { error: 'unauthorized' }, `${method} ${url}`);
  }
});

test('HTML navigation without a session redirects to /login', async () => {
  for (const url of ['/', '/index.html', '/api/session', '/no-such-page']) {
    const res = await ctx.app.inject({ method: 'GET', url, headers: { accept: 'text/html,application/xhtml+xml' } });
    assert.equal(res.statusCode, 302, url);
    assert.equal(res.headers.location, '/login', url);
  }
});

test('unknown paths and non-GET methods without a session return 401', async () => {
  for (const [method, url] of [
    ['GET', '/no-such-file'],
    ['DELETE', '/api/anything'],
    ['PUT', '/login'],
  ]) {
    const res = await ctx.app.inject({ method, url, headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('public routes answer without a session', async () => {
  for (const [method, url] of PUBLIC.filter(([m]) => m === 'GET')) {
    const res = await ctx.app.inject({ method, url });
    assert.equal(res.statusCode, 200, url);
  }
  const page = await ctx.app.inject({ method: 'GET', url: '/login' });
  assert.equal(page.body, '/* login.html */');
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin: ORIGIN },
    payload: { password: 'x' },
  });
  assert.deepEqual(res.json(), { error: 'invalid_credentials' });
});

test('a signed-in session reaches the editor page', async () => {
  const cookie = await login(ctx.app);
  const res = await ctx.app.inject({ method: 'GET', url: '/', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, '/* index.html */');
});

test('state-changing requests need an Origin that matches Host', async () => {
  const cookie = await login(ctx.app);
  for (const origin of [undefined, 'null', 'http://evil.example', 'http://localhost:8080', 'not a url']) {
    const headers = origin === undefined ? { cookie } : { cookie, origin };
    const res = await ctx.app.inject({ method: 'POST', url: '/api/logout', headers });
    assert.equal(res.statusCode, 403, String(origin));
    assert.deepEqual(res.json(), { error: 'bad_origin' });
  }
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/session', headers: { cookie } })).statusCode, 200);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/logout', headers: { cookie, origin: ORIGIN } });
  assert.equal(res.statusCode, 204);
});

test('the Origin check compares hosts, including ports', async () => {
  const cookie = await login(ctx.app);
  const headers = { cookie, host: 'notes.example:8443', origin: 'https://notes.example:8443' };
  const res = await ctx.app.inject({ method: 'POST', url: '/api/logout', headers });
  assert.equal(res.statusCode, 204);
  const other = await ctx.app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { host: 'notes.example', origin: 'https://notes.example.evil' },
    payload: { password: 'x' },
  });
  assert.equal(other.statusCode, 403);
});

test('login also needs a matching Origin', async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/login', payload: { password: 'x' } });
  assert.equal(res.statusCode, 403);
});

test('PUT, PATCH and DELETE also need a matching Origin', async () => {
  const cookie = await login(ctx.app);
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    for (const origin of [undefined, 'http://evil.example']) {
      const headers = origin === undefined ? { cookie } : { cookie, origin };
      const res = await ctx.app.inject({ method, url: '/api/session', headers });
      assert.equal(res.statusCode, 403, `${method} ${origin}`);
    }
  }
});

test('the public allowlist matches exact paths only', async () => {
  const near = ['/login/', '/login.js/', '/%6cogin.js', '//login', '/LOGIN', '/healthz/', '/styles.css.map', '/login.html'];
  for (const url of near) {
    const res = await ctx.app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401, url);
  }
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/login?next=1' })).statusCode, 200);
});

test('the manifest and icons are public with the right content types (TD-19)', async () => {
  const manifest = await ctx.app.inject({ method: 'GET', url: '/manifest.webmanifest' });
  assert.equal(manifest.statusCode, 200);
  assert.match(manifest.headers['content-type'], /^application\/manifest\+json/);
  for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    const res = await ctx.app.inject({ method: 'GET', url: `/icons/${name}` });
    assert.equal(res.statusCode, 200, name);
    assert.equal(res.headers['content-type'], 'image/png', name);
  }
  assert.equal((await ctx.app.inject({ method: 'GET', url: '/icons/other.png' })).statusCode, 401);
});
