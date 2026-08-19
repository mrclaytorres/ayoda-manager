// The officer enters a night's loot in one go, then picks what to hand out first.
import { expect, test } from '@playwright/test';
import { addItems, addMember, registerWithLine, startRound } from './helpers';

test.describe('the item pool', () => {
  let lineId = '';

  test.beforeEach(async ({ page }) => {
    lineId = (await registerWithLine(page)).lineId;
    await addMember(page, lineId, 'Ash', 88000);
    await addMember(page, lineId, 'Bex', 74000);
    await startRound(page, lineId);
  });

  test('every chip meets the 44px touch target floor', async ({ page }) => {
    await addItems(page, 'Force Blade');
    for (const name of ['Distribute Force Blade', 'Remove Force Blade from the pool']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('a whole loot list goes in at once and keeps its order', async ({ page }) => {
    await addItems(page, 'Force Blade', 'Chakra Ring', 'Guardian Boots');
    await expect(page.getByText('Item pool · 3')).toBeVisible();

    const names = await page.getByRole('button', { name: /^Distribute / }).allInnerTexts();
    expect(names).toEqual(['Force Blade', 'Chakra Ring', 'Guardian Boots']);
  });

  test('the officer picks which item to distribute, not just the first', async ({ page }) => {
    await addItems(page, 'Force Blade', 'Chakra Ring');
    await page.getByRole('button', { name: 'Distribute Chakra Ring' }).click();

    await expect(page.getByText('Distributing')).toBeVisible();
    await expect(page.getByText('Chakra Ring')).toBeVisible();

    // Awarding it settles the distribution; Force Blade is still waiting its turn.
    await page.getByRole('button', { name: 'Award to Ash' }).click();
    await expect(page.getByText('Item pool · 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Distribute Force Blade' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove Chakra Ring from the pool' }),
    ).toHaveCount(0);
  });

  test('backing out of the wrong item returns it and lets another be picked', async ({ page }) => {
    await addItems(page, 'Force Blade', 'Chakra Ring');
    await page.getByRole('button', { name: 'Distribute Force Blade' }).click();
    await expect(page.getByText('Distributing')).toBeVisible();

    // Nothing has been recorded, so backing out is one tap with no confirmation.
    await page.getByRole('button', { name: 'Back to the pool' }).click();

    await expect(page.getByText('Item pool · 2')).toBeVisible();
    await page.getByRole('button', { name: 'Distribute Chakra Ring' }).click();
    await expect(page.getByText('Chakra Ring')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Award to Ash' })).toBeVisible();
  });

  test('backing out after a pass asks first, then discards it', async ({ page }) => {
    await addItems(page, 'Force Blade');
    await page.getByRole('button', { name: 'Distribute Force Blade' }).click();
    await page.getByRole('button', { name: 'Ash passes' }).click();
    await expect(page.getByRole('button', { name: 'Award to Bex' })).toBeVisible();

    await page.getByRole('button', { name: 'Back to the pool' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByText('Item pool · 1')).toBeVisible();

    // The pass went with it: Ash holds the offer again on the next try.
    await page.getByRole('button', { name: 'Distribute Force Blade' }).click();
    await expect(page.getByRole('button', { name: 'Award to Ash' })).toBeVisible();

    // And nothing reached the history.
    await page.goto('/history');
    await expect(page.getByText('Nothing recorded yet.')).toBeVisible();
  });

  test('the line and the roster say which item was received', async ({ page }) => {
    await addItems(page, 'Skill IV');
    await page.getByRole('button', { name: 'Distribute Skill IV' }).click();
    await page.getByRole('button', { name: 'Award to Ash' }).click();

    await expect(page.getByText('received Skill IV')).toBeVisible();
    await page.goto(`/lines/${lineId}/roster`);
    await expect(page.getByText('received Skill IV')).toBeVisible();
  });

  test('an item entered by mistake can be taken back out', async ({ page }) => {
    await addItems(page, 'Force Blade', 'Chakra Rong');
    await page.getByRole('button', { name: 'Remove Chakra Rong from the pool' }).click();

    await expect(page.getByText('Item pool · 1')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Remove Chakra Rong from the pool' }),
    ).toHaveCount(0);
  });

  test('an empty pool says what to do about it', async ({ page }) => {
    await expect(
      page.getByText('No items yet. Add what dropped, then pick one to distribute.'),
    ).toBeVisible();
  });

  test('the add dialog can be dismissed without adding anything', async ({ page }) => {
    await page.getByRole('button', { name: 'Add items' }).click();
    await page.getByLabel('Item names').fill('Force Blade');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByText('No items yet. Add what dropped, then pick one to distribute.'),
    ).toBeVisible();
  });
});
