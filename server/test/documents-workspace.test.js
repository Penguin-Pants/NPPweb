// Workspace-scoped document API (v3 WS-5, WS-6, MIG-3, TD-23 to TD-25).
// gate.test.js pins the route list, so no route can create, rename or
// delete a workspace (WS-1).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';
import { migrate } from '../src/db.js';
import { migrations } from '../src/migrations.js';
import { createTestApp, login, ORIGIN } from './helpers.js';

let ctx;
let cookie;

beforeEach(async () => {
  ctx = await createTestApp();
  cookie = await login(ctx.app);
});

afterEach(() => ctx.close());

const send = (method, url, { payload, headers = {} } = {}) =>
  ctx.app.inject({ method, url, headers: { cookie, origin: ORIGIN, ...headers }, payload });
const text = { 'content-type': 'text/plain; charset=utf-8' };
const ws = (workspace) => (workspace === undefined ? '' : `workspace=${workspace}`);
const query = (...parts) => {
  const joined = parts.filter(Boolean).join('&');
  return joined ? `?${joined}` : '';
};
const create = async (workspace, name) => {
  const res = await send('POST', `/api/documents${query(ws(workspace), name && `name=${encodeURIComponent(name)}`)}`, {
    payload: 'text',
    headers: text,
  });
  assert.equal(res.statusCode, 201);
  return res.json();
};
const names = async (workspace) =>
  (await send('GET', `/api/documents${query(ws(workspace))}`)).json().map((doc) => doc.name);

test('a document of the other workspace is not found by get, save, rename, language or delete', async () => {
  const work = await create('work', 'plan.md');
  const asPersonal = `/api/documents/${work.id}?workspace=personal`;
  const responses = [
    await send('GET', asPersonal),
    await send('PUT', `/api/documents/${work.id}/content?workspace=personal`, {
      payload: 'changed',
      headers: { ...text, 'if-match': '1' },
    }),
    await send('PATCH', asPersonal, { payload: { name: 'renamed.md' } }),
    await send('PATCH', asPersonal, { payload: { language: 'sql' } }),
    await send('DELETE', asPersonal),
    await send('GET', `/api/documents/${work.id}`),
  ];
  for (const res of responses) assert.deepEqual([res.statusCode, res.json()], [404, { error: 'not_found' }]);
  const stored = (await send('GET', `/api/documents/${work.id}?workspace=work`)).json();
  assert.deepEqual([stored.name, stored.content, stored.version, stored.language], ['plan.md', 'text', 1, null]);
});

test('each list holds only the documents of its workspace', async () => {
  await create('personal', 'home.md');
  await create('work', 'plan.md');
  await create(undefined, 'old-client.md');
  assert.deepEqual(await names('personal'), ['old-client.md', 'home.md']);
  assert.deepEqual(await names(undefined), ['old-client.md', 'home.md']);
  assert.deepEqual(await names('work'), ['plan.md']);
});

test('"Untitled N" counts only the names of the target workspace', async () => {
  assert.equal((await create('personal')).name, 'Untitled 1');
  assert.equal((await create('work')).name, 'Untitled 1');
  assert.equal((await create('personal')).name, 'Untitled 2');
  assert.equal((await create('work')).name, 'Untitled 2');
});

test('a request without a workspace acts on Personal, as a page from before v3 sends it (MIG-3)', async () => {
  const doc = await create('personal', 'notes.md');
  const res = await send('PUT', `/api/documents/${doc.id}/content`, {
    payload: 'saved by an old page',
    headers: { ...text, 'if-match': '1' },
  });
  assert.equal(res.statusCode, 200);
  const stored = (await send('GET', `/api/documents/${doc.id}?workspace=personal`)).json();
  assert.equal(stored.content, 'saved by an old page');
  assert.equal((await send('PATCH', `/api/documents/${doc.id}`, { payload: { name: 'n.md' } })).statusCode, 200);
  assert.equal((await send('DELETE', `/api/documents/${doc.id}`)).statusCode, 204);
});

test('an unknown or repeated workspace value returns 400 invalid_workspace on every route', async () => {
  const doc = await create('personal', 'notes.md');
  for (const bad of ['team', 'Work', '', 'work&workspace=personal']) {
    const q = `?workspace=${bad}`;
    const responses = [
      await send('GET', `/api/documents${q}`),
      await send('POST', `/api/documents${q}`, { payload: '', headers: text }),
      await send('GET', `/api/documents/${doc.id}${q}`),
      await send('PUT', `/api/documents/${doc.id}/content${q}`, { payload: 'x', headers: { ...text, 'if-match': '1' } }),
      await send('PATCH', `/api/documents/${doc.id}${q}`, { payload: { name: 'x.md' } }),
      await send('DELETE', `/api/documents/${doc.id}${q}`),
    ];
    for (const res of responses) {
      assert.deepEqual([res.statusCode, res.json()], [400, { error: 'invalid_workspace' }], `${res.request?.url} ${bad}`);
    }
  }
  assert.deepEqual(await names('personal'), ['notes.md']);
});

