import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

test('logs redact cookie and authorization headers', async (t) => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk;
      done();
    },
  });
  const app = await buildApp({ config: loadConfig({}), logger: { stream } });
  t.after(() => app.close());
  const headers = { cookie: 'pn_session=cookie-secret', authorization: 'Basic auth-secret', accept: 'text/plain' };
  app.log.info({ headers });
  app.log.info({ request: { headers } });
  assert.match(output, /text\/plain/);
  assert.doesNotMatch(output, /cookie-secret|auth-secret/);
});
