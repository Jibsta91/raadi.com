import { expect, type Locator, type Page } from '@playwright/test';

export const domain = process.env.RAADI_DOMAIN ?? 'raadi.localhost';
export const password = process.env.DEMO_USER_PASSWORD ?? 'raadi-demo-pass';

/** Logs in through Keycloak's hosted page and waits until the app is back. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/en');
  await page.getByTestId('nav-login').click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(page.getByTestId('nav-account')).toBeVisible();
}

/** Card prices in display order (whole kroner; "Price on request" cards skipped). */
export async function cardPrices(cards: Locator): Promise<number[]> {
  const texts = await cards.getByTestId('listing-card-price').allInnerTexts();
  return texts
    .map((t) => t.replace(/\D/g, ''))
    .filter((digits) => digits !== '')
    .map(Number);
}
