'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import { addItemsInput, removeItemInput } from '@/lib/domain/schemas';

/**
 * The item pool — the loot waiting to be handed out.
 *
 * Plain table writes rather than RPCs, like the roster: there is no rule to enforce beyond
 * ownership, and RLS already enforces that. `seq` is assigned by a trigger so a whole list
 * inserted in one statement keeps the order the officer typed it in.
 */

function refresh(lineId: string) {
  revalidatePath(`/lines/${lineId}`);
}

export async function addItems(input: unknown): Promise<ActionResult<{ added: number }>> {
  const parsed = addItemsInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  // Duplicates are kept: two of the same item can drop in one night.
  const { data, error } = await supabase
    .from('items')
    .insert(parsed.data.names.map((name) => ({ line_id: parsed.data.lineId, name })))
    .select('id');

  if (error) return failWrite(supabase, error);
  refresh(parsed.data.lineId);
  return ok({ added: data?.length ?? 0 });
}

export async function removeItem(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeItemInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  // Only pool items are ever offered for removal in the UI. Deleting one that was distributed
  // anyway leaves the history intact — item_name is a snapshot and item_id is ON DELETE SET NULL.
  const { data, error } = await supabase
    .from('items')
    .delete()
    .eq('id', parsed.data.id)
    .select('line_id')
    .single();

  if (error) return failWrite(supabase, error);
  refresh(data.line_id);
  return ok(null);
}
