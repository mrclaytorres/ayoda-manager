// T091 — the guarded deletion dialog. FR-046.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

let lineId = '';

test('deletion requires typing YES exactly', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await startRound(page, lineId);
  await startDistribution(page, 'Force Blade');
  await page.getByRole('button', { name: 'Award to Ash' }).click();

  // Round 1 completed; start round 2 so there is a completed round to delete.
  await page.getByRole('link', { name: 'Start a round' }).click();
  await page.getByRole('button', { name: 'Start round' }).click();

  await page.goto('/history');
  await page.getByRole('button', { name: 'Delete history' }).click();
  await page.getByRole('checkbox').first().check();

  const confirm = page.getByRole('button', { name: 'Delete permanently' });
  await expect(page.getByText(/permanently destroys/)).toBeVisible();
  await expect(confirm).toBeDisabled();

  const input = page.getByLabel('Type YES to confirm');
  await input.fill('yes');
  await expect(confirm).toBeDisabled();

  await input.fill('Yes');
  await expect(confirm).toBeDisabled();

  await input.fill('YES');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(page.getByText('Force Blade')).toHaveCount(0);
});
