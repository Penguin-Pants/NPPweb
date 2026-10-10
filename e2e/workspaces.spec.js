// v3 workspaces (REQUIREMENTS_V3.md). Fixture API calls send no workspace,
// so they act on Personal (MIG-3).
import { closeButton, drop, expect, login, newDocument, test } from './fixtures.js';
import { contrastRatio } from '../web/src/workspace-color.js';

/** rgb(r, g, b) from getComputedStyle as #rrggbb. */
const hex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;

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
  await expect(page).toHaveTitle('Personal - Margin');
  await page.evaluate(() => localStorage.setItem('pn.workspace', 'work'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-workspace', 'work');
  await expect(page).toHaveTitle('Work - Margin');
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

// The switch (WS-2, WS-7 to WS-9, EDGE-28 to EDGE-30, EDGE-34, TD-33).
const switchButton = (page) => page.locator('#workspace-switch');
const message = (page) => page.locator('#status-message');
const isPersonalList = (url) => url.pathname === '/api/documents' && !url.searchParams.has('workspace');

/** Creates a document in a workspace through the API. Returns its id. */
async function create(api, workspace, name, content) {
  const res = await api.post(`/api/documents?workspace=${workspace}&name=${encodeURIComponent(name)}`, {
    data: content,
    headers: text,
  });
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

/** Stores the open tabs of both workspaces in this browser, then reloads. */
async function storeTabs(page, { personal = [], work = [] }) {
  await page.evaluate(
    ([p, w]) => {
      localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: p, activeId: p[0] ?? null }));
      localStorage.setItem('pn.openTabs.work.v1', JSON.stringify({ ids: w, activeId: w[0] ?? null }));
    },
    [personal, work],
  );
  await page.reload();
}

async function switchTo(page, name) {
  await switchButton(page).click();
  await expect(page).toHaveTitle(`${name} - Margin`);
}

/** Lets a reply that just arrived run its handlers. */
const afterReply = (page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));

test('switching away and back restores each workspace\'s tabs, active tab and title (WS-2, WS-3, WS-7) @smoke', async ({ page, api }) => {
  const a = await create(api, 'personal', 'a.md', 'aaa');
  const b = await create(api, 'personal', 'b.md', 'bbb');
  await login(page);
  await storeTabs(page, { personal: [a, b] });
  await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
  await expect(switchButton(page)).toHaveText('Personal');
  await expect(switchButton(page)).toHaveAttribute('aria-label', 'Workspace: Personal. Switch to Work');

  await switchTo(page, 'Work');
  await expect(switchButton(page)).toHaveText('Work');
  await expect(switchButton(page)).toHaveAttribute('aria-label', 'Workspace: Work. Switch to Personal');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await newDocument(page);

  await switchTo(page, 'Personal');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'a.md' })).toHaveAttribute('aria-selected', 'true');
  await expect(editor(page)).toHaveText('aaa');

  await switchTo(page, 'Work');
  await expect(page.getByRole('tab', { name: 'Untitled 1' })).toHaveAttribute('aria-selected', 'true');
  expect(await names(api, 'work')).toEqual(['Untitled 1']);
  expect(await names(api, 'personal')).toEqual(['b.md', 'a.md']);
});

test.describe('with a 30-second autosave delay', () => {
  test.use({ autosaveSeconds: 30 });

  test('text typed just before a switch is on the server after it (WS-8)', async ({ page, api }) => {
    await login(page);
    await newDocument(page);
    await editor(page).click();
    await page.keyboard.type('typed just before');
    await expect(status(page)).toHaveText('Unsaved changes');
    await switchTo(page, 'Work');
    const [doc] = await (await api.get('/api/documents')).json();
    expect((await (await api.get(`/api/documents/${doc.id}`)).json()).content).toBe('typed just before');
  });
});

test('a save that fails before a switch keeps the workspace and says why (EDGE-28)', async ({ page }) => {
  await login(page);
  await newDocument(page);
  await page.route('**/api/documents/*/content', (route) => route.abort());
  await editor(page).click();
  await page.keyboard.type('not saved');
  await switchButton(page).click();
  await expect(message(page)).toHaveText(
    'Unsaved changes could not be saved: the server cannot be reached. The workspace did not change.',
  );
  await expect(page).toHaveTitle('Personal - Margin');
  await expect(switchButton(page)).toHaveText('Personal');
  await expect(editor(page)).toHaveText('not saved');
});

