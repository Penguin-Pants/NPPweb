import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTestApp, login, ORIGIN } from './helpers.js';

const LIMIT = 1_048_576;
let ctx;
let cookie;
let now;

beforeEach(async () => {
  now = Date.UTC(2026, 0, 1);
  ctx = await createTestApp({ clock: () => now });
  cookie = await login(ctx.app);
});

afterEach(() => ctx.close());

const create = (content = '', query = '') =>
  ctx.app.inject({
    method: 'POST',
    url: `/api/documents${query}`,
    headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain; charset=utf-8' },
    payload: content,
  });
const withName = (name) => `?name=${encodeURIComponent(name)}`;
const list = async () => (await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: { cookie } })).json();
const get = (id) => ctx.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: { cookie } });

test('the list is empty at first', async () => {
  assert.deepEqual(await list(), []);
});

test('create without a name gives Untitled 1, then Untitled 2', async () => {
  const first = await create();
  assert.equal(first.statusCode, 201);
  assert.deepEqual(Object.keys(first.json()).sort(), ['id', 'language', 'name', 'updatedAt', 'version']);
  assert.equal(first.json().name, 'Untitled 1');
  assert.equal(first.json().version, 1);
  assert.equal(first.json().language, null);
  assert.equal(first.json().updatedAt, now);
  assert.match(first.json().id, /^[0-9a-f-]{36}$/);
  assert.equal((await create()).json().name, 'Untitled 2');
});

test('Untitled N uses 1 + the highest N, not the count', async () => {
  const first = (await create()).json();
  await create();
  ctx.db.prepare("UPDATE documents SET name = 'renamed.txt' WHERE id = ?").run(first.id);
  assert.equal((await create()).json().name, 'Untitled 3');
});

test('only names that are exactly "Untitled <digits>" count', async () => {
  for (const name of ['Untitled 9 notes', 'untitled 7', 'Untitled', 'My Untitled 8']) await create('', withName(name));
  assert.equal((await create()).json().name, 'Untitled 1');
  await create('', withName('Untitled 41'));
  assert.equal((await create()).json().name, 'Untitled 42');
});

test('create stores the body and an optional trimmed name', async () => {
  const res = await create('hello\nworld', withName('  notes.md  '));
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().name, 'notes.md');
  assert.equal(res.json().language, null);
  const doc = (await get(res.json().id)).json();
  assert.deepEqual(doc, { ...res.json(), content: 'hello\nworld' });
});

test('create stores an optional language and rejects an unknown one', async () => {
  const res = await create('', '?language=markdown');
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().name, 'Untitled 1');
  assert.equal(res.json().language, 'markdown');
  assert.equal((await get(res.json().id)).json().language, 'markdown');
  assert.equal((await create('', `${withName('a.txt')}&language=python`)).json().language, 'python');
  for (const query of ['?language=rust', '?language=', '?language=plain&language=sql']) {
    const bad = await create('', query);
    assert.equal(bad.statusCode, 400, query);
    assert.deepEqual(bad.json(), { error: 'invalid_language' });
  }
  assert.equal((await list()).length, 2);
});

test('an empty body creates an empty document', async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/documents', headers: { cookie, origin: ORIGIN } });
  assert.equal(res.statusCode, 201);
  assert.equal((await get(res.json().id)).json().content, '');
});

test('duplicate names are allowed', async () => {
  const a = await create('', withName('same.txt'));
  const b = await create('', withName('same.txt'));
  assert.equal(b.statusCode, 201);
  assert.notEqual(a.json().id, b.json().id);
});

test('invalid names return 400 invalid_name', async () => {
  for (const name of ['', '   ', 'a'.repeat(256), 'bell\u0007', 'line\nbreak', 'tab\tname', 'del\u007f']) {
    const res = await create('', withName(name));
    assert.equal(res.statusCode, 400, JSON.stringify(name));
    assert.deepEqual(res.json(), { error: 'invalid_name' });
  }
  assert.deepEqual(await list(), []);
});

