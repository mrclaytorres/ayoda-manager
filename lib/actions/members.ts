'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import {
  addMemberInput,
  importMembersInput,
  removeMemberInput,
  updateMemberInput,
} from '@/lib/domain/schemas';

function refresh(lineId: string) {
  revalidatePath(`/lines/${lineId}`);
  revalidatePath(`/lines/${lineId}/roster`);
}

// T045
export async function addMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = addMemberInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .insert({
      line_id: parsed.data.lineId,
      name: parsed.data.name,
      combat_power: parsed.data.combatPower,
    })
    .select('id')
    .single();

  if (error) return failWrite(supabase, error);
  refresh(parsed.data.lineId);
  return ok({ id: data.id });
}

// T081
export async function updateMember(input: unknown): Promise<ActionResult<null>> {
  const parsed = updateMemberInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  // FR-012: editable at any time. The round's ranked_cp is a snapshot, so this cannot reorder the
  // round in progress — it shows up as a pending change instead.
  if (parsed.data.combatPower !== undefined) patch.combat_power = parsed.data.combatPower;
  if (Object.keys(patch).length === 0) return ok(null);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .update(patch)
    .eq('id', parsed.data.id)
    .select('line_id')
    .single();

  if (error) return failWrite(supabase, error);
  refresh(data.line_id);
  return ok(null);
}

// T081
export async function removeMember(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeMemberInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  // FR-014: their round entries cascade away, but distributions keep the name snapshot, so the
  // history stays readable.
  const { data, error } = await supabase
    .from('members')
    .delete()
    .eq('id', parsed.data.id)
    .select('line_id')
    .single();

  if (error) return failWrite(supabase, error);
  refresh(data.line_id);
  return ok(null);
}

/**
 * Bulk import from a CSV the officer has already previewed.
 *
 * The rows arrive parsed and validated by `lib/domain/csv.ts`, but they are re-parsed here and
 * re-checked in the RPC — the browser is a convenience, not the authority.
 */
export async function importMembers(
  input: unknown,
): Promise<ActionResult<{ inserted: number; updated: number; unchanged: number }>> {
  const parsed = importMembersInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_members', {
    p_line_id: parsed.data.lineId,
    p_rows: parsed.data.rows,
  });

  if (error) return failWrite(supabase, error);
  refresh(parsed.data.lineId);
  return ok(data as { inserted: number; updated: number; unchanged: number });
}
