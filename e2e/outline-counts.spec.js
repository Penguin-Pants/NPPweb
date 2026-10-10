import { expect, login, test } from './fixtures.js';

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

const panel = (page) => page.getByRole('complementary', { name: 'Outline' });
const entries = (page) => panel(page).locator('.outline-entry');
const line = (page, text) => page.locator('.cm-line', { hasText: text });
const DOC = '# One\n\ntext under one\n\n## Two\n\ntext under two\n\n```\n# not a heading\n```\n\n###### Six\n\nend';

test('the outline lists headings by level, updates while typing and is the same in both modes (OUT-1, OUT-2, OUT-5) @smoke', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', DOC]]);
  await expect(entries(page)).toHaveText(['One', 'Two', 'Six']);
  await expect(entries(page).nth(0)).toHaveClass(/outline-l1/);
  await expect(entries(page).nth(1)).toHaveClass(/outline-l2/);
  await expect(entries(page).nth(2)).toHaveClass(/outline-l6/);
  await line(page, 'end').click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n\n### **New** one');
  await expect(entries(page)).toHaveText(['One', 'Two', 'Six', 'New one']);
  await page.getByRole('button', { name: 'Visual' }).click();
  await expect(entries(page)).toHaveText(['One', 'Two', 'Six', 'New one']);
});

test('a click on an entry moves the cursor to its heading, and the section under the cursor is marked (OUT-3, OUT-4)', async ({ page, api }) => {
  const body = `${DOC}\n${Array.from({ length: 80 }, (_, i) => `filler ${i}`).join('\n\n')}\n\n# Last`;
  await openDocs(page, api, [['a.md', body]]);
  await entries(page).filter({ hasText: 'Last' }).click();
  await expect(page.locator('.cm-activeLine')).toHaveText('# Last');
  await expect(page.locator('.cm-activeLine')).toBeInViewport();
  await expect(page.locator('.cm-content')).toBeFocused();
  await expect(entries(page).filter({ hasText: 'Last' })).toHaveAttribute('aria-current', 'location');
  await entries(page).filter({ hasText: 'Two' }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(entries(page).filter({ hasText: 'Two' })).toHaveAttribute('aria-current', 'location');
  await expect(entries(page).filter({ hasText: 'One' })).not.toHaveAttribute('aria-current', 'location');
});

test('the panel explains other tabs and Markdown without headings (OUT-6)', async ({ page, api }) => {
  await openDocs(page, api, [
    ['code.py', 'x = 1'],
    ['plain.md', 'no headings here'],
  ]);
  await expect(panel(page).locator('.outline-message')).toHaveText('Outline is available for Markdown documents.');
  await page.getByRole('tab', { name: 'plain.md' }).click();
  await expect(panel(page).locator('.outline-message')).toHaveText('No headings.');
  await expect(entries(page)).toHaveCount(0);
});

test('counts are live, can include syntax, survive a reload and count the selection (CNT-1 to CNT-3)', async ({ page, api }) => {
  await openDocs(page, api, [['a.md', '**bold** text']]);
  const counts = page.locator('#counts');
  const syntax = page.getByRole('button', { name: 'Count syntax' });
  await expect(counts).toHaveText('2 words · 9 characters');
  await expect(syntax).toHaveAttribute('aria-pressed', 'false');
  await line(page, 'text').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await expect(counts).toHaveText('3 words · 14 characters');

  await syntax.click();
  await expect(syntax).toHaveAttribute('aria-pressed', 'true');
  await expect(counts).toHaveText('3 words · 18 characters');
  await expect(page.locator('#save-status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Count syntax' })).toHaveAttribute('aria-pressed', 'true');
  await expect(counts).toHaveText('3 words · 18 characters');

  const selection = page.locator('#selection-counts');
  await expect(selection).toBeHidden();
  await page.getByRole('button', { name: 'Count syntax' }).click();
  await page.locator('.cm-content').focus();
  await page.keyboard.press('ControlOrMeta+a');
  await expect(selection).toHaveText('Selection: 3 words · 14 characters');
  await page.keyboard.press('ArrowRight');
  await expect(selection).toBeHidden();
});

test('other tabs count raw text and have no syntax toggle (CNT-4)', async ({ page, api }) => {
  await openDocs(page, api, [['code.py', '# a comment\nx = 1']]);
  await expect(page.locator('#counts')).toHaveText('4 words · 16 characters');
  await expect(page.getByRole('button', { name: 'Count syntax' })).toBeHidden();
});
