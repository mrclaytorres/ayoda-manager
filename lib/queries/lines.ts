import { createClient } from '@/lib/supabase/server';
import type { Line } from '@/lib/types/database';

/** A line as it appears on the index: enough to choose between them without opening each one. */
export interface LineSummary extends Line {
  member_count: number;
  pool_count: number;
  round_number: number | null;
  received: number;
}

export async function loadLines(): Promise<LineSummary[]> {
  const supabase = await createClient();

  const [{ data: lines }, { data: members }, { data: pool }, { data: rounds }, { data: entries }] =
    await Promise.all([
      supabase.from('lines').select('*').order('created_at'),
      supabase.from('members').select('line_id'),
      supabase.from('v_item_pool').select('line_id'),
      supabase.from('rounds').select('id, line_id, round_number').eq('status', 'active'),
      supabase.from('v_round_line').select('line_id, eligible'),
    ]);

  const count = (rows: { line_id: string }[] | null, lineId: string) =>
    (rows ?? []).filter((row) => row.line_id === lineId).length;

  return ((lines ?? []) as Line[]).map((line) => {
    const round = (rounds ?? []).find((r) => r.line_id === line.id);
    return {
      ...line,
      member_count: count(members, line.id),
      pool_count: count(pool, line.id),
      round_number: round?.round_number ?? null,
      received: (entries ?? []).filter((e) => e.line_id === line.id && !e.eligible).length,
    };
  });
}

export async function loadLine(id: string): Promise<Line | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('lines').select('*').eq('id', id).maybeSingle();
  return (data as Line) ?? null;
}
