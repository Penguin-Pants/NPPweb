import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { LANGUAGE_IDS } from '../../shared/contract.js';
import { createTestApp, login, ORIGIN } from './helpers.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
let ctx;
let cookie;
let now;
let doc;

beforeEach(async () => {
  now = Date.UTC(2026, 0, 1);
  ctx = await createTestApp({ clock: () => now });
  cookie = await login(ctx.app);
  doc = (
    await ctx.app.inject({
      method: 'POST',
      url: '/api/documents?name=a.py',
      headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain' },
      payload: 'print(1)',
    })
  ).json();
});

afterEach(() => ctx.close());

const patch = (payload, id = doc.id) =>
  ctx.app.inject({ method: 'PATCH', url: `/api/documents/${id}`, headers: { cookie, origin: ORIGIN }, payload });
const remove = (id = doc.id) =>
  ctx.app.inject({ method: 'DELETE', url: `/api/documents/${id}`, headers: { cookie, origin: ORIGIN } });
const get = (id = doc.id) => ctx.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: { cookie } });

test('rename keeps the version and updates updatedAt', async () => {
  await ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${doc.id}/content`,
    headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain', 'if-match': '1' },
    payload: 'print(2)',
  });
  now += 5000;
  const res = await patch({ name: '  a.sql ' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { id: doc.id, name: 'a.sql', version: 2, language: null, updatedAt: now });
  const stored = (await get()).json();
  assert.equal(stored.name, 'a.sql');
  assert.equal(stored.version, 2);
  assert.equal(stored.content, 'print(2)');
});

test('an invalid name returns 400 invalid_name and changes nothing', async () => {
  for (const name of ['', '  ', 'x'.repeat(256), 'a\u0000b', 42, null]) {
    const res = await patch({ name });
    assert.equal(res.statusCode, 400, JSON.stringify(name));
    assert.deepEqual(res.json(), { error: 'invalid_name' });
  }
  assert.equal((await get()).json().name, 'a.py');
});

test('language accepts each of the 11 values and null', async () => {
  for (const language of LANGUAGE_IDS) {
    const res = await patch({ language });
    assert.equal(res.statusCode, 200, language);
    assert.equal(res.json().language, language);
  }
  const reset = await patch({ language: null });
  assert.equal(reset.json().language, null);
  assert.equal((await get()).json().language, null);
});

test('an unknown language returns 400 invalid_language and changes nothing', async () => {
  await patch({ language: 'python' });
  for (const language of ['rust', '', 'PYTHON', 'auto', 5]) {
    const res = await patch({ language });
    assert.equal(res.statusCode, 400, String(language));
    assert.deepEqual(res.json(), { error: 'invalid_language' });
  }
  assert.equal((await get()).json().language, 'python');
});

test('a language change keeps the version and updatedAt', async () => {
  now += 5000;
  const res = await patch({ language: 'sql' });
  assert.equal(res.json().version, 1);
  assert.equal(res.json().updatedAt, doc.updatedAt);
});

test('one invalid field rejects the whole PATCH', async () => {
  const res = await patch({ name: 'b.sql', language: 'rust' });
  assert.equal(res.statusCode, 400);
  const stored = (await get()).json();
  assert.equal(stored.name, 'a.py');
  assert.equal(stored.language, null);
});

test('a PATCH body must be a JSON object', async () => {
  for (const payload of [[1], '"text"']) {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/documents/${doc.id}`,
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: 'invalid_request' });
  }
});

test('PATCH and DELETE on an unknown id return 404', async () => {
  assert.equal((await patch({ name: 'x' }, MISSING_ID)).statusCode, 404);
  const res = await remove(MISSING_ID);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not_found' });
});

test('delete returns 204, then GET returns 404 and the list omits it', async () => {
  const res = await remove();
  assert.equal(res.statusCode, 204);
  assert.equal((await get()).statusCode, 404);
  const list = (await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: { cookie } })).json();
  assert.deepEqual(list, []);
  assert.equal((await remove()).statusCode, 404);
});

test('the list order follows content saves and renames, not language changes', async () => {
  const create = async (name) =>
    (
      await ctx.app.inject({
        method: 'POST',
        url: `/api/documents?name=${name}`,
        headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain' },
        payload: '',
      })
    ).json();
  const order = async () =>
    (await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: { cookie } })).json().map((d) => d.name);
  now += 1000;
  const b = await create('b.txt');
  now += 1000;
  const c = await create('c.txt');
  assert.deepEqual(await order(), ['c.txt', 'b.txt', 'a.py']);
  now += 1000;
  await ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${doc.id}/content`,
    headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain', 'if-match': '1' },
    payload: 'saved later',
  });
  assert.deepEqual(await order(), ['a.py', 'c.txt', 'b.txt']);
  now += 1000;
  await patch({ name: 'b2.txt' }, b.id);
  assert.deepEqual(await order(), ['b2.txt', 'a.py', 'c.txt']);
  now += 1000;
  await patch({ language: 'markdown' }, c.id);
  assert.deepEqual(await order(), ['b2.txt', 'a.py', 'c.txt']);
});

test('malformed or empty JSON returns 400 bad_request', async () => {
  for (const payload of ['{not json', '']) {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/documents/${doc.id}`,
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      payload,
    });
    assert.equal(res.statusCode, 400, JSON.stringify(payload));
    assert.deepEqual(res.json(), { error: 'bad_request' });
  }
});
