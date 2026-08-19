-- delete_round_history has to take the items with it now.
--
-- Availability is derived from distributions.item_id, and deleting a round cascades its
-- distributions away — so without this the officer would wipe last week's history and watch every
-- item they already handed out reappear in the pool as if it had never been given.

create or replace function public.delete_round_history(
  p_round_ids    uuid[],
  p_confirmation text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_owner   uuid := auth.uid();
  v_deleted integer;
begin
  -- Byte-for-byte. No btrim, no upper(): "yes", " YES ", and "Y" are all refusals, because the
  -- officer was told to type YES and a guard that quietly accepts near-misses is not a guard.
  if p_confirmation is distinct from 'YES' then
    raise exception 'GS010: type YES exactly to confirm — nothing was deleted';
  end if;

  -- FR-045: resetting a live round is reset_round's job; deleting it is never right.
  if exists (
    select 1 from public.rounds
    where id = any(p_round_ids) and owner_id = v_owner and status = 'active'
  ) then
    raise exception 'GS011: the round in progress cannot be deleted — reset it instead';
  end if;

  delete from public.items i
  where i.owner_id = v_owner
    and exists (
      select 1
      from public.distributions d
      join public.rounds r on r.id = d.round_id
      where d.item_id = i.id
        and r.id = any(p_round_ids)
        and r.owner_id = v_owner
        and r.status = 'complete'
    );

  -- Ids matching no round are ignored rather than raising: another device may already have
  -- deleted them, and the caller's intent is satisfied either way.
  -- round_entries, distributions, and offer_responses cascade. members are untouched, and
  -- round_number is never reused because start_round continues from the high-water mark.
  with removed as (
    delete from public.rounds
    where id = any(p_round_ids) and owner_id = v_owner and status = 'complete'
    returning 1
  )
  select count(*) into v_deleted from removed;

  return v_deleted;
end;
$$;
