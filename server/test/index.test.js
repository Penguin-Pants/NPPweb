import assert from 'node:assert/strict';
import { test } from 'node:test';
import { start } from '../src/index.js';

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`start serves /healthz and exits 0 on ${signal}`, async () => {
    let exited;
    const exitCode = new Promise((resolve) => (exited = resolve));
    const app = await start({ env: { PORT: '0' }, exit: exited, logger: false });
    const { port } = app.server.address();
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(res.status, 200);
    process.emit(signal);
    assert.equal(await exitCode, 0);
    assert.equal(app.server.listening, false);
  });
}

test('start exits 1 on a config error', async () => {
  const codes = [];
  const app = await start({ env: { PORT: 'abc' }, exit: (code) => codes.push(code), logger: false });
  assert.equal(app, undefined);
  assert.deepEqual(codes, [1]);
});
