import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createAutosave } from '../src/autosave.js';

// Lets pending promise callbacks run. setImmediate is not mocked.
const settle = () => new Promise((resolve) => setImmediate(resolve));

let calls;
let replies;
let statuses;
let events;
let autosave;
let content;

/** A save function whose replies the test controls. */
function controlledSave(id, text, version) {
  calls.push({ id, text, version });
  return new Promise((resolve) => replies.push(resolve));
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  calls = [];
  replies = [];
  statuses = [];
  events = [];
  content = { a: 'one', b: 'two' };
  autosave = createAutosave({
    save: controlledSave,
    onStatus: (id, status) => statuses.push(`${id}:${status}`),
    onEvent: (type, detail) => events.push({ type, ...detail }),
  });
  autosave.track('a', { version: 1, getContent: () => content.a });
  autosave.track('b', { version: 5, getContent: () => content.b });
});

afterEach(() => mock.timers.reset());

const reply = async (status, data) => {
  replies.shift()({ status, data });
  await settle();
};

test('an edit sets unsaved and saves the latest content after 1000 ms', async () => {
  autosave.edited('a');
  assert.equal(autosave.status('a'), 'unsaved');
  mock.timers.tick(999);
  assert.equal(calls.length, 0);
  content.a = 'one more';
  mock.timers.tick(1);
  assert.deepEqual(calls, [{ id: 'a', text: 'one more', version: 1 }]);
  assert.equal(autosave.status('a'), 'saving');
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(autosave.status('a'), 'saved');
  assert.deepEqual(statuses, ['a:unsaved', 'a:saving', 'a:saved']);
});

test('each edit restarts the debounce', () => {
  autosave.edited('a');
  mock.timers.tick(600);
  autosave.edited('a');
  mock.timers.tick(999);
  assert.equal(calls.length, 0);
  mock.timers.tick(1);
  assert.equal(calls.length, 1);
});

test('the next save uses the version from the last successful save', async () => {
  autosave.edited('a');
  mock.timers.tick(1000);
  await reply(200, { version: 2, updatedAt: 1 });
  autosave.edited('a');
  mock.timers.tick(1000);
  assert.equal(calls[1].version, 2);
  assert.equal(autosave.version('a'), 2);
});

test('only one save is in flight, and edits during it cause one more save', async () => {
  autosave.edited('a');
  mock.timers.tick(1000);
  content.a = 'typed during save';
  autosave.edited('a');
  mock.timers.tick(1000);
  autosave.edited('a');
  mock.timers.tick(1000);
  assert.equal(calls.length, 1);
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { id: 'a', text: 'typed during save', version: 2 });
  assert.equal(autosave.status('a'), 'saving');
  await reply(200, { version: 3, updatedAt: 2 });
  assert.equal(calls.length, 2);
  assert.equal(autosave.status('a'), 'saved');
});

test('flush saves at once, cancels the debounce and reports success', async () => {
  autosave.edited('a');
  const flushed = autosave.flush('a');
  assert.equal(calls.length, 1);
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(await flushed, true);
  mock.timers.tick(5000);
  assert.equal(calls.length, 1);
});

test('flush waits for the save in flight and the follow-up save', async () => {
  autosave.edited('a');
  mock.timers.tick(1000);
  content.a = 'newer';
  autosave.edited('a');
  let done = false;
  const flushed = autosave.flush('a').then((ok) => (done = ok));
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(done, false);
  assert.equal(calls[1].text, 'newer');
  await reply(200, { version: 3, updatedAt: 2 });
  assert.equal(await flushed, true);
});

test('flush with nothing to save resolves true and sends nothing', async () => {
  assert.equal(await autosave.flush('a'), true);
  assert.equal(calls.length, 0);
  assert.equal(autosave.status('a'), 'saved');
});

test('documents save independently', async () => {
  autosave.edited('a');
  autosave.edited('b');
  mock.timers.tick(1000);
  assert.deepEqual(
    calls.map((call) => [call.id, call.version]),
    [
      ['a', 1],
      ['b', 5],
    ],
  );
});

test('an untracked document stops saving', () => {
  autosave.edited('a');
  autosave.untrack('a');
  mock.timers.tick(5000);
  assert.equal(calls.length, 0);
});

/** Edits doc a, lets the debounce fire and answers the save with status. */
async function failOnce(status, data = null) {
  autosave.edited('a');
  mock.timers.tick(1000);
  await reply(status, data);
}

test('a network error sets error, keeps retrying on the backoff and recovers', async () => {
  await failOnce(0);
  assert.equal(autosave.status('a'), 'error');
  assert.equal(autosave.reason('a'), 'network');
  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    const before = calls.length;
    mock.timers.tick(delay - 1);
    assert.equal(calls.length, before, `no retry before ${delay} ms`);
    mock.timers.tick(1);
    assert.equal(calls.length, before + 1, `retry at ${delay} ms`);
    await reply(503);
  }
  mock.timers.tick(30000);
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(autosave.status('a'), 'saved');
  assert.equal(autosave.reason('a'), null);
  assert.equal(calls.at(-1).text, 'one');
});

test('a success resets the backoff', async () => {
  await failOnce(0);
  mock.timers.tick(2000);
  await reply(200, { version: 2, updatedAt: 1 });
  await failOnce(500);
  mock.timers.tick(2000);
  assert.equal(calls.length, 4);
});

