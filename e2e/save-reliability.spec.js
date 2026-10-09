import { expect, login, OWNER_PASSWORD, test } from './fixtures.js';

const SAVE_URL = '**/api/documents/*/content';

async function storedContent(api) {
  const [doc] = await (await api.get('/api/documents')).json();
  return (await (await api.get(`/api/documents/${doc.id}`)).json()).content;
}

test('a failed save shows error, keeps the text and saves when the network returns', async ({ page, api }) => {
  await login(page);
  const status = page.locator('#save-status');
  await expect(status).toHaveText('Saved');
  await page.route(SAVE_URL, (route) => route.abort());
  await page.locator('.cm-content').click();
  await page.keyboard.type('offline text');
  await expect(status).toHaveText('Save failed. Retrying.');
  await expect(page.locator('.cm-content')).toHaveText('offline text');
  await page.unroute(SAVE_URL);
  await expect(status).toHaveText('Saved', { timeout: 10_000 });
  expect(await storedContent(api)).toBe('offline text');
});

test('a server error also retries until the save works', async ({ page, api }) => {
  await login(page);
  let failures = 2;
  await page.route(SAVE_URL, (route) =>
    failures-- > 0 ? route.fulfill({ status: 503, body: 'down' }) : route.fallback(),
  );
  await page.locator('.cm-content').click();
  await page.keyboard.type('retry me');
  await expect(page.locator('#save-status')).toHaveText('Saved', { timeout: 15_000 });
  expect(await storedContent(api)).toBe('retry me');
});

test('an expired session opens the re-login dialog and saves the text after sign-in', async ({ page, context, api }) => {
  await login(page);
  const status = page.locator('#save-status');
  await page.locator('.cm-content').click();
  await page.keyboard.type('before');
  await expect(status).toHaveText('Saved');
  await context.clearCookies();
  await page.keyboard.type(' after');
  const dialog = page.getByRole('dialog', { name: 'Sign in again' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.cm-content')).toHaveText('before after');
  await dialog.getByLabel('Password').fill('wrong-password');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Wrong password.');
  await dialog.getByLabel('Password').fill(OWNER_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveText('Saved');
  expect(await storedContent(api)).toBe('before after');
});

test('closing the page with unsaved text triggers the browser warning', async ({ page }) => {
  await login(page);
  await page.route(SAVE_URL, (route) => route.abort());
  await page.locator('.cm-content').click();
  await page.keyboard.type('not saved yet');
  const dialogType = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      resolve(dialog.type());
      await dialog.dismiss();
    });
  });
  await page.close({ runBeforeUnload: true });
  expect(await dialogType).toBe('beforeunload');
});

test('closing the page with everything saved shows no warning', async ({ page }) => {
  await login(page);
  await page.locator('.cm-content').click();
  await page.keyboard.type('saved text');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  let warned = false;
  page.on('dialog', async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  expect(warned).toBe(false);
});
