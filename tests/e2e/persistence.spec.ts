// T066 — quickstart V6. FR-002, FR-004, SC-005.
import { expect, test } from '@playwright/test';
import { addMember, registerWithLine, startDistribution, startRound } from './helpers';

let lineId = '';

test('guild data survives sign-out and a fresh browser context', async ({ page, browser }) => {
  const registered = await registerWithLine(page);
  const email = registered.email;
  lineId = registered.lineId;
  await addMember(page, lineId, 'Ash', 88000);
  await addMember(page, lineId, 'Bex', 74000);
  await startRound(page, lineId);
  await startDistribution(page, 'Force Blade');
  await page.getByRole('button', { name: 'Ash passes' }).click();
  await page.getByRole('button', { name: 'Award to Bex' }).click();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/login/);

  // A second, independent browser context — a different device in all but name.
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const second = await context.newPage();
  await second.goto('/login');
  await second.getByLabel('Email').fill(email);
  await second.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await second.getByRole('button', { name: 'Sign in' }).click();
  await second.waitForURL('/');

  // Signing in lands on the list of lines; the round lives inside one.
  await second.getByRole('link', { name: /Main/ }).click();
  await expect(second.getByText('Round 1')).toBeVisible();
  await expect(second.getByText('1 of 2')).toBeVisible();
  await second.goto('/history');
  const entry = second.getByRole('listitem').filter({ hasText: 'Force Blade' });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Bex');
  await context.close();
});

test('an unauthenticated visitor is redirected to sign in', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/lines/${lineId}/roster`);
  await page.waitForURL(/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await context.close();
});
