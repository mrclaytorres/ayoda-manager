// Several rotations at once, and lines that are ordered by hand rather than by Combat Power.
import { expect, test } from '@playwright/test';
import { addItems, addMember, createLine, registerOfficer, startRound } from './helpers';

test('two lines run at the same time without touching each other', async ({ page }) => {
  await registerOfficer(page);

  const weapons = await createLine(page, 'Weapons');
  await addMember(page, weapons, 'Ash', 88000);
  await addMember(page, weapons, 'Bex', 74000);
  await startRound(page, weapons);

  const armour = await createLine(page, 'Armour');
  await addMember(page, armour, 'Ash', 51000);
  await addMember(page, armour, 'Cyd', 60000);
  await startRound(page, armour);

  // Both are live, and both are Round 1 — numbering is per line.
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Weapons/ })).toContainText('Round 1');
  await expect(page.getByRole('link', { name: /Armour/ })).toContainText('Round 1');

  // Award on Weapons.
  await page.goto(`/lines/${weapons}`);
  await addItems(page, 'Force Blade');
  await page.getByRole('button', { name: 'Distribute Force Blade' }).click();
  await page.getByRole('button', { name: 'Award to Ash' }).click();
  await expect(page.getByText('received Force Blade')).toBeVisible();

  // Ash is still first in line on Armour — the two rotations are unrelated.
  await page.goto(`/lines/${armour}`);
  await expect(page.getByText('received Force Blade')).toHaveCount(0);
  await addItems(page, 'Guardian Boots');
  await page.getByRole('button', { name: 'Distribute Guardian Boots' }).click();
  await expect(page.getByRole('button', { name: 'Award to Cyd' })).toBeVisible();
});

test('a line can be renamed, and deleting one asks for its name back', async ({ page }) => {
  await registerOfficer(page);
  const lineId = await createLine(page, 'Wepons');
  await addMember(page, lineId, 'Ash', 88000);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Line name').fill('Weapons');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { name: 'Weapons' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  const remove = page.getByRole('button', { name: 'Delete this line' });
  await expect(remove).toBeDisabled();

  await page.getByLabel('Type Weapons to confirm').fill('weapons');
  await expect(remove).toBeDisabled(); // Case matters, as with the history guard.

  await page.getByLabel('Type Weapons to confirm').fill('Weapons');
  await remove.click();
  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: /Weapons/ })).toHaveCount(0);
});

test('a line ordered by hand needs no Combat Power at all', async ({ page }) => {
  await registerOfficer(page);
  const lineId = await createLine(page, 'Talics');
  await addMember(page, lineId, 'Ash', null);
  await addMember(page, lineId, 'Bex', null);
  await addMember(page, lineId, 'Cyd', null);

  await page.goto(`/lines/${lineId}/roster`);
  await expect(page.getByText('no Combat Power')).toHaveCount(3);

  await startRound(page, lineId, 'Arrange by hand');
  await expect(page.getByText('arranged by hand')).toBeVisible();

  // Put Cyd first.
  await page.getByRole('button', { name: 'Rearrange the line' }).click();
  await page.getByRole('button', { name: 'Move Cyd up' }).click();
  await page.getByRole('button', { name: 'Move Cyd up' }).click();
  await page.getByRole('button', { name: 'Save order' }).click();

  await addItems(page, 'Talic');
  await page.getByRole('button', { name: 'Distribute Talic' }).click();
  await expect(page.getByRole('button', { name: 'Award to Cyd' })).toBeVisible();
});

test('a live round can be rearranged, and the offer follows', async ({ page }) => {
  await registerOfficer(page);
  const lineId = await createLine(page, 'Weapons');
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);

  await page.getByRole('button', { name: 'Rearrange the line' }).click();
  await page.getByRole('button', { name: 'Move Bex up' }).click();
  await page.getByRole('button', { name: 'Save order' }).click();

  // The round still records that it started from Combat Power.
  await expect(page.getByText('ranked by current Combat Power, then rearranged')).toBeVisible();

  await addItems(page, 'Force Blade');
  await page.getByRole('button', { name: 'Distribute Force Blade' }).click();
  await expect(page.getByRole('button', { name: 'Award to Bex' })).toBeVisible();
});
