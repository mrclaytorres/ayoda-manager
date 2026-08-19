// Roster CSV import, driven through the real file picker.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startRound } from './helpers';

let lineId = '';

const REAL_CSV = 'members.csv';

async function chooseCsv(page: import('@playwright/test').Page, name: string, contents: string) {
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.getByLabel('Choose a CSV file').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from(contents, 'utf8'),
  });
}

test('imports the project members.csv, CRLF and all', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await page.goto(`/lines/${lineId}/roster`);

  const csv = readFileSync(REAL_CSV, 'utf8');
  // Derive the expectations from the file rather than hard-coding them, so editing members.csv
  // does not silently invalidate this test.
  const dataRows = csv
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(','));
  const expected = dataRows.length;
  const [firstName, firstCp] = dataRows[0];
  const [lastName] = dataRows[dataRows.length - 1];

  await chooseCsv(page, 'members.csv', csv);
  await expect(page.getByText('New members')).toBeVisible();
  await page.getByRole('button', { name: `Import ${expected} changes` }).click();

  await expect(page.getByText(`${expected} members added`)).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Spot-check both ends of the roster.
  await expect(page.getByRole('listitem').filter({ hasText: firstName })).toContainText(
    Number(firstCp).toLocaleString('en-US'),
  );
  await expect(page.getByRole('listitem').filter({ hasText: lastName }).first()).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(expected);
});

test('previews adds, updates, and skips before writing anything', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);

  await page.goto(`/lines/${lineId}/roster`);
  await chooseCsv(
    page,
    'mixed.csv',
    'ign,combat_power\r\nAsh,90000\r\nBex,74000\r\nCyd,51000\r\nBroken,-5\r\nNoCp,\r\n',
  );

  // The preview is shown before any write. A blank Combat Power is a value now, not a broken
  // row — only the negative is rejected.
  await expect(page.getByText('New members')).toBeVisible();
  await expect(page.getByText('1 row will be skipped')).toBeVisible();
  await page.getByText('1 row will be skipped').click();
  await expect(page.getByText(/Combat Power "-5" is not a whole number/)).toBeVisible();

  // Nothing has changed yet.
  await expect(page.getByRole('listitem').filter({ hasText: 'Ash' })).toContainText('88,000');

  await page.getByRole('button', { name: 'Import 3 changes' }).click();
  await expect(page.getByText('2 members added, 1 Combat Power value updated')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('listitem').filter({ hasText: 'Ash' })).toContainText('90,000');
  await expect(page.getByRole('listitem').filter({ hasText: 'Cyd' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'NoCp' })).toContainText(
    'no Combat Power',
  );
  // Bex was in the file and unchanged; nobody was removed.
  await expect(page.getByRole('listitem')).toHaveCount(4);
});

test('an import during a round adds to the line without reordering it', async ({ page }) => {
  lineId = (await registerWithLine(page)).lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);

  await page.goto(`/lines/${lineId}/roster`);
  await chooseCsv(page, 'midround.csv', 'ign,combat_power\nAsh,10\nDov,80000\n');

  await expect(page.getByText(/will not reorder it/)).toBeVisible();
  await expect(page.getByText(/1 new member will join the round in progress/)).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 changes' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  // Ash keeps first place on the ranked value; Dov joins behind them.
  await page.goto(`/lines/${lineId}`);
  const line = await page.locator('ol > li').allInnerTexts();
  expect(line.join(' ')).toMatch(/Ash[\s\S]*Dov[\s\S]*Bex/);
  expect(line.join(' ')).toContain('88,000');
});
