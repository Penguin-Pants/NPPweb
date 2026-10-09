import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

test('GET /healthz returns 200 with ok true', async (t) => {
  const app = buildApp({ config: loadConfig({}), logger: false });
  t.after(() => app.close());
  const res = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});
