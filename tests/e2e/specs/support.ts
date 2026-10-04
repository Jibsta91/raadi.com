import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

export const domain = process.env.RAADI_DOMAIN ?? 'raadi.localhost';
export const password = process.env.DEMO_USER_PASSWORD ?? 'raadi-demo-pass';

/**
 * Where sessions.setup.ts keeps a demo user's signed-in session: the e2e container's temp
 * directory, never the checkout (session cookies are secrets; the secret scan checks the tree).
 */
export const SESSION_DIR = join(tmpdir(), 'raadi-e2e-sessions');
export const sessionFile = (email: string) => join(SESSION_DIR, `${email.split('@')[0]}.json`);

/**
 * Signs in as a demo user: with the session sessions.setup.ts made (one sign-in per user for
 * the whole suite), or through Keycloak's hosted page when there is none.
 */
export async function login(page: Page, email: string): Promise<void> {
  const file = sessionFile(email);
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, 'utf8')) as {
      cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0];
    };
    await page.context().addCookies(state.cookies);
    await page.goto('/en');
    await expect(page.getByTestId('nav-account')).toBeVisible();
    return;
  }
  await signIn(page, email);
}

/** Signs in through Keycloak's hosted page (a new session) and waits until the app is back. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/en');
  await page.getByTestId('nav-login').click();
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(page.getByTestId('nav-account')).toBeVisible();
}

/** Opens the header's account menu (My listings, Account, Log out live there). */
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByTestId('nav-account').click();
  await expect(page.getByTestId('nav-logout')).toBeVisible();
}

/** Card prices in display order (whole kroner; "Price on request" cards skipped). */
export async function cardPrices(cards: Locator): Promise<number[]> {
  const texts = await cards.getByTestId('listing-card-price').allInnerTexts();
  return texts
    .map((t) => t.replace(/\D/g, ''))
    .filter((digits) => digits !== '')
    .map(Number);
}
