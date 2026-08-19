-- T041 — record_award. FR-027, FR-028, FR-031, FR-032, FR-033, FR-036, FR-037.

-- Round completion is reachable two ways: the last award (here) and the removal of the last
-- eligible member (migration 0019). Both funnel through this helper so the rule lives in one place.
create or replace function public.maybe_complete_round(p_round_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $fn$
declare
  v_eligible integer;
begin
  select count(*) into v_eligible
  from public.round_entries
  where round_id = p_round_id and received_at is null;

  if v_eligible = 0 then
    update public.rounds
    set status = 'complete', completed_at = coalesce(completed_at, now())
    where id = p_round_id and status = 'active';
    return true;
  end if;

  return false;
end;
$fn$;

create or replace function public.record_award(
  p_distribution_id  uuid,
  p_member_id        uuid,
  p_mode             public.award_mode,
  p_client_action_id uuid
)
returns public.distributions
language plpgsql
set search_path = ''
as $$
declare
  v_owner  uuid := auth.uid();
  v_dist   public.distributions;
  v_entry  public.round_entries;
  v_holder uuid;
  v_name   text;
  v_seq    integer;
begin
  select * into v_dist
  from public.distributions
  where owner_id = v_owner and client_action_id = p_client_action_id and status = 'awarded';
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

  select * into v_entry
  from public.round_entries
  where round_id = v_dist.round_id and member_id = p_member_id;

  if not found then
    raise exception 'GS005: that member is not taking part in this round';
  end if;

  -- FR-033, FR-036. The partial unique index also enforces this, so a race cannot beat it; this
  -- check exists to return a useful code rather than a constraint violation.
  if v_entry.received_at is not null then
    raise exception 'GS004: that member has already received a skill this round';
  end if;

  if p_mode = 'sequence' then
    select member_id into v_holder
    from public.v_current_offer
    where distribution_id = p_distribution_id;

    if v_holder is null or v_holder <> p_member_id then
      raise exception 'GS003: that member is not the current offer holder';
    end if;
  end if;
  -- FR-031: a manual award needs no such check — any eligible member, at any point, including
  -- after everyone has passed.

  select name into v_name from public.members where id = p_member_id;

  -- Only record an acceptance if this member has not already responded to this distribution
  -- (a manual award may follow their own pass).
  if not exists (
    select 1 from public.offer_responses
    where distribution_id = p_distribution_id and member_id = p_member_id
  ) then
    select coalesce(max(seq), 0) + 1 into v_seq
    from public.offer_responses where distribution_id = p_distribution_id;

    insert into public.offer_responses
      (owner_id, distribution_id, member_id, member_name, kind, seq, client_action_id)
    values
      (v_owner, p_distribution_id, p_member_id, v_name, 'accept', v_seq, p_client_action_id);
  end if;

  update public.round_entries
  set received_at = now()
  where round_id = v_dist.round_id and member_id = p_member_id;

  update public.distributions
  set status              = 'awarded',
      recipient_member_id = p_member_id,
      recipient_name      = v_name,
      award_mode          = p_mode,
      closed_at           = now()
  where id = p_distribution_id
  returning * into v_dist;

  -- FR-037: complete the round if that was the last eligible member. No new round is created —
  -- the officer chooses the next ordering.
  perform public.maybe_complete_round(v_dist.round_id);

  return v_dist;
end;
$$;
