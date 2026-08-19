'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { fail, isOrphanedSession, type ActionResult } from '@/lib/domain/errors';

/**
 * Turn a Supabase error into an ActionResult, clearing the session first if the account behind it
 * has been deleted.
 *
 * The proxy verifies the JWT signature locally and does not ask the Auth server whether the user
 * still exists — that is the deliberate "thin proxy" trade-off, and paying a network round trip on
 * every request to catch a rare case would be the wrong bargain. Instead the rare case is caught
 * here, at the only point where it can actually surface: a write. Signing out means the next
 * request redirects to the login screen instead of looping through the same failure.
 */
export async function failWrite(
  supabase: SupabaseClient,
  error: unknown,
): Promise<ActionResult<never>> {
  if (isOrphanedSession(error)) {
    await supabase.auth.signOut();
  }
  return fail(error);
}
