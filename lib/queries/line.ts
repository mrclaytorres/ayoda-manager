import { createClient } from '@/lib/supabase/server';
import type {
  CurrentOfferRow,
  Distribution,
  ItemPoolRow,
  Member,
  OfferResponse,
  Round,
  RoundLineRow,
} from '@/lib/types/database';

export interface LineState {
  round: Round | null;
  line: RoundLineRow[];
  distribution: Distribution | null;
  offer: CurrentOfferRow | null;
  responses: OfferResponse[];
  members: Member[];
  /** Items still up for grabs — `v_item_pool` derives this from what has been distributed. */
  pool: ItemPoolRow[];
}

/** Everything one line's screen needs, in one pass. */
export async function loadLineState(lineId: string): Promise<LineState> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('line_id', lineId)
    .order('combat_power', { ascending: false, nullsFirst: false });

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('line_id', lineId)
    .eq('status', 'active')
    .maybeSingle();

  if (!round) {
    return {
      round: null,
      line: [],
      distribution: null,
      offer: null,
      responses: [],
      members: (members ?? []) as Member[],
      pool: [],
    };
  }

  const { data: pool } = await supabase
    .from('v_item_pool')
    .select('*')
    .eq('line_id', lineId)
    .order('seq');

  const { data: line } = await supabase
    .from('v_round_line')
    .select('*')
    .eq('round_id', round.id)
    .order('position');

  const { data: distribution } = await supabase
    .from('distributions')
    .select('*')
    .eq('round_id', round.id)
    .eq('status', 'in_progress')
    .maybeSingle();

  let offer: CurrentOfferRow | null = null;
  let responses: OfferResponse[] = [];

  if (distribution) {
    const { data: offerRow } = await supabase
      .from('v_current_offer')
      .select('*')
      .eq('distribution_id', distribution.id)
      .maybeSingle();
    offer = (offerRow as CurrentOfferRow) ?? null;

    const { data: responseRows } = await supabase
      .from('offer_responses')
      .select('*')
      .eq('distribution_id', distribution.id)
      .order('seq');
    responses = (responseRows ?? []) as OfferResponse[];
  }

  return {
    round: round as Round,
    line: (line ?? []) as RoundLineRow[],
    distribution: (distribution as Distribution) ?? null,
    offer,
    responses,
    members: (members ?? []) as Member[],
    pool: (pool ?? []) as ItemPoolRow[],
  };
}

/** The line's most recently completed round, used to offer the next ordering choice. */
export async function loadLastCompletedRound(lineId: string): Promise<Round | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .eq('line_id', lineId)
    .eq('status', 'complete')
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Round) ?? null;
}
