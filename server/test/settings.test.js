import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTestApp, login, ORIGIN } from './helpers.js';

let ctx;
let cookie;

beforeEach(async () => {
  ctx = await createTestApp();
  cookie = await login(ctx.app);
});

afterEach(() => ctx.close());

const get = () => ctx.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
const put = (payload) =>
  ctx.app.inject({ method: 'PUT', url: '/api/settings', headers: { cookie, origin: ORIGIN }, payload });

test('the autosave delay is 5 seconds by default', async () => {
  const res = await get();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { autosaveSeconds: 5 });
});

test('a saved delay is returned and survives a restart', async () => {
  const res = await put({ autosaveSeconds: 12 });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { autosaveSeconds: 12 });
  assert.deepEqual((await get()).json(), { autosaveSeconds: 12 });
  await ctx.restart();
  cookie = await login(ctx.app);
  assert.deepEqual((await get()).json(), { autosaveSeconds: 12 });
});

test('1 and 60 are accepted', async () => {
  assert.equal((await put({ autosaveSeconds: 1 })).statusCode, 200);
  assert.equal((await put({ autosaveSeconds: 60 })).statusCode, 200);
  assert.deepEqual((await get()).json(), { autosaveSeconds: 60 });
});

test('values outside whole numbers 1 to 60 are rejected and the stored value stays', async () => {
  await put({ autosaveSeconds: 7 });
  for (const autosaveSeconds of [0, 61, 2.5, -1, '5', null, true]) {
    const res = await put({ autosaveSeconds });
    assert.equal(res.statusCode, 400, `value ${JSON.stringify(autosaveSeconds)}`);
    assert.deepEqual(res.json(), { error: 'invalid_autosave_seconds' });
  }
  assert.equal((await put({})).statusCode, 400);
  assert.deepEqual((await get()).json(), { autosaveSeconds: 7 });
});

test('a body that is not an object is rejected', async () => {
  for (const payload of [[5], '5']) {
    const res = await ctx.app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'invalid_request' });
  }
});

test('a stored value that breaks the rule reads as the default', async () => {
  for (const bad of ['abc', '0', '61', '2.5', '']) {
    ctx.db
      .prepare("INSERT INTO settings (key, value) VALUES ('autosave_seconds', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
      .run(bad);
    assert.deepEqual((await get()).json(), { autosaveSeconds: 5 }, `stored ${JSON.stringify(bad)}`);
  }
});
