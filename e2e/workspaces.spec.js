// v3 workspaces (REQUIREMENTS_V3.md). Fixture API calls send no workspace,
// so they act on Personal (MIG-3).
import { expect, login, test } from './fixtures.js';

test('the window title names the workspace at first paint (WS-3, WS-4)', async ({ page }) => {
  await login(page);
  await expect(page).toHaveTitle('Personal - Notepad');
  await page.evaluate(() => localStorage.setItem('pn.workspace', 'work'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-workspace', 'work');
  await expect(page).toHaveTitle('Work - Notepad');
});
