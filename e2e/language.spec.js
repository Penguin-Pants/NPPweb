import { expect, login, OWNER_PASSWORD, test } from './fixtures.js';

const SAMPLES = {
  'a.md': ['markdown', '# Title\n\n**bold** text'],
  'a.json': ['json', '{ "key": true, "n": 1 }'],
  'a.html': ['html', '<div class="x">hi</div>'],
  'a.css': ['css', 'body { color: red; }'],
  'a.js': ['javascript', 'const x = function () { return 1; };'],
  'a.ts': ['typescript', 'let n: number = 1; interface A { b: string }'],
  'a.py': ['python', 'def f(x):\n    return x'],
  'a.sql': ['sql', 'SELECT id FROM t WHERE x = 1'],
  'a.yaml': ['yaml', 'key: value\nlist:\n  - 1'],
  'a.sh': ['shell', 'if [ -f x ]; then echo hi; fi'],
  'notes.txt': ['plain', 'just text'],
};

async function createDoc(api, name, content) {
  const res = await api.post(`/api/documents?name=${encodeURIComponent(name)}`, {
    data: content,
    headers: { 'Content-Type': 'text/plain' },
  });
  return res.json();
}

async function openTabs(page, ids) {
  await page.evaluate((list) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: list, activeId: list[0] })), ids);
  await page.reload();
}

const content = (page) => page.locator('.cm-content');
const languageSelect = (page) => page.getByRole('combobox', { name: 'Language' });

test('each extension selects its language and highlights tokens', async ({ page, api }) => {
  const docs = [];
  for (const [name, [, text]] of Object.entries(SAMPLES)) docs.push(await createDoc(api, name, text));
  await login(page);
  await openTabs(page, docs.map((doc) => doc.id));
  for (const [name, [id]] of Object.entries(SAMPLES)) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(content(page)).toHaveAttribute('data-language', id);
    const highlighted = content(page).locator('.cm-line span[class]');
    if (id === 'plain') await expect(highlighted).toHaveCount(0);
    else await expect(highlighted.first()).toBeVisible();
  }
});

test('renaming a.py to a.sql switches to SQL', async ({ page, api }) => {
  const doc = await createDoc(api, 'a.py', 'select 1');
  await login(page);
  await openTabs(page, [doc.id]);
  await expect(content(page)).toHaveAttribute('data-language', 'python');
  await page.getByRole('button', { name: 'Documents' }).click();
  await page.getByRole('button', { name: 'Rename a.py' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  await dialog.getByLabel('Name').fill('a.sql');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(content(page)).toHaveAttribute('data-language', 'sql');
  await expect(languageSelect(page)).toHaveValue('');
});

test('an override wins over the extension and shows in a second browser context', async ({ page, api, browser, server }) => {
  const doc = await createDoc(api, 'a.py', 'x = 1');
  await login(page);
  await openTabs(page, [doc.id]);
  await expect(languageSelect(page).locator('option')).toHaveCount(12);
  await expect(languageSelect(page).locator('option').first()).toHaveText('Auto (detected)');
  await languageSelect(page).selectOption('markdown');
  await expect(content(page)).toHaveAttribute('data-language', 'markdown');
  await expect.poll(async () => (await (await api.get(`/api/documents/${doc.id}`)).json()).language).toBe('markdown');

  const other = await browser.newContext({ baseURL: server.url });
  const second = await other.newPage();
  await second.goto('/login');
  await second.getByLabel('Password').fill(OWNER_PASSWORD);
  await second.getByRole('button', { name: 'Sign in' }).click();
  await second.waitForURL((url) => url.pathname === '/');
  await openTabs(second, [doc.id]);
  await expect(content(second)).toHaveAttribute('data-language', 'markdown');
  await expect(languageSelect(second)).toHaveValue('markdown');
  await other.close();

  await languageSelect(page).selectOption('');
  await expect(content(page)).toHaveAttribute('data-language', 'python');
  await expect.poll(async () => (await (await api.get(`/api/documents/${doc.id}`)).json()).language).toBe(null);
});

test('a tab that is not shown picks up a rename when it is shown again', async ({ page, api }) => {
  const a = await createDoc(api, 'a.py', 'x = 1');
  const b = await createDoc(api, 'b.py', 'y = 2');
  await login(page);
  await openTabs(page, [a.id, b.id]);
  await page.getByRole('tab', { name: 'b.py', exact: true }).click();
  await expect(content(page)).toHaveAttribute('data-language', 'python');
  await page.getByRole('tab', { name: 'a.py', exact: true }).click();
  await page.getByRole('button', { name: 'Documents' }).click();
  await page.getByRole('button', { name: 'Rename b.py' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  await dialog.getByLabel('Name').fill('b.sql');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(content(page)).toHaveAttribute('data-language', 'python');
  await page.getByRole('tab', { name: 'b.sql', exact: true }).click();
  await expect(content(page)).toHaveAttribute('data-language', 'sql');
  await expect(languageSelect(page)).toHaveAttribute('title', 'Language: SQL');
});

test('renaming the active tab updates the selector tooltip', async ({ page, api }) => {
  const doc = await createDoc(api, 'a.py', 'x = 1');
  await login(page);
  await openTabs(page, [doc.id]);
  await expect(languageSelect(page)).toHaveAttribute('title', 'Language: Python');
  await page.getByRole('button', { name: 'Documents' }).click();
  await page.getByRole('button', { name: 'Rename a.py' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  await dialog.getByLabel('Name').fill('a.sql');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(languageSelect(page)).toHaveAttribute('title', 'Language: SQL');
});
