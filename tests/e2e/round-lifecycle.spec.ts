// T057 — round completion and the ordering choice.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

let lineId = '';

test('a completed round offers both orderings and does not auto-start', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);

  const awardTo = async (name: string, item: string) => {
    await startDistribution(page, item);
    await page.getByRole('button', { name: `Award to ${name}` }).click();
  };

  await awardTo('Ash', 'A');
  await awardTo('Bex', 'B');

  // The round is complete and the app waits for a decision rather than starting round 2 itself.
  await expect(page.getByText('No round in progress')).toBeVisible();

  await page.getByRole('link', { name: 'Start a round' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 complete' })).toBeVisible();
  await expect(page.getByLabel(/Rank by current Combat Power/)).toBeChecked();
  await expect(page.getByText(/Reuse round 1 sequence/)).toBeVisible();

  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(page.getByRole('heading', { name: 'Round 2' })).toBeVisible();
  await expect(page.getByText('0 of 2')).toBeVisible();
});
