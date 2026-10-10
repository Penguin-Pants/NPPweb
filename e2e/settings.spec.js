import { expect, login, newDocument, test } from './fixtures.js';

// These tests keep the server default delay of 5 seconds (SAV-2).
test.use({ autosaveSeconds: null });

const status = (page) => page.locator('#save-status');

async function openSettings(page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test('a document saves about 5 seconds after the first unsaved edit by default', async ({ page }) => {
  await login(page);
  await newDocument(page);
  await page.locator('.cm-content').click();
  await page.keyboard.type('a');
  const typedAt = Date.now();
  await page.waitForTimeout(3500);
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(status(page)).toHaveText('Saved', { timeout: 10_000 });
  const elapsed = Date.now() - typedAt;
  expect(elapsed).toBeGreaterThan(4500);
  expect(elapsed).toBeLessThan(8000);
});

test('nonstop typing still saves at least every delay period', async ({ page }) => {
  await login(page);
  const dialog = await openSettings(page);
  await dialog.getByLabel('Autosave delay in seconds (1 to 60)').fill('1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await newDocument(page);
  await page.locator('.cm-content').click();
  let puts = 0;
  page.on('request', (req) => req.method() === 'PUT' && req.url().includes('/content') && (puts += 1));
  const end = Date.now() + 3200;
  while (Date.now() < end) await page.keyboard.type('x', { delay: 50 });
  expect(puts).toBeGreaterThanOrEqual(2);
});

test('the Settings dialog rejects invalid delays and a saved one applies on every device', async ({ page, browser, server }) => {
  await login(page);
  let dialog = await openSettings(page);
  const field = dialog.getByLabel('Autosave delay in seconds (1 to 60)');
  await expect(field).toHaveValue('5');
  for (const bad of ['0', '61', '2.5', 'abc', '']) {
    await field.fill(bad);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Use a whole number from 1 to 60.');
  }
  await field.fill('2');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await newDocument(page);
  await page.locator('.cm-content').click();
  await page.keyboard.type('b');
  const typedAt = Date.now();
  await expect(status(page)).toHaveText('Saved', { timeout: 10_000 });
  expect(Date.now() - typedAt).toBeLessThan(4500);

  const other = await browser.newContext({ baseURL: server.url });
  const pageB = await other.newPage();
  await login(pageB);
  dialog = await openSettings(pageB);
  await expect(dialog.getByLabel('Autosave delay in seconds (1 to 60)')).toHaveValue('2');
  await other.close();
});
