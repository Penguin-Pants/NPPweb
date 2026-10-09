import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTestApp, login, ORIGIN } from './helpers.js';

const LIMIT = 1_048_576;
let ctx;
let cookie;
let now;
let doc;

beforeEach(async () => {
  now = Date.UTC(2026, 0, 1);
  ctx = await createTestApp({ clock: () => now });
  cookie = await login(ctx.app);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain' },
    payload: 'original',
  });
  doc = res.json();
});

afterEach(() => ctx.close());

const save = (content, ifMatch, id = doc.id) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${id}/content`,
    headers: {
      cookie,
      origin: ORIGIN,
      'content-type': 'text/plain; charset=utf-8',
      ...(ifMatch !== undefined && { 'if-match': String(ifMatch) }),
    },
    payload: content,
  });
const stored = async () =>
  (await ctx.app.inject({ method: 'GET', url: `/api/documents/${doc.id}`, headers: { cookie } })).json();

test('a matching If-Match saves and increments the version', async () => {
  now += 5000;
  const res = await save('changed', 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { version: 2, updatedAt: now });
  const current = await stored();
  assert.equal(current.content, 'changed');
  assert.equal(current.version, 2);
  assert.equal(current.updatedAt, now);
  assert.equal((await save('again', 2)).json().version, 3);
});

test('a stale version returns 412 with currentVersion and leaves content unchanged', async () => {
  await save('first device', 1);
  const res = await save('second device', 1);
  assert.equal(res.statusCode, 412);
  assert.deepEqual(res.json(), { error: 'version_conflict', currentVersion: 2 });
  assert.equal((await stored()).content, 'first device');
});

test('a deleted document returns 404', async () => {
  ctx.db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  const res = await save('text', 1);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not_found' });
});

test('a missing or malformed If-Match returns 428 and saves nothing', async () => {
  for (const ifMatch of [undefined, '', 'abc', '1.5', '-1', 'W/"1"']) {
    const res = await save('text', ifMatch);
    assert.equal(res.statusCode, 428, String(ifMatch));
    assert.deepEqual(res.json(), { error: 'version_required' });
  }
  assert.equal((await stored()).content, 'original');
});

test('exactly 1,048,576 bytes is accepted', async () => {
  const res = await save('a'.repeat(LIMIT), 1);
  assert.equal(res.statusCode, 200);
  assert.equal((await stored()).content.length, LIMIT);
});

test('one byte more returns 413 and leaves content unchanged', async () => {
  const res = await save('a'.repeat(LIMIT + 1), 1);
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.json(), { error: 'too_large', limitBytes: LIMIT });
  const current = await stored();
  assert.equal(current.content, 'original');
  assert.equal(current.version, 1);
});

test('the save limit counts UTF-8 bytes', async () => {
  assert.equal((await save('é'.repeat(LIMIT / 2 + 1), 1)).statusCode, 413);
  assert.equal((await save('é'.repeat(LIMIT / 2), 1)).statusCode, 200);
});

test('empty content is accepted', async () => {
  const res = await save('', 1);
  assert.equal(res.statusCode, 200);
  assert.equal((await stored()).content, '');
});

test('a non-text body returns 415 and saves nothing', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${doc.id}/content`,
    headers: { cookie, origin: ORIGIN, 'if-match': '1' },
    payload: { content: 'json' },
  });
  assert.equal(res.statusCode, 415);
  assert.equal((await stored()).content, 'original');
});

test('a save with no body is rejected and keeps the content', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${doc.id}/content`,
    headers: { cookie, origin: ORIGIN, 'if-match': '1' },
  });
  assert.equal(res.statusCode, 415);
  assert.equal((await stored()).content, 'original');
});

test('a JSON string body is rejected and keeps the content', async () => {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/documents/${doc.id}/content`,
    headers: { cookie, origin: ORIGIN, 'if-match': '1', 'content-type': 'application/json' },
    payload: '"replaced"',
  });
  assert.equal(res.statusCode, 415);
  assert.equal((await stored()).content, 'original');
});
