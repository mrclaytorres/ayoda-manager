// T089 — the history screen.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

let lineId = '';

test('history shows outcomes, passers, and filters by round', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);

  await startDistribution(page, 'Force Blade');
  await page.getByRole('button', { name: 'Ash passes' }).click();
  await page.getByRole('button', { name: 'Award to Bex' }).click();

  await startDistribution(page, 'Ice Shield');
  await page.getByRole('button', { name: 'Ash passes' }).click();
  await page.getByRole('button', { name: 'Record as unclaimed' }).click();

  await page.goto('/history');
  await expect(page.getByText('Force Blade')).toBeVisible();
  await expect(page.getByText('Passed: Ash').first()).toBeVisible();
  await expect(page.getByText(/Unclaimed/)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Force Blade' })).toContainText(
    'Round 1',
  );
});
