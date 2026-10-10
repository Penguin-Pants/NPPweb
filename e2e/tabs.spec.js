import { closeButton, expect, login, newDocument, openDocs, OWNER_PASSWORD, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const tab = (page, name) => page.getByRole('tab', { name });

test('with no stored tabs the empty state offers New document', async ({ page }) => {
  await login(page);
  await expect(page.getByText('No document is open.')).toBeVisible();
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(tab(page, 'Untitled 1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('No document is open.')).toBeHidden();
});

test('a New that the server or the network fails shows a message and opens no tab', async ({ page }) => {
  await login(page);
  let fail = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal_error"}' });
  await page.route(
    (url) => url.pathname === '/api/documents',
    (route) => (route.request().method() === 'POST' ? fail(route) : route.continue()),
  );
  const message = page.locator('#status-message');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(message).toHaveText('Could not create a document. Try again.');
  await page.evaluate(() => (document.getElementById('status-message').textContent = ''));
  fail = (route) => route.abort();
  await page.getByRole('button', { name: 'New document' }).click();
  await expect(message).toHaveText('Could not create a document. Try again.');
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('a keyboard-only run moves between tabs, opens one and closes one (audit C4)', async ({ page, api }) => {
  await openDocs(page, api, [['a.txt', 'aaa'], ['b.txt', 'bbb'], ['c.txt', 'ccc']]);
  const strip = page.getByRole('tablist', { name: 'Open documents' });
  await expect(strip.getByRole('button')).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
  // The tab list is one Tab stop, on the selected tab.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'a.txt')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'a.txt')).toBeFocused();

  for (const [key, name] of [['ArrowRight', 'b.txt'], ['End', 'c.txt'], ['ArrowRight', 'a.txt'], ['ArrowLeft', 'c.txt'], ['Home', 'a.txt'], ['ArrowRight', 'b.txt']]) {
    await page.keyboard.press(key);
    await expect(tab(page, name)).toBeFocused();
  }
  await expect(tab(page, 'a.txt')).toHaveAttribute('aria-selected', 'true');

  // A re-render of the strip (here after a list refresh) keeps the focus.
  const listed = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/documents');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await listed;
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
  await expect(tab(page, 'b.txt')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(tab(page, 'b.txt')).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('bbb');
  await expect(editor(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+Tab');
  await expect(tab(page, 'b.txt')).toBeFocused();
  const closeDialog = page.getByRole('dialog', { name: 'Close document' });
  await page.keyboard.press('Delete');
  await expect(closeDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(closeDialog).toBeHidden();
  await expect(tab(page, 'b.txt')).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter'); // Keep, the default choice.
  await expect(page.getByRole('tab')).toHaveText([/^a\.txt/, /^c\.txt/]);
});

test('three tabs keep separate content and undo history', async ({ page }) => {
  await login(page);
  for (const text of ['alpha', 'beta', 'gamma']) {
    await newDocument(page);
    await editor(page).click();
    await page.keyboard.type(text);
  }
  await tab(page, 'Untitled 1').click();
  await expect(editor(page)).toHaveText('alpha');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveText('');
  await tab(page, 'Untitled 2').click();
  await expect(editor(page)).toHaveText('beta');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveText('');
  await tab(page, 'Untitled 3').click();
  await expect(editor(page)).toHaveText('gamma');
  await tab(page, 'Untitled 1').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
  await expect(editor(page)).toHaveText('alpha');
});

test('a reload restores the open tabs and the active tab', { tag: '@smoke' }, async ({ page }) => {
  await login(page);
  for (const text of ['one', 'two', 'three']) {
    await newDocument(page);
    await editor(page).click();
    await page.keyboard.type(text);
  }
  await tab(page, 'Untitled 2').click();
  await expect(page.locator('.tab.dirty')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab')).toHaveText(['Untitled 1', 'Untitled 2', 'Untitled 3'].map((n) => new RegExp(n)));
  await expect(tab(page, 'Untitled 2')).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('two');
  await tab(page, 'Untitled 1').click();
  await expect(editor(page)).toHaveText('one');
  await tab(page, 'Untitled 3').click();
  await expect(editor(page)).toHaveText('three');
});

test('clicking the active tab keeps the typed text', async ({ page, api }) => {
  await login(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('hello');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  await tab(page, 'Untitled 1').click();
  await expect(editor(page)).toHaveText('hello');
  await page.keyboard.type(' again');
  await tab(page, 'Untitled 1').click();
  await expect(editor(page)).toHaveText('hello again');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  const [doc] = await (await api.get('/api/documents')).json();
  expect((await (await api.get(`/api/documents/${doc.id}`)).json()).content).toBe('hello again');
});

test('while a tab loads, the editor is read-only and no text goes astray', async ({ page, api }) => {
  const make = async (name, text) =>
    (await api.post(`/api/documents?name=${name}`, { data: text, headers: { 'Content-Type': 'text/plain' } })).json();
  const a = await make('a.txt', 'text of a');
  const b = await make('b.txt', 'text of b');
  await login(page);
  await page.evaluate((ids) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids, activeId: ids[0] })), [a.id, b.id]);
  await page.reload();
  await expect(editor(page)).toHaveText('text of a');
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(`**/api/documents/${b.id}`, async (route) => {
    await gate;
    await route.fallback();
  });
  await tab(page, 'b.txt').click();
  await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
  await page.keyboard.type('stray');
  release();
  await expect(editor(page)).toHaveText('text of b');
  await tab(page, 'a.txt').click();
  await expect(editor(page)).toHaveText('text of a');
  const content = async (id) => (await (await api.get(`/api/documents/${id}`)).json()).content;
  expect(await content(a.id)).toBe('text of a');
  expect(await content(b.id)).toBe('text of b');
});

test('a document deleted elsewhere is dropped from the restored tabs', async ({ page, api }) => {
  await login(page);
  await newDocument(page);
  await newDocument(page);
  const docs = await (await api.get('/api/documents')).json();
  const first = docs.find((doc) => doc.name === 'Untitled 1');
  expect((await api.delete(`/api/documents/${first.id}`)).status()).toBe(204);
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(tab(page, 'Untitled 2')).toBeVisible();
});

test('closing a tab saves it first and keeps the document', async ({ page, api }) => {
  await login(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('keep me');
  await closeButton(page, 'Untitled 1').click();
  await page.getByRole('dialog', { name: 'Close document' }).getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByText('No document is open.')).toBeVisible();
  const [doc] = await (await api.get('/api/documents')).json();
  expect((await (await api.get(`/api/documents/${doc.id}`)).json()).content).toBe('keep me');
});

test('a change saved in context A shows in context B after B regains focus', async ({ browser, server }) => {
  const contextA = await browser.newContext({ baseURL: server.url });
  const contextB = await browser.newContext({ baseURL: server.url });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await login(pageA, OWNER_PASSWORD);
  await newDocument(pageA);
  await editor(pageA).click();
  await pageA.keyboard.type('first');
  await expect(pageA.locator('#save-status')).toHaveText('Saved');

  await login(pageB, OWNER_PASSWORD);
  await pageB.evaluate((ids) => localStorage.setItem('pn.openTabs.v1', JSON.stringify(ids)), {
    ids: [await pageA.locator('.tab').getAttribute('data-id')],
    activeId: null,
  });
  await pageB.reload();
  await expect(editor(pageB)).toHaveText('first');

  await editor(pageA).click();
  await pageA.keyboard.press('End');
  await pageA.keyboard.type(' and second');
  await expect(pageA.locator('#save-status')).toHaveText('Saved');
  await expect(editor(pageB)).toHaveText('first');
  await pageB.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(editor(pageB)).toHaveText('first and second');
  await contextA.close();
  await contextB.close();
});

test('a refresh whose list was read before a new document never closes that new tab', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', 'a']]);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route('**/api/documents', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch(); // The list as it is now, before the new document.
    await held;
    return route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  release();
  await page.waitForTimeout(500);
  await expect(page.getByRole('tab')).toHaveCount(2);
});
