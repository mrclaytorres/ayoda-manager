// T099 — quickstart V9. FR-047, SC-002, SC-003, SC-008.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

test.describe('mobile at 360px', () => {
  let lineId = '';

  test.beforeEach(async ({ page }) => {
    lineId = (await registerWithLine(page)).lineId;
    await addMember(page, lineId, 'Ash', 88000);
    await addMember(page, lineId, 'Bex', 74000);
    await addMember(page, lineId, 'Cyd', 51000);
    await startRound(page, lineId);
  });

  const noHorizontalScroll = async (page: import('@playwright/test').Page) => {
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  };

  test('no primary screen scrolls horizontally', async ({ page }) => {
    for (const path of ['/', '/roster', '/history', '/round/start']) {
      await page.goto(path);
      await noHorizontalScroll(page);
    }
  });

  test('the offer holder is visible without scrolling', async ({ page }) => {
    await startDistribution(page, 'Force Blade');
    const offer = page.getByText('Offer with');
    await expect(offer).toBeInViewport();
  });

  test('pass and award controls meet the 44px touch target floor', async ({ page }) => {
    await startDistribution(page, 'Force Blade');
    for (const name of ['Ash passes', 'Award to Ash']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('a 60-character name does not break the layout', async ({ page }) => {
    await addMember(page, lineId, 'A'.repeat(60), 99000);
    await page.goto(`/lines/${lineId}/roster`);
    await noHorizontalScroll(page);
  });

  test('SC-002 — a full pass, pass, award distribution takes under 30 seconds', async ({
    page,
  }) => {
    const started = Date.now();
    await startDistribution(page, 'Force Blade');
    await page.getByRole('button', { name: 'Ash passes' }).click();
    await page.getByRole('button', { name: 'Bex passes' }).click();
    await page.getByRole('button', { name: 'Award to Cyd' }).click();
    await expect(page.getByText('1 of 3')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});
