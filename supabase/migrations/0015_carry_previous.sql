-- T059 — the carry_previous ordering path.
-- Implemented in 0008 start_round. This migration documents the invariant and adds the index the
-- carry path relies on when copying the previous round's sequence.

create index if not exists round_entries_round_member
  on public.round_entries (round_id, member_id);

comment on function public.start_round(public.ordering_mode) is
  'FR-020/FR-022: current_cp snapshots members.combat_power now; carry_previous copies the previous '
  'round''s ranked_cp and tiebreak_seq for surviving members and appends newcomers past the maximum, '
  'leaving their CP edits pending.';
