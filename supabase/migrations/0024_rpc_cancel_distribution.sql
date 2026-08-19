-- Backing out of a distribution that was started on the wrong item (FR-055).
--
-- A delete, not a status: the pool is derived from `distributions.item_id`, so removing the row is
-- exactly what puts the item back on the shelf. `offer_responses` cascades with it, which is why
-- the interface asks first when any have been recorded — the officer is discarding them.
--
-- This is not `close_unclaimed`. Unclaimed means the item was offered and nobody took it, and it
-- belongs in the history. Cancelling means the distribution should never have started.

create or replace function public.cancel_distribution(p_distribution_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_dist  public.distributions;
begin
  select d.* into v_dist
  from public.distributions d
  join public.rounds r on r.id = d.round_id
  where d.id = p_distribution_id and d.owner_id = v_owner
  -- FR-049: serialise against anything else touching this round.
  for update of r;

  -- Already gone. A retry of a delete has got what it asked for, so this is a success — the same
  -- reasoning delete_round_history applies to ids that match no round (FR-048).
  if not found then
    return;
  end if;

  if v_dist.status <> 'in_progress' then
    raise exception 'GS006: this distribution has already been settled';
  end if;

  delete from public.distributions where id = p_distribution_id;
end;
$$;
