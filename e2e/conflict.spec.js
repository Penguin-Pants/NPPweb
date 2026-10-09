import { expect, login, newDocument, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const status = (page) => page.locator('#save-status');
const conflictDialog = (page) => page.getByRole('dialog', { name: 'This document changed on another device.' });
const deletedDialog = (page) => page.getByRole('dialog', { name: 'This document was deleted on another device.' });

/** Opens a new document with saved text. Returns its id. */
async function savedDocument(page, api, text) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(text);
  await expect(status(page)).toHaveText('Saved');
  const [doc] = await (await api.get('/api/documents')).json();
  return doc.id;
}

async function serverDoc(api, id) {
  return (await api.get(`/api/documents/${id}`)).json();
}

/** Saves text through the API, as another device would. */
async function saveElsewhere(api, id, text) {
  const { version } = await serverDoc(api, id);
  const res = await api.put(`/api/documents/${id}/content`, {
    data: text,
    headers: { 'Content-Type': 'text/plain', 'If-Match': String(version) },
  });
  expect(res.status()).toBe(200);
}

async function editUntilConflict(page, api, id) {
  await saveElsewhere(api, id, 'theirs');
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' more');
  await expect(conflictDialog(page)).toBeVisible();
}

test('Overwrite with mine saves my text over the other version', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  await expect(status(page)).toHaveText('Not saved: changed on another device.');
  await page.keyboard.press('Escape');
  await expect(conflictDialog(page)).toBeVisible();
  await conflictDialog(page).getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(status(page)).toHaveText('Saved');
  const doc = await serverDoc(api, id);
  expect(doc.content).toBe('mine more');
  expect(doc.version).toBe(4);
});

test('another conflict during Overwrite shows the dialog again', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  await saveElsewhere(api, id, 'theirs again');
  await conflictDialog(page).getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(conflictDialog(page)).toBeVisible();
  await conflictDialog(page).getByRole('button', { name: 'Overwrite with mine' }).click();
  await expect(status(page)).toHaveText('Saved');
  expect((await serverDoc(api, id)).content).toBe('mine more');
});

test('Load the other version replaces my text and marks the tab clean', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  await conflictDialog(page).getByRole('button', { name: 'Load the other version' }).click();
  await expect(editor(page)).toHaveText('theirs');
  await expect(status(page)).toHaveText('Saved');
  expect((await serverDoc(api, id)).content).toBe('theirs');
});

test('Save mine as a new document creates a conflict copy and reloads the original', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  await conflictDialog(page).getByRole('button', { name: 'Save mine as a new document' }).click();
  const copyTab = page.getByRole('tab', { name: 'Untitled 1 (conflict copy)' });
  await expect(copyTab).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('mine more');
  const copy = (await (await api.get('/api/documents')).json()).find((doc) => doc.name === 'Untitled 1 (conflict copy)');
  expect((await serverDoc(api, copy.id)).content).toBe('mine more');
  await page.getByRole('tab', { name: 'Untitled 1', exact: true }).click();
  await expect(editor(page)).toHaveText('theirs');
  await expect(status(page)).toHaveText('Saved');
});

test('after a delete elsewhere, Save mine as a new document keeps my text', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  expect((await api.delete(`/api/documents/${id}`)).status()).toBe(204);
  await editor(page).click();
  await page.keyboard.type(' more');
  await expect(deletedDialog(page)).toBeVisible();
  await expect(status(page)).toHaveText('Not saved: deleted on another device.');
  await deletedDialog(page).getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Untitled 1' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('mine more');
  const docs = await (await api.get('/api/documents')).json();
  expect(docs.map((doc) => doc.name)).toEqual(['Untitled 1']);
  expect((await serverDoc(api, docs[0].id)).content).toBe('mine more');
});

test('after a delete elsewhere, Discard and close closes the tab', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  expect((await api.delete(`/api/documents/${id}`)).status()).toBe(204);
  await editor(page).click();
  await page.keyboard.type(' more');
  await deletedDialog(page).getByRole('button', { name: 'Discard and close' }).click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  expect(await (await api.get('/api/documents')).json()).toEqual([]);
});
