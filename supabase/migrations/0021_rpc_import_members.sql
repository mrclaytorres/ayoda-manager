-- Bulk roster import. FR-008, FR-009, FR-010, FR-012.
--
-- One transaction for the whole file: either the roster ends up matching the import or nothing
-- changed. A partial import would leave the officer guessing which half landed.
--
-- Add and update only — never remove. A member on the roster but absent from the file is left
-- alone, because removing someone completes rounds and drops them from the line, and that is a
-- deliberate act with its own confirmation rather than a side effect of importing a file.

create or replace function public.import_members(p_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_owner     uuid := auth.uid();
  v_row       jsonb;
  v_name      text;
  v_cp        integer;
  v_existing  public.members;
  v_inserted  integer := 0;
  v_updated   integer := 0;
  v_unchanged integer := 0;
begin
  if v_owner is null then
    raise exception 'GS006: not authenticated';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'GS012: import payload must be a list of rows';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(v_row ->> 'name');
    v_cp   := (v_row ->> 'combatPower')::integer;

    if v_name is null or v_name = '' or length(v_name) > 60 then
      raise exception 'GS013: invalid member name in import';
    end if;
    if v_cp is null or v_cp < 0 then
      raise exception 'GS013: invalid Combat Power for %', v_name;
    end if;

    -- Match the way the roster's unique index does, so "ASH" updates "Ash" rather than colliding.
    select * into v_existing
    from public.members
    where owner_id = v_owner and lower(btrim(name)) = lower(v_name);

    if found then
      if v_existing.combat_power is distinct from v_cp then
        -- FR-012/FR-018: this cannot reorder a round in progress. round_entries.ranked_cp is a
        -- snapshot, so the change surfaces as pending and lands at the start of the next round.
        update public.members
        set combat_power = v_cp
        where id = v_existing.id;
        v_updated := v_updated + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
    else
      -- FR-023: if a round is live, the members_join_active_round trigger enrols them at
      -- max(tiebreak_seq) + 1, so importing mid-round adds people to the current line.
      insert into public.members (owner_id, name, combat_power)
      values (v_owner, v_name, v_cp);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted',  v_inserted,
    'updated',   v_updated,
    'unchanged', v_unchanged
  );
end;
$$;

comment on function public.import_members(jsonb) is
  'Bulk roster import: adds new members and updates the Combat Power of existing ones, matched '
  'case-insensitively. Never removes. Runs in one transaction so a failed row rolls the whole '
  'import back.';
