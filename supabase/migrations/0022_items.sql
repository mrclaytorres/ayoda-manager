-- The loot being distributed is an item, not a skill, and it now comes from a pool the officer
-- fills ahead of time instead of a name typed at the moment of distribution.

-- ── Rename ────────────────────────────────────────────────────────────────────
-- A rename rather than an edit to 0005: this ships to a database that already holds rounds.
alter table public.distributions rename column skill_name to item_name;
alter table public.distributions
  rename constraint distributions_skill_name_len to distributions_item_name_len;

-- ── The pool ──────────────────────────────────────────────────────────────────
create table public.items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  -- Entry order. A batch inserted in one statement shares created_at (now() is transaction time),
  -- so without this the officer's list would come back shuffled.
  seq        integer not null default 0,
  created_at timestamptz not null default now(),
  constraint items_name_len check (length(btrim(name)) between 1 and 120)
);

-- Deliberately NOT unique on (owner_id, name): two Force Blades can drop in one night, and
-- collapsing them into one row would quietly lose an item.
create index items_owner_seq on public.items (owner_id, seq, id);

alter table public.items enable row level security;

create policy items_select on public.items for select
  using (owner_id = (select auth.uid()));
create policy items_insert on public.items for insert
  with check (owner_id = (select auth.uid()));
create policy items_update on public.items for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy items_delete on public.items for delete
  using (owner_id = (select auth.uid()));

-- Row-level BEFORE INSERT fires once per row in order, so a multi-row insert numbers itself.
-- Same shape as the tiebreak_seq assignment in 0018.
create or replace function public.items_assign_seq()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select coalesce(max(seq), 0) + 1 into new.seq
  from public.items
  where owner_id = new.owner_id;
  return new;
end;
$$;

create trigger items_assign_seq
before insert on public.items
for each row execute function public.items_assign_seq();

-- ── Link ──────────────────────────────────────────────────────────────────────
-- ON DELETE SET NULL, matching R-011: deleting an item must not erase the record of handing it
-- out, and item_name is the snapshot that keeps the history readable.
alter table public.distributions
  add column item_id uuid references public.items (id) on delete set null;

-- An item is distributed at most once. Availability is derived from this same link, so the rule
-- and the read model cannot drift apart.
create unique index distributions_one_per_item
  on public.distributions (item_id) where item_id is not null;

-- ── What is still up for grabs ────────────────────────────────────────────────
-- Derived, not a status column, for the reason in R-007: every way a distribution can be undone
-- then returns the item to the pool for free. reset_round deletes the round's distributions, so a
-- reset hands its items back — which is what resetting a round means.
create view public.v_item_pool
with (security_invoker = on) as
select i.id, i.owner_id, i.name, i.seq, i.created_at
from public.items i
where not exists (select 1 from public.distributions d where d.item_id = i.id);

-- ── start_distribution now takes an item, not a name ──────────────────────────
-- Dropped rather than replaced: the argument type changed, so CREATE OR REPLACE would leave the
-- old (text, uuid) overload in place and PostgREST would have two candidates to choose from.
drop function public.start_distribution(text, uuid);

create function public.start_distribution(
  p_item_id          uuid,
  p_client_action_id uuid
)
returns public.distributions
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_round public.rounds;
  v_dist  public.distributions;
  v_item  public.items;
begin
  -- FR-048: an identical retry returns the original row and creates nothing.
  select * into v_dist
  from public.distributions
  where owner_id = v_owner and client_action_id = p_client_action_id;
  if found then
    return v_dist;
  end if;

  -- FR-049: serialise every mutation touching this round.
  select * into v_round
  from public.rounds
  where owner_id = v_owner and status = 'active'
  for update;

  if not found then
    raise exception 'GS001: there is no round in progress';
  end if;

  if exists (
    select 1 from public.distributions
    where round_id = v_round.id and status = 'in_progress'
  ) then
    raise exception 'GS006: a distribution is already in progress';
  end if;

  -- Locked for the same reason the round is: two devices picking the same item at once must not
  -- both get past the check below.
  select * into v_item
  from public.items
  where id = p_item_id and owner_id = v_owner
  for update;

  if not found then
    raise exception 'GS014: that item is no longer in the pool';
  end if;

  if exists (select 1 from public.distributions where item_id = p_item_id) then
    raise exception 'GS014: that item has already been distributed';
  end if;

  insert into public.distributions (owner_id, round_id, item_id, item_name, client_action_id)
  values (v_owner, v_round.id, v_item.id, v_item.name, p_client_action_id)
  returning * into v_dist;

  return v_dist;
end;
$$;
