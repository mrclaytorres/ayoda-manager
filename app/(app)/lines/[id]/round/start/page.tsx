import { redirect } from 'next/navigation';

type Href = Parameters<typeof redirect>[0];
import { StartRoundForm } from '@/components/line/StartRoundForm';
import { createClient } from '@/lib/supabase/server';
import { loadLastCompletedRound } from '@/lib/queries/line';
import type { Member } from '@/lib/types/database';

// T063 — the ordering choice. FR-020.
export default async function StartRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: active } = await supabase
    .from('rounds')
    .select('id')
    .eq('line_id', id)
    .eq('status', 'active')
    .maybeSingle();
  if (active) redirect(`/lines/${id}` as Href);

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('line_id', id)
    .order('combat_power', { ascending: false, nullsFirst: false });
  if (!members?.length) redirect(`/lines/${id}/roster` as Href);

  const previous = await loadLastCompletedRound(id);
  let pendingChanges = 0;

  if (previous) {
    const { data: line } = await supabase
      .from('v_round_line')
      .select('cp_change_pending')
      .eq('round_id', previous.id);
    pendingChanges = (line ?? []).filter((row) => row.cp_change_pending).length;
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-base font-semibold">
          {previous ? `Round ${previous.round_number} complete` : 'Start the first round'}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          {previous
            ? 'Everyone is eligible again. Choose how the next round is sequenced.'
            : `${members.length} member${members.length === 1 ? '' : 's'} on this line.`}
        </p>
      </header>

      <StartRoundForm
        lineId={id}
        hasPrevious={!!previous}
        previousNumber={previous?.round_number ?? null}
        pendingChanges={pendingChanges}
        preview={(members as Member[]).map((m) => ({ name: m.name, cp: m.combat_power }))}
      />
    </div>
  );
}