test('an edit during an error saves after the debounce, not the retry delay', async () => {
  await failOnce(0);
  autosave.edited('a');
  assert.equal(autosave.status('a'), 'unsaved');
  mock.timers.tick(1000);
  assert.equal(calls.length, 2);
});

test('flush resolves false when the save fails', async () => {
  autosave.edited('a');
  const flushed = autosave.flush('a');
  await reply(0);
  assert.equal(await flushed, false);
  assert.equal(autosave.status('a'), 'error');
});

test('a 401 pauses every document until resumeAll, which flushes them', async () => {
  await failOnce(401);
  autosave.edited('b');
  mock.timers.tick(60000);
  assert.equal(calls.length, 1);
  assert.equal(autosave.status('a'), 'unsaved');
  assert.equal(autosave.status('b'), 'unsaved');
  autosave.resumeAll();
  assert.deepEqual(calls.slice(1).map((call) => call.id).sort(), ['a', 'b']);
});

test('a 412 pauses that document and emits doc-conflict', async () => {
  await failOnce(412, { error: 'version_conflict', currentVersion: 7 });
  assert.deepEqual(events, [{ type: 'doc-conflict', id: 'a', currentVersion: 7 }]);
  assert.equal(autosave.status('a'), 'error');
  assert.equal(autosave.reason('a'), 'conflict');
  autosave.edited('a');
  mock.timers.tick(60000);
  assert.equal(await autosave.flush('a'), false);
  assert.equal(calls.length, 1);
  autosave.edited('b');
  mock.timers.tick(1000);
  assert.equal(calls.at(-1).id, 'b');
});

test('resume sets the new version and saves a paused document', async () => {
  await failOnce(412, { error: 'version_conflict', currentVersion: 7 });
  const flushed = autosave.resume('a', { version: 7 });
  assert.deepEqual(calls.at(-1), { id: 'a', text: 'one', version: 7 });
  await reply(200, { version: 8, updatedAt: 1 });
  assert.equal(await flushed, true);
  assert.equal(autosave.status('a'), 'saved');
});

test('a 404 pauses that document and emits doc-deleted-remote', async () => {
  await failOnce(404, { error: 'not_found' });
  assert.deepEqual(events, [{ type: 'doc-deleted-remote', id: 'a' }]);
  assert.equal(autosave.reason('a'), 'deleted');
  autosave.edited('a');
  mock.timers.tick(60000);
  assert.equal(calls.length, 1);
});

test('a 413 emits doc-too-large and does not retry until the content changes', async () => {
  await failOnce(413, { error: 'too_large', limitBytes: 1048576 });
  assert.deepEqual(events, [{ type: 'doc-too-large', id: 'a' }]);
  assert.equal(autosave.status('a'), 'error');
  assert.equal(autosave.reason('a'), 'too-large');
  mock.timers.tick(120000);
  assert.equal(await autosave.flush('a'), false);
  assert.equal(calls.length, 1);
  autosave.edited('a');
  mock.timers.tick(1000);
  assert.equal(calls.length, 2);
});

test('a successful save emits doc-saved with the new version', async () => {
  autosave.edited('a');
  mock.timers.tick(1000);
  await reply(200, { version: 2, updatedAt: 1 });
  assert.deepEqual(events, [{ type: 'doc-saved', id: 'a', version: 2 }]);
});

test('hasUnsaved is true while any document is unsaved, saving or in error', async () => {
  assert.equal(autosave.hasUnsaved(), false);
  autosave.edited('a');
  assert.equal(autosave.hasUnsaved(), true);
  mock.timers.tick(1000);
  assert.equal(autosave.hasUnsaved(), true);
  await reply(0);
  assert.equal(autosave.hasUnsaved(), true);
  mock.timers.tick(2000);
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(autosave.hasUnsaved(), false);
});

test('resumeAll does not save a document held by a conflict', async () => {
  await failOnce(412, { error: 'version_conflict', currentVersion: 7 });
  autosave.edited('b');
  mock.timers.tick(1000);
  await reply(401);
  autosave.resumeAll();
  assert.deepEqual(calls.slice(2).map((call) => call.id), ['b']);
  assert.equal(autosave.reason('a'), 'conflict');
});

test('track again clears a hold and settles a flush that waits on an in-flight save', async () => {
  autosave.edited('a');
  const pending = autosave.flush('a');
  autosave.track('a', { version: 7, getContent: () => 'loaded from server' });
  await reply(200, { version: 2, updatedAt: 1 });
  assert.equal(await Promise.race([pending, settle().then(() => 'still pending')]), false);
  assert.equal(autosave.status('a'), 'saved');
  autosave.edited('a');
  mock.timers.tick(1000);
  assert.deepEqual(calls.at(-1), { id: 'a', text: 'loaded from server', version: 7 });
});

test('a reply for a document that was tracked again is ignored', async () => {
  autosave.edited('a');
  mock.timers.tick(1000);
  autosave.track('a', { version: 9, getContent: () => 'fresh' });
  await reply(412, { error: 'version_conflict', currentVersion: 9 });
  assert.equal(autosave.status('a'), 'saved');
  assert.deepEqual(events, []);
});
