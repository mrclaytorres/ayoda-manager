-- T012: one profile per auth user. FR-007 — the account holder is the only application user.

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  guild_name text not null default 'My Guild',
  created_at timestamptz not null default now(),
  constraint profiles_guild_name_len check (length(btrim(guild_name)) between 1 and 60)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
