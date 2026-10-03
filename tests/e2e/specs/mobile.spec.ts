import { expect, test } from '@playwright/test';
import { domain, password } from './support.js';

// The Expo app's web build under /m (ADR-0021), at a phone's size.
test.use({ viewport: { width: 393, height: 852 } });

test('app: search, open a listing, sign in, my listings, log out back to the app', async ({
  page,
}) => {
  await page.goto('/m/');
  await expect(page.getByTestId('tab-bar')).toBeVisible();

  await page.getByTestId('tab-search').click();
  await expect(page).toHaveURL(/\/m\/search/);
  await page.getByTestId('search-input').fill('Kawasaki');
  await page.getByTestId('search-input').press('Enter');
  await expect(page).toHaveURL(/\/m\/search\?q=Kawasaki/);
  // Tab screens stay mounted: scope to the search screen, not the home tab underneath.
  const card = page.getByTestId('search-results').getByTestId('listing-card').first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/m\/listings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('listing-title')).toContainText('Kawasaki');

  // Sign in through the BFF and Keycloak, and come back to the app.
  await page.goto('/m/account');
  await page.getByTestId('login').click();
  await page.locator('#username').fill(`kari.nordmann@${domain}`);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  // Right after a cold start, a demo user's first login goes through the welcome page.
  await expect(page).toHaveURL(/\/m\/account$|\/welcome/);
  if (/\/welcome/.test(page.url())) await page.getByTestId('welcome-continue').click();
  await expect(page).toHaveURL(/\/m\/account$/);
  await expect(page.getByTestId('signed-in-as')).toContainText(`kari.nordmann@${domain}`);

  // A route starting with "m" must keep its name under the /m base path.
  await page.getByTestId('my-listings').click();
  await expect(page).toHaveURL(/\/m\/my-listings$/);
  await expect(page.getByTestId('my-listing').first()).toBeVisible();

  await page.goto('/m/account');
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/m\/account$/);
  await expect(page.getByTestId('login')).toBeVisible();
});

test("app: unknown routes show the app's own not-found screen", async ({ page }) => {
  await page.goto('/m/does-not-exist');
  await expect(page.getByTestId('not-found')).toBeVisible();
});
