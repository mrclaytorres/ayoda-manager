// T037 — quickstart V1 end to end.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

test.describe('V1 — the core loop', () => {
  let lineId = '';

  test.beforeEach(async ({ page }) => {
    lineId = (await registerWithLine(page)).lineId;
    await addMember(page, lineId, 'Ash', 88000);
    await addMember(page, lineId, 'Bex', 74000);
    await addMember(page, lineId, 'Cyd', 51000);
    await startRound(page, lineId);
  });

  test('an officer can run a distribution from an empty account', async ({ page }) => {
    await startDistribution(page, 'Force Blade');

    // Ash holds the offer.
    await expect(page.getByText('Offer with')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Award to Ash' })).toBeVisible();

    // Ash passes, then Bex passes.
    await page.getByRole('button', { name: 'Ash passes' }).click();
    await expect(page.getByRole('button', { name: 'Award to Bex' })).toBeVisible();
    await page.getByRole('button', { name: 'Bex passes' }).click();
    await expect(page.getByRole('button', { name: 'Award to Cyd' })).toBeVisible();

    // Award to Cyd; they leave the line.
    await page.getByRole('button', { name: 'Award to Cyd' }).click();
    await expect(page.getByText('1 of 3')).toBeVisible();

    // The next item starts back at Ash.
    await startDistribution(page, 'Ice Shield');
    await expect(page.getByRole('button', { name: 'Award to Ash' })).toBeVisible();
  });

  test('undo restores the previous state', async ({ page }) => {
    await startDistribution(page, 'Force Blade');
    await page.getByRole('button', { name: 'Ash passes' }).click();
    await expect(page.getByRole('button', { name: 'Award to Bex' })).toBeVisible();

    await page.getByRole('button', { name: 'Undo last action' }).click();
    await expect(page.getByRole('button', { name: 'Award to Ash' })).toBeVisible();
  });

  test('everyone passing offers a manual award or an unclaimed close', async ({ page }) => {
    await startDistribution(page, 'Ice Shield');
    await page.getByRole('button', { name: 'Ash passes' }).click();
    await page.getByRole('button', { name: 'Bex passes' }).click();
    await page.getByRole('button', { name: 'Cyd passes' }).click();

    await expect(page.getByText('Everyone eligible has passed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Award manually…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record as unclaimed' })).toBeVisible();

    await page.getByRole('button', { name: 'Record as unclaimed' }).click();
    // Nobody left the line.
    await expect(page.getByText('0 of 3')).toBeVisible();
  });

  test('a manual award skips the line and is flagged in the history', async ({ page }) => {
    await startDistribution(page, 'Flame Aura');
    await page.getByRole('button', { name: 'Award manually…' }).click();
    await page.getByRole('button', { name: /Cyd/ }).click();

    await expect(page.getByText('1 of 3')).toBeVisible();
    await page.goto('/history');
    await expect(page.getByText('manual award')).toBeVisible();
  });
});
