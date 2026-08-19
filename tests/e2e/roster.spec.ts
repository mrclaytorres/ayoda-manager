// T077 — mid-round roster changes.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startRound } from './helpers';

let lineId = '';

test('roster changes mid-round behave as specified', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await addMember(page, lineId, 'Cyd', 51000);
  await startRound(page, lineId);

  // A mid-round joiner slots in by Combat Power.
  await addMember(page, lineId, 'Dov', 66000);
  await page.goto(`/lines/${lineId}`);
  const names = await page.locator('ol > li').allInnerTexts();
  expect(names.join(' ')).toMatch(/Ash[\s\S]*Bex[\s\S]*Dov[\s\S]*Cyd/);

  // A duplicate name is refused on the name field.
  await page.goto(`/lines/${lineId}/roster`);
  await page.getByLabel('Member name').fill('ash');
  await page.getByLabel('Combat Power').fill('1');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText('A member with that name already exists.')).toBeVisible();

  // Negative Combat Power is refused; zero is accepted.
  await page.getByLabel('Member name').fill('Neg');
  await page.getByLabel('Combat Power').fill('-5');
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.getByText(/whole number of 0 or more/)).toBeVisible();
});

test('editing Combat Power mid-round shows a pending change without reordering', async ({
  page,
}) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);

  await page.goto(`/lines/${lineId}/roster`);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const editRow = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Save' }) });
  await editRow.getByLabel('Combat Power').fill('10');
  await editRow.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText(/ranked on 88,000/)).toBeVisible();
  await expect(page.getByText(/now 10, applies next round/)).toBeVisible();

  // The line is unchanged.
  await page.goto(`/lines/${lineId}`);
  const first = page.locator('ol > li').first();
  await expect(first).toContainText('Ash');
});
