import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRefresh, readOpenTabs, writeOpenTabs } from '../src/tabs.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
}
const blocked = () => {
  throw new Error('blocked');
};

test('readOpenTabs returns the stored ids and active id', () => {
  const storage = fakeStorage({ 'pn.openTabs.v1': JSON.stringify({ ids: ['a', 'b'], activeId: 'b' }) });
  assert.deepEqual(readOpenTabs(() => storage), { ids: ['a', 'b'], activeId: 'b' });
});

test('readOpenTabs returns no tabs for missing, broken or blocked storage', () => {
  const empty = { ids: [], activeId: null };
  assert.deepEqual(readOpenTabs(() => fakeStorage()), empty);
  assert.deepEqual(readOpenTabs(() => fakeStorage({ 'pn.openTabs.v1': '{not json' })), empty);
  assert.deepEqual(readOpenTabs(() => fakeStorage({ 'pn.openTabs.v1': '{"ids":"a"}' })), empty);
  assert.deepEqual(readOpenTabs(blocked), empty);
});

test('readOpenTabs drops ids that are not strings, duplicates and an unknown active id', () => {
  const raw = JSON.stringify({ ids: ['a', 3, 'a', null, 'b'], activeId: 'zzz' });
  assert.deepEqual(readOpenTabs(() => fakeStorage({ 'pn.openTabs.v1': raw })), { ids: ['a', 'b'], activeId: null });
});

test('writeOpenTabs stores the state and ignores blocked storage', () => {
  const storage = fakeStorage();
  writeOpenTabs(() => storage, { ids: ['a'], activeId: 'a' });
  assert.deepEqual(JSON.parse(storage.data.get('pn.openTabs.v1')), { ids: ['a'], activeId: 'a' });
  assert.doesNotThrow(() => writeOpenTabs(blocked, { ids: [], activeId: null }));
});

const meta = (id, version, name = id) => ({ id, name, version, language: null, updatedAt: 0 });

test('planRefresh closes clean tabs whose document is gone and keeps dirty ones', () => {
  const tabs = [
    { id: 'gone-clean', loaded: true, clean: true, version: 1 },
    { id: 'gone-dirty', loaded: true, clean: false, version: 1 },
    { id: 'gone-unloaded', loaded: false, clean: true, version: null },
    { id: 'kept', loaded: true, clean: true, version: 1 },
  ];
  const plan = planRefresh(tabs, [meta('kept', 1)]);
  assert.deepEqual(plan.remove, ['gone-clean', 'gone-unloaded']);
  assert.deepEqual(plan.reload, []);
});

test('planRefresh reloads clean loaded tabs whose server version is newer', () => {
  const tabs = [
    { id: 'newer-clean', loaded: true, clean: true, version: 1 },
    { id: 'newer-dirty', loaded: true, clean: false, version: 1 },
    { id: 'same', loaded: true, clean: true, version: 4 },
    { id: 'older-server', loaded: true, clean: true, version: 9 },
    { id: 'unloaded', loaded: false, clean: true, version: null },
  ];
  const list = [meta('newer-clean', 2), meta('newer-dirty', 2), meta('same', 4), meta('older-server', 8), meta('unloaded', 3)];
  assert.deepEqual(planRefresh(tabs, list).reload, ['newer-clean']);
});

test('planRefresh returns the server metadata for every open tab that still exists', () => {
  const tabs = [{ id: 'a', loaded: true, clean: true, version: 1 }];
  const plan = planRefresh(tabs, [meta('a', 1, 'renamed.md'), meta('other', 1)]);
  assert.deepEqual([...plan.meta.keys()], ['a']);
  assert.equal(plan.meta.get('a').name, 'renamed.md');
});
