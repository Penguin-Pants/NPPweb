import { expect, login, newDocument, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const panel = (page) => page.locator('.search-panel');

async function documentWith(page, text) {
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type(text);
}

async function openFind(page) {
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(panel(page).getByLabel('Find')).toBeFocused();
}

/** The text of the current selection in the editor. */
const selection = (page) => page.evaluate(() => getSelection().toString());

test('searching a.c matches only the literal text a.c', async ({ page }) => {
  await login(page);
  await documentWith(page, 'abc a.c aXc a.c');
  await openFind(page);
  await page.keyboard.type('a.c');
  await expect(page.locator('.cm-searchMatch')).toHaveCount(2);
  await page.keyboard.press('Enter');
  expect(await selection(page)).toBe('a.c');
});

test('search ignores case', async ({ page }) => {
  await login(page);
  await documentWith(page, 'Cat CAT cat');
  await openFind(page);
  await page.keyboard.type('cat');
  await expect(page.locator('.cm-searchMatch')).toHaveCount(3);
});

test('Enter goes to the next match, Shift+Enter to the previous, Escape closes', async ({ page }) => {
  await login(page);
  await documentWith(page, 'one two one two');
  await editor(page).press('ControlOrMeta+Home');
  await openFind(page);
  await page.keyboard.type('two');
  const matches = page.locator('.cm-searchMatch');
  await expect(matches).toHaveCount(2);
  const selected = (index) => expect(matches.nth(index)).toHaveClass(/cm-searchMatch-selected/);
  await page.keyboard.press('Enter');
  await selected(0);
  await page.keyboard.press('Enter');
  await selected(1);
  await page.keyboard.press('Shift+Enter');
  await selected(0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(editor(page)).toBeFocused();
});

test('Replace changes one match', async ({ page }) => {
  await login(page);
  await documentWith(page, 'cat cat cat');
  await openFind(page);
  await page.keyboard.type('cat');
  await panel(page).getByLabel('Replace with').fill('dog');
  await panel(page).getByRole('button', { name: 'Next' }).click();
  await panel(page).getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(editor(page)).toHaveText('dog cat cat');
});

test('Replace all changes every match in the current tab and none in other tabs', async ({ page }) => {
  await login(page);
  await documentWith(page, 'x and x');
  await documentWith(page, 'x or x');
  await openFind(page);
  await page.keyboard.type('x');
  await panel(page).getByLabel('Replace with').fill('y');
  await panel(page).getByRole('button', { name: 'Replace all' }).click();
  await expect(editor(page)).toHaveText('y or y');
  await page.getByRole('tab', { name: 'Untitled 1' }).click();
  await expect(editor(page)).toHaveText('x and x');
});

test('the panel has no regex, whole-word or case controls', async ({ page }) => {
  await login(page);
  await documentWith(page, 'text');
  await openFind(page);
  await expect(panel(page).locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(panel(page).locator('input')).toHaveCount(2);
  await expect(panel(page).getByRole('button')).toHaveText(['Previous', 'Next', 'Replace', 'Replace all', 'Close']);
  await expect(page.locator('.cm-search')).toHaveCount(0);
});

test('Enter on a focused panel button runs that button', async ({ page }) => {
  await login(page);
  await documentWith(page, 'x and x');
  await openFind(page);
  await page.keyboard.type('x');
  await panel(page).getByLabel('Replace with').fill('y');
  await panel(page).getByRole('button', { name: 'Replace all' }).focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toHaveText('y and y');
});

test('the replace text stays when the panel opens again with a selection', async ({ page }) => {
  await login(page);
  await documentWith(page, 'cat dog');
  await openFind(page);
  await page.keyboard.type('cat');
  await panel(page).getByLabel('Replace with').fill('bird');
  await page.locator('.cm-line').dblclick({ position: { x: 45, y: 5 } });
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(panel(page).getByLabel('Find')).toHaveValue('dog');
  await expect(panel(page).getByLabel('Replace with')).toHaveValue('bird');
});

test('each tab keeps its own search panel', async ({ page }) => {
  await login(page);
  await documentWith(page, 'first');
  await documentWith(page, 'second');
  await openFind(page);
  await page.keyboard.type('sec');
  await page.getByRole('tab', { name: 'Untitled 1' }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Untitled 2' }).click();
  await expect(panel(page).getByLabel('Find')).toHaveValue('sec');
});
