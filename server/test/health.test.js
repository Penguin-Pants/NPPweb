import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestApp } from './helpers.js';

test('GET /healthz returns 200 with ok true and needs no session', async (t) => {
  const ctx = await createTestApp();
  t.after(() => ctx.close());
  const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});