test('a failed list read keeps the workspace, and the text typed before is saved (EDGE-30)', async ({ page, api }) => {
  await login(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('saved first');
  await page.route((url) => url.pathname === '/api/documents' && url.searchParams.get('workspace') === 'work', (route) =>
    route.abort(),
  );
  await switchButton(page).click();
  await expect(message(page)).toHaveText('Could not open the Work documents. Try again.');
  await expect(page).toHaveTitle('Personal - Margin');
  const [doc] = await (await api.get('/api/documents')).json();
  expect((await (await api.get(`/api/documents/${doc.id}`)).json()).content).toBe('saved first');
});

test('a Personal list read that returns after the switch leaves the Work tabs as they are (TD-41)', async ({ page, api }) => {
  const p = await create(api, 'personal', 'p.md', 'personal text');
  const w = await create(api, 'work', 'w.md', 'work text');
  await login(page);
  await storeTabs(page, { personal: [p], work: [w] });
  await expect(page.getByRole('tab', { name: 'p.md' })).toHaveAttribute('aria-selected', 'true');
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(isPersonalList, async (route) => {
    await held;
    await route.continue();
  }, { times: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await switchTo(page, 'Work');
  await expect(page.getByRole('tab', { name: 'w.md' })).toHaveAttribute('aria-selected', 'true');
  const reply = page.waitForResponse((res) => isPersonalList(new URL(res.url())));
  release();
  await reply;
  await afterReply(page);
  await expect(page.getByRole('tab', { name: 'w.md' })).toHaveCount(1);
  await expect(editor(page)).toHaveText('work text');
});

test('a language change whose reply arrives after the switch shows no message (TD-41)', async ({ page, api }) => {
  const p = await create(api, 'personal', 'p.md', 'x = 1');
  await login(page);
  await storeTabs(page, { personal: [p] });
  await expect(page.getByRole('tab', { name: 'p.md' })).toHaveAttribute('aria-selected', 'true');
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const isPatch = (url) => url.pathname === `/api/documents/${p}`;
  await page.route(isPatch, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await held;
    await route.continue();
  });
  await page.getByLabel('Language').selectOption('python');
  await switchTo(page, 'Work');
  const reply = page.waitForResponse((res) => isPatch(new URL(res.url())) && res.request().method() === 'PATCH');
  release();
  await reply;
  await afterReply(page);
  // One read: the message clears itself after 5 seconds, so a retrying check would pass anyway.
  expect(await message(page).textContent()).toBe('');
});

test('a New whose reply arrives after the switch shows no message and opens no tab (TD-41, R14)', async ({ page }) => {
  await login(page);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  const isCreate = (url) => url.pathname === '/api/documents';
  await page.route(isCreate, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await held;
    await route.continue();
  });
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await switchTo(page, 'Work');
  const reply = page.waitForResponse((res) => isCreate(new URL(res.url())) && res.request().method() === 'POST');
  release();
  await reply;
  await afterReply(page);
  // One read: the message clears itself after 5 seconds, so a retrying check would pass anyway.
  expect(await message(page).textContent()).toBe('');
  await expect(page.getByRole('tab')).toHaveCount(0);
});

test('a keyboard-only run switches the workspace (WS-2)', async ({ page }) => {
  await login(page);
  await page.locator('#theme-toggle').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(switchButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Work - Margin');
  await expect(switchButton(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).toHaveTitle('Personal - Margin');
});

test('a theme change in Work also shows in Personal (WS-9)', async ({ page }) => {
  await login(page);
  await switchTo(page, 'Work');
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await switchTo(page, 'Personal');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('two browsers in different workspaces work independently (EDGE-34)', async ({ page, browser, baseURL, api }) => {
  await login(page);
  const other = await browser.newContext({ baseURL });
  try {
    const second = await other.newPage();
    await login(second);
    await switchTo(second, 'Work');
    await newDocument(page);
    await newDocument(second);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await second.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveTitle('Personal - Margin');
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(second.getByRole('tab')).toHaveCount(1);
    expect(await names(api, 'personal')).toEqual(['Untitled 1']);
    expect(await names(api, 'work')).toEqual(['Untitled 1']);
  } finally {
    await other.close();
  }
});

// Move (MOV-1 to MOV-3, EDGE-31, EDGE-32, TD-34).
const documentsButton = (page) => page.getByRole('button', { name: 'Documents', exact: true });
const moveButton = (page, name, target) => page.getByRole('button', { name: `Move ${name} to ${target}` });
const deletedDialog = (page) => page.getByRole('dialog', { name: 'This document was deleted on another device.' });

test('Move to Work takes a document out of this list and into the Work list (MOV-1)', async ({ page, api }) => {
  await create(api, 'personal', 'a.md', 'aaa');
  await create(api, 'personal', 'b.md', 'bbb');
  await login(page);
  await documentsButton(page).click();
  await expect(moveButton(page, 'a.md', 'Work')).toHaveText('Move to Work');
  await moveButton(page, 'a.md', 'Work').click();
  await expect(message(page)).toHaveText('Moved a.md to Work.');
  await expect(page.locator('.doc-row')).toHaveCount(1);
  expect(await names(api, 'personal')).toEqual(['b.md']);
  expect(await names(api, 'work')).toEqual(['a.md']);
  await page.keyboard.press('Escape');
  await switchTo(page, 'Work');
  await documentsButton(page).click();
  await expect(moveButton(page, 'a.md', 'Personal')).toHaveText('Move to Personal');
});

test('a failed move keeps the tab and moves nothing (EDGE-32)', async ({ page, api }) => {
  const a = await create(api, 'personal', 'a.md', 'aaa');
  await login(page);
  await storeTabs(page, { personal: [a] });
  await page.route(`**/api/documents/${a}`, (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.fallback(),
  );
  await documentsButton(page).click();
  await moveButton(page, 'a.md', 'Work').click();
  await expect(message(page)).toHaveText('Not moved. Try again.');
  await expect(page.getByRole('tab', { name: 'a.md' })).toHaveCount(1);
  expect(await names(api, 'work')).toEqual([]);
});

test('a move of a document that another device moved says so and drops its row (EDGE-32)', async ({ page, api }) => {
  const a = await create(api, 'personal', 'a.md', 'aaa');
  await login(page);
  await documentsButton(page).click();
  await expect(moveButton(page, 'a.md', 'Work')).toBeVisible();
  expect((await api.patch(`/api/documents/${a}?workspace=personal`, { data: { workspace: 'work' } })).status()).toBe(200);
  await moveButton(page, 'a.md', 'Work').click();
  await expect(message(page)).toHaveText('Not moved: the document is no longer in Personal.');
  await expect(page.locator('.doc-row')).toHaveCount(0);
});

test.describe('moves with a 30-second autosave delay', () => {
  test.use({ autosaveSeconds: 30 });

  test('an edit typed just before a move is in the moved document, and its tab closes (MOV-3)', async ({ page, api }) => {
    const a = await create(api, 'personal', 'a.md', 'aaa');
    await login(page);
    await storeTabs(page, { personal: [a] });
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' more');
    await expect(status(page)).toHaveText('Unsaved changes');
    await documentsButton(page).click();
    await moveButton(page, 'a.md', 'Work').click();
    await expect(message(page)).toHaveText('Moved a.md to Work.');
    await expect(page.getByRole('tab')).toHaveCount(0);
    expect((await (await api.get(`/api/documents/${a}?workspace=work`)).json()).content).toBe('aaa more');
  });

  test('a save that fails before a move keeps the tab and moves nothing (EDGE-32)', async ({ page, api }) => {
    const a = await create(api, 'personal', 'a.md', 'aaa');
    await login(page);
    await storeTabs(page, { personal: [a] });
    await page.route('**/api/documents/*/content', (route) => route.abort());
    await editor(page).click();
    await page.keyboard.type('x');
    await documentsButton(page).click();
    await moveButton(page, 'a.md', 'Work').click();
    await expect(message(page)).toHaveText('Not moved: unsaved changes could not be saved.');
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveCount(1);
    expect(await names(api, 'work')).toEqual([]);
  });

  test('text typed during a move request stays in its tab, and its next save offers a new document (TD-34, R11)', async ({ page, api }) => {
    const a = await create(api, 'personal', 'a.md', 'aaa');
    await login(page);
    await storeTabs(page, { personal: [a] });
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route(`**/api/documents/${a}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      await held;
      await route.continue();
    });
    await documentsButton(page).click();
    await moveButton(page, 'a.md', 'Work').click();
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' late');
    const reply = page.waitForResponse((res) => res.url().endsWith(`/api/documents/${a}`) && res.request().method() === 'PATCH');
    release();
    await reply;
    await expect(message(page)).toHaveText('Moved a.md to Work.');
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(deletedDialog(page)).toBeVisible();
    await deletedDialog(page).getByRole('button', { name: 'Save mine as a new document' }).click();
    await expect(editor(page)).toHaveText('aaa late');
    expect(await names(api, 'personal')).toEqual(['a.md']);
    expect(await names(api, 'work')).toEqual(['a.md']);
  });

  test('a document moved on another device: a clean tab closes at the next refresh, a dirty one warns at its next save (EDGE-31)', async ({ page, api }) => {
    const a = await create(api, 'personal', 'a.md', 'aaa');
    const b = await create(api, 'personal', 'b.md', 'bbb');
    await login(page);
    await storeTabs(page, { personal: [a, b] });
    await page.getByRole('tab', { name: 'b.md' }).click();
    await editor(page).click();
    await page.keyboard.type('dirty ');
    for (const id of [a, b]) {
      expect((await api.patch(`/api/documents/${id}?workspace=personal`, { data: { workspace: 'work' } })).status()).toBe(200);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('tab', { name: 'a.md' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'b.md' })).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+s');
    await expect(deletedDialog(page)).toBeVisible();
  });
});

// Colors (CLR-1 to CLR-6, TD-36 to TD-39).
const css = (locator, property) => locator.evaluate((el, name) => getComputedStyle(el)[name], property);
const strip = (page) => css(page.locator('#tabstrip'), 'backgroundColor');
const DARK_SURFACE = 'rgb(38, 40, 44)';
const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const WORK_PRESET = 'rgb(15, 118, 110)';

async function openSettings(page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

test('each workspace colors the tab strip in both themes, and Personal keeps today\'s look (CLR-1, CLR-6)', async ({ page, api }) => {
  const w1 = await create(api, 'work', 'w1.md', 'one');
  const w2 = await create(api, 'work', 'w2.md', 'two');
  await login(page);
  await storeTabs(page, { work: [w1, w2] });
  expect(await strip(page)).toBe(DARK_SURFACE);
  await switchTo(page, 'Work');
  expect(await strip(page)).toBe(WORK_PRESET);
  expect(await css(switchButton(page), 'backgroundColor')).toBe(WORK_PRESET);
  expect(await css(page.getByRole('tab', { name: 'w2.md' }), 'color')).toBe('rgb(255, 255, 255)');
  expect(await css(page.getByRole('tab', { name: 'w1.md' }), 'backgroundColor')).not.toBe(WORK_PRESET);

  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await strip(page)).toBe(WORK_PRESET);
  await switchTo(page, 'Personal');
  expect(await strip(page)).toBe(LIGHT_SURFACE);
});

test('a color set in Settings colors the strip and shows on another device after a reload, and an empty field restores the default (CLR-2 to CLR-4)', async ({ page, browser, baseURL }) => {
  await login(page);
  let dialog = await openSettings(page);
  await dialog.getByLabel('Work color (hex, empty for default)').fill('#12');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Use #RGB or #RRGGBB for the Work color.');
  await dialog.getByLabel('Work color (hex, empty for default)').fill('#FF0');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  expect(await strip(page)).toBe(DARK_SURFACE);
  await switchTo(page, 'Work');
  expect(await strip(page)).toBe('rgb(255, 255, 0)');
  expect(await css(switchButton(page), 'color')).toBe('rgb(0, 0, 0)');

  const other = await browser.newContext({ baseURL });
  try {
    const second = await other.newPage();
    await second.addInitScript(() => localStorage.setItem('pn.workspace', 'work'));
    await login(second);
    expect(await strip(second)).toBe('rgb(255, 255, 0)');
  } finally {
    await other.close();
  }

  dialog = await openSettings(page);
  await expect(dialog.getByLabel('Work color (hex, empty for default)')).toHaveValue('#FF0');
  await dialog.getByLabel('Work color (hex, empty for default)').fill('');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  expect(await strip(page)).toBe(WORK_PRESET);
});

test('a Personal color applies to Personal only (CLR-1)', async ({ page }) => {
  await login(page);
  const dialog = await openSettings(page);
  await dialog.getByLabel('Personal color (hex, empty for default)').fill('#000080');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  expect(await strip(page)).toBe('rgb(0, 0, 128)');
  expect(await css(switchButton(page), 'color')).toBe('rgb(255, 255, 255)');
  await switchTo(page, 'Work');
  expect(await strip(page)).toBe(WORK_PRESET);
  await switchTo(page, 'Personal');
  expect(await strip(page)).toBe('rgb(0, 0, 128)');
});

test.describe('tab colors with a 30-second autosave delay', () => {
  test.use({ autosaveSeconds: 30 });

  test('an inactive Personal tab keeps today\'s accent dot, and a Work one uses the strip text color (CLR-6, TD-38)', async ({ page, api }) => {
    const p1 = await create(api, 'personal', 'p1.md', 'one');
    const p2 = await create(api, 'personal', 'p2.md', 'two');
    await login(page);
    await storeTabs(page, { personal: [p1, p2] });
    await editor(page).click();
    await page.keyboard.type('x');
    await page.getByRole('tab', { name: 'p2.md' }).click();
    const dot = page.getByRole('tab', { name: 'p1.md' }).locator('.tab-dirty');
    await expect(dot).toBeVisible();
    // A list refresh renders the strip again, so the check reads the current node each time.
    await expect(dot).toHaveCSS('background-color', 'rgb(94, 161, 255)');
  });
});

test('a hovered close button on an inactive Work tab stays readable in the light theme (CLR-5)', async ({ page, api }) => {
  const w1 = await create(api, 'work', 'w1.md', 'one');
  const w2 = await create(api, 'work', 'w2.md', 'two');
  await page.addInitScript(() => {
    localStorage.setItem('pn.workspace', 'work');
    localStorage.setItem('pn.theme', 'light');
  });
  await login(page);
  await storeTabs(page, { work: [w1, w2] });
  const close = closeButton(page, 'w2.md');
  await close.hover();
  const [color, background] = [await css(close, 'color'), await css(close, 'backgroundColor')];
  expect(contrastRatio(hex(color), hex(background))).toBeGreaterThanOrEqual(4.5);
});

test('a settings reply without colors, as from a v2 server, keeps both default colors (R15)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/settings', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"autosaveSeconds":5}' })
      : route.fallback(),
  );
  await login(page);
  expect(await strip(page)).toBe(DARK_SURFACE);
  await switchTo(page, 'Work');
  expect(await strip(page)).toBe(WORK_PRESET);
  const dialog = await openSettings(page);
  await expect(dialog.getByLabel('Work color (hex, empty for default)')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('after a switch the Documents list never shows the other workspace\'s rows (WS-6)', async ({ page, api }) => {
  await create(api, 'personal', 'home.md', 'personal');
  await create(api, 'work', 'plan.md', 'work');
  await login(page);
  await documentsButton(page).click();
  await expect(page.locator('.doc-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await switchTo(page, 'Work');
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route((url) => url.pathname === '/api/documents' && url.searchParams.get('workspace') === 'work', async (route) => {
    await held;
    await route.continue();
  }, { times: 1 });
  await documentsButton(page).click();
  await expect(page.getByRole('button', { name: 'Delete home.md' })).toHaveCount(0);
  release();
  await expect(moveButton(page, 'plan.md', 'Personal')).toBeVisible();
});

// A Delete or Rename dialog that opened before a switch applied acts on the
// row's workspace when it is confirmed after the switch (audit C2).
async function openRowDialogDuringSwitch(page, button, dialogName) {
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let arrived;
  const holding = new Promise((resolve) => (arrived = resolve));
  await page.route((url) => url.pathname === '/api/documents' && url.searchParams.get('workspace') === 'work', async (route) => {
    arrived();
    await held;
    await route.continue();
  }, { times: 1 });
  await switchButton(page).click();
  await holding;
  await documentsButton(page).click();
  await page.getByRole('button', { name: button }).click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  release();
  await expect(page).toHaveTitle('Work - Margin');
  return dialog;
}

test('a Delete confirmed after a switch deletes the row\'s document in its own workspace (audit C2)', async ({ page, api }) => {
  await create(api, 'personal', 'home.md', 'personal');
  await create(api, 'work', 'home.md', 'work');
  await login(page);
  const dialog = await openRowDialogDuringSwitch(page, 'Delete home.md', 'Delete document');
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => names(api, 'personal')).toEqual([]);
  expect(await names(api, 'work')).toEqual(['home.md']);
  await afterReply(page);
  expect(await message(page).textContent()).toBe('');
});

test('a Rename submitted after a switch renames the row\'s document in its own workspace (audit C2)', async ({ page, api }) => {
  await create(api, 'personal', 'home.md', 'personal');
  await login(page);
  const dialog = await openRowDialogDuringSwitch(page, 'Rename home.md', 'Rename document');
  await dialog.getByLabel('Name').fill('house.md');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog).toBeHidden();
  expect(await names(api, 'personal')).toEqual(['house.md']);
  expect(await names(api, 'work')).toEqual([]);
});
