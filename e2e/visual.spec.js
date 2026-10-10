import { expect, login, test } from './fixtures.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Creates the documents, signs in and opens them as tabs. The first is active. */
async function openDocs(page, api, docs) {
  const ids = [];
  for (const [name, content] of docs) {
    const res = await api.post(`/api/documents?name=${encodeURIComponent(name)}`, {
      data: content,
      headers: { 'Content-Type': 'text/plain' },
    });
    ids.push((await res.json()).id);
  }
  await login(page);
  await page.evaluate((list) => localStorage.setItem('pn.openTabs.v1', JSON.stringify({ ids: list, activeId: list[0] })), ids);
  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  return ids;
}

const line = (page, text) => page.locator('.cm-line', { hasText: text });
const toggle = (page) => page.getByRole('button', { name: 'Visual' });
const toolbar = (page) => page.getByRole('toolbar', { name: 'Formatting' });

/** Saves now and returns the stored content. */
async function stored(page, api, id) {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  return (await (await api.get(`/api/documents/${id}`)).json()).content;
}

test('Markdown tabs show the toggle and toolbar, Visual comes first and the choice survives a reload @smoke', async ({ page, api }) => {
  await openDocs(page, api, [
    ['notes.md', '# Title\n\nend'],
    ['code.py', 'x = 1'],
  ]);
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(toolbar(page)).toBeVisible();
  await page.getByRole('tab', { name: 'code.py' }).click();
  await expect(toggle(page)).toBeHidden();
  await expect(toolbar(page)).toBeHidden();
  await page.getByRole('tab', { name: 'notes.md' }).click();
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await line(page, 'end').click();
  await expect(line(page, 'Title')).toHaveText('# Title');
  await page.reload();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(toolbar(page)).toBeVisible();
});

test('a toggle never changes the text and never starts a save (MDV-3)', async ({ page, api }) => {
  const text =
    'Title\n===\n\nSee [ref][r] and [x](https://a.b).\n\n* one\n+ two\n\n1) first\n\n<div>html</div>\n\n\n\n~~~\ncode\n~~~\n\n[r]: https://r.s\n';
  const [id] = await openDocs(page, api, [['tricky.md', text]]);
  let puts = 0;
  page.on('request', (req) => req.method() === 'PUT' && (puts += 1));
  for (let i = 0; i < 4; i += 1) await toggle(page).click();
  await page.waitForTimeout(1500);
  expect(puts).toBe(0);
  await expect(page.locator('#save-status')).toHaveText('Saved');
  expect((await (await api.get(`/api/documents/${id}`)).json()).content).toBe(text);
});

test('Visual mode hides marks and shows them on the cursor line (MDV-4, MDV-5)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', '# Title\n\nSome **bold** and *em* text\n\n> quoted\n\nend']]);
  await line(page, 'end').click();
  const heading = page.locator('.cm-line.cm-md-h1');
  await expect(heading).toHaveText('Title');
  await expect(line(page, 'Some')).toHaveText('Some bold and em text');
  await expect(page.locator('.cm-md-strong')).toHaveText('bold');
  await expect(page.locator('.cm-line.cm-md-quote')).toHaveText('quoted');
  await heading.click();
  await expect(heading).toHaveText('# Title');
  await expect(line(page, 'Some')).toHaveText('Some bold and em text');
});

test('undo and the cursor survive a toggle (MDV-6)', async ({ page, api }) => {
  const [id] = await openDocs(page, api, [['a.md', '# Title\n\nend']]);
  await line(page, 'end').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await toggle(page).click();
  await page.keyboard.type('!');
  expect(await stored(page, api, id)).toBe('# Title\n\nend more!');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await stored(page, api, id)).toBe('# Title\n\nend');
});

test('a task box click switches the task, and Ctrl+click opens a link in a new tab (MDV-7)', async ({ page, context, api }) => {
  await context.route('https://example.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  const [id] = await openDocs(page, api, [['a.md', '- [ ] todo\n\n[site](https://example.com/page)\n\nend']]);
  await line(page, 'end').click();
  await page.locator('.cm-md-task').click();
  expect(await stored(page, api, id)).toBe('- [x] todo\n\n[site](https://example.com/page)\n\nend');

  await line(page, 'end').click();
  let opened = 0;
  context.on('page', () => (opened += 1));
  await page.locator('.cm-md-link').click();
  await page.waitForTimeout(500);
  expect(opened).toBe(0);
  await line(page, 'end').click();
  const popup = context.waitForEvent('page');
  await page.locator('.cm-md-link').click({ modifiers: ['ControlOrMeta'] });
  expect((await popup).url()).toBe('https://example.com/page');
});

test('raw HTML stays source text and never runs (MDV-8)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', '<img src=x onerror="window.__xss = 1">\n\n<b>bold</b>\n\nend']]);
  await line(page, 'end').click();
  await expect(line(page, 'onerror')).toHaveText('<img src=x onerror="window.__xss = 1">');
  await expect(line(page, 'bold')).toHaveText('<b>bold</b>');
  await expect(page.locator('.cm-content img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('the toolbar formats the selection (MDV-9)', async ({ page, api }) => {
  const [id] = await openDocs(page, api, [['a.md', 'word\n\nend']]);
  for (const name of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link', 'Quote', 'Inline code', 'Code block']) {
    await expect(toolbar(page).getByRole('button', { name, exact: true })).toBeVisible();
  }
  await line(page, 'word').dblclick();
  await toolbar(page).getByRole('button', { name: 'Bold', exact: true }).click();
  await toolbar(page).getByLabel('Heading level').selectOption('Heading 2');
  expect(await stored(page, api, id)).toBe('## **word**\n\nend');
  await toolbar(page).getByRole('button', { name: 'Quote' }).click();
  expect(await stored(page, api, id)).toBe('> ## **word**\n\nend');
});

