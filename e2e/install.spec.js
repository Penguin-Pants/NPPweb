import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { expect, login, test } from './fixtures.js';

test('the manifest and icons load without a session', async ({ request, server }) => {
  const manifest = await request.get(`${server.url}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()['content-type']).toMatch(/^application\/manifest\+json/);
  const body = await manifest.json();
  expect(body).toMatchObject({ name: 'Margin', short_name: 'Margin', start_url: '/', scope: '/', display: 'standalone' });
  expect(body.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ]);
  for (const icon of body.icons) {
    const res = await request.get(`${server.url}${icon.src}`);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('the login and editor pages link the manifest and theme color', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e1f22');
  await login(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1e1f22');
});

test('the login and editor pages link the Margin icons, and each loads without a session', async ({ page, request, server }) => {
  const icons = () =>
    page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) => links.map((link) => `${link.rel} ${link.getAttribute('href')}`));
  const expected = ['icon /icons/favicon.ico', 'icon /icons/icon.svg', 'apple-touch-icon /icons/apple-touch-icon.png'];
  await page.goto('/login');
  await expect(page).toHaveTitle('Sign in - Margin');
  expect(await icons()).toEqual(expected);
  await login(page);
  expect(await icons()).toEqual(expected);
  for (const href of expected.map((icon) => icon.split(' ')[1])) {
    const res = await request.get(`${server.url}${href}`);
    expect(res.status(), href).toBe(200);
    expect(res.headers()['content-type'], href).toMatch(/^image\//);
  }
});

// The headless shell does not run the install check, and an incognito-like
// context always reports "in-incognito". A persistent full Chromium does both.
test('Chromium reports no installability errors', async ({ server, browserName }) => {
  test.skip(browserName !== 'chromium', 'Installability is a Chromium check.');
  const profile = await mkdtemp(join(tmpdir(), 'pn-profile-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', baseURL: server.url });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await login(page);
    const cdp = await context.newCDPSession(page);
    const errors = async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map((e) => e.errorId);
    await expect.poll(errors).toEqual([]);
    // The check can fail: a page without the manifest reports it.
    await page.goto('/healthz');
    await expect.poll(errors).toContain('no-manifest');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('no response is cached by a service worker (NG-6)', async ({ page }) => {
  await login(page);
  await page.reload();
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});
