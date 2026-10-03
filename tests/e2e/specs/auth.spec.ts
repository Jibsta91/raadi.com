import { expect, test } from '@playwright/test';
import { openAccountMenu } from './support.js';

const domain = process.env.RAADI_DOMAIN ?? 'raadi.localhost';
const password = process.env.DEMO_USER_PASSWORD ?? 'raadi-demo-pass';

test('demo user logs in through Keycloak, sees the account page and logs out', async ({ page }) => {
  const email = `ola.nordmann@${domain}`;
  await page.goto('/en');
  await page.getByTestId('nav-login').click();

  // Keycloak's hosted login page (auth.<domain>).
  await expect(page).toHaveURL(new RegExp(`auth\\.${domain.replaceAll('.', '\\.')}/realms/raadi/`));
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();

  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await expect(page.getByTestId('nav-account')).toBeVisible();

  // The session cookie is HttpOnly: page scripts cannot read it.
  expect(await page.evaluate(() => document.cookie)).not.toContain('raadi_sid');

  await openAccountMenu(page);
  await page.getByTestId('nav-logout').click();
  await expect(page.getByTestId('nav-login')).toBeVisible();
});

test('protected page redirects anonymous users to login', async ({ page }) => {
  await page.goto('/en/account');
  await expect(page).toHaveURL(/\/realms\/raadi\/protocol\/openid-connect\/auth/);
});
