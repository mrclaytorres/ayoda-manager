-- T042 — close_unclaimed. FR-034.
-- Removes nobody from the line and leaves the round position untouched.

create or replace function public.close_unclaimed(
  p_distribution_id  uuid,
  p_client_action_id uuid
)
returns public.distributions
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_dist  public.distributions;
begin
  select * into v_dist
  from public.distributions
  where owner_id = v_owner and client_action_id = p_client_action_id and status = 'unclaimed';
  if found then
    return v_dist;
  end if;

  select d.* into v_dist
  from public.distributions d
  join public.rounds r on r.id = d.round_id
  where d.id = p_distribution_id and d.owner_id = v_owner
  for update of r;

  if not found then
    raise exception 'GS006: distribution not found';
  end if;

  if v_dist.status <> 'in_progress' then
    raise exception 'GS006: this distribution has already been settled';
  end if;

  update public.distributions
  set status = 'unclaimed', closed_at = now()
  where id = p_distribution_id
  returning * into v_dist;

  return v_dist;
end;
$$;
