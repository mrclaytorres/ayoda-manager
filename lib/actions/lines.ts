'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import { createLineInput, removeLineInput, renameLineInput } from '@/lib/domain/schemas';

/**
 * Lines — the rotations an account runs side by side. Each owns its own members, items, and round
 * numbering, so weapons and armour can be distributed at once without one line's awards taking a
 * member out of the other's.
 *
 * Plain table writes: RLS is the only rule to enforce, exactly as for the roster.
 */

export async function createLine(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createLineInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lines')
    .insert({ name: parsed.data.name })
    .select('id')
    .single();

  if (error) return failWrite(supabase, error);
  revalidatePath('/');
  return ok({ id: data.id });
}

export async function renameLine(input: unknown): Promise<ActionResult<null>> {
  const parsed = renameLineInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase
    .from('lines')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.id);

  if (error) return failWrite(supabase, error);
  revalidatePath('/', 'layout');
  return ok(null);
}

export async function removeLine(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeLineInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  // Everything below a line goes with it — members, items, rounds, and the history of those
  // rounds. That is why the interface asks for the line's name back before calling this.
  const { error } = await supabase.from('lines').delete().eq('id', parsed.data.id);

  if (error) return failWrite(supabase, error);
  revalidatePath('/', 'layout');
  return ok(null);
}
