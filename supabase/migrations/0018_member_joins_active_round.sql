-- T079 — a member added mid-round joins the current round. FR-023.
-- They get max(tiebreak_seq) + 1 and slot in by Combat Power, so nobody is renumbered.

create or replace function public.enrol_member_in_active_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_id uuid;
begin
  select id into v_round_id
  from public.rounds
  where owner_id = new.owner_id and status = 'active';

  if v_round_id is not null then
    insert into public.round_entries (owner_id, round_id, member_id, ranked_cp, tiebreak_seq)
    values (
      new.owner_id,
      v_round_id,
      new.id,
      new.combat_power,
      coalesce((select max(tiebreak_seq) from public.round_entries where round_id = v_round_id), 0) + 1
    );
  end if;

  return new;
end;
$$;

create trigger members_join_active_round
  after insert on public.members
  for each row execute function public.enrol_member_in_active_round();
