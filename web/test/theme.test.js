import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readChoice } from '../src/stored-choice.js';
import { animateThemeSwitch, createTheme, THEME } from '../src/theme.js';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}
const throwingStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

test('the theme is dark when nothing is stored', () => {
  assert.equal(readChoice({ ...THEME, getStorage: () => fakeStorage() }), 'dark');
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => fakeStorage(), root });
  assert.equal(theme.get(), 'dark');
  assert.equal(root.dataset.theme, 'dark');
});

test('a stored light choice is used', () => {
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => fakeStorage({ 'pn.theme': 'light' }), root });
  assert.equal(theme.get(), 'light');
  assert.equal(root.dataset.theme, 'light');
});

test('an unknown stored value falls back to dark', () => {
  assert.equal(readChoice({ ...THEME, getStorage: () => fakeStorage({ 'pn.theme': 'purple' }) }), 'dark');
});

test('blocked storage falls back to dark and toggling still works', () => {
  assert.equal(readChoice({ ...THEME, getStorage: () => throwingStorage }), 'dark');
  assert.equal(
    readChoice({
      ...THEME,
      getStorage: () => {
        throw new Error('no storage');
      },
    }),
    'dark',
  );
  const root = { dataset: {} };
  const theme = createTheme({ getStorage: () => throwingStorage, root });
  assert.equal(theme.toggle(), 'light');
  assert.equal(root.dataset.theme, 'light');
});

test('toggle switches the theme, stores it and reports it', () => {
  const storage = fakeStorage();
  const root = { dataset: {} };
  const changes = [];
  const theme = createTheme({ getStorage: () => storage, root, onChange: (value) => changes.push(value) });
  assert.equal(theme.toggle(), 'light');
  assert.equal(storage.data.get('pn.theme'), 'light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(theme.toggle(), 'dark');
  assert.equal(storage.data.get('pn.theme'), 'dark');
  assert.deepEqual(changes, ['light', 'dark']);
});

function fakeWindow({ reduce = false } = {}) {
  return { innerWidth: 1000, innerHeight: 800, matchMedia: (query) => ({ matches: reduce && query.includes('reduce') }) };
}
const button = { getBoundingClientRect: () => ({ left: 90, top: 10, width: 20, height: 20 }) };

test('a theme switch animates as a circle from the toggle button (THM-1)', async () => {
  const toggled = [];
  const animations = [];
  const doc = {
    documentElement: { animate: (keyframes, options) => animations.push({ keyframes, options }) },
    startViewTransition(update) {
      update();
      return { ready: Promise.resolve() };
    },
  };
  const how = animateThemeSwitch({ toggle: () => toggled.push(1), button, doc, win: fakeWindow() });
  assert.equal(how, 'animated');
  assert.equal(toggled.length, 1);
  await Promise.resolve();
  const radius = Math.hypot(900, 780);
  assert.deepEqual(animations, [
    {
      keyframes: { clipPath: ['circle(0px at 100px 20px)', `circle(${radius}px at 100px 20px)`] },
      options: { duration: 450, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
    },
  ]);
});

test('without the View Transitions API, or with reduced motion, the theme switches at once (THM-2)', () => {
  const toggled = [];
  const plain = { documentElement: {} };
  assert.equal(animateThemeSwitch({ toggle: () => toggled.push(1), button, doc: plain, win: fakeWindow() }), 'instant');
  const withApi = {
    documentElement: {},
    startViewTransition() {
      throw new Error('must not animate');
    },
  };
  assert.equal(animateThemeSwitch({ toggle: () => toggled.push(1), button, doc: withApi, win: fakeWindow({ reduce: true }) }), 'instant');
  assert.equal(toggled.length, 2);
});