test('names of 255 characters are allowed, counted as characters', async () => {
  assert.equal((await create('', withName('a'.repeat(255)))).statusCode, 201);
  assert.equal((await create('', withName('😀'.repeat(255)))).statusCode, 201);
  assert.equal((await create('', withName('😀'.repeat(256)))).statusCode, 400);
});

test('the list is newest first and has no content', async () => {
  const ids = [];
  for (const name of ['a', 'b', 'c']) {
    now += 1000;
    ids.push((await create(`content of ${name}`, withName(name))).json().id);
  }
  const rows = await list();
  assert.deepEqual(rows.map((row) => row.id), ids.reverse());
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'language', 'name', 'updatedAt', 'version']);
});

test('a body of 1,048,577 bytes returns 413 and creates nothing', async () => {
  const res = await create('a'.repeat(LIMIT + 1));
  assert.equal(res.statusCode, 413);
  assert.deepEqual(res.json(), { error: 'too_large', limitBytes: LIMIT });
  assert.deepEqual(await list(), []);
});

test('a body of exactly 1,048,576 bytes is accepted', async () => {
  const res = await create('a'.repeat(LIMIT));
  assert.equal(res.statusCode, 201);
  assert.equal((await get(res.json().id)).json().content.length, LIMIT);
});

test('the limit counts UTF-8 bytes, not characters', async () => {
  const over = await create('é'.repeat(LIMIT / 2 + 1));
  assert.equal(over.statusCode, 413);
  const exact = await create('é'.repeat(LIMIT / 2));
  assert.equal(exact.statusCode, 201);
  assert.equal((await get(exact.json().id)).json().content, 'é'.repeat(LIMIT / 2));
});

test('a non-text body returns 415', async () => {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: { cookie, origin: ORIGIN },
    payload: { content: 'json is not accepted' },
  });
  assert.equal(res.statusCode, 415);
  assert.deepEqual(await list(), []);
});

test('an unknown id returns 404 not_found', async () => {
  const res = await get('00000000-0000-4000-8000-000000000000');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.json(), { error: 'not_found' });
});

test('document routes need a session', async () => {
  for (const [method, url] of [
    ['GET', '/api/documents'],
    ['POST', '/api/documents'],
    ['GET', '/api/documents/x'],
  ]) {
    const res = await ctx.app.inject({ method, url, headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 401, `${method} ${url}`);
  }
});

test('a chunked body over the limit returns 413 (the byte counter, not Content-Length)', async () => {
  const { Readable } = await import('node:stream');
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain; charset=utf-8' },
    payload: Readable.from([Buffer.from('é'.repeat(LIMIT / 2 + 1))]),
  });
  assert.equal(res.statusCode, 413);
  assert.deepEqual(await list(), []);
});

test('content must be text/plain in UTF-8', async () => {
  const cases = [
    { 'content-type': 'application/json', payload: '"a json string"' },
    { 'content-type': 'text/plain; charset=iso-8859-1', payload: 'latin' },
    { 'content-type': 'text/plainish', payload: 'x' },
  ];
  for (const { payload, ...headers } of cases) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: { cookie, origin: ORIGIN, ...headers },
      payload,
    });
    assert.equal(res.statusCode, 415, headers['content-type']);
    assert.deepEqual(res.json(), { error: 'unsupported_media_type' });
  }
  for (const type of ['text/plain', 'text/plain;charset=UTF-8', 'TEXT/PLAIN; charset="utf-8"']) {
    const typed = await ctx.app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: { cookie, origin: ORIGIN, 'content-type': type },
      payload: 'ok',
    });
    assert.equal(typed.statusCode, 201, type);
  }
});

test('content round-trips control characters, NUL and astral characters', async () => {
  const text = 'a\u0000b\tc\r\nd 😀   end';
  const res = await create(text);
  assert.equal((await get(res.json().id)).json().content, text);
});
