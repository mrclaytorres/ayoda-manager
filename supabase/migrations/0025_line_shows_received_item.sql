-- The line and the roster say *what* a member received, not just that they did.
--
-- Appended to the end of the column list: CREATE OR REPLACE VIEW can only add columns there, and
-- v_current_offer selects from this view.

create or replace view public.v_round_line
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
  (count(*) over (partition by re.round_id, re.ranked_cp) > 1) as tied,
  -- At most one row can match: distributions_one_award_per_member_per_round is a unique index over
  -- exactly this pair. Non-null precisely when the member is no longer eligible, because an award
  -- is the only thing that sets received_at, and undo and reset clear both together.
  (
    select d.item_name
    from public.distributions d
    where d.round_id            = re.round_id
      and d.recipient_member_id = re.member_id
      and d.status              = 'awarded'
  )                                              as received_item
from public.round_entries re
join public.members m on m.id = re.member_id;
