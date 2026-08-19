-- T013: the guild roster. FR-008, FR-009, FR-010, FR-012.

create table public.members (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  combat_power integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- FR-010: zero is a legitimate Combat Power; negative is not.
  constraint members_cp_non_negative check (combat_power >= 0),
  constraint members_name_len        check (length(btrim(name)) between 1 and 60)
);

-- FR-009: names are unique per account, case-insensitively.
create unique index members_owner_name_unique
  on public.members (owner_id, lower(btrim(name)));

create index members_owner_cp on public.members (owner_id, combat_power desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_touch_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();
