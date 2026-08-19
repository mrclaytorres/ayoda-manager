-- The functions and views, re-pointed at lines.

-- ── The line as displayed ────────────────────────────────────────────────────
-- Dropped and recreated rather than replaced: CREATE OR REPLACE VIEW may only append columns, and
-- line_id belongs beside round_id. v_current_offer goes first because it selects from this one.
drop view public.v_current_offer;
drop view public.v_round_line;

create view public.v_round_line
with (security_invoker = on) as
select
  re.round_id,
  r.line_id,
  re.owner_id,
  re.member_id,
  m.name,
  re.ranked_cp,
  m.combat_power as current_cp,
  -- FR-019/FR-021: derived, so it clears itself when a new round adopts the new value. Suppressed
  -- for a hand-arranged round: it was never ranked on Combat Power, so there is no pending change
  -- to report against.
  (r.ordering_mode <> 'manual' and m.combat_power is distinct from re.ranked_cp) as cp_change_pending,
  re.received_at,
  (re.received_at is null) as eligible,
  row_number() over (
    partition by re.round_id
    order by re.position_seq asc, re.member_id asc
  ) as position,
  -- FR-017: surface the tie so the officer can settle it by guild convention. Meaningless when the
  -- officer set the order themselves, or when neither member has a Combat Power.
  (
    r.ordering_mode <> 'manual'
    and re.ranked_cp is not null
    and count(*) over (partition by re.round_id, re.ranked_cp) > 1
  ) as tied,
  (
    select d.item_name
    from public.distributions d
    where d.round_id            = re.round_id
      and d.recipient_member_id = re.member_id
      and d.status              = 'awarded'
  ) as received_item
from public.round_entries re
join public.members m on m.id = re.member_id
join public.rounds  r on r.id = re.round_id;

-- FR-026: whose turn it is, never stored. Deriving it is what makes undo a delete.
create view public.v_current_offer
with (security_invoker = on) as
select distinct on (d.id)
  d.id       as distribution_id,
  d.owner_id,
  l.member_id,
  l.name,
  l.position
from public.distributions d
join public.v_round_line l
  on l.round_id = d.round_id and l.eligible
left join public.offer_responses r
  on r.distribution_id = d.id and r.member_id = l.member_id
where d.status = 'in_progress' and r.id is null
order by d.id, l.position;

drop view public.v_item_pool;

create view public.v_item_pool
with (security_invoker = on) as
select i.id, i.owner_id, i.line_id, i.name, i.seq, i.created_at
from public.items i
where not exists (select 1 from public.distributions d where d.item_id = i.id);

-- ── start_round ──────────────────────────────────────────────────────────────
drop function public.start_round(public.ordering_mode);

create function public.start_round(
  p_line_id       uuid,
  p_ordering_mode public.ordering_mode
)
returns public.rounds
language plpgsql
set search_path = ''
as $$
declare
  v_owner    uuid := auth.uid();
  v_line     public.lines;
  v_prev     public.rounds;
  v_round    public.rounds;
  v_next_num integer;
