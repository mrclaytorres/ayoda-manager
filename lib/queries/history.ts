import { createClient } from '@/lib/supabase/server';
import type { AwardMode, DistributionStatus, Round } from '@/lib/types/database';

// T092 — the history read model. FR-041, FR-042.

export interface HistoryEntry {
  id: string;
  item_name: string;
  status: DistributionStatus;
  recipient_name: string | null;
  recipient_member_id: string | null;
  award_mode: AwardMode | null;
  round_number: number;
  round_id: string;
  line_id: string;
  line_name: string;
  closed_at: string | null;
  created_at: string;
  passers: string[];
}

export interface HistoryFilters {
  memberId?: string;
  roundId?: string;
  lineId?: string;
}

export async function loadHistory(filters: HistoryFilters = {}): Promise<HistoryEntry[]> {
  const supabase = await createClient();

  let query = supabase
    .from('distributions')
    .select(
      'id, item_name, status, recipient_name, recipient_member_id, award_mode, closed_at, created_at, round_id, rounds!inner(round_number, line_id, lines!inner(name)), offer_responses(member_name, kind, seq, member_id)',
    )
    .neq('status', 'in_progress')
    .order('created_at', { ascending: false });

  if (filters.roundId) query = query.eq('round_id', filters.roundId);
  if (filters.lineId) query = query.eq('rounds.line_id', filters.lineId);

  const { data, error } = await query;
  if (error || !data) return [];

  type RoundJoin = {
    round_number: number;
    line_id: string;
    lines: { name: string } | { name: string }[];
  };

  type Row = (typeof data)[number] & {
    rounds: RoundJoin | RoundJoin[];
    offer_responses: { member_name: string; kind: string; seq: number; member_id: string | null }[];
  };

  const lineNameOf = (round: RoundJoin | undefined) => {
    if (!round) return 'Line';
    const lines = round.lines;
    return (Array.isArray(lines) ? lines[0]?.name : lines?.name) ?? 'Line';
  };

  let entries = (data as Row[]).map((row) => {
    const round = Array.isArray(row.rounds) ? row.rounds[0] : row.rounds;
    return {
      id: row.id,
      item_name: row.item_name,
      status: row.status as DistributionStatus,
      recipient_name: row.recipient_name,
      recipient_member_id: row.recipient_member_id,
      award_mode: row.award_mode as AwardMode | null,
      round_number: round?.round_number ?? 0,
      round_id: row.round_id,
      line_id: round?.line_id ?? '',
      line_name: lineNameOf(round),
      closed_at: row.closed_at,
      created_at: row.created_at,
      passers: (row.offer_responses ?? [])
        .filter((r) => r.kind === 'pass')
        .sort((a, b) => a.seq - b.seq)
        .map((r) => r.member_name),
      _responderIds: (row.offer_responses ?? []).map((r) => r.member_id),
    };
  });

  // Filtering by member means "everything they took part in", not only what they won.
  if (filters.memberId) {
    entries = entries.filter(
      (e) =>
        e.recipient_member_id === filters.memberId ||
        (e as { _responderIds: (string | null)[] })._responderIds.includes(filters.memberId!),
    );
  }

  return entries.map(({ _responderIds, ...entry }) => {
    void _responderIds;
    return entry;
  });
}

/** Rounds available for deletion — completed only. FR-044, FR-045. */
export async function loadDeletableRounds(): Promise<
  (Round & { distribution_count: number; line_name: string })[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('rounds')
    .select('*, lines!inner(name), distributions(count)')
    .eq('status', 'complete')
    .order('round_number', { ascending: false });

  type Row = Round & {
    distributions: { count: number }[];
    lines: { name: string } | { name: string }[];
  };

  return ((data ?? []) as Row[]).map((round) => ({
    ...round,
    distribution_count: round.distributions?.[0]?.count ?? 0,
    line_name: (Array.isArray(round.lines) ? round.lines[0]?.name : round.lines?.name) ?? 'Line',
  }));
}

export async function loadRoundsAndMembers() {
  const supabase = await createClient();
  const [{ data: rounds }, { data: members }, { data: lines }] = await Promise.all([
    supabase
      .from('rounds')
      .select('id, round_number, line_id')
      .order('round_number', { ascending: false }),
    supabase.from('members').select('id, name').order('name'),
    supabase.from('lines').select('id, name').order('created_at'),
  ]);
  return { rounds: rounds ?? [], members: members ?? [], lines: lines ?? [] };
}
