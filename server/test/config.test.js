import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('defaults apply when no variables are set', () => {
  assert.deepEqual(loadConfig({}), {
    port: 3000,
    nodeEnv: 'development',
    isProduction: false,
    dataDir: resolve('data'),
    ownerPassword: null,
    resetPassword: false,
  });
});

test('reads PORT, NODE_ENV and OWNER_PASSWORD', () => {
  const config = loadConfig({ PORT: '8080', NODE_ENV: 'production', DATA_DIR: '/data', OWNER_PASSWORD: 'secret' });
  assert.equal(config.port, 8080);
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.isProduction, true);
  assert.equal(config.ownerPassword, 'secret');
});

test('an empty OWNER_PASSWORD counts as not set', () => {
  assert.equal(loadConfig({ OWNER_PASSWORD: '' }).ownerPassword, null);
});

test('an invalid PORT is a config error', () => {
  for (const value of ['abc', '70000', '-1', '3.5', '80a']) {
    assert.throws(() => loadConfig({ PORT: value }), /Invalid PORT/, value);
  }
});

test('RESET_PASSWORD is true only for true or 1, in any case', () => {
  for (const value of ['true', 'TRUE', 'True', '1']) {
    assert.equal(loadConfig({ RESET_PASSWORD: value }).resetPassword, true, value);
  }
  for (const value of [undefined, '', 'false', '0', 'yes', ' true', 'tru', '11']) {
    assert.equal(loadConfig({ RESET_PASSWORD: value }).resetPassword, false, String(value));
  }
});

test('DATA_DIR wins over RAILWAY_VOLUME_MOUNT_PATH', () => {
  const config = loadConfig({ DATA_DIR: 'custom', RAILWAY_VOLUME_MOUNT_PATH: '/data' });
  assert.equal(config.dataDir, resolve('custom'));
});

test('RAILWAY_VOLUME_MOUNT_PATH is used when DATA_DIR is not set', () => {
  assert.equal(loadConfig({ RAILWAY_VOLUME_MOUNT_PATH: '/data' }).dataDir, resolve('/data'));
  assert.equal(loadConfig({ DATA_DIR: '', RAILWAY_VOLUME_MOUNT_PATH: '/data' }).dataDir, resolve('/data'));
});

test('production without a volume path is a config error', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }),
    { message: 'No persistent volume configured. Attach a Railway volume.' },
  );
  assert.equal(loadConfig({ NODE_ENV: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/data' }).dataDir, resolve('/data'));
  assert.equal(loadConfig({ NODE_ENV: 'production', DATA_DIR: '/srv' }).dataDir, resolve('/srv'));
});
