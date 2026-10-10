import { expect, login, newDocument, openDocs, test } from './fixtures.js';

async function createDoc(api, name, content = '') {
  const res = await api.post(`/api/documents?name=${encodeURIComponent(name)}`, {
    data: content,
    headers: { 'Content-Type': 'text/plain' },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

const documentsButton = (page) => page.getByRole('button', { name: 'Documents' });
const dropdown = (page) => page.locator('#doclist');
const openButtons = (page) => page.locator('#doclist .doc-open');

test('the outline panel is open on the first visit and its state survives a reload (LAY-2, LAY-5) @smoke', async ({ page }) => {
  await login(page);
  await newDocument(page);
  const toggle = page.getByRole('button', { name: 'Outline' });
  const panel = page.getByRole('complementary', { name: 'Outline' });
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const narrow = (await page.locator('#editor').boundingBox()).width;

  await toggle.click();
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await page.locator('#editor').boundingBox()).width).toBeGreaterThan(narrow);

  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(panel).toBeHidden();
  await toggle.click();
  await expect(panel).toBeVisible();
});

test('the counts and the language start at the left edge of the editor pane, in the status bar', async ({ page, api }) => {
  await openDocs(page, api, [['notes.md', '# Notes']]);
  const bar = await page.locator('.statusbar').boundingBox();
  const counts = page.locator('#counts');
  const language = page.getByRole('combobox', { name: 'Language' });
  const left = async (locator) => (await locator.boundingBox()).x;
  const pane = await left(page.locator('.editor-pane'));
  await expect(counts).toHaveText('1 word · 5 characters');
  expect(await left(counts)).toBeGreaterThanOrEqual(pane);
  expect(await left(counts)).toBeLessThanOrEqual(pane + 16);
  const select = await language.boundingBox();
  expect(select.x).toBeGreaterThan(await left(counts));
  expect(select.x + select.width).toBeLessThan(pane + bar.width / 2);
  for (const box of [await counts.boundingBox(), select]) {
    expect(box.y).toBeGreaterThanOrEqual(bar.y);
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + bar.height);
  }

  await page.getByRole('button', { name: 'Outline' }).click();
  await expect(page.getByRole('complementary', { name: 'Outline' })).toBeHidden();
  const status = await page.locator('#save-status').boundingBox();
  await expect.poll(() => left(counts)).toBeLessThan(status.x + status.width + 16);
  expect(await left(counts)).toBeGreaterThanOrEqual(status.x + status.width);
});

