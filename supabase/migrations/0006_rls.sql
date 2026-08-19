-- T016: row level security. FR-005, FR-006, SC-006.
-- `(select auth.uid())` rather than a bare `auth.uid()` so the planner evaluates it once as an
-- InitPlan instead of once per row.

alter table public.profiles        enable row level security;
alter table public.members         enable row level security;
alter table public.rounds          enable row level security;
alter table public.round_entries   enable row level security;
alter table public.distributions   enable row level security;
alter table public.offer_responses enable row level security;

create policy profiles_select on public.profiles for select
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array['members', 'rounds', 'round_entries', 'distributions', 'offer_responses']
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update using (owner_id = (select auth.uid())) '
      'with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete using (owner_id = (select auth.uid()))', t);
  end loop;
end;
$$;
