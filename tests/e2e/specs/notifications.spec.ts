import { expect, test } from '@playwright/test';
import { domain, login } from './support.js';

test('owner is notified in the app when a moderator removes their listing', async ({ browser }) => {
  // The owner creates a listing (through the API, with the browser session).
  const owner = await browser.newPage();
  await login(owner, `amina.hassan@${domain}`);
  const title = `Fjernes av moderator ${Date.now().toString(36)}`;
  const origin = new URL(owner.url()).origin;
  const created = await owner.request.post('/api/v1/listings', {
    headers: { origin },
    data: {
      category: 'torget',
      subcategory: 'hobby',
      title,
      description: 'Laget av e2e-testen for varsler.',
      priceNok: 100,
      attributes: { condition: 'good' },
      placeId: 'oslo',
      imageIds: [],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };

  // A moderator removes it from the listing page.
  const moderator = await browser.newPage();
  await login(moderator, `moderator@${domain}`);
  await moderator.goto(`/en/listings/${id}`);
  moderator.once('dialog', (dialog) => void dialog.accept());
  await moderator.getByTestId('delete-listing').click();
  await expect(moderator).toHaveURL(/\/en\/my\/listings$/);

  // The owner gets an in-app notification (via the event pipeline).
  await expect(async () => {
    await owner.goto('/en/notifications');
    await expect(owner.getByTestId('notification-item').filter({ hasText: title })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 90_000 });
  await expect(owner.getByTestId('nav-alerts')).toBeVisible();
  await owner.getByTestId('notification-item').filter({ hasText: title }).click();
  await expect(owner).toHaveURL(/\/en\/my\/listings$/);

  // Message alert preferences save immediately.
  await owner.goto('/en/notifications');
  const toggle = owner.getByTestId('pref-email-messages');
  const before = await toggle.isChecked();
  await toggle.click();
  await expect(owner.getByTestId('pref-status')).toHaveText('Saved');
  await owner.reload();
  await expect(owner.getByTestId('pref-email-messages')).toBeChecked({ checked: !before });
  await owner.getByTestId('pref-email-messages').click(); // restore
  await expect(owner.getByTestId('pref-status')).toHaveText('Saved');

  // The app's push preference is saved the same way, independently of e-mail.
  const push = owner.getByTestId('pref-push-messages');
  const pushBefore = await push.isChecked();
  await push.click();
  await expect(owner.getByTestId('pref-status')).toHaveText('Saved');
  await owner.reload();
  await expect(owner.getByTestId('pref-push-messages')).toBeChecked({ checked: !pushBefore });
  await expect(owner.getByTestId('pref-email-messages')).toBeChecked({ checked: before });
  await owner.getByTestId('pref-push-messages').click(); // restore
  await expect(owner.getByTestId('pref-status')).toHaveText('Saved');

  await owner.close();
  await moderator.close();
});
