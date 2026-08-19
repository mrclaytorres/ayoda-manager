// T067 — the password reset journey.
import { expect, test } from '@playwright/test';
import { registerOfficer } from './helpers';

test('a reset request does not reveal whether the email is registered', async ({
  page,
  browser,
}) => {
  // No line needed: this journey never leaves the auth screens.
  const email = await registerOfficer(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/login/);

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.waitForURL(/forgot-password/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const known = await page.getByText(/reset link is on its way/).textContent();

  // An address with no account must produce exactly the same response.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto('/forgot-password');
  await other.getByLabel('Email').fill('nobody-here@example.test');
  await other.getByRole('button', { name: 'Send reset link' }).click();
  const unknown = await other.getByText(/reset link is on its way/).textContent();

  expect(unknown).toBe(known);
  await context.close();
});
