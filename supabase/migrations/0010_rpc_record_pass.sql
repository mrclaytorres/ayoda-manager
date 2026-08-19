-- T040 — record_pass. FR-029, FR-030.
-- p_member_id is supplied by the caller and checked against the computed holder. That check is the
-- concurrency guard: a second device showing a stale line names the wrong member and is rejected
-- rather than quietly applied to whoever happens to be first now.

create or replace function public.record_pass(
  p_distribution_id  uuid,
  p_member_id        uuid,
  p_client_action_id uuid
)
returns public.offer_responses
language plpgsql
set search_path = ''
as $$
declare
  v_owner  uuid := auth.uid();
  v_resp   public.offer_responses;
  v_dist   public.distributions;
  v_holder uuid;
  v_name   text;
  v_seq    integer;
begin
  select * into v_resp
  from public.offer_responses
  where owner_id = v_owner and client_action_id = p_client_action_id;
  if found then
    return v_resp;
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

  select member_id into v_holder
  from public.v_current_offer
  where distribution_id = p_distribution_id;

  if v_holder is null or v_holder <> p_member_id then
    raise exception 'GS003: that member is not the current offer holder';
  end if;

  select name into v_name from public.members where id = p_member_id;
  select coalesce(max(seq), 0) + 1 into v_seq
  from public.offer_responses where distribution_id = p_distribution_id;

  insert into public.offer_responses
    (owner_id, distribution_id, member_id, member_name, kind, seq, client_action_id)
  values
    (v_owner, p_distribution_id, p_member_id, v_name, 'pass', v_seq, p_client_action_id)
  returning * into v_resp;

  return v_resp;
end;
$$;
