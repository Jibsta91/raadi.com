import { expect, test } from '@playwright/test';

test('front page shows the latest listings', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByTestId('latest-listings').getByTestId('listing-card')).toHaveCount(8);
});

test('browse: home → category page → subcategory → listing detail', async ({ page }) => {
  await page.goto('/en');
  await page.getByTestId('category-bil').click();

  // The category's own front page (FINN-style): subcategory tiles with counts.
  await expect(page).toHaveURL(/\/en\/bil$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cars');
  const tile = page.getByTestId('subcategory-tiles').getByRole('link').first();
  const tileCount = Number((await tile.innerText()).match(/(\d+) listings?/)?.[1]);
  expect(tileCount).toBeGreaterThan(0);
  await tile.click();

  await expect(page).toHaveURL(/\/en\/search\?category=bil&subcategory=/);
  await expect(page.getByTestId('facet-category-bil')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('result-count')).toHaveText(new RegExp(`^${tileCount} results?$`));
  await expect(page.getByTestId('crumb-category')).toHaveText('Cars');

  const card = page.getByTestId('listing-card').first();
  const title = await card.getByTestId('listing-card-title').innerText();
  await card.click();

  await expect(page).toHaveURL(/\/en\/listings\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('listing-title')).toHaveText(title);
  await expect(page.getByTestId('listing-price')).not.toBeEmpty();
  await expect(page.getByTestId('gallery-main')).toBeVisible();
  // Anonymous visitors get no owner actions.
  await expect(page.getByTestId('listing-actions')).toHaveCount(0);
});
