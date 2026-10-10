import { expect, login, newDocument, test } from './fixtures.js';

const editor = (page) => page.locator('.cm-content');
const tabs = (page) => page.getByRole('tab');

/**
 * Dispatches Mod+<key> on document, as an installed app window delivers it.
 * Returns whether the page called preventDefault.
 */
function dispatchMod(page, code) {
  return page.evaluate((keyCode) => {
    const mac = /Mac/.test(navigator.platform);
    const event = new KeyboardEvent('keydown', {
      code: keyCode,
      key: keyCode.slice(3).toLowerCase(),
      ctrlKey: !mac,
      metaKey: mac,
      bubbles: true,
      cancelable: true,
    });
    return !document.activeElement.dispatchEvent(event);
  }, code);
}

test('Ctrl+N creates a document and is kept from the browser', async ({ page }) => {
  await login(page);
  expect(await dispatchMod(page, 'KeyN')).toBe(true);
  await expect(tabs(page)).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Untitled 1' })).toHaveAttribute('aria-selected', 'true');
});

test('Ctrl+W starts the close flow and is kept from the browser', async ({ page }) => {
  await login(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.type('text');
  expect(await dispatchMod(page, 'KeyW')).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Close document' })).toBeVisible();
  expect(await dispatchMod(page, 'KeyW')).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(1);
});

test.describe('with a long autosave delay', () => {
  // 60 seconds, so only Ctrl+S can explain a save within the limit.
  test.use({ autosaveSeconds: 60 });

  test('Ctrl+S saves before the autosave delay', async ({ page }) => {
    await login(page);
    await newDocument(page);
    await editor(page).click();
    await page.keyboard.type('quick');
    const saved = page.waitForResponse((res) => res.request().method() === 'PUT');
    const pressedAt = Date.now();
    await page.keyboard.press('ControlOrMeta+s');
    expect((await saved).status()).toBe(200);
    expect(Date.now() - pressedAt).toBeLessThan(700);
  });
});

test('Ctrl+F focuses the find field and Ctrl+H the replace field', async ({ page }) => {
  await login(page);
  await newDocument(page);
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.search-panel').getByLabel('Find')).toBeFocused();
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+h');
  await expect(page.locator('.search-panel').getByLabel('Replace with')).toBeFocused();
});

test.describe('Alt shortcuts', { tag: '@smoke' }, () => {
  test('Alt+N creates a document and types nothing', async ({ page }) => {
    await login(page);
    await page.keyboard.press('Alt+KeyN');
    await expect(tabs(page)).toHaveCount(1);
    await page.keyboard.press('Alt+KeyN');
    await expect(tabs(page)).toHaveCount(2);
    await expect(editor(page)).toHaveText('');
  });

  test('Alt+W starts the close flow', async ({ page }) => {
    await login(page);
    await newDocument(page);
    await editor(page).click();
    await page.keyboard.type('text');
    await page.keyboard.press('Alt+KeyW');
    const dialog = page.getByRole('dialog', { name: 'Close document' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep' }).click();
    await expect(tabs(page)).toHaveCount(0);
  });
});

test('buttons show their shortcuts in tooltips', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveAttribute('title', /Alt\+N/);
  await expect(page.getByRole('button', { name: 'Find', exact: true })).toHaveAttribute('title', /\+F/);
});
