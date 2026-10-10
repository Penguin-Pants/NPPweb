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

test('the outline panel is open on the first visit and its state survives a reload @smoke', async ({ page }) => {
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

test('many open tabs stay in one scrolling row and the document list sits in the top bar', async ({ page, api }) => {
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

test('the Documents dropdown closes on Escape, on a click outside and after Open', async ({ page, api }) => {
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

test('arrow keys move through the Documents dropdown', async ({ page, api }) => {
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
