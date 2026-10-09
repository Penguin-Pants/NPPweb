import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createAutosave } from '../src/autosave.js';

// Lets pending promise callbacks run. setImmediate is not mocked.
const settle = () => new Promise((resolve) => setImmediate(resolve));

let calls;
let replies;
let statuses;
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
  content = { a: 'one', b: 'two' };
  autosave = createAutosave({
    save: controlledSave,
    onStatus: (id, status) => statuses.push(`${id}:${status}`),
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
