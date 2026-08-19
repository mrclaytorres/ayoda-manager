import { ImportMembersDialog } from '@/components/roster/ImportMembersDialog';
import { MemberForm } from '@/components/roster/MemberForm';
import { MemberRow } from '@/components/roster/MemberRow';
import { createClient } from '@/lib/supabase/server';
import type { Member, RoundLineRow } from '@/lib/types/database';

// T054 (minimal) / T082 (full CRUD)
export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .eq('line_id', id)
    .order('combat_power', { ascending: false, nullsFirst: false });

  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('line_id', id)
    .eq('status', 'active')
    .maybeSingle();

  let line: RoundLineRow[] = [];
  if (round) {
    const { data } = await supabase.from('v_round_line').select('*').eq('round_id', round.id);
    line = (data ?? []) as RoundLineRow[];
  }
  const byMember = new Map(line.map((row) => [row.member_id, row]));

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Roster</h2>
        <ImportMembersDialog
          lineId={id}
          existing={(members ?? []).map((m) => ({ name: m.name, combat_power: m.combat_power }))}
          roundInProgress={!!round}
        />
      </header>
      <MemberForm lineId={id} />

      {members?.length ? (
        <ul className="space-y-1.5">
          {(members as Member[]).map((member) => (
            <MemberRow key={member.id} member={member} lineRow={byMember.get(member.id) ?? null} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-dim">
          No members yet. Add the guild above, then start a round.
        </p>
      )}
    </div>
  );
}
