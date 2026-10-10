import { expect, login, OWNER_PASSWORD, test } from './fixtures.js';

test.describe('login', { tag: '@smoke' }, () => {
  test('visiting / without a session lands on /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('the login page is dark by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the sign-in page keeps its title with a stored workspace (TD-29)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pn.workspace', 'work'));
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-workspace', 'work');
    await expect(page).toHaveTitle('Sign in - Margin');
  });

  test('a wrong password shows a generic error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the right password lands on /', async ({ page }) => {
    await login(page, OWNER_PASSWORD);
    await expect(page).toHaveURL(/\/$/);
    const res = await page.request.get('/api/session');
    expect(res.status()).toBe(200);
  });

  test('six wrong attempts show the rate-limit message', async ({ page }) => {
    await page.goto('/login');
    const alert = page.getByRole('alert');
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('Password').fill(`wrong-${i}`);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(alert).toHaveText('Wrong password.');
      await page.evaluate(() => (document.getElementById('login-error').textContent = ''));
    }
    await page.getByLabel('Password').fill('wrong-5');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(alert).toHaveText('Too many failed attempts. Wait 15 minutes, then try again.');
    await expect(page).toHaveURL(/\/login$/);
  });
});
