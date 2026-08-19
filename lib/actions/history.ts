'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import { deleteRoundHistoryInput } from '@/lib/domain/schemas';

/**
 * T097 — history deletion.
 *
 * The confirmation string is passed through untouched: not trimmed, not upper-cased. The server
 * decides whether the officer confirmed, and "helping" the input here would quietly weaken the
 * guard they think they are getting (FR-046).
 */
export async function deleteRoundHistory(
  input: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const parsed = deleteRoundHistoryInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_round_history', {
    p_round_ids: parsed.data.roundIds,
    p_confirmation: parsed.data.confirmation,
  });

  if (error) return failWrite(supabase, error);
  revalidatePath('/history');
  revalidatePath('/');
  return ok({ deleted: (data as number) ?? 0 });
}
