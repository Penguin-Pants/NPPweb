import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createTestApp, login, ORIGIN } from './helpers.js';

test('logs redact cookie and authorization headers', async (t) => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk;
      done();
    },
  });
  const app = await buildApp({ config: loadConfig({}), logger: { stream } });
  t.after(() => app.close());
  const headers = { cookie: 'pn_session=cookie-secret', authorization: 'Basic auth-secret', accept: 'text/plain' };
  app.log.info({ headers });
  app.log.info({ request: { headers } });
  assert.match(output, /text\/plain/);
  assert.doesNotMatch(output, /cookie-secret|auth-secret/);
});

test('a signed-in request for an unknown route or a missing file gets 404 not_found (section 2.7)', async (t) => {
  const ctx = await createTestApp();
  t.after(() => ctx.close());
  const cookie = await login(ctx.app);
  const requests = [
    { method: 'GET', url: '/api/no-such-route' },
    { method: 'DELETE', url: '/api/no-such-route', headers: { origin: ORIGIN } },
    { method: 'GET', url: '/no-such-file.txt' },
    { method: 'GET', url: '/chunks/no-such-chunk.js' },
  ];
  for (const { method, url, headers } of requests) {
    const res = await ctx.app.inject({ method, url, headers: { cookie, ...headers } });
    assert.equal(res.statusCode, 404, `${method} ${url}`);
    assert.deepEqual(res.json(), { error: 'not_found' }, `${method} ${url}`);
  }
});
