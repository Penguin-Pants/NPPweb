import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readChoice } from '../src/stored-choice.js';
import { otherWorkspace, showWorkspace, titleFor, WORKSPACE, WORKSPACE_NAMES } from '../src/workspace.js';

const storage = (value) => () => ({ getItem: (key) => (key === 'pn.workspace' ? value : null) });

test('a first visit, an unknown value and blocked storage open Personal (WS-4)', () => {
  assert.equal(readChoice({ getStorage: storage(null), ...WORKSPACE }), 'personal');
  assert.equal(readChoice({ getStorage: storage('team'), ...WORKSPACE }), 'personal');
  const blocked = () => {
    throw new Error('blocked');
  };
  assert.equal(readChoice({ getStorage: blocked, ...WORKSPACE }), 'personal');
});

test('a stored work opens Work', () => {
  assert.equal(readChoice({ getStorage: storage('work'), ...WORKSPACE }), 'work');
});

test('the window title starts with the workspace name (WS-3)', () => {
  assert.deepEqual(WORKSPACE_NAMES, { personal: 'Personal', work: 'Work' });
  assert.equal(titleFor('personal'), 'Personal - Margin');
  assert.equal(titleFor('work'), 'Work - Margin');
});

const fakeDocument = (page, title) => ({ title, documentElement: { dataset: page ? { page } : {} } });

test('showWorkspace marks <html> and sets the title on the app page only (TD-29)', () => {
  const app = fakeDocument('app', 'Margin');
  showWorkspace(app, 'work');
  assert.equal(app.documentElement.dataset.workspace, 'work');
  assert.equal(app.title, 'Work - Margin');
  const signIn = fakeDocument(undefined, 'Sign in - Margin');
  showWorkspace(signIn, 'work');
  assert.equal(signIn.documentElement.dataset.workspace, 'work');
  assert.equal(signIn.title, 'Sign in - Margin');
});

test('otherWorkspace gives the workspace a switch or a move goes to', () => {
  assert.equal(otherWorkspace('personal'), 'work');
  assert.equal(otherWorkspace('work'), 'personal');
});
