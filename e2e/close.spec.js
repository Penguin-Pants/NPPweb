import { expect, login, newDocument, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const closeDialog = (page) => page.getByRole('dialog', { name: 'Close document' });

async function typedDocument(page, text) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(text);
}

async function documentIds(api) {
  return (await (await api.get('/api/documents')).json()).map((doc) => doc.id);
}

test('Keep saves the text, closes the tab and leaves the document in the list', async ({ page, api }) => {
  await login(page);
  await typedDocument(page, 'keep this');
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  const dialog = closeDialog(page);
  await expect(dialog).toContainText('permanently');
  await expect(dialog.getByRole('button', { name: 'Keep' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  const [id] = await documentIds(api);
  expect((await (await api.get(`/api/documents/${id}`)).json()).content).toBe('keep this');
});

test('Delete permanently removes the document', async ({ page, api }) => {
  await login(page);
  await typedDocument(page, 'delete this');
  const [id] = await documentIds(api);
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  await closeDialog(page).getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect.poll(async () => (await api.get(`/api/documents/${id}`)).status()).toBe(404);
});

test('Cancel and Escape keep the tab open', async ({ page }) => {
  await login(page);
  await typedDocument(page, 'stay open');
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  await closeDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  await page.keyboard.press('Escape');
  await expect(closeDialog(page)).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(1);
});

test('an empty Untitled tab closes with no dialog and leaves no document', async ({ page, api }) => {
  await login(page);
  await newDocument(page);
  await typedDocument(page, 'x');
  await page.keyboard.press('Backspace');
  await page.getByRole('button', { name: 'Close Untitled 2' }).click();
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(closeDialog(page)).toHaveCount(0);
  await expect.poll(() => documentIds(api)).toEqual([]);
});

test('an empty document with a custom name shows the dialog', async ({ page, api }) => {
  const res = await api.post('/api/documents?name=notes.txt', { data: '', headers: { 'Content-Type': 'text/plain' } });
  const { id } = await res.json();
  await login(page);
  await page.evaluate((docId) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: [docId], activeId: docId })), id);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'notes.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Close notes.txt' }).click();
  await expect(closeDialog(page)).toBeVisible();
});

test('when the Keep save fails, the tab stays open with status error', async ({ page }) => {
  await login(page);
  await newDocument(page);
  await page.route('**/api/documents/*/content', (route) => route.abort());
  await editor(page).click();
  await page.keyboard.type('cannot save');
  await page.getByRole('button', { name: 'Close Untitled 1' }).click();
  await closeDialog(page).getByRole('button', { name: 'Keep' }).click();
  await expect(page.locator('#save-status')).toHaveText('Save failed. Retrying.');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(editor(page)).toHaveText('cannot save');
});