test('Ctrl+B, Ctrl+I and Ctrl+K format the selection (MDV-10)', async ({ page, api }) => {
  const [id] = await openDocs(page, api, [['a.md', 'one two three\n\nend']]);
  await toggle(page).click(); // Raw mode: every character is visible, so arrows move one at a time.
  const press = async (key, times = 1) => {
    for (let i = 0; i < times; i += 1) await page.keyboard.press(key);
  };
  await line(page, 'one').click();
  await press('Home');
  await press('Shift+ArrowRight', 3);
  await page.keyboard.press('ControlOrMeta+b'); // **one** two three, "one" selected
  await press('ArrowRight');
  await press('ArrowRight', 3);
  await press('Shift+ArrowRight', 3);
  await page.keyboard.press('ControlOrMeta+i'); // *two*, "two" selected
  await press('ArrowRight');
  await press('ArrowRight', 2);
  await press('Shift+ArrowRight', 5);
  await page.keyboard.press('ControlOrMeta+k');
  expect(await stored(page, api, id)).toBe('**one** *two* [three](https://)\n\nend');
});

test('fenced code is highlighted for known languages and plain for others (MDV-11)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', '```python\ndef f(): return 1\n```\n\n```rust\nfn main() {}\n```\n\nend']]);
  await line(page, 'end').click();
  const python = page.locator('.cm-line.cm-md-codeblock', { hasText: 'def f()' });
  const rust = page.locator('.cm-line.cm-md-codeblock', { hasText: 'fn main' });
  await expect(python).toBeVisible();
  expect(await python.locator('span').count()).toBeGreaterThan(0);
  expect(await rust.locator('span').count()).toBe(0);
  await expect(page.locator('.cm-line.cm-md-fence').first()).toHaveText('');
});

test('remote images wait for a click, data images show at once, relative ones never load (MDV-14, EDGE-25)', async ({ page, api }) => {
  let imageRequests = 0;
  await page.route('https://img.example/**', (route) => {
    imageRequests += 1;
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_BASE64, 'base64') });
  });
  await openDocs(page, api, [
    ['a.md', `![a cat](https://img.example/cat.png)\n\n![a dot](data:image/png;base64,${PNG_BASE64})\n\n![local](pics/a.png)\n\nend`],
  ]);
  await line(page, 'end').click();
  const remote = page.locator('.cm-md-image-placeholder', { hasText: 'a cat' });
  await expect(remote).toBeVisible();
  await expect(page.locator('img[alt="a dot"]')).toBeVisible();
  const local = page.locator('.cm-md-image-placeholder', { hasText: 'local' });
  await expect(local).toBeVisible();
  await expect(local.getByRole('button')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(imageRequests).toBe(0);

  await remote.getByRole('button', { name: 'Load image' }).click();
  await expect(page.locator('img[alt="a cat"]')).toBeVisible();
  expect(imageRequests).toBe(1);
});

test('the cursor line stays in view across a toggle (MDV-6)', async ({ page, api }) => {
  const body = Array.from({ length: 300 }, (_, i) => (i % 20 === 0 ? `# Heading ${i}` : `line ${i} with **bold**`)).join('\n');
  await openDocs(page, api, [['long.md', `${body}\nlast line`]]);
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+End');
  const last = line(page, 'last line');
  await expect(last).toBeInViewport();
  for (let i = 0; i < 2; i += 1) {
    await toggle(page).click();
    await expect(last).toBeInViewport();
  }
});

test('each toolbar button applies its own format (MDV-9)', async ({ page, api }) => {
  const [id] = await openDocs(page, api, [['a.md', 'a1\na2\na3\na4\na5\na6\na7\na8\n\nend']]);
  await toggle(page).click(); // Raw mode, so Home and Shift+End select the plain line.
  const buttons = ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link', 'Quote', 'Inline code', 'Code block'];
  for (const [index, name] of buttons.entries()) {
    await line(page, new RegExp(`^a${index + 1}$`)).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await toolbar(page).getByRole('button', { name, exact: true }).click();
  }
  expect(await stored(page, api, id)).toBe('**a1**\n*a2*\n- a3\n1. a4\n[a5](https://)\n> a6\n`a7`\n```\na8\n```\n\nend');
});