begin
  if v_owner is null then
    raise exception 'GS006: not authenticated';
  end if;

  select * into v_line from public.lines where id = p_line_id and owner_id = v_owner;
  if not found then
    raise exception 'GS016: that line no longer exists';
  end if;

  if not exists (select 1 from public.members where line_id = p_line_id) then
    raise exception 'GS002: add at least one member before starting a round';
  end if;

  if exists (select 1 from public.rounds where line_id = p_line_id and status = 'active') then
    raise exception 'GS009: a round is already in progress';
  end if;

  select * into v_prev
  from public.rounds
  where line_id = p_line_id
  order by round_number desc
  limit 1;

  -- round_number never reuses a deleted round's number: it continues from the line's high-water
  -- mark. Numbering is per line, so two lines each have their own Round 1.
  v_next_num := coalesce(v_prev.round_number, 0) + 1;

  insert into public.rounds (owner_id, line_id, round_number, ordering_mode)
  values (v_owner, p_line_id, v_next_num, p_ordering_mode)
  returning * into v_round;

  if p_ordering_mode = 'carry_previous' and v_prev.id is not null then
    -- Carry the previous sequence for members still on the line...
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, position_seq)
    select v_owner, v_round.id, pe.member_id, pe.ranked_cp, pe.position_seq
    from public.round_entries pe
    join public.members m on m.id = pe.member_id
    where pe.round_id = v_prev.id;

    -- ...and append anyone who joined since, past the current maximum.
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, position_seq)
    select
      v_owner,
      v_round.id,
      m.id,
      m.combat_power,
      coalesce((select max(position_seq) from public.round_entries where round_id = v_round.id), 0)
        + row_number() over (order by m.combat_power desc nulls last, m.created_at asc, m.id asc)
    from public.members m
    where m.line_id = p_line_id
      and not exists (
        select 1 from public.round_entries re
        where re.round_id = v_round.id and re.member_id = m.id
      );
  else
    -- current_cp and manual both start from the Combat Power ranking. Manual then exists to be
    -- rearranged, and a line with no Combat Power at all simply starts in roster order.
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, position_seq)
    select
      v_owner,
      v_round.id,
      m.id,
      m.combat_power,
      row_number() over (order by m.combat_power desc nulls last, m.created_at asc, m.id asc)
    from public.members m
    where m.line_id = p_line_id;
  end if;

  return v_round;
end;
$$;

-- ── set_round_order — the officer arranges the line by hand ──────────────────
create or replace function public.set_round_order(
  p_round_id    uuid,
  p_member_ids  uuid[]
)
returns public.rounds
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_round public.rounds;
begin
  select * into v_round
  from public.rounds
  where id = p_round_id and owner_id = v_owner
  -- FR-049: serialise against anything else touching this round.
  for update;

  if not found then
    raise exception 'GS001: round not found';
  end if;

  if v_round.status <> 'active' then
    raise exception 'GS009: this round is already complete';
  end if;

  -- The list must be exactly the round's members: an arrangement that quietly drops someone would
  -- take them out of the line, which is removal, not reordering.
  if (
    select count(*) from public.round_entries where round_id = p_round_id
  ) is distinct from array_length(p_member_ids, 1)
  or exists (
    select 1 from public.round_entries re
    where re.round_id = p_round_id and re.member_id <> all(p_member_ids)
  )
  or (
    select count(distinct x) from unnest(p_member_ids) x
  ) is distinct from array_length(p_member_ids, 1)
  then
    raise exception 'GS015: that order does not match the members in this round';
  end if;

  update public.round_entries re
  set position_seq = ordered.ord
  from (select x, ordinality as ord from unnest(p_member_ids) with ordinality x) ordered
  where re.round_id = p_round_id and re.member_id = ordered.x;

  -- ordering_mode still records how the round *started* (FR-022); this records that it no longer
  -- follows from that choice alone.
  update public.rounds set reordered_at = now() where id = p_round_id returning * into v_round;

  return v_round;
end;
$$;

-- ── start_distribution — the round now comes from the item's line ────────────
drop function public.start_distribution(uuid, uuid);

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

  -- The item is locked first because it names the line, and therefore the round. Nothing else
  -- locks items, so there is no path that takes these two in the opposite order.
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

  -- FR-049: serialise every mutation touching this round.
  select * into v_round
  from public.rounds
  where line_id = v_item.line_id and status = 'active'
  for update;

  if not found then
    raise exception 'GS001: there is no round in progress on this line';
  end if;

  if exists (
    select 1 from public.distributions
    where round_id = v_round.id and status = 'in_progress'
  ) then
    raise exception 'GS006: a distribution is already in progress';
  end if;

  insert into public.distributions (owner_id, round_id, item_id, item_name, client_action_id)
  values (v_owner, v_round.id, v_item.id, v_item.name, p_client_action_id);

  select * into v_dist from public.distributions where client_action_id = p_client_action_id
    and owner_id = v_owner;
  return v_dist;
