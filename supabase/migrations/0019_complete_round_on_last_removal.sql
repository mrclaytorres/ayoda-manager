-- T080 — the stranded-round fix. FR-037.
--
-- Round completion is reachable two ways, not one. record_award handles the last award; this
-- handles the other: removing the last member who had not yet received a skill.
--
-- Without this, deleting that member cascades their round_entries row away and leaves the round
-- `active` with zero eligible members. The officer can still start a distribution, but
-- v_current_offer returns nothing and no action can advance it — the round is stranded with no way
-- forward. The spec requires it to complete "immediately rather than stalling with an empty line".

create or replace function public.complete_round_if_emptied()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only meaningful while the round is still live; a cascade from deleting the round itself is
  -- not our business.
  if exists (select 1 from public.rounds where id = old.round_id and status = 'active') then
    perform public.maybe_complete_round(old.round_id);
  end if;
  return old;
end;
$$;

create trigger round_entries_complete_on_empty
  after delete on public.round_entries
  for each row execute function public.complete_round_if_emptied();
