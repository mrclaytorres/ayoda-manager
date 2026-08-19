-- T017: derived read models.
-- security_invoker = on is load-bearing: without it a view runs as its owner and silently
-- bypasses RLS on its base tables, which is exactly the leak SC-006 forbids.

create view public.v_round_line
with (security_invoker = on) as
select
  re.round_id,
  re.owner_id,
  re.member_id,
  m.name,
  re.ranked_cp,
  m.combat_power                                 as current_cp,
  -- FR-019/FR-021: derived, so it clears itself when a new round adopts the new value and leaves
  -- no residue if a CP is edited and edited back.
  (m.combat_power is distinct from re.ranked_cp) as cp_change_pending,
  re.received_at,
  (re.received_at is null)                       as eligible,
  row_number() over (
    partition by re.round_id
    order by re.ranked_cp desc, re.tiebreak_seq asc
  )                                              as position,
  -- FR-017: surface the tie so the officer can settle it by guild convention.
  (count(*) over (partition by re.round_id, re.ranked_cp) > 1) as tied
from public.round_entries re
join public.members m on m.id = re.member_id;

-- FR-026: whose turn it is, never stored. Deriving it is what makes undo a delete.
create view public.v_current_offer
with (security_invoker = on) as
select distinct on (d.id)
  d.id       as distribution_id,
  d.owner_id,
  l.member_id,
  l.name,
  l.position
from public.distributions d
join public.v_round_line l
  on l.round_id = d.round_id and l.eligible
left join public.offer_responses r
  on r.distribution_id = d.id and r.member_id = l.member_id
where d.status = 'in_progress' and r.id is null
order by d.id, l.position;
