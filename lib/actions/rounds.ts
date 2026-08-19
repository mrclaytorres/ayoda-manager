'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { invalid, ok, type ActionResult } from '@/lib/domain/errors';
import { failWrite } from '@/lib/actions/session';
import { resetRoundInput, setRoundOrderInput, startRoundInput } from '@/lib/domain/schemas';

function refresh(lineId?: string) {
  revalidatePath('/', 'layout');
  revalidatePath('/history');
  if (lineId) revalidatePath(`/lines/${lineId}`);
}

// T052 (current_cp) / T059 (extended with the ordering choice)
export async function startRound(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = startRoundInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc('start_round', {
      p_line_id: parsed.data.lineId,
      p_ordering_mode: parsed.data.orderingMode,
    })
    .single();

  if (error) return failWrite(supabase, error);
  refresh(parsed.data.lineId);
  return ok({ id: (data as { id: string }).id });
}

// T062
export async function resetRound(input: unknown): Promise<ActionResult<null>> {
  const parsed = resetRoundInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('reset_round', { p_round_id: parsed.data.roundId });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}

/**
 * Rearrange a live round by hand (FR-057).
 *
 * The whole order is sent, not a move instruction: two officers dragging at once would otherwise
 * compose into an arrangement neither chose. The RPC rejects a list that is not exactly this
 * round's members, so a stale screen cannot drop somebody by omission.
 */
export async function setRoundOrder(input: unknown): Promise<ActionResult<null>> {
  const parsed = setRoundOrderInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_round_order', {
    p_round_id: parsed.data.roundId,
    p_member_ids: parsed.data.memberIds,
  });

  if (error) return failWrite(supabase, error);
  refresh();
  return ok(null);
}
