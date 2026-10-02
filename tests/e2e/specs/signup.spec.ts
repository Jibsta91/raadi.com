import { expect, type Page, test } from '@playwright/test';
import { domain } from './support.js';

/** The newest e-mail to `to` in Mailpit (development SMTP), as plain text. */
async function latestMail(page: Page, to: string): Promise<string> {
  const query = encodeURIComponent(`to:"${to}"`);
  let id = '';
  await expect(async () => {
    const res = await page.request.get(`http://mailpit:8025/api/v1/search?query=${query}`);
    const body = (await res.json()) as { messages: Array<{ ID: string }> };
    id = body.messages[0]?.ID ?? '';
    expect(id).not.toBe('');
  }).toPass({ timeout: 30_000 });
  const message = await page.request.get(`http://mailpit:8025/api/v1/message/${id}`);
  return ((await message.json()) as { Text: string }).Text;
}

test('a new user signs up, accepts the terms, confirms the e-mail and is welcomed', async ({
  page,
}) => {
  const email = `e2e-${Date.now().toString(36)}@${domain}`;
  await page.goto('/en');
  await page.getByTestId('nav-signup').click();

  // Keycloak's registration form (Raadi theme), opened directly by prompt=create. With e-mail
  // verification on, Keycloak asks for the password only after the address is confirmed, so
  // nobody can pre-register an account with someone else's address.
  await expect(page.locator('#kc-register-form')).toBeVisible();
  await page.locator('#email').fill(email);
  await page.locator('#firstName').fill('Test');
  await page.locator('#lastName').fill('Bruker');
  await page.locator('#kc-register-form [type=submit]').click();

  // Confirm the e-mail, set a password and accept the terms, in whichever order Keycloak asks.
  let refusedCommon = false;
  for (let step = 0; step < 5 && !/\/welcome/.test(page.url()); step++) {
    // "We sent a link to …" (Raadi theme text on Keycloak's verify-e-mail page).
    const verify = page.getByText('We sent a link to');
    const password = page.locator('#kc-passwd-update-form');
    const accept = page.locator('#kc-accept');
    await expect(
      verify
        .or(password)
        .or(accept)
        .or(page.locator('#kc-info-message'))
        .or(page.getByTestId('welcome')),
    ).toBeVisible();
    if (await verify.isVisible()) {
      const text = await latestMail(page, email);
      expect(text).toContain('Welcome to Raadi');
      const link = /https?:\/\/\S+action-token\S+/.exec(text)?.[0];
      expect(link).toBeTruthy();
      await page.goto(link!);
    } else if (await password.isVisible()) {
      // A common password is refused even though it is long enough.
      const choice = refusedCommon ? `Raadi-e2e-${Date.now()}-signup` : 'password1234';
      await page.locator('#password-new').fill(choice);
      await page.locator('#password-confirm').fill(choice);
      await page.locator('#kc-submit').click();
      if (!refusedCommon) {
        await expect(page.getByText('This password is too common')).toBeVisible();
        refusedCommon = true;
      }
    } else if (await accept.isVisible()) {
      await expect(page.locator('a[href$="/en/terms"]')).toBeVisible();
      await accept.click();
    } else if (await page.locator('#kc-info-message a').isVisible()) {
      await page.locator('#kc-info-message a').click();
    }
  }
  expect(refusedCommon).toBe(true);

  // First login goes through the welcome page, then on to where the user started.
  await expect(page).toHaveURL(/\/en\/welcome\?next=%2Fen$/);
  await expect(page.getByTestId('welcome')).toContainText('Welcome to Raadi, Test!');
  await expect(page.getByTestId('verify-bankid')).toBeVisible();
  await page.getByTestId('welcome-continue').click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId('nav-account')).toHaveText('Test Bruker');
});
