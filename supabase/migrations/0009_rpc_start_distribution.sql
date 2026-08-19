-- T039 — start_distribution. FR-025, FR-048, FR-049.

create or replace function public.start_distribution(
  p_skill_name       text,
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
  v_name  text := btrim(p_skill_name);
begin
  -- FR-048: an identical retry returns the original row and creates nothing.
  select * into v_dist
  from public.distributions
  where owner_id = v_owner and client_action_id = p_client_action_id;
  if found then
    return v_dist;
  end if;

  if v_name = '' then
    raise exception 'GS001: a skill name is required';
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

  insert into public.distributions (owner_id, round_id, skill_name, client_action_id)
  values (v_owner, v_round.id, v_name, p_client_action_id)
  returning * into v_dist;

  return v_dist;
end;
$$;
