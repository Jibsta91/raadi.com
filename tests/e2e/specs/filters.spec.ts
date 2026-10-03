import { expect, test } from '@playwright/test';

test('a category shows its own filters, ranges and removable chips', async ({ page }) => {
  await page.goto('/en/search');
  // Without a category, no category-specific filters.
  await expect(page.getByTestId('facet-category')).toBeVisible();
  await expect(page.getByTestId('facet-fuel')).toHaveCount(0);
  await expect(page.getByTestId('range-year')).toHaveCount(0);

  await page.getByTestId('facet-category-bil').click();
  await expect(page).toHaveURL(/category=bil/);
  await expect(page.getByTestId('facet-fuel')).toBeVisible();
  await expect(page.getByTestId('facet-make')).toBeVisible();
  await expect(page.getByTestId('facet-condition')).toHaveCount(0);

  // Year range: every result is at least that new.
  const total = Number((await page.getByTestId('result-count').innerText()).replace(/\D/g, ''));
  await page.getByTestId('range-year').getByRole('spinbutton').first().fill('2018');
  await page.getByTestId('price-filter').getByRole('button').click();
  await expect(page).toHaveURL(/yearMin=2018/);
  const chip = page.getByTestId('chip-yearMin');
  await expect(chip).toContainText('2018');
  const filtered = Number((await page.getByTestId('result-count').innerText()).replace(/\D/g, ''));
  expect(filtered).toBeLessThanOrEqual(total);

  // Removing the chip removes the filter; the category chip stays.
  await chip.click();
  await expect(page).not.toHaveURL(/yearMin/);
  await expect(page.getByTestId('chip-category-bil')).toBeVisible();
});

test('on a phone, filters open as a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/search?category=torget');
  await expect(page.getByTestId('facet-condition')).toBeHidden();
  await page.getByTestId('open-filters').click();
  await expect(page.getByTestId('facet-condition')).toBeVisible();
  await page.getByTestId('facet-condition').getByRole('checkbox').first().click();
  await expect(page).toHaveURL(/condition=/);
  // The sheet stays open while the results update; "Show n results" closes it.
  await page.getByTestId('show-results').click();
  await expect(page.getByTestId('facet-condition')).toBeHidden();
  await expect(page.getByTestId('active-filters')).toBeVisible();
});

test('a new listing starts from category tiles', async ({ page }) => {
  await page.goto('/en/bil');
  await expect(page.getByTestId('category-new-listing')).toHaveAttribute(
    'href',
    '/en/listings/new?category=bil',
  );
});
