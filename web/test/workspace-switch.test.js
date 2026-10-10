// The workspace switch (v3 TD-33) and the lock that keeps a switch, a drop
// and a move apart (TD-42), with fakes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExclusive, saveAll, switchWorkspace } from '../src/workspace-switch.js';

/**
 * A fake autosave over `docs` (id -> { status, reason }). Each flush calls
 * `onFlush(id, docs)`, which can change the state, and resolves to its result
 * (default: the document saves).
 */
function fakeAutosave(docs, onFlush = (id) => ((docs[id] = { status: 'saved', reason: null }), true)) {
  const flushed = [];
  return {
    flushed,
    ids: () => Object.keys(docs),
    flush: async (id) => {
      flushed.push(id);
      return onFlush(id, docs);
    },
    hasUnsaved: () => Object.values(docs).some((doc) => doc.status !== 'saved'),
    status: (id) => docs[id]?.status,
    reason: (id) => docs[id]?.reason ?? null,
  };
}
const unsaved = () => ({ status: 'unsaved', reason: null });
const failing = (status, reason) => (id, docs) => ((docs[id] = { status, reason }), false);

test('saveAll flushes every document and is ok when nothing is unsaved', async () => {
  const autosave = fakeAutosave({ a: unsaved(), b: { status: 'saved', reason: null } });
  assert.deepEqual(await saveAll(autosave), { ok: true });
  assert.deepEqual(autosave.flushed, ['a', 'b']);
});

test('saveAll names the cause of a failed save', async () => {
  const cases = [
    [failing('error', 'network'), 'network'],
    [failing('error', 'conflict'), 'conflict'],
    [failing('error', 'deleted'), 'conflict'],
    [failing('error', 'too-large'), 'too-large'],
    [failing('unsaved', null), 'session'], // a 401 pauses the document as unsaved
  ];
  for (const [onFlush, reason] of cases) {
    const docs = { a: unsaved() };
    assert.deepEqual(await saveAll(fakeAutosave(docs, onFlush)), { ok: false, reason });
  }
});

test('saveAll repeats while text keeps changing and gives up after 3 rounds', async () => {
  const autosave = fakeAutosave({ a: unsaved() }, () => true); // saves, but the text is unsaved again
  assert.deepEqual(await saveAll(autosave), { ok: false, reason: 'changing' });
  assert.deepEqual(autosave.flushed, ['a', 'a', 'a']);
});

test('saveAll is ok in a second round when the typing stops', async () => {
  let round = 0;
  const docs = { a: unsaved() };
  const autosave = fakeAutosave(docs, (id) => {
    round += 1;
    docs[id] = round === 1 ? unsaved() : { status: 'saved', reason: null };
    return true;
  });
  assert.deepEqual(await saveAll(autosave), { ok: true });
  assert.deepEqual(autosave.flushed, ['a', 'a']);
});

/** The other parts of a switch to Work, with a log of every step. */
function switchParts({ docs = { a: unsaved() }, onFlush, list = { status: 200, data: [{ id: 'w1' }] }, onList } = {}) {
  const log = [];
  const messages = [];
  const autosave = fakeAutosave(docs, onFlush);
  const flush = autosave.flush;
  autosave.flush = async (id) => {
    log.push(`flush ${id}`);
    return flush(id);
  };
  return {
    log,
    messages,
    deps: {
      target: 'work',
      autosave,
      api: {
        listDocuments: async (target) => {
          log.push(`list ${target}`);
          onList?.(docs);
          return list;
        },
      },
      tabs: {
        closeAllSaved: () => log.push('close'),
        boot: async ({ list: data }) => log.push(`boot ${data.length}`),
      },
      apply: (target) => log.push(`apply ${target}`),
      showMessage: (text) => messages.push(text),
    },
  };
}

test('a switch saves, reads the target list, saves again, then closes, applies and boots', async () => {
  const { log, messages, deps } = switchParts();
  assert.equal(await switchWorkspace(deps), true);
  assert.deepEqual(log, ['flush a', 'list work', 'flush a', 'close', 'apply work', 'boot 1']);
  assert.deepEqual(messages, []);
});

