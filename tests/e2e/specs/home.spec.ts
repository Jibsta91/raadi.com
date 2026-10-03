import { expect, test } from '@playwright/test';

test('front page defaults to Norwegian and lists the categories', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/nb$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finn det. Selg det. Raadi.');
  for (const category of ['torget', 'bil', 'eiendom', 'jobb', 'reise']) {
    await expect(page.getByTestId(`category-${category}`)).toBeVisible();
  }
});

test('language switcher changes locale (nb → en → so)', async ({ page }) => {
  await page.goto('/nb');
  await page.getByTestId('locale-switcher').selectOption('en');
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find it. Sell it. Raadi.');
  await page.getByTestId('locale-switcher').selectOption('so');
  await expect(page).toHaveURL(/\/so$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'so');
});

test('status page reports all systems operational', async ({ page }) => {
  await page.goto('/en/status');
  await expect(page.getByTestId('overall-status')).toHaveText('All systems operational');
});

test('privacy page is reachable from the footer', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
});

test('appearance: dark is applied at once, rendered by the server after a reload, and system resets it', async ({
  page,
}) => {
  await page.goto('/en');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme');
  const footer = page.getByRole('contentinfo');

  await footer.getByTestId('theme-dark').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(footer.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');

  // The server reads the cookie, so the first paint is already dark (no flash).
  const response = await page.request.get('/en');
  expect(await response.text()).toMatch(/<html[^>]*data-theme="dark"/);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await footer.getByTestId('theme-system').click();
  await expect(html).not.toHaveAttribute('data-theme');
});
