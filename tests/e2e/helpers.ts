import type { Page } from '@playwright/test';

let counter = 0;

export async function registerOfficer(page: Page) {
  const email = `e2e-${Date.now()}-${counter++}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('/');
  return email;
}

/** Create a line and land on its roster, which is where its members go. */
export async function createLine(page: Page, name = 'Main') {
  await page.goto('/');
  await page.getByRole('button', { name: 'New line' }).click();
  await page.getByLabel('Line name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/lines\/[0-9a-f-]+\/roster/);
  return page.url().match(/\/lines\/([0-9a-f-]+)/)![1];
}

/** Register and open a line in one step — the starting point for most journeys. */
export async function registerWithLine(page: Page, name = 'Main') {
  const email = await registerOfficer(page);
  const lineId = await createLine(page, name);
  return { email, lineId };
}

export async function addMember(page: Page, lineId: string, name: string, cp: number | null) {
  await page.goto(`/lines/${lineId}/roster`);
  await page.getByLabel('Member name').fill(name);
  await page.getByLabel('Combat Power').fill(cp === null ? '' : String(cp));
  await page.getByRole('button', { name: 'Add member' }).click();
  await page.getByText(name, { exact: true }).first().waitFor();
}

export async function startRound(page: Page, lineId: string, mode?: 'Arrange by hand') {
  await page.goto(`/lines/${lineId}/round/start`);
  if (mode) await page.getByText(mode).click();
  await page.getByRole('button', { name: 'Start round' }).click();
  await page.waitForURL(`/lines/${lineId}`);
}

/** Put items in the pool, one per line, the way the officer enters a loot list. */
export async function addItems(page: Page, ...names: string[]) {
  await page.getByRole('button', { name: 'Add items' }).click();
  await page.getByLabel('Item names').fill(names.join('\n'));
  await page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true }).click();
  for (const name of names) {
    await page
      .getByRole('button', { name: `Distribute ${name}` })
      .first()
      .waitFor();
  }
}

/** Add the item if it is not already pooled, then distribute it. */
export async function startDistribution(page: Page, item: string) {
  if ((await page.getByRole('button', { name: `Distribute ${item}` }).count()) === 0) {
    await addItems(page, item);
  }
  await page
    .getByRole('button', { name: `Distribute ${item}` })
    .first()
    .click();
  await page.getByText('Distributing').waitFor();
}