test('text typed during the list read saves before the tabs close (WS-8)', async () => {
  const docs = { a: unsaved() };
  const { log, deps } = switchParts({ docs, onList: () => (docs.a = unsaved()) });
  assert.equal(await switchWorkspace(deps), true);
  assert.deepEqual(log.slice(0, 4), ['flush a', 'list work', 'flush a', 'close']);
  assert.equal(docs.a.status, 'saved');
});

test('a failed save keeps the workspace and names the cause (EDGE-28)', async () => {
  const cases = [
    [failing('error', 'network'), 'the server cannot be reached'],
    [failing('unsaved', null), 'your session ended'],
    [failing('error', 'too-large'), 'a document is larger than 1 MB'],
  ];
  for (const [onFlush, cause] of cases) {
    const { log, messages, deps } = switchParts({ onFlush });
    assert.equal(await switchWorkspace(deps), false);
    assert.deepEqual(log, ['flush a']);
    assert.deepEqual(messages, [`Unsaved changes could not be saved: ${cause}. The workspace did not change.`]);
  }
});

test('a conflict keeps the workspace and leaves the explaining to its dialog (EDGE-29)', async () => {
  const { log, messages, deps } = switchParts({ onFlush: failing('error', 'conflict') });
  assert.equal(await switchWorkspace(deps), false);
  assert.deepEqual(log, ['flush a']);
  assert.deepEqual(messages, []);
});

test('text that keeps changing keeps the workspace', async () => {
  const { log, messages, deps } = switchParts({ onFlush: () => true });
  assert.equal(await switchWorkspace(deps), false);
  assert.deepEqual(log, ['flush a', 'flush a', 'flush a']);
  assert.deepEqual(messages, ['Text is still changing. Try the switch again.']);
});

test('a failed list read keeps the workspace, with all text already saved (EDGE-30)', async () => {
  const docs = { a: unsaved() };
  const { log, messages, deps } = switchParts({ docs, list: { status: 0, data: null } });
  assert.equal(await switchWorkspace(deps), false);
  assert.deepEqual(log, ['flush a', 'list work']);
  assert.deepEqual(messages, ['Could not open the Work documents. Try again.']);
  assert.equal(docs.a.status, 'saved');
});

test('a failed save after the list read keeps the workspace', async () => {
  let calls = 0;
  const onFlush = (id, docs) => {
    calls += 1;
    if (calls === 1) return (docs[id] = { status: 'saved', reason: null }), true;
    return failing('error', 'network')(id, docs);
  };
  const docs = { a: unsaved() };
  const { log, messages, deps } = switchParts({ docs, onFlush, onList: () => (docs.a = unsaved()) });
  assert.equal(await switchWorkspace(deps), false);
  assert.deepEqual(log, ['flush a', 'list work', 'flush a']);
  assert.deepEqual(messages, ['Unsaved changes could not be saved: the server cannot be reached. The workspace did not change.']);
});

test('exclusive refuses a second operation while one runs, and runs it after that ends (TD-42)', async () => {
  const messages = [];
  const exclusive = createExclusive((text) => messages.push(text));
  let finish;
  const first = exclusive('workspace switch', () => new Promise((resolve) => (finish = resolve)));
  let ran = false;
  assert.equal(await exclusive('drop', async () => (ran = true)), undefined);
  assert.equal(ran, false);
  assert.deepEqual(messages, ['Wait until the workspace switch ends, then try again.']);
  finish('switched');
  assert.equal(await first, 'switched');
  assert.equal(await exclusive('drop', async () => (ran = true)), true);
  assert.equal(ran, true);
});

test('exclusive frees the lock when an operation throws', async () => {
  const exclusive = createExclusive(() => {});
  await assert.rejects(exclusive('move', async () => {
    throw new Error('boom');
  }));
  assert.equal(await exclusive('drop', async () => 'ran'), 'ran');
});
