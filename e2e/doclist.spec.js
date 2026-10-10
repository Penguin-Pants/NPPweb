import { expect, login, newDocument, test } from './fixtures.js';

async function createDoc(api, name, content = '') {
  const res = await api.post(`/api/documents?name=${encodeURIComponent(name)}`, {
    data: content,
    headers: { 'Content-Type': 'text/plain' },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

const rows = (page) => page.locator('#doclist .doc-row');
const openRow = (page, name) =>
  rows(page).filter({ has: page.locator('.doc-name', { hasText: name }) }).locator('.doc-open').click();
const openList = (page) => page.getByRole('button', { name: 'Documents' }).click();

test('the list shows name and last modified date, newest first', async ({ page, api }) => {
  const docs = [];
  for (const name of ['first.txt', 'second.md', 'third.py']) {
    docs.push(await createDoc(api, name));
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await login(page);
  await openList(page);
  await expect(rows(page).locator('.doc-name')).toHaveText(['third.py', 'second.md', 'first.txt']);
  const expected = await page.evaluate((ms) => new Date(ms).toLocaleString(), docs[2].updatedAt);
  await expect(rows(page).first().locator('.doc-date')).toHaveText(expected);
});

test('the list refreshes when it opens', async ({ page, api }) => {
  await login(page);
  await openList(page);
  await expect(page.locator('#doclist')).toContainText('No documents yet.');
  await openList(page);
  await createDoc(api, 'later.txt');
  await openList(page);
  await expect(rows(page).locator('.doc-name')).toHaveText(['later.txt']);
});

test('a click opens the document once and activates its tab', async ({ page, api }) => {
  await createDoc(api, 'notes.txt', 'some notes');
  await login(page);
  await openList(page);
  await openRow(page, 'notes.txt');
  await expect(page.getByRole('tab', { name: 'notes.txt' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cm-content')).toHaveText('some notes');
  await newDocument(page);
  await openList(page);
  await openRow(page, 'notes.txt');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'notes.txt' })).toHaveAttribute('aria-selected', 'true');
});

test('rename updates the list, the open tab and the server', async ({ page, api }) => {
  const doc = await createDoc(api, 'old-name.txt');
  await login(page);
  await openList(page);
  await openRow(page, 'old-name.txt');
  await openList(page);
  await page.getByRole('button', { name: 'Rename old-name.txt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  await dialog.getByLabel('Name').fill('   ');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Use 1 to 255 characters and no control characters.');
  await dialog.getByLabel('Name').fill('new-name.md');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'new-name.md' })).toBeVisible();
  await expect(rows(page).locator('.doc-name')).toHaveText(['new-name.md']);
  expect((await (await api.get(`/api/documents/${doc.id}`)).json()).name).toBe('new-name.md');
});

test('delete asks once, says it is permanent, removes the document and closes its tab', async ({ page, api }) => {
  const doc = await createDoc(api, 'doomed.txt', 'bye');
  await createDoc(api, 'stays.txt');
  await login(page);
  await openList(page);
  await openRow(page, 'doomed.txt');
  await expect(page.getByRole('tab', { name: 'doomed.txt' })).toBeVisible();

  await openList(page);
  await page.getByRole('button', { name: 'Delete doomed.txt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete document' });
  await expect(dialog).toContainText('permanently');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Delete doomed.txt' }).click();
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(rows(page).locator('.doc-name')).toHaveText(['stays.txt']);
  await expect(page.getByRole('tab', { name: 'doomed.txt' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await api.get(`/api/documents/${doc.id}`)).status()).toBe(404);
});

test('the empty state button opens the document list', async ({ page, api }) => {
  await createDoc(api, 'from-empty.txt');
  await login(page);
  await page.getByRole('button', { name: 'Open document list' }).click();
  await expect(page.locator('#doclist')).toBeVisible();
  await expect(rows(page).locator('.doc-name')).toHaveText(['from-empty.txt']);
});