test('many open tabs stay in one scrolling row and the document list sits in the top bar (LAY-1, LAY-3)', async ({ page, api }) => {
  await openDocs(
    page,
    api,
    Array.from({ length: 12 }, (_, i) => [`a-rather-long-document-name-${i}.txt`, '']),
  );
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(12);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cm-content')).toBeVisible();
  const tops = await tabs.evaluateAll((list) => list.map((tab) => tab.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  const strip = await page.locator('#tabstrip').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(strip.scroll).toBeGreaterThan(strip.client);
  await expect(page.locator('.topbar #doclist')).toHaveCount(1);
  await expect(page.locator('#outline #doclist')).toHaveCount(0);
});

test('the empty-state button opens the dropdown and a click on a tab closes it', async ({ page, api }) => {
  await createDoc(api, 'first.txt');
  await login(page);
  await page.getByRole('button', { name: 'Open document list' }).click();
  await expect(dropdown(page)).toBeVisible();
  await openButtons(page).first().click();
  for (let i = 0; i < 5; i += 1) await newDocument(page);
  await documentsButton(page).click();
  await expect(dropdown(page)).toBeVisible();
  // A tab beside the dropdown, so the click reaches it. A tab click re-renders the strip.
  const edge = await dropdown(page).evaluate((el) => el.getBoundingClientRect().right);
  const lefts = await page.getByRole('tab').evaluateAll((list) => list.map((tab) => tab.getBoundingClientRect().left));
  const index = lefts.findIndex((left) => left > edge + 4);
  expect(index).toBeGreaterThan(-1);
  const tab = page.getByRole('tab').nth(index);
  await tab.click({ position: { x: 8, y: 8 } });
  await expect(dropdown(page)).toBeHidden();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
});

test('the Documents dropdown closes on Escape, on a click outside and after Open (LAY-4)', async ({ page, api }) => {
  await createDoc(api, 'notes.txt', 'hello');
  await login(page);

  await documentsButton(page).click();
  await expect(dropdown(page)).toBeVisible();
  await expect(documentsButton(page)).toHaveAttribute('aria-expanded', 'true');
  await openButtons(page).first().focus();
  await page.keyboard.press('Escape');
  await expect(dropdown(page)).toBeHidden();
  await expect(documentsButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(documentsButton(page)).toBeFocused();

  await documentsButton(page).click();
  await expect(dropdown(page)).toBeVisible();
  await page.locator('.statusbar').click();
  await expect(dropdown(page)).toBeHidden();

  await documentsButton(page).click();
  await openButtons(page).first().click();
  await expect(dropdown(page)).toBeHidden();
  await expect(page.getByRole('tab', { name: 'notes.txt' })).toHaveAttribute('aria-selected', 'true');
});

test('arrow keys move through the Documents dropdown (LAY-4)', async ({ page, api }) => {
  for (const name of ['one.txt', 'two.txt', 'three.txt']) {
    await createDoc(api, name);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await login(page);
  await documentsButton(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(dropdown(page)).toBeVisible();
  await expect(openButtons(page).nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(openButtons(page).nth(1)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(openButtons(page).nth(0)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(openButtons(page).nth(2)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dropdown(page)).toBeHidden();
  await expect(page.getByRole('tab', { name: 'one.txt' })).toHaveAttribute('aria-selected', 'true');
});

test('rename and delete dialogs keep the dropdown open, and Escape closes it afterwards', async ({ page, api }) => {
  await createDoc(api, 'draft.txt');
  await createDoc(api, 'spare.txt');
  await login(page);
  await documentsButton(page).click();
  await page.getByRole('button', { name: 'Rename draft.txt' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename document' });
  await rename.getByLabel('Name').fill('final.txt');
  await rename.getByLabel('Name').click();
  await rename.getByRole('button', { name: 'Rename' }).click();
  await expect(rename).toBeHidden();
  await expect(dropdown(page)).toBeVisible();
  await expect(page.locator('#doclist .doc-name')).toHaveText(['final.txt', 'spare.txt']);
  await expect(page.getByRole('button', { name: 'Rename final.txt' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dropdown(page)).toBeHidden();
  await expect(documentsButton(page)).toBeFocused();

  await documentsButton(page).click();
  await page.getByRole('button', { name: 'Delete spare.txt' }).click();
  const remove = page.getByRole('dialog', { name: 'Delete document' });
  await remove.getByRole('button', { name: 'Cancel' }).click();
  await expect(remove).toBeHidden();
  await expect(dropdown(page)).toBeVisible();
  await page.getByRole('button', { name: 'Delete spare.txt' }).click();
  await remove.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.locator('#doclist .doc-name')).toHaveText(['final.txt']);
  await expect(dropdown(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dropdown(page)).toBeHidden();
});

test('the account menu closes on Escape and on a click outside', async ({ page }) => {
  await login(page);
  const button = page.getByRole('button', { name: 'Account' });
  const menu = page.locator('#account-menu');
  await button.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await page.locator('.statusbar').click();
  await expect(menu).toBeHidden();
});

test('in a narrow window every top-bar control, status-bar control and the Documents panel stay inside the window', async ({ page, api }) => {
  await page.setViewportSize({ width: 480, height: 700 });
  await openDocs(page, api, [['notes.md', '# Notes']]);
  await expect(page.getByRole('button', { name: 'Visual' })).toBeVisible();
  for (const name of ['New', 'Outline', 'Documents', 'Export', 'Find', 'Visual', 'Light theme', 'Account']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box.x + box.width, name).toBeLessThanOrEqual(480);
  }
  for (const control of [page.getByRole('button', { name: 'Count syntax' }), page.getByRole('combobox', { name: 'Language' })]) {
    const box = await control.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(480);
  }
  await page.getByRole('button', { name: 'Documents' }).click();
  const panel = await page.locator('#doclist').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(480);
});

test('a keyboard-only run reaches each visible control of the top bar, the outline, the toolbar and the status bar, and works them (NFR-5)', async ({
  page,
  api,
}) => {
  await openDocs(page, api, [['k.md', '# One\n\n## Two\n\ntext']]);
  await expect(page.locator('.outline-entry')).toHaveCount(2);
  // New is the first stop: Shift+Tab from the next control reaches it.
  await page.getByRole('button', { name: 'Outline', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeFocused();
  const expected = await page.evaluate(() =>
    [...document.querySelectorAll(':is(.topbar, #md-toolbar, .statusbar) :is(button, select)')]
      .filter((el) => el.checkVisibility() && !el.disabled)
      .map((el) => el.getAttribute('aria-label') || el.textContent.trim()),
  );
  expect(expected.length).toBeGreaterThan(15);
  const describe = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      if (el.classList.contains('cm-content')) return 'editor';
      return el.getAttribute('aria-label') || el.textContent.trim() || el.tagName;
    });
  const visual = page.getByRole('button', { name: 'Visual' });
  const reached = ['New'];
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    const name = await describe();
    reached.push(name);
    if (name === 'editor') {
      await page.keyboard.press('Escape'); // Then Tab leaves the editor, whose own Tab key indents.
      continue;
    }
    if (name === 'Visual') {
      // The toggle switches the mode and sends the focus to the editor.
      for (const pressed of ['false', 'true']) {
        await page.keyboard.press('Space');
        await expect(visual).toHaveAttribute('aria-pressed', pressed);
        await expect(page.locator('.cm-content')).toBeFocused();
        await visual.focus(); // Back to the same place in the Tab order.
      }
    }
    if (name === 'Heading') {
      await page.keyboard.press('ArrowDown');
      await expect(page.locator(':focus')).toHaveText('Normal text');
      await page.keyboard.press('Escape');
      await expect(page.locator(':focus')).toHaveText('Heading');
    }
    if (name === 'Language') break;
  }
  for (const name of [...expected, 'One', 'editor']) expect(reached, name).toContain(name);
  expect(reached.filter((name) => name === 'One' || name === 'Two')).toEqual(['One']); // The outline is one tab stop.

  for (const [button, first] of [['Export', 'Markdown (.md)'], ['Documents', 'k.md']]) {
    await page.getByRole('button', { name: button, exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toContainText(first);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: button, exact: true })).toBeFocused();
  }

  // The workspace switch (v3 WS-2): to Work and back, from the keyboard.
  expect(reached).toContain('Workspace: Personal. Switch to Work');
  await page.locator('#workspace-switch').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Work - Notepad');
  await expect(page.locator('#workspace-switch')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Personal - Notepad');
  await expect(page.getByRole('tab', { name: 'k.md' })).toHaveAttribute('aria-selected', 'true');
});
