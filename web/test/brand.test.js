import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// margin-brand/ holds the approved Margin assets (BRAND.md). web/icons/ holds
// copies of the icons that the app serves.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const webDir = join(rootDir, 'web');
const brandDir = join(rootDir, 'margin-brand');

const readPage = (name) => readFile(join(webDir, name), 'utf8');
const readManifest = async () => JSON.parse(await readFile(join(webDir, 'manifest.webmanifest'), 'utf8'));

/** The `rel href` of each icon link in a page. */
function iconLinks(html) {
  return [...html.matchAll(/<link\s[^>]*>/g)]
    .map(([tag]) => [/\srel="([^"]*)"/.exec(tag)?.[1], /\shref="([^"]*)"/.exec(tag)?.[1]])
    .filter(([rel]) => rel === 'icon' || rel === 'apple-touch-icon')
    .map(([rel, href]) => `${rel} ${href}`);
}

/** Every icon URL that a page or the manifest names. */
async function iconUrls() {
  const pages = await Promise.all(['index.html', 'login.html'].map(readPage));
  const linked = pages.flatMap(iconLinks).map((link) => link.split(' ')[1]);
  const listed = (await readManifest()).icons.map((icon) => icon.src);
  return [...new Set([...linked, ...listed])].sort();
}

test('each page has its Margin title and links the favicon, the SVG icon and the Apple touch icon', async () => {
  for (const [name, title] of [['index.html', 'Margin'], ['login.html', 'Sign in - Margin']]) {
    const html = await readPage(name);
    assert.equal(/<title>([^<]*)<\/title>/.exec(html)?.[1], title, name);
    assert.deepEqual(iconLinks(html), ['icon /icons/favicon.ico', 'icon /icons/icon.svg', 'apple-touch-icon /icons/apple-touch-icon.png'], name);
  }
  assert.match(await readPage('login.html'), /<h1>Margin<\/h1>/);
});

test('the manifest names the app Margin and keeps its three install icons', async () => {
  const manifest = await readManifest();
  assert.equal(manifest.name, 'Margin');
  assert.equal(manifest.short_name, 'Margin');
  assert.equal(manifest.description, 'Private notes and code, in one place.');
  assert.deepEqual(manifest.icons.map((icon) => icon.src), ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']);
});

test('each icon that a page or the manifest names is the approved file from margin-brand/', async () => {
  for (const url of await iconUrls()) {
    assert.ok(url.startsWith('/icons/'), url);
    assert.deepEqual(await readFile(join(webDir, url)), await readFile(join(brandDir, basename(url))), url);
  }
});

test('web/icons/ holds only the icons that a page or the manifest names', async () => {
  const files = (await readdir(join(webDir, 'icons'))).map((name) => `/icons/${name}`).sort();
  assert.deepEqual(files, await iconUrls());
});
