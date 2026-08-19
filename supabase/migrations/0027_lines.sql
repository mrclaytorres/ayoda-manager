-- Lines: several rotations running side by side, each with its own members, items, and rounds.
--
-- Until now "one officer" meant "one line", and the schema said so — rounds were unique-active per
-- owner and members belonged to the account. A guild distributing weapons and armour on separate
-- rotations could not express that. A line is the thing a round belongs to; the account owns lines.

create table public.lines (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint lines_name_len check (length(btrim(name)) between 1 and 60)
);

create unique index lines_owner_name_unique on public.lines (owner_id, lower(btrim(name)));
create index lines_owner_created on public.lines (owner_id, created_at, id);

alter table public.lines enable row level security;

create policy lines_select on public.lines for select
  using (owner_id = (select auth.uid()));
create policy lines_insert on public.lines for insert
  with check (owner_id = (select auth.uid()));
create policy lines_update on public.lines for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy lines_delete on public.lines for delete
  using (owner_id = (select auth.uid()));

-- ── Everything that exists today belongs to one line ──────────────────────────
insert into public.lines (owner_id, name)
select distinct owner_id, 'Main' from public.members
union
select distinct owner_id, 'Main' from public.rounds
union
select distinct owner_id, 'Main' from public.items;

alter table public.members add column line_id uuid references public.lines (id) on delete cascade;
alter table public.items   add column line_id uuid references public.lines (id) on delete cascade;
alter table public.rounds  add column line_id uuid references public.lines (id) on delete cascade;

update public.members m set line_id = l.id from public.lines l where l.owner_id = m.owner_id;
update public.items   i set line_id = l.id from public.lines l where l.owner_id = i.owner_id;
update public.rounds  r set line_id = l.id from public.lines l where l.owner_id = r.owner_id;

alter table public.members alter column line_id set not null;
alter table public.items   alter column line_id set not null;
alter table public.rounds  alter column line_id set not null;

create index members_line on public.members (line_id);
create index items_line   on public.items   (line_id, seq, id);

-- ── Members belong to a line, and their Combat Power is optional ──────────────
-- Names are unique within a line, not across the account: the same person can take part in the
-- weapons line and the armour line, and those are separate rows with separate CP.
drop index public.members_owner_name_unique;
create unique index members_line_name_unique on public.members (line_id, lower(btrim(name)));

-- Some lines are ordered by hand, so a number nobody uses should not be mandatory.
-- members_cp_non_negative still holds: `null >= 0` is unknown, and a CHECK passes on unknown.
alter table public.members alter column combat_power drop not null;

-- ── One live round per line, numbered within that line ───────────────────────
drop index public.rounds_one_active_per_owner;
create unique index rounds_one_active_per_line on public.rounds (line_id) where status = 'active';

alter table public.rounds drop constraint rounds_owner_id_round_number_key;
alter table public.rounds add constraint rounds_line_number_unique unique (line_id, round_number);

-- Set when the officer rearranges a live round. ordering_mode keeps saying how the round *started*,
-- so the history can report "ranked by Combat Power, then rearranged" rather than quietly rewriting
-- which choice produced the sequence (FR-022).
alter table public.rounds add column reordered_at timestamptz;

-- ── One ordering key instead of two ──────────────────────────────────────────
-- Was (ranked_cp desc, tiebreak_seq asc). A hand-arranged line has no CP to sort by, so position is
-- now a single number that every mode assigns and the officer can rewrite. ranked_cp stays as the
-- snapshot the round was ranked on, for the pending-change flag (FR-019).
alter table public.round_entries rename column tiebreak_seq to position_seq;
alter table public.round_entries alter column ranked_cp drop not null;

-- Uniqueness on the position has to go: shifting a block of rows down by one to make room for a
-- mid-round joiner transiently duplicates a value, and a non-deferrable unique index rejects that
-- mid-statement. Order is still deterministic — the view breaks ties on member_id.
alter table public.round_entries drop constraint round_entries_round_id_tiebreak_seq_key;

drop index public.round_entries_order;
create index round_entries_order on public.round_entries (round_id, position_seq, member_id);
