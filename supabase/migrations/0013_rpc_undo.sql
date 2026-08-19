-- T043 — undo_last_action. FR-035.
-- Undo is cheap because "whose turn it is" is derived, not stored: deleting the last response is
-- enough for the offer holder to recompute itself. There is no pointer to rewind.

create or replace function public.undo_last_action(p_distribution_id uuid)
returns public.distributions
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_dist  public.distributions;
  v_last  public.offer_responses;
begin
  select d.* into v_dist
  from public.distributions d
  join public.rounds r on r.id = d.round_id
  where d.id = p_distribution_id and d.owner_id = v_owner
  for update of r;

  if not found then
    raise exception 'GS006: distribution not found';
  end if;

  if v_dist.status = 'awarded' then
    -- Reopen: clear the recipient, put them back in the line, drop the acceptance.
    update public.round_entries
    set received_at = null
    where round_id = v_dist.round_id and member_id = v_dist.recipient_member_id;

    delete from public.offer_responses
    where distribution_id = p_distribution_id
      and member_id = v_dist.recipient_member_id
      and kind = 'accept';

    update public.distributions
    set status              = 'in_progress',
        recipient_member_id = null,
        recipient_name      = null,
        award_mode          = null,
        closed_at           = null
    where id = p_distribution_id
    returning * into v_dist;

    -- The award may have completed the round. Reopen it, and roll back a next round if one was
    -- started but has seen no activity yet.
    perform public.reopen_round_for_undo(v_dist.round_id);
    return v_dist;
  end if;

  if v_dist.status = 'unclaimed' then
    update public.distributions
    set status = 'in_progress', closed_at = null
    where id = p_distribution_id
    returning * into v_dist;
    return v_dist;
  end if;

  -- Still in progress: undo the most recent pass.
  select * into v_last
  from public.offer_responses
  where distribution_id = p_distribution_id
  order by seq desc
  limit 1;

  if not found then
    raise exception 'GS007: there is nothing left to undo';
  end if;

  delete from public.offer_responses where id = v_last.id;
  return v_dist;
end;
$$;

-- FR-035 across a round boundary (research R-008). Undoing the round-completing award must
-- reopen the round; if the officer already started the next one, that is only rolled back when it
-- holds no distributions. Cascading through a round with real activity would destroy records
-- nobody asked to lose, so that case is refused instead.
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
  where owner_id = v_owner and round_number > v_round.round_number
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
