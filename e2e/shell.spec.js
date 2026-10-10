import { expect, login, OWNER_PASSWORD, test } from './fixtures.js';

const NEW_PASSWORD = 'shell-new-password-456';

test('the first visit is dark and the light choice survives a reload', { tag: '@smoke' }, async ({ page }) => {
  await login(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Light theme' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Dark theme' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark theme' }).click();
  // The switch runs in a view transition, one frame after the click (THM-1).
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('sign out returns to /login and / then redirects to /login', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

async function openPasswordDialog(page) {
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Change password' }).click();
  return page.getByRole('dialog', { name: 'Change password' });
}

test('changing the password works and the new password signs in', async ({ page }) => {
  await login(page);
  const dialog = await openPasswordDialog(page);
  await dialog.getByLabel('Current password').fill(OWNER_PASSWORD);
  await dialog.getByLabel('New password (12 to 256 characters)').fill(NEW_PASSWORD);
  await dialog.getByLabel('New password again').fill(NEW_PASSWORD);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Password changed. Other devices are signed out.');

  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Password').fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong password.');
  await login(page, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
});

test('the password dialog shows API and match errors and keeps the password', async ({ page, api }) => {
  await login(page);
  const dialog = await openPasswordDialog(page);
  const error = dialog.getByRole('alert');
  await dialog.getByLabel('Current password').fill('not-the-password');
  await dialog.getByLabel('New password (12 to 256 characters)').fill(NEW_PASSWORD);
  await dialog.getByLabel('New password again').fill(NEW_PASSWORD);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(error).toHaveText('The current password is wrong.');

  await dialog.getByLabel('Current password').fill(OWNER_PASSWORD);
  await dialog.getByLabel('New password again').fill('something-else-entirely');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(error).toHaveText('The new passwords are not the same.');

  await dialog.getByLabel('New password (12 to 256 characters)').fill('short');
  await dialog.getByLabel('New password again').fill('short');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(error).toHaveText('The new password must have 12 to 256 characters.');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect((await api.get('/api/session')).status()).toBe(200);
});
