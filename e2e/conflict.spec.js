import { expect, login, newDocument, OWNER_PASSWORD, test } from './fixtures.js';

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
  await expect(conflictDialog(page).getByRole('button', { name: 'Save mine as a new document' })).toBeFocused();
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
  let puts = 0;
  page.on('request', (req) => req.method() === 'PUT' && (puts += 1));
  await page.waitForTimeout(2500);
  expect(puts).toBe(0);
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
  await expect(editor(page)).toHaveAttribute('data-language', 'markdown');
  const copy = (await (await api.get('/api/documents')).json()).find((doc) => doc.name === 'Untitled 1 (conflict copy)');
  expect((await serverDoc(api, copy.id)).content).toBe('mine more');
  expect(copy.language).toBe('markdown');
  await page.getByRole('tab', { name: 'Untitled 1', exact: true }).click();
  await expect(editor(page)).toHaveText('theirs');
  await expect(status(page)).toHaveText('Saved');
});

test('a conflict copy of a named document keeps its detected language', async ({ page, api }) => {
  const res = await api.post('/api/documents?name=notes.py', { data: 'x = 1', headers: { 'Content-Type': 'text/plain' } });
  const { id } = await res.json();
  await login(page);
  await page.evaluate((list) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: list, activeId: list[0] })), [id]);
  await page.reload();
  await expect(editor(page)).toHaveAttribute('data-language', 'python');
  await editUntilConflict(page, api, id);
  await conflictDialog(page).getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(page.getByRole('tab', { name: 'notes.py (conflict copy)' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveAttribute('data-language', 'python');
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
  await expect(editor(page)).toHaveAttribute('data-language', 'markdown');
  const docs = await (await api.get('/api/documents')).json();
  expect(docs.map((doc) => doc.name)).toEqual(['Untitled 1']);
  expect(docs[0].language).toBe('markdown');
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

test('a failed step inside a choice shows an error in the dialog and keeps my text', async ({ page, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  let failures = 1;
  await page.route(
    (url) => url.pathname === '/api/documents' && url.search.includes('name='),
    (route) => (route.request().method() === 'POST' && failures-- > 0 ? route.abort() : route.fallback()),
  );
  const dialog = conflictDialog(page);
  await dialog.getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Cannot connect to the server. Try again.');
  await expect(editor(page)).toHaveText('mine more');
  await dialog.getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Untitled 1 (conflict copy)' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('mine more');
  const names = (await (await api.get('/api/documents')).json()).map((doc) => doc.name).sort();
  expect(names).toEqual(['Untitled 1', 'Untitled 1 (conflict copy)']);
});

test('an expired session inside a choice asks for sign-in, then the choice works', async ({ page, context, api }) => {
  await login(page);
  const id = await savedDocument(page, api, 'mine');
  await editUntilConflict(page, api, id);
  await context.clearCookies();
  const dialog = conflictDialog(page);
  await dialog.getByRole('button', { name: 'Load the other version' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in again' });
  await expect(signIn).toBeVisible();
  await signIn.getByLabel('Password').fill(OWNER_PASSWORD);
  await signIn.getByRole('button', { name: 'Sign in' }).click();
  await expect(signIn).toBeHidden();
  await expect(dialog.getByRole('alert')).toHaveText('Your session ended. Sign in, then choose again.');
  await dialog.getByRole('button', { name: 'Load the other version' }).click();
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toHaveText('theirs');
});

test('two conflicts show one dialog after the other', async ({ page, api }) => {
  await login(page);
  const first = await savedDocument(page, api, 'one');
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('two');
  await expect(status(page)).toHaveText('Saved');
  const docs = await (await api.get('/api/documents')).json();
  const second = docs.find((doc) => doc.id !== first).id;
  await page.getByRole('tab', { name: 'Untitled 1' }).click();
  await editor(page).press('ControlOrMeta+End');
  await page.keyboard.type(' a');
  await page.getByRole('tab', { name: 'Untitled 2' }).click();
  await editor(page).press('ControlOrMeta+End');
  await page.keyboard.type(' b');
  await saveElsewhere(api, first, 'theirs one');
  await saveElsewhere(api, second, 'theirs two');
  const dialog = conflictDialog(page);
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Load the other version' }).click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Load the other version' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('tab', { name: 'Untitled 1' }).click();
  await expect(editor(page)).toHaveText('theirs one');
  await page.getByRole('tab', { name: 'Untitled 2' }).click();
  await expect(editor(page)).toHaveText('theirs two');
});
