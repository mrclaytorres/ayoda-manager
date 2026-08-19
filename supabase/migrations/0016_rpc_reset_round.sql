-- T060 — reset_round. FR-040.
-- Restarts the round; it does not re-rank it. round_number, ranked_cp, and tiebreak_seq survive.

create or replace function public.reset_round(p_round_id uuid)
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
  for update;

  if not found then
    raise exception 'GS001: round not found';
  end if;

  delete from public.distributions where round_id = p_round_id;

  update public.round_entries
  set received_at = null
  where round_id = p_round_id;

  update public.rounds
  set status = 'active', completed_at = null
  where id = p_round_id
  returning * into v_round;

  return v_round;
end;
$$;
