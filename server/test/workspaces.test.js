import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWorkspace, WORKSPACES } from '../src/workspaces.js';

test('there are exactly two workspaces, Personal first (WS-1)', () => {
  assert.deepEqual(WORKSPACES, ['personal', 'work']);
});

test('a missing workspace means Personal, so pages from before v3 keep working (MIG-3)', () => {
  assert.equal(parseWorkspace({}), 'personal');
  assert.equal(parseWorkspace(undefined), 'personal');
});

test('known workspaces pass, anything else gives null', () => {
  assert.equal(parseWorkspace({ workspace: 'personal' }), 'personal');
  assert.equal(parseWorkspace({ workspace: 'work' }), 'work');
  for (const value of ['', 'Work', 'team', ['work', 'personal']]) {
    assert.equal(parseWorkspace({ workspace: value }), null, String(value));
  }
});
