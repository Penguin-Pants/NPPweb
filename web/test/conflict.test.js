import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conflictCopyName } from '../src/conflict.js';

test('the copy is named "<name> (conflict copy)"', () => {
  assert.equal(conflictCopyName('notes.md'), 'notes.md (conflict copy)');
  assert.equal(conflictCopyName('Untitled 1'), 'Untitled 1 (conflict copy)');
});

test('a long name is shortened so the copy name has at most 255 characters', () => {
  const name = conflictCopyName('a'.repeat(255));
  assert.equal([...name].length, 255);
  assert.ok(name.endsWith(' (conflict copy)'));
  const astral = conflictCopyName('😀'.repeat(255));
  assert.equal([...astral].length, 255);
  assert.ok(!/[\ud800-\udbff]$/.test(astral.slice(0, -' (conflict copy)'.length)));
});
