// Playwright fixtures (T10). Each test gets its own server on a free port
// with a fresh data folder, so tests never share state. The server starts
// with a 1-second autosave delay, so the v1 save tests keep their timing.
// A spec sets `test.use({ autosaveSeconds: null })` to keep the 5-second
// default (SAV-2).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, request } from '@playwright/test';

export { expect };
export const OWNER_PASSWORD = 'e2e-password-123';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

export const test = base.extend({
  autosaveSeconds: [1, { option: true }],

  server: async ({ autosaveSeconds }, use) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'pn-e2e-'));
    const port = await freePort();
    const child = spawn(process.execPath, [join(rootDir, 'server', 'src', 'index.js')], {
      cwd: rootDir,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, OWNER_PASSWORD, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const exited = new Promise((resolve) => child.once('exit', resolve));
    const url = `http://127.0.0.1:${port}`;
    const stop = async () => {
      child.kill();
      await exited;
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
    };
    try {
      await waitForHealth(url, () => child.exitCode !== null);
      if (autosaveSeconds !== null) await setAutosaveSeconds(url, autosaveSeconds);
    } catch (err) {
      await stop();
      throw new Error(`${err.message}\nServer output:\n${output}`);
    }

    await use({ url, dataDir });
    await stop();
  },

  baseURL: async ({ server }, use) => {
    await use(server.url);
  },

  // A signed-in API client. It sends Origin so the server's Origin check passes.
  api: async ({ server }, use) => {
    const api = await request.newContext({ baseURL: server.url, extraHTTPHeaders: { Origin: server.url } });
    const res = await api.post('/api/login', { data: { password: OWNER_PASSWORD } });
    if (res.status() !== 204) throw new Error(`api login failed with ${res.status()}`);
    await use(api);
    await api.dispose();
  },
});

/**
 * Signs in through the login page and waits for the editor page and its
 * startup settings read, so the autosave delay is in force before typing.
 * @param {import('@playwright/test').Page} page
 */
export async function login(page, password = OWNER_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Password').fill(password);
  const settings = page.waitForResponse((res) => res.url().endsWith('/api/settings') && res.request().method() === 'GET');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/');
  await settings;
}

async function setAutosaveSeconds(url, autosaveSeconds) {
  const headers = { Origin: url, 'Content-Type': 'application/json' };
  const login = await fetch(`${url}/api/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: OWNER_PASSWORD }),
  });
  const cookie = login.headers.getSetCookie().find((value) => value.startsWith('pn_session='))?.split(';')[0];
  const res = await fetch(`${url}/api/settings`, {
    method: 'PUT',
    headers: { ...headers, Cookie: cookie },
    body: JSON.stringify({ autosaveSeconds }),
  });
  if (res.status !== 200) throw new Error(`setting the autosave delay failed with ${res.status}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, hasExited) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (hasExited()) throw new Error('Server exited during startup.');
    try {
      if ((await fetch(`${url}/healthz`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not answer /healthz within 15 seconds.');
}

/**
 * Clicks New and waits for the new tab and the editor.
 * @param {import('@playwright/test').Page} page
 */
export async function newDocument(page) {
  const tabs = page.getByRole('tab');
  const count = await tabs.count();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(tabs).toHaveCount(count + 1);
  await expect(page.locator('.cm-content')).toBeVisible();
}
