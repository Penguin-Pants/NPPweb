// api.js: workspace on document calls (v3 TD-30) and stale replies after a
// switch (TD-41), with a fake fetch.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api } from '../src/api.js';
import { on } from '../src/events.js';

let calls;
let pending;
let expired;
let stop;
const savedFetch = globalThis.fetch;

/** A fetch whose replies wait until the test resolves them. */
function fakeFetch() {
  return (url, init) =>
    new Promise((resolve, reject) => {
      calls.push({ url, method: init.method });
      pending.push({ resolve, reject });
    });
}
const reply = (status, body = null) => ({
  status,
  headers: { get: () => (body === null ? null : 'application/json') },
  json: async () => body,
});
const answer = (index, status, body) => pending[index].resolve(reply(status, body));

beforeEach(() => {
  calls = [];
  pending = [];
  expired = 0;
  stop = on('session-expired', () => (expired += 1));
  globalThis.fetch = fakeFetch();
  api.setWorkspace('personal');
});

afterEach(() => {
  stop();
  globalThis.fetch = savedFetch;
  api.setWorkspace('personal');
});

test('in Work, every document call names the workspace, other calls do not', async () => {
  api.setWorkspace('work');
  assert.equal(api.workspace(), 'work');
  api.listDocuments();
  api.createDocument('', undefined, 'markdown');
  api.createDocument('x', 'a b.md');
  api.getDocument('id1');
  api.saveContent('id1', 'text', 3);
  api.updateDocument('id1', { name: 'n' });
  api.deleteDocument('id1');
  api.getSettings();
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      'GET /api/documents?workspace=work',
      'POST /api/documents?language=markdown&workspace=work',
      'POST /api/documents?name=a%20b.md&workspace=work',
      'GET /api/documents/id1?workspace=work',
      'PUT /api/documents/id1/content?workspace=work',
      'PATCH /api/documents/id1?workspace=work',
      'DELETE /api/documents/id1?workspace=work',
      'GET /api/settings',
    ],
  );
});

test('Personal document calls send no workspace, the server default, so v1 paths stay the same (MIG-3)', async () => {
  api.listDocuments();
  api.getDocument('id1');
  api.listDocuments('personal');
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/documents', '/api/documents/id1', '/api/documents'],
  );
});

test('a reply before any switch passes through', async () => {
  const result = api.listDocuments();
  answer(0, 200, []);
  assert.deepEqual(await result, { status: 200, data: [] });
});

test('a document reply that arrives after a switch is stale and emits no session-expired', async () => {
  const list = api.listDocuments();
  const save = api.saveContent('id1', 'text', 1);
  api.setWorkspace('work');
  answer(0, 200, [{ id: 'p1' }]);
  answer(1, 401, { error: 'unauthorized' });
  assert.deepEqual(await list, { status: 0, data: null, stale: true });
  assert.deepEqual(await save, { status: 0, data: null, stale: true });
  assert.equal(expired, 0);
});

test('a network failure after a switch is stale too', async () => {
  const result = api.getDocument('id1');
  api.setWorkspace('work');
  pending[0].reject(new TypeError('offline'));
  assert.deepEqual(await result, { status: 0, data: null, stale: true });
});

test('the list read of a named workspace is never stale (switch prefetch)', async () => {
  const result = api.listDocuments('work');
  assert.equal(calls[0].url, '/api/documents?workspace=work');
  api.setWorkspace('work');
  answer(0, 200, []);
  assert.deepEqual(await result, { status: 200, data: [] });
});

test('a 401 before a switch still emits session-expired', async () => {
  const result = api.getDocument('id1');
  answer(0, 401, { error: 'unauthorized' });
  assert.equal((await result).status, 401);
  assert.equal(expired, 1);
});
