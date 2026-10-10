import { expect, login, newDocument, test } from './fixtures.js';

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

test('open tabs stay in one row at the top and the left panel holds no document list', async ({ page, api }) => {
  await createDoc(api, 'a.txt');
  await createDoc(api, 'b.txt');
  await login(page);
  await documentsButton(page).click();
  await openButtons(page).first().click();
  await documentsButton(page).click();
  await openButtons(page).nth(1).click();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  const [first, second] = [await tabs.nth(0).boundingBox(), await tabs.nth(1).boundingBox()];
  expect(second.y).toBe(first.y);
  expect(second.x).toBeGreaterThan(first.x);
  await expect(page.getByRole('complementary', { name: 'Outline' }).locator('.doc-row')).toHaveCount(0);
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

test('a rename dialog opened from the dropdown keeps the dropdown open', async ({ page, api }) => {
  await createDoc(api, 'draft.txt');
  await login(page);
  await documentsButton(page).click();
  await page.getByRole('button', { name: 'Rename draft.txt' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename document' });
  await dialog.getByLabel('Name').fill('final.txt');
  await dialog.getByLabel('Name').click();
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog).toBeHidden();
  await expect(dropdown(page)).toBeVisible();
  await expect(page.locator('#doclist .doc-name')).toHaveText(['final.txt']);
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
