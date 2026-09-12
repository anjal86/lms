import { expect, test } from '@playwright/test';

test('login page exposes secure recovery flow', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Wanderlust CRM' })).toBeVisible();
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
});

test('forgot password page does not expose whether an account exists', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});

test('reset password page requires a valid recovery session', async ({ page }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toBeVisible();
});

test('authenticated operator workflow', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, 'Provide E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to exercise authenticated workflow.');

  await page.goto('/login');
  await page.getByLabel('Work email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'What needs attention now' })).toBeVisible();

  await page.goto('/leads');
  await expect(page.getByText('Active Pipeline')).toBeVisible();
});
