-- T014: rounds and their frozen order snapshot.
-- The order lives in round_entries as (ranked_cp, tiebreak_seq) and position is derived by
-- ORDER BY. Nothing stores a dense position, so a mid-round joiner never renumbers anyone.

create table public.rounds (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_number  integer not null,
  ordering_mode public.ordering_mode not null,
  status        public.round_status not null default 'active',
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (owner_id, round_number),
  constraint rounds_completed_consistency check (
    (status = 'complete' and completed_at is not null) or
    (status = 'active'   and completed_at is null)
  )
);

-- FR-038: exactly one live round per account, so the app is never ambiguous about which is current.
create unique index rounds_one_active_per_owner
  on public.rounds (owner_id) where status = 'active';

create table public.round_entries (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_id     uuid not null references public.rounds (id)  on delete cascade,
  -- FR-013: removing a member takes them out of the line immediately.
  member_id    uuid not null references public.members (id) on delete cascade,
  -- FR-018: the CP this round was ranked on. Never updated after the round starts.
  ranked_cp    integer not null,
  -- FR-017: persisted so equal-CP members keep the same order on every device, every load.
  tiebreak_seq integer not null,
  received_at  timestamptz,
  unique (round_id, member_id),
  unique (round_id, tiebreak_seq)
);

create index round_entries_order
  on public.round_entries (round_id, ranked_cp desc, tiebreak_seq asc);

create index round_entries_member on public.round_entries (member_id);
