-- T015: distributions and the response log.

create table public.distributions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_id            uuid not null references public.rounds (id) on delete cascade,
  skill_name          text not null,
  status              public.distribution_status not null default 'in_progress',
  -- FR-014: nulled when a member is deleted, but recipient_name keeps the history readable.
  recipient_member_id uuid references public.members (id) on delete set null,
  recipient_name      text,
  award_mode          public.award_mode,
  client_action_id    uuid not null,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz,
  constraint distributions_skill_name_len check (length(btrim(skill_name)) between 1 and 120),
  -- Asserts on recipient_name, NOT recipient_member_id: ON DELETE SET NULL fires as an UPDATE and
  -- would fail a check that required the member id to be present.
  constraint distributions_awarded_shape check (
    (status = 'awarded'
       and recipient_name is not null
       and award_mode     is not null
       and closed_at      is not null)
    or
    (status <> 'awarded'
       and recipient_name      is null
       and recipient_member_id is null
       and award_mode          is null)
  )
);

-- FR-033, FR-036, SC-004: a race cannot award two skills to one member in one round.
create unique index distributions_one_award_per_member_per_round
  on public.distributions (round_id, recipient_member_id)
  where status = 'awarded' and recipient_member_id is not null;

create unique index distributions_one_in_progress_per_round
  on public.distributions (round_id) where status = 'in_progress';

-- FR-048: replaying a write with the same id is a no-op, so a retry cannot duplicate.
create unique index distributions_client_action
  on public.distributions (owner_id, client_action_id);

create index distributions_round_created on public.distributions (round_id, created_at desc);
create index distributions_recipient on public.distributions (recipient_member_id);

create table public.offer_responses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  distribution_id  uuid not null references public.distributions (id) on delete cascade,
  member_id        uuid references public.members (id) on delete set null,
  member_name      text not null,
  kind             public.offer_response_kind not null,
  seq              integer not null,
  client_action_id uuid not null,
  created_at       timestamptz not null default now(),
  unique (distribution_id, seq)
);

create unique index offer_responses_client_action
  on public.offer_responses (owner_id, client_action_id);

-- A member is asked at most once per distribution.
create unique index offer_responses_one_per_member_per_distribution
  on public.offer_responses (distribution_id, member_id) where member_id is not null;

create index offer_responses_member on public.offer_responses (member_id);
