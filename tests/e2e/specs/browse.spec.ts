import { expect, test } from '@playwright/test';

test('front page shows the latest listings', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByTestId('latest-listings').getByTestId('listing-card')).toHaveCount(8);
});

test('browse: home → category → facet → listing detail', async ({ page }) => {
  await page.goto('/en');
  await page.getByTestId('category-bil').click();

  await expect(page).toHaveURL(/\/en\/search\?category=bil$/);
  await expect(page.getByTestId('facet-category-bil')).toHaveAttribute('aria-checked', 'true');
  const total = Number((await page.getByTestId('result-count').innerText()).replace(/\D/g, ''));
  expect(total).toBeGreaterThan(0);

  // Narrow down with the first subcategory facet.
  const facet = page.getByTestId('facet-subcategory').getByRole('checkbox').first();
  const facetCount = Number((await facet.locator('span').last().innerText()).trim());
  await facet.click();
  await expect(page).toHaveURL(/subcategory=/);
  await expect(page.getByTestId('result-count')).toHaveText(new RegExp(`^${facetCount} results?$`));
  expect(facetCount).toBeLessThanOrEqual(total);

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
