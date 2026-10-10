// Shared setup for API tests: temp data folder, seeded password, stub web root.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { ensurePassword } from '../src/auth/bootstrap.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';

export const PASSWORD = 'test-owner-password';
// Fastify inject sends "Host: localhost:80" by default.
export const ORIGIN = 'http://localhost';
export const WEB_FILES = [
  'index.html',
  'login.html',
  'login.js',
  'main.js',
  'theme-init.js',
  'styles.css',
  'manifest.webmanifest',
  'icons/favicon.ico',
  'icons/icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'chunks/flowchart-AB12CD34.js',
];

/**
 * @param {object} [options]
 * @param {Record<string, string>} [options.env]
 * @param {() => number} [options.clock]
 */
export async function createTestApp({ env = {}, clock } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'pn-app-'));
  const webRoot = join(dir, 'web');
  await mkdir(join(webRoot, 'icons'), { recursive: true });
  await mkdir(join(webRoot, 'chunks'), { recursive: true });
  for (const name of WEB_FILES) await writeFile(join(webRoot, name), `/* ${name} */`);
  const config = loadConfig({ DATA_DIR: join(dir, 'data'), OWNER_PASSWORD: PASSWORD, ...env });
  const db = openDatabase(config.dataDir);
  await ensurePassword({ db, config, logger: { warn() {} } });
  const ctx = {
    app: await buildApp({ config, db, clock, logger: false, webRoot }),
    db,
    config,
    /** Simulates a restart on the same database: bootstrap again, then a new app. */
    async restart() {
      await ctx.app.close();
      await ensurePassword({ db, config, logger: { warn() {} } });
      ctx.app = await buildApp({ config, db, clock, logger: false, webRoot });
    },
    async close() {
      await ctx.app.close();
      db.close();
      await rm(dir, { recursive: true, force: true, maxRetries: 5 });
    },
  };
  return ctx;
}

/** Signs in and returns the Cookie header value for later requests. */
export async function login(app, password = PASSWORD) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/login',
    headers: { origin: ORIGIN },
    payload: { password },
  });
  if (res.statusCode !== 204) throw new Error(`login failed with ${res.statusCode}`);
  return sessionCookie(res);
}

/** Returns "pn_session=<token>" from a response's Set-Cookie header. */
export function sessionCookie(res) {
  const header = [res.headers['set-cookie']].flat().find((value) => value?.startsWith('pn_session='));
  return header?.split(';')[0];
}
