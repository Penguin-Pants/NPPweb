import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderer, mermaidConfig } from '../src/mermaid-render.js';

test('Mermaid runs strict, with the dagre layout and the editor theme, and diagrams cannot change that (MDV-13, C6)', () => {
  const config = mermaidConfig('dark');
  assert.equal(config.securityLevel, 'strict');
  assert.equal(config.layout, 'dagre');
  assert.equal(config.theme, 'dark');
  assert.equal(config.startOnLoad, false);
  assert.equal(config.suppressErrorRendering, true, 'an error leaves no error drawing behind');
  for (const key of ['securityLevel', 'layout', 'suppressErrorRendering', 'maxTextSize', 'maxEdges', 'secure']) {
    assert.ok(config.secure.includes(key), key);
  }
  assert.equal(mermaidConfig('light').theme, 'default');
});

/** A renderer whose load and draw steps the test controls. */
function setup({ fail = 0 } = {}) {
  const calls = [];
  let loads = 0;
  let failures = fail;
  let running = 0;
  let maxRunning = 0;
  const load = async () => {
    loads += 1;
    if (failures > 0) {
      failures -= 1;
      throw new Error('404');
    }
    return async (source, config) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      calls.push(`${config.theme}:${source}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return source === 'bad' ? { error: 'Parse error' } : { svg: `<svg>${source}</svg>`, width: 10, height: 5 };
    };
  };
  return { load, calls, loads: () => loads, maxRunning: () => maxRunning };
}

test('each source and theme renders once, one at a time, and errors are kept too (MDV-12, EDGE-15)', async () => {
  const s = setup();
  const { render, peek } = createRenderer({ load: s.load });
  const results = await Promise.all([render('a', 'dark'), render('b', 'dark'), render('a', 'dark'), render('a', 'light'), render('bad', 'dark')]);
  assert.deepEqual(results[0], { svg: '<svg>a</svg>', width: 10, height: 5 });
  assert.deepEqual(peek('a', 'dark'), results[0], 'a kept result is there at once');
  assert.equal(peek('a', 'other'), undefined);
  assert.deepEqual(results[4], { error: 'Diagram error: Parse error' });
  assert.deepEqual(await render('bad', 'dark'), { error: 'Diagram error: Parse error' });
  assert.deepEqual(s.calls, ['dark:a', 'dark:b', 'default:a', 'dark:bad']);
  assert.equal(s.maxRunning(), 1);
  assert.equal(s.loads(), 1);
});

test('a failed load shows its own message, is not kept and loads again next time', async () => {
  const s = setup({ fail: 1 });
  const { render, peek } = createRenderer({ load: s.load });
  assert.deepEqual(await render('a', 'dark'), { error: 'Could not load the diagram tool. It tries again when the diagram shows again.' });
  assert.equal(peek('a', 'dark'), undefined);
  assert.deepEqual(await render('a', 'dark'), { svg: '<svg>a</svg>', width: 10, height: 5 });
  assert.equal(s.loads(), 2);
});

test('a render that nobody wants any more is skipped and not kept', async () => {
  const s = setup();
  const { render } = createRenderer({ load: s.load });
  const first = render('slow', 'dark');
  const gone = render('gone', 'dark', () => false);
  const shared = [render('shared', 'dark', () => false), render('shared', 'dark', () => true)];
  assert.equal(await gone, null);
  await first;
  assert.deepEqual(await shared[1], { svg: '<svg>shared</svg>', width: 10, height: 5 });
  assert.deepEqual(s.calls, ['dark:slow', 'dark:shared']);
  await render('gone', 'dark');
  assert.deepEqual(s.calls, ['dark:slow', 'dark:shared', 'dark:gone']);
});

test('only the most recent results are kept', async () => {
  const s = setup();
  const { render } = createRenderer({ load: s.load, limit: 2 });
  await render('a', 'dark');
  await render('b', 'dark');
  await render('a', 'dark'); // Used again, so b is the oldest.
  await render('c', 'dark');
  await render('a', 'dark');
  await render('b', 'dark');
  assert.deepEqual(s.calls, ['dark:a', 'dark:b', 'dark:c', 'dark:b']);
});
