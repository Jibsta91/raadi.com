import { expect, test } from '@playwright/test';
import { domain, login, openAccountMenu } from './support.js';

test.describe.configure({ mode: 'serial' });

test('favourites: heart a listing, find it under Favourites, remove it', async ({ page }) => {
  await login(page, `amina.hassan@${domain}`);
  // Seeded cars: Amina owns none of the first results' sellers' listings in this category.
  await page.goto('/en/search?category=bil&sort=newest');
  const card = page.getByTestId('listing-card').first();
  const title = await card.getByTestId('listing-card-title').innerText();
  const heart = page.getByTestId('favourite-toggle').first();
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  await openAccountMenu(page);
  await page.getByTestId('nav-favourites').click();
  await expect(page).toHaveURL(/\/en\/my\/favourites$/);
  const favourite = page
    .getByTestId('favourites')
    .getByTestId('listing-card')
    .filter({ hasText: title });
  await expect(favourite).toHaveCount(1);

  // The heart on the listing page shows the same state; removing it empties the list again.
  await favourite.click();
  const inline = page.getByTestId('favourite-toggle');
  await expect(inline).toHaveAttribute('aria-pressed', 'true');
  await inline.click();
  await expect(inline).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/en/my/favourites');
  await expect(page.getByTestId('favourites').getByText(title, { exact: true })).toHaveCount(0);
});

test('saved searches: save a search, see it listed with its filters, open and delete it', async ({
  page,
}) => {
  await login(page, `amina.hassan@${domain}`);
  const q = `e2e${Date.now().toString(36)}`;
  await page.goto(`/en/search?q=${q}&category=torget&sort=price_asc`);
  await page.getByTestId('save-search').click();
  await expect(page.getByTestId('search-saved')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('search-saved')).toBeVisible();

  await page.getByTestId('search-saved').click();
  await expect(page).toHaveURL(/\/en\/my\/saved-searches$/);
  const row = page.getByTestId('saved-search').filter({ hasText: q });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Marketplace');

  // Alerts can be switched off and on.
  const notify = row.getByTestId('saved-search-notify');
  await expect(notify).toHaveAttribute('aria-pressed', 'true');
  await notify.click();
  await expect(notify).toHaveAttribute('aria-pressed', 'false');

  // Opening it shows the results (sorting is not part of a saved search).
  await row.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/en/search\\?.*q=${q}`));
  await expect(page).not.toHaveURL(/price_asc/);

  await page.goto('/en/my/saved-searches');
  await page
    .getByTestId('saved-search')
    .filter({ hasText: q })
    .getByTestId('saved-search-delete')
    .click();
  await expect(page.getByTestId('saved-search').filter({ hasText: q })).toHaveCount(0);
});
