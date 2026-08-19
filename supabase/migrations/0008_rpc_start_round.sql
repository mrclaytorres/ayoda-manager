-- T038 — start_round. FR-016, FR-017, FR-020, FR-021, FR-022, FR-038.
-- SECURITY INVOKER (the default) so RLS applies: an RPC is not a way around isolation.
-- `set search_path = ''` so a caller-controlled search_path cannot resolve an identifier to
-- something of their choosing.

create or replace function public.start_round(p_ordering_mode public.ordering_mode)
returns public.rounds
language plpgsql
set search_path = ''
as $$
declare
  v_owner    uuid := auth.uid();
  v_prev     public.rounds;
  v_round    public.rounds;
  v_next_num integer;
begin
  if v_owner is null then
    raise exception 'GS006: not authenticated';
  end if;

  if not exists (select 1 from public.members where owner_id = v_owner) then
    raise exception 'GS002: add at least one member before starting a round';
  end if;

  if exists (select 1 from public.rounds where owner_id = v_owner and status = 'active') then
    raise exception 'GS009: a round is already in progress';
  end if;

  select * into v_prev
  from public.rounds
  where owner_id = v_owner
  order by round_number desc
  limit 1;

  -- round_number never reuses a deleted round's number: it continues from the high-water mark.
  v_next_num := coalesce(v_prev.round_number, 0) + 1;

  insert into public.rounds (owner_id, round_number, ordering_mode)
  values (v_owner, v_next_num, p_ordering_mode)
  returning * into v_round;

  if p_ordering_mode = 'current_cp' or v_prev.id is null then
    -- Snapshot current Combat Power. Ties resolve by the older roster entry, then id.
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, tiebreak_seq)
    select
      v_owner,
      v_round.id,
      m.id,
      m.combat_power,
      row_number() over (order by m.combat_power desc, m.created_at asc, m.id asc)
    from public.members m
    where m.owner_id = v_owner;
  else
    -- Carry the previous sequence for members still on the roster...
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, tiebreak_seq)
    select v_owner, v_round.id, pe.member_id, pe.ranked_cp, pe.tiebreak_seq
    from public.round_entries pe
    join public.members m on m.id = pe.member_id
    where pe.round_id = v_prev.id;

    -- ...and append anyone who joined since, past the current maximum.
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, tiebreak_seq)
    select
      v_owner,
      v_round.id,
      m.id,
      m.combat_power,
      coalesce((select max(tiebreak_seq) from public.round_entries where round_id = v_round.id), 0)
        + row_number() over (order by m.combat_power desc, m.created_at asc, m.id asc)
    from public.members m
    where m.owner_id = v_owner
      and not exists (
        select 1 from public.round_entries re
        where re.round_id = v_round.id and re.member_id = m.id
      );
  end if;

  return v_round;
end;
$$;
