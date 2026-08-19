'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import {
  cancelDistributionInput,
  closeUnclaimedInput,
  recordAwardInput,
  recordPassInput,
  startDistributionInput,
  undoLastActionInput,
} from '@/lib/domain/schemas';

/**
 * T044 — the distribution actions.
 *
 * Each one parses its input, calls exactly one RPC, and maps a GS code to a message. The rules are
 * enforced in the database; nothing here re-implements them.
 *
 * `clientActionId` is minted in the browser, once per gesture. Generating it here would defeat
 * FR-048 — a retry would arrive with a fresh id and create a duplicate.
 */

function refresh() {
  // Every distribution action lands inside one line, but the id is not always to hand — the
  // distribution knows its round and the round knows its line. Revalidating the segment covers
  // them all, and the pages are cheap.
  revalidatePath('/lines/[id]', 'page');
  revalidatePath('/history');
}

export async function startDistribution(
  input: unknown,
): Promise<ActionResult<{ id: string; itemName: string }>> {
  const parsed = startDistributionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('start_distribution', {
      p_item_id: parsed.data.itemId,
      p_client_action_id: parsed.data.clientActionId,
    })
    .single();

  if (error) return failWrite(supabase, error);
  refresh();
  const row = data as { id: string; item_name: string };
  return ok({ id: row.id, itemName: row.item_name });
}

export async function recordPass(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordPassInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_pass', {
    p_distribution_id: parsed.data.distributionId,
    p_member_id: parsed.data.memberId,
    p_client_action_id: parsed.data.clientActionId,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}

export async function recordAward(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordAwardInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_award', {
    p_distribution_id: parsed.data.distributionId,
    p_member_id: parsed.data.memberId,
    p_mode: parsed.data.mode,
    p_client_action_id: parsed.data.clientActionId,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}

export async function closeUnclaimed(input: unknown): Promise<ActionResult<null>> {
  const parsed = closeUnclaimedInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('close_unclaimed', {
    p_distribution_id: parsed.data.distributionId,
    p_client_action_id: parsed.data.clientActionId,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}

/**
 * Back out of a distribution started on the wrong item (FR-055). The row is deleted, so the item
 * returns to the pool; nothing reaches the history, because nothing happened.
 */
export async function cancelDistribution(input: unknown): Promise<ActionResult<null>> {
  const parsed = cancelDistributionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_distribution', {
    p_distribution_id: parsed.data.distributionId,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}

export async function undoLastAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = undoLastActionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('undo_last_action', {
    p_distribution_id: parsed.data.distributionId,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}