end;
$$;

-- ── A member added mid-round joins that line's round ─────────────────────────
create or replace function public.enrol_member_in_active_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round public.rounds;
  v_pos   integer;
begin
  select * into v_round
  from public.rounds
  where line_id = new.line_id and status = 'active';

  if not found then
    return new;
  end if;

  if v_round.ordering_mode = 'manual'
     or v_round.reordered_at is not null
     or new.combat_power is null
  then
    -- Nothing to place them by — the order is the officer's, or the newcomer has no Combat Power —
    -- so they go to the back rather than somewhere guessed.
    v_pos := coalesce(
      (select max(position_seq) from public.round_entries where round_id = v_round.id), 0
    ) + 1;
  else
    -- FR-023: slot in by Combat Power, shifting everyone below them down one.
    select count(*) + 1 into v_pos
    from public.round_entries
    where round_id = v_round.id
      and ranked_cp is not null
      and ranked_cp >= new.combat_power;

    update public.round_entries
    set position_seq = position_seq + 1
    where round_id = v_round.id and position_seq >= v_pos;
  end if;

  insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, position_seq)
  values (new.owner_id, v_round.id, new.id, new.combat_power, v_pos);

  return new;
end;
$$;

-- ── Undo across a round boundary follows the line, not the account ───────────
create or replace function public.reopen_round_for_undo(p_round_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_round public.rounds;
  v_next  public.rounds;
begin
  select * into v_round from public.rounds where id = p_round_id;

  if v_round.status = 'active' then
    return;
  end if;

  select * into v_next
  from public.rounds
  where owner_id = v_owner
    and line_id = v_round.line_id
    and round_number > v_round.round_number
  order by round_number asc
  limit 1;

  if found then
    if exists (select 1 from public.distributions where round_id = v_next.id) then
      raise exception 'GS008: the next round has already started — reset the round instead';
    end if;
    delete from public.rounds where id = v_next.id;
  end if;

  update public.rounds
  set status = 'active', completed_at = null
  where id = p_round_id;
end;
$$;

-- ── Import lands in one line, and Combat Power is now optional ───────────────
drop function public.import_members(jsonb);

create function public.import_members(p_line_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner     uuid := auth.uid();
  v_row       jsonb;
  v_name      text;
  v_cp        integer;
  v_existing  public.members;
  v_inserted  integer := 0;
  v_updated   integer := 0;
  v_unchanged integer := 0;
begin
  if v_owner is null then
    raise exception 'GS006: not authenticated';
  end if;

  if not exists (select 1 from public.lines where id = p_line_id and owner_id = v_owner) then
    raise exception 'GS016: that line no longer exists';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'GS012: import payload must be a list of rows';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(v_row ->> 'name');
    v_cp   := nullif(v_row ->> 'combatPower', '')::integer;

    if v_name is null or v_name = '' or length(v_name) > 60 then
      raise exception 'GS013: invalid member name in import';
    end if;
    if v_cp is not null and v_cp < 0 then
      raise exception 'GS013: invalid Combat Power for %', v_name;
    end if;

    -- Match the way the line's unique index does, so "ASH" updates "Ash" rather than colliding.
    select * into v_existing
    from public.members
    where line_id = p_line_id and lower(btrim(name)) = lower(v_name);

    if found then
      if v_existing.combat_power is distinct from v_cp then
        -- FR-012/FR-018: this cannot reorder a round in progress. round_entries.ranked_cp is a
        -- snapshot, so the change surfaces as pending and lands at the start of the next round.
        update public.members set combat_power = v_cp where id = v_existing.id;
        v_updated := v_updated + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
    else
      -- FR-023: if a round is live, the members_join_active_round trigger enrols them, so
      -- importing mid-round adds people to the current line.
      insert into public.members (owner_id, line_id, name, combat_power)
      values (v_owner, p_line_id, v_name, v_cp);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged);
end;
$$;