test('document responses do not carry the workspace', async () => {
  const doc = await create('work', 'plan.md');
  assert.equal(Object.hasOwn(doc, 'workspace'), false);
  const listed = (await send('GET', '/api/documents?workspace=work')).json()[0];
  assert.equal(Object.hasOwn(listed, 'workspace'), false);
});

test('an upgraded version 1 database lists the same documents, now in Personal (MIG-1)', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'pn-upgrade-'));
  const v1 = new DatabaseSync(join(dataDir, 'notepad.db'));
  migrate(v1, migrations.slice(0, 1));
  const insert = v1.prepare(
    'INSERT INTO documents (id, name, content, version, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run('a', 'notes.md', Buffer.from('# Notes'), 3, null, 1, 10);
  insert.run('b', 'Untitled 4', Buffer.from(''), 1, 'markdown', 2, 20);
  v1.close();
  const upgraded = await createTestApp({ env: { DATA_DIR: dataDir } });
  try {
    const session = await login(upgraded.app);
    const get = (url) => upgraded.app.inject({ method: 'GET', url, headers: { cookie: session } });
    const listed = (await get('/api/documents?workspace=personal')).json();
    assert.deepEqual(
      listed.map(({ id, name, version, language, updatedAt }) => ({ id, name, version, language, updatedAt })),
      [
        { id: 'b', name: 'Untitled 4', version: 1, language: 'markdown', updatedAt: 20 },
        { id: 'a', name: 'notes.md', version: 3, language: null, updatedAt: 10 },
      ],
    );
    assert.equal((await get('/api/documents/a')).json().content, '# Notes');
    assert.deepEqual((await get('/api/documents?workspace=work')).json(), []);
  } finally {
    await upgraded.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
});

// Move (v3 MOV-2, TD-26).
const move = (id, from, body) => send('PATCH', `/api/documents/${id}?workspace=${from}`, { payload: body });
const stored = async (id, workspace) => (await send('GET', `/api/documents/${id}?workspace=${workspace}`)).json();

test('a move keeps name, content, version and updatedAt and puts the document in the other list (MOV-2)', async () => {
  const doc = await create('personal', 'notes.md');
  const saved = await send('PUT', `/api/documents/${doc.id}/content?workspace=personal`, {
    payload: 'é and a NUL \u0000 stay',
    headers: { ...text, 'if-match': '1' },
  });
  assert.equal(saved.statusCode, 200);
  const before = await stored(doc.id, 'personal');
  const res = await move(doc.id, 'personal', { workspace: 'work' });
  assert.equal(res.statusCode, 200);
  const { content, ...meta } = before;
  assert.deepEqual(res.json(), meta);
  assert.deepEqual(await stored(doc.id, 'work'), before);
  assert.deepEqual(await names('personal'), []);
  assert.deepEqual(await names('work'), ['notes.md']);
  assert.equal((await send('GET', `/api/documents/${doc.id}?workspace=personal`)).statusCode, 404);
});

test('a moved name that the target already uses stays unchanged (MOV-2)', async () => {
  await create('work', 'notes.md');
  const doc = await create('personal', 'notes.md');
  assert.equal((await move(doc.id, 'personal', { workspace: 'work' })).statusCode, 200);
  assert.deepEqual(await names('work'), ['notes.md', 'notes.md']);
});

test('a move sent with the wrong source workspace is not found and moves nothing', async () => {
  const doc = await create('personal', 'notes.md');
  const res = await move(doc.id, 'work', { workspace: 'personal' });
  assert.deepEqual([res.statusCode, res.json()], [404, { error: 'not_found' }]);
  assert.deepEqual(await names('personal'), ['notes.md']);
});

test('a move to the same workspace returns 200 and changes nothing', async () => {
  const doc = await create('work', 'plan.md');
  const before = await stored(doc.id, 'work');
  const res = await move(doc.id, 'work', { workspace: 'work' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(await stored(doc.id, 'work'), before);
});

test('an unknown move target returns 400 invalid_workspace and moves nothing', async () => {
  const doc = await create('personal', 'notes.md');
  for (const target of ['team', 'Work', null, 1, ['work']]) {
    const res = await move(doc.id, 'personal', { workspace: target, name: 'renamed.md' });
    assert.deepEqual([res.statusCode, res.json()], [400, { error: 'invalid_workspace' }], String(target));
  }
  assert.deepEqual(await names('personal'), ['notes.md']);
});

test('a move and a rename in one request apply together', async () => {
  const doc = await create('personal', 'notes.md');
  const res = await move(doc.id, 'personal', { name: 'plan.md', workspace: 'work' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().name, 'plan.md');
  assert.deepEqual(await names('work'), ['plan.md']);
  assert.deepEqual(await names('personal'), []);
});
