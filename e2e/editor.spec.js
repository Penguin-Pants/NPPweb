import { expect, login, test } from './fixtures.js';

const isSave = (res) => res.request().method() === 'PUT' && res.url().includes('/content');

test('line numbers show', async ({ page }) => {
  await login(page);
  const editor = page.locator('.cm-content');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type('one\ntwo\nthree');
  await expect(page.locator('.cm-lineNumbers .cm-gutterElement', { hasText: /^3$/ })).toBeVisible();
});

test('typing then pausing saves within about 1 second and survives a reload', { tag: '@smoke' }, async ({ page, api }) => {
  await login(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  const saved = page.waitForResponse(isSave);
  await page.keyboard.type('hello world');
  const typedAt = Date.now();
  const res = await saved;
  expect(res.status()).toBe(200);
  expect(Date.now() - typedAt).toBeLessThan(2500);

  const [doc] = await (await api.get('/api/documents')).json();
  const stored = await (await api.get(`/api/documents/${doc.id}`)).json();
  expect(stored.content).toBe('hello world');

  await page.reload();
  await expect(page.locator('.cm-content')).toHaveText('hello world');
});

test('Ctrl+click and Alt+click never create a second cursor', async ({ page }) => {
  await login(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('first line\nsecond line\nthird line');
  const lines = page.locator('.cm-line');
  for (const modifier of ['ControlOrMeta', 'Alt']) {
    await lines.nth(0).click({ position: { x: 20, y: 5 } });
    await lines.nth(2).click({ modifiers: [modifier], position: { x: 30, y: 5 } });
    await lines.nth(1).click({ modifiers: [modifier], position: { x: 10, y: 5 } });
    await expect(page.locator('.cm-cursor')).toHaveCount(1);
  }
});
