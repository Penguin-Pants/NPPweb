import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorState } from '@codemirror/state';
import { docBytes, LIMIT_BYTES, sizeLimit, utf8ByteLength } from '../src/size-limit.js';

test('utf8ByteLength matches Buffer.byteLength for ASCII, multi-byte and astral text', () => {
  for (const text of ['', 'a', 'hello\nworld', 'é', 'ÿĀ', '€', '中文字', '😀', 'a😀b€c\n\té', '\u0000\u007f\u0080߿ࠀ￿']) {
    assert.equal(utf8ByteLength(text), Buffer.byteLength(text, 'utf8'), JSON.stringify(text));
  }
});

test('utf8ByteLength counts a lone surrogate as the 3-byte replacement character', () => {
  for (const text of ['\ud83d', '\ude00', 'a\ud83db', '\ude00\ud83d']) {
    assert.equal(utf8ByteLength(text), Buffer.byteLength(text, 'utf8'), JSON.stringify(text));
  }
});

test('the limit is 1,048,576 bytes', () => {
  assert.equal(LIMIT_BYTES, 1_048_576);
});

function stateWith(doc, rejected) {
  return EditorState.create({ doc, extensions: sizeLimit(() => rejected.push(true)) });
}

test('a change that stays at the limit is applied', () => {
  const rejected = [];
  const state = stateWith('a'.repeat(LIMIT_BYTES - 1), rejected);
  const next = state.update({ changes: { from: 0, insert: 'b' } }).state;
  assert.equal(next.doc.length, LIMIT_BYTES);
  assert.deepEqual(rejected, []);
});

test('a change that would pass the limit is rejected and the content stays unchanged', () => {
  const rejected = [];
  const state = stateWith('a'.repeat(LIMIT_BYTES), rejected);
  const next = state.update({ changes: { from: 5, insert: 'b' } }).state;
  assert.equal(next.doc.toString(), state.doc.toString());
  assert.deepEqual(rejected, [true]);
});

test('multi-byte text counts bytes, not characters', () => {
  const rejected = [];
  const state = stateWith('é'.repeat(LIMIT_BYTES / 2), rejected);
  assert.equal(state.update({ changes: { from: 0, insert: 'x' } }).state.doc.length, LIMIT_BYTES / 2);
  assert.deepEqual(rejected, [true]);
  const smaller = stateWith('é'.repeat(LIMIT_BYTES / 2 - 1), rejected);
  assert.equal(smaller.update({ changes: { from: 0, insert: 'é' } }).state.doc.length, LIMIT_BYTES / 2);
});

test('a surrogate pair at the boundary counts as 4 bytes', () => {
  const rejected = [];
  const state = stateWith('a'.repeat(LIMIT_BYTES - 4), rejected);
  assert.equal(state.update({ changes: { from: 0, insert: '😀' } }).state.doc.length, LIMIT_BYTES - 2);
  const full = stateWith('a'.repeat(LIMIT_BYTES - 3), rejected);
  assert.equal(full.update({ changes: { from: 0, insert: '😀' } }).state.doc.length, LIMIT_BYTES - 3);
  assert.deepEqual(rejected, [true]);
});

test('deleting text from a document over the limit is allowed', () => {
  const rejected = [];
  const state = stateWith('a'.repeat(LIMIT_BYTES + 10), rejected);
  const next = state.update({ changes: { from: 0, to: 5 } }).state;
  assert.equal(next.doc.length, LIMIT_BYTES + 5);
  assert.deepEqual(rejected, []);
});

test('a small paste into a small document is never measured as too large', () => {
  const rejected = [];
  const state = stateWith('short', rejected);
  assert.equal(state.update({ changes: { from: 5, insert: ' text' } }).state.doc.toString(), 'short text');
  assert.deepEqual(rejected, []);
});

test('docBytes matches Buffer.byteLength across document parts and after edits that reuse them', () => {
  const lines = Array.from({ length: 3000 }, (_, i) => ['plain', 'café ü', '👍🏽 emoji', ''][i % 4] + ` ${i}`);
  let state = EditorState.create({ doc: lines.join('\n') });
  assert.ok(state.doc.children, 'the document has more than one part');
  assert.equal(docBytes(state.doc), Buffer.byteLength(state.doc.toString()));
  for (const change of [{ from: 0, insert: '€' }, { from: 5000, to: 5010 }, { from: 100, insert: 'x\ny\n👍' }, { from: 0, to: 20000 }]) {
    state = state.update({ changes: change }).state;
    assert.equal(docBytes(state.doc), Buffer.byteLength(state.doc.toString()), JSON.stringify(change));
  }
});
