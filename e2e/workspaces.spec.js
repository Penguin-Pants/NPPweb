// v3 workspaces (REQUIREMENTS_V3.md). Fixture API calls send no workspace,
// so they act on Personal (MIG-3).
import { drop, expect, login, newDocument, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const status = (page) => page.locator('#save-status');
const text = { 'Content-Type': 'text/plain' };

/** The document names of one workspace, newest first. */
async function names(api, workspace) {
  return (await (await api.get(`/api/documents?workspace=${workspace}`)).json()).map((doc) => doc.name);
}

/** Signs in with Work as this browser's stored workspace. */
async function loginToWork(page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('pn.workspace')) localStorage.setItem('pn.workspace', 'work');
  });
  await login(page);
}

/** Opens a new document in the active workspace and saves text in it. Returns its id. */
async function savedDocument(page, api, workspace, content) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(content);
  await expect(status(page)).toHaveText('Saved');
  const [doc] = await (await api.get(`/api/documents?workspace=${workspace}`)).json();
  return doc.id;
}

test('the window title names the workspace at first paint (WS-3, WS-4)', async ({ page }) => {
  await login(page);
  await expect(page).toHaveTitle('Personal - Notepad');
  await page.evaluate(() => localStorage.setItem('pn.workspace', 'work'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-workspace', 'work');
  await expect(page).toHaveTitle('Work - Notepad');
});

test('in Work, New creates a Work document and Personal stays empty (WS-6)', async ({ page, api }) => {
  await loginToWork(page);
  await newDocument(page);
  await expect(page.getByRole('tab', { name: 'Untitled 1' })).toHaveAttribute('aria-selected', 'true');
  expect(await names(api, 'work')).toEqual(['Untitled 1']);
  expect(await names(api, 'personal')).toEqual([]);
});

test('in Work, a dropped notes.md keeps its name while only Personal has notes.md (WS-6, DRP-2)', async ({ page, api }) => {
  await api.post('/api/documents?name=notes.md', { data: 'personal', headers: text });
  await loginToWork(page);
  await drop(page, [{ name: 'notes.md', text: 'dropped' }]);
  await expect(page.getByRole('tab', { name: 'notes.md', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('dropped');
  expect(await names(api, 'work')).toEqual(['notes.md']);
  expect(await names(api, 'personal')).toEqual(['notes.md']);
});

test('in Work, the conflict copy goes to Work (WS-6, CON-1)', async ({ page, api }) => {
  await loginToWork(page);
  const id = await savedDocument(page, api, 'work', 'mine');
  const { version } = await (await api.get(`/api/documents/${id}?workspace=work`)).json();
  const res = await api.put(`/api/documents/${id}/content?workspace=work`, {
    data: 'theirs',
    headers: { ...text, 'If-Match': String(version) },
  });
  expect(res.status()).toBe(200);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' more');
  const dialog = page.getByRole('dialog', { name: 'This document changed on another device.' });
  await dialog.getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(page.getByRole('tab', { name: 'Untitled 1 (conflict copy)' })).toHaveAttribute('aria-selected', 'true');
  expect(await names(api, 'work')).toEqual(['Untitled 1 (conflict copy)', 'Untitled 1']);
  expect(await names(api, 'personal')).toEqual([]);
});

test('in Work, the copy after a delete elsewhere goes to Work (WS-6, EDGE-1)', async ({ page, api }) => {
  await loginToWork(page);
  const id = await savedDocument(page, api, 'work', 'mine');
  expect((await api.delete(`/api/documents/${id}?workspace=work`)).status()).toBe(204);
  await editor(page).click();
  await page.keyboard.type(' more');
  const dialog = page.getByRole('dialog', { name: 'This document was deleted on another device.' });
  await dialog.getByRole('button', { name: 'Save mine as a new document' }).click();
  await expect(page.getByRole('tab', { name: 'Untitled 1' })).toHaveAttribute('aria-selected', 'true');
  expect(await names(api, 'work')).toEqual(['Untitled 1']);
  expect(await names(api, 'personal')).toEqual([]);
});

test('tabs stored before the upgrade restore as the Personal tabs, and Work keeps its own (MIG-2, WS-7)', async ({ page, api }) => {
  const ids = [];
  for (const name of ['a.md', 'b.md']) {
    ids.push((await (await api.post(`/api/documents?name=${name}`, { data: name, headers: text })).json()).id);
  }
  await login(page);
  await page.evaluate((list) => {
    localStorage.removeItem('pn.workspace');
    localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: list, activeId: list[1] }));
  }, ids);
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('b.md');

  await page.evaluate(() => localStorage.setItem('pn.workspace', 'work'));
  await page.reload();
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pn.openTabs.v1')))).toEqual({ ids, activeId: ids[1] });
});
