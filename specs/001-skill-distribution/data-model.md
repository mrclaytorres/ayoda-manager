# Phase 1 Data Model: Guild Item Loot Distribution

**Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Postgres, hosted by Supabase. Every rule that protects a spec invariant lives here rather than in
application code — see [R-005](./research.md#r-005-where-the-distribution-rules-are-enforced).

---

## Entity overview

| Table | Spec entity | Purpose |
|---|---|---|
| `profiles` | Guild Account | Guild name, keyed 1:1 to `auth.users` |
| `members` | Member | Roster: name + current Combat Power |
| `rounds` | Round | One full cycle; carries the ordering choice |
| `round_entries` | Round (order snapshot) | Frozen sequence + who has received this round |
| `distributions` | Distribution | One item being offered down the line |
| `items` | Item | Loot waiting to be handed out |
| `lines` | Line | One rotation: its own members, items, and rounds |
| `offer_responses` | Offer Response | Each pass / accept, in the order it happened |

```text
auth.users ──1:1── profiles
     │
     ├──1:N── members ──────────┐
     │                          │
     └──1:N── rounds ──1:N── round_entries
                 │
                 └──1:N── distributions ──1:N── offer_responses
```

---

## Enumerations

```sql
create type ordering_mode        as enum ('current_cp', 'carry_previous');
create type round_status         as enum ('active', 'complete');
create type distribution_status  as enum ('in_progress', 'awarded', 'unclaimed');
create type award_mode           as enum ('sequence', 'manual');
create type offer_response_kind  as enum ('pass', 'accept');
```

---

## Tables

### `profiles`

```sql
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  guild_name text not null default 'My Guild',
  created_at timestamptz not null default now(),
  constraint profiles_guild_name_len check (length(btrim(guild_name)) between 1 and 60)
);
```

Created by an `after insert` trigger on `auth.users`. Satisfies **FR-007** — this is the only
notion of a "user" in the system; guild members are never application users.

### `members`

```sql
create table members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  combat_power  integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint members_cp_non_negative check (combat_power >= 0),
  constraint members_name_len        check (length(btrim(name)) between 1 and 60)
);

create unique index members_owner_name_unique
  on members (owner_id, lower(btrim(name)));

create index members_owner_cp on members (owner_id, combat_power desc);
```

| Rule | Requirement |
|---|---|
| `combat_power >= 0`, integer type rejects non-numeric and negative; zero passes | **FR-010** |
| case-insensitive unique name per account | **FR-009** |
| `combat_power` freely updatable at any time | **FR-012** |

### `rounds`

```sql
create table rounds (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  round_number  integer not null,
  ordering_mode ordering_mode not null,
  status        round_status not null default 'active',
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  unique (owner_id, round_number),
  constraint rounds_completed_consistency check (
    (status = 'complete' and completed_at is not null) or
    (status = 'active'   and completed_at is null)
  )
);

create unique index rounds_one_active_per_owner
  on rounds (owner_id) where status = 'active';
```

`ordering_mode` records which choice produced this round's sequence — **FR-022**. The partial
unique index guarantees the app is never ambiguous about which round is live (**FR-038**,
[R-009](./research.md#r-009-when-the-next-round-is-created)).

### `round_entries`

```sql
create table round_entries (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  round_id     uuid not null references rounds(id)  on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  ranked_cp    integer not null,
  tiebreak_seq integer not null,
  received_at  timestamptz,
  unique (round_id, member_id),
  unique (round_id, tiebreak_seq)
);

create index round_entries_order
  on round_entries (round_id, ranked_cp desc, tiebreak_seq asc);
```

The heart of the model — see [R-006](./research.md#r-006-representing-the-round-order).

| Column | Role | Requirement |
|---|---|---|
| `ranked_cp` | CP snapshot taken at round start; never updated. Nullable | **FR-018**, **FR-010** |
| `position_seq` | the position itself, assigned at round start and rewritable | **FR-020**, **FR-063** |
| `received_at` | non-null means removed from the eligible line | **FR-028**, **FR-036** |

Ordering is **one key**, not two. It used to be `ORDER BY ranked_cp DESC, tiebreak_seq ASC`, which
cannot express "these people, in this order, for reasons the app does not know" — so a line with no
Combat Power at all had no order. `position_seq` is now the position: `current_cp` and `manual` both
assign it from the Combat Power ranking (unranked members last), `carry_previous` copies it, and
`set_round_order` rewrites it (**FR-063**). `ORDER BY position_seq, member_id` breaks the remaining
tie deterministically, which is why the column is **not** unique — shifting a block down by one to
make room for a mid-round joiner transiently duplicates a value.

There is deliberately **no stored "CP changed" flag**; pending-change is
`members.combat_power IS DISTINCT FROM round_entries.ranked_cp`, which makes **FR-021**
self-maintaining. A mid-round joiner gets `max(tiebreak_seq) + 1` and slots in by CP with no
renumbering (**FR-023**). `on delete cascade` from `members` removes a departed member from the
line (**FR-013**).

### `lines`

```sql
create table lines (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  constraint lines_name_len check (length(btrim(name)) between 1 and 60)
);

create unique index lines_owner_name_unique on lines (owner_id, lower(btrim(name)));
```

The account owns lines; a line owns everything else (**FR-057**). `members`, `items`, and `rounds`
all carry `line_id ... on delete cascade`, which is what makes **FR-060** a single delete.

Members are unique per line rather than per account (**FR-058**), and their `combat_power` is
nullable (**FR-010**) — a line ordered by hand may never fill it in. `members_cp_non_negative`
still holds either way: `null >= 0` is unknown, and a CHECK passes on unknown.

`rounds_one_active_per_line` replaces the old per-owner index, and `round_number` is unique per
line, so every line has its own Round 1 (**FR-061**).

### `items`

```sql
create table items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  seq        integer not null default 0,
  created_at timestamptz not null default now(),
  constraint items_name_len check (length(btrim(name)) between 1 and 120)
);

create index items_owner_seq on items (owner_id, seq, id);
```

The pool of loot waiting to be handed out (**FR-025**, **FR-050**). Deliberately **not** unique on
`(owner_id, name)`: two of the same item can drop in one night, and collapsing them would lose one.

`seq` is assigned by a `before insert` trigger, because a whole list inserted in one statement
shares `created_at` — `now()` is transaction time — and would otherwise come back shuffled.

There is **no status column**. What is still up for grabs is derived, for the reason in
[R-007](./research.md#r-007-whose-turn-it-is):

```sql
create view v_item_pool with (security_invoker = on) as
select i.id, i.owner_id, i.name, i.seq, i.created_at
from items i
where not exists (select 1 from distributions d where d.item_id = i.id);
```

Every way a distribution can be unwound then does the right thing for free: an undo reopens the
distribution, so the item stays claimed; `reset_round` deletes the round's distributions, so its
items return to the pool (**FR-054**). The one case the derivation gets wrong is history deletion —
the distributions cascade away and the items would reappear as if never handed out — so
`delete_round_history` deletes them explicitly.

### `distributions`

```sql
create table distributions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  round_id            uuid not null references rounds(id) on delete cascade,
  item_id             uuid references public.items (id) on delete set null,
  item_name           text not null,
  status              distribution_status not null default 'in_progress',
  recipient_member_id uuid references members(id) on delete set null,
  recipient_name      text,
  award_mode          award_mode,
  client_action_id    uuid not null,
  created_at          timestamptz not null default now(),
  closed_at           timestamptz,
  constraint distributions_item_name_len check (length(btrim(item_name)) between 1 and 120),
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

create unique index distributions_one_award_per_member_per_round
  on distributions (round_id, recipient_member_id)
  where status = 'awarded' and recipient_member_id is not null;

create unique index distributions_one_in_progress_per_round
  on distributions (round_id) where status = 'in_progress';

create unique index distributions_client_action
  on distributions (owner_id, client_action_id);

create index distributions_round_created on distributions (round_id, created_at desc);
```

| Index / constraint | Requirement |
|---|---|
| one award per member per round — a race cannot beat it | **FR-033**, **FR-036**, **SC-004** |
| one in-progress distribution per round | keeps the live screen unambiguous |
| `client_action_id` unique — a retry is a no-op | **FR-048** |
| `item_name` non-blank | **FR-025** |
| one distribution per item | **FR-052** |

`distributions_awarded_shape` deliberately asserts on `recipient_name`, **not** on
`recipient_member_id`. `ON DELETE SET NULL` fires as an `UPDATE`, so a check requiring a non-null
`recipient_member_id` would make deleting a member fail outright — see
[R-011](./research.md#r-011-preserving-history-when-a-member-is-deleted). The name snapshot keeps
the history readable after the member is gone (**FR-014**).

### `offer_responses`

```sql
create table offer_responses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  distribution_id  uuid not null references distributions(id) on delete cascade,
  member_id        uuid references members(id) on delete set null,
  member_name      text not null,
  kind             offer_response_kind not null,
  seq              integer not null,
  client_action_id uuid not null,
  created_at       timestamptz not null default now(),
  unique (distribution_id, seq)
);

create unique index offer_responses_client_action
  on offer_responses (owner_id, client_action_id);

create unique index offer_responses_one_per_member_per_distribution
  on offer_responses (distribution_id, member_id) where member_id is not null;
```

`seq` gives the response order (**FR-041**) and makes "the most recent action" unambiguous for
undo (**FR-035**). The partial unique index stops the same member being asked twice within one
distribution.

---

## Derived views

Both views are `security_invoker` so that the base tables' RLS applies to the caller. Omitting
this would run the view as its owner and bypass isolation entirely —
[R-010](./research.md#r-010-tenancy-and-isolation).

### `v_round_line` — the line as displayed

```sql
create view v_round_line
with (security_invoker = on) as
select
  re.round_id,
  re.member_id,
  m.name,
  re.ranked_cp,
  m.combat_power                                  as current_cp,
  (m.combat_power is distinct from re.ranked_cp)  as cp_change_pending,
  re.received_at,
  (re.received_at is null)                        as eligible,
  row_number() over w                             as position,
  count(*) over (partition by re.round_id, re.ranked_cp) > 1 as tied,
  (
    select d.item_name from distributions d
     where d.round_id = re.round_id
       and d.recipient_member_id = re.member_id
       and d.status = 'awarded'
  )                                               as received_item
from round_entries re
join members m on m.id = re.member_id
window w as (partition by re.round_id order by re.ranked_cp desc, re.tiebreak_seq asc);
```

Serves **FR-015**, **FR-017**, **FR-019**, **FR-024**, **FR-039**, and **FR-056**.

`received_item` can match at most one row — `distributions_one_award_per_member_per_round` is a
unique index over exactly that pair — and is non-null precisely when `eligible` is false, because an
award is the only thing that sets `received_at` and undo and reset clear both together.

### `v_current_offer` — whose turn it is

```sql
create view v_current_offer
with (security_invoker = on) as
select distinct on (d.id)
  d.id as distribution_id,
  l.member_id,
  l.name,
  l.position
from distributions d
join v_round_line l on l.round_id = d.round_id and l.eligible
left join offer_responses r
       on r.distribution_id = d.id and r.member_id = l.member_id
where d.status = 'in_progress' and r.id is null
order by d.id, l.position;
```

Never stored, always derived — which is what makes undo a delete
([R-007](./research.md#r-007-deriving-the-current-offer-holder)). Serves **FR-026**, **FR-030**.

---

## Row Level Security

Applied to all six tables. `profiles` keys on `id`; the rest key on `owner_id`.

```sql
alter table members        enable row level security;
alter table rounds         enable row level security;
alter table round_entries  enable row level security;
alter table distributions  enable row level security;
alter table offer_responses enable row level security;
alter table profiles       enable row level security;

-- repeated per table, with `id` in place of `owner_id` for profiles
create policy members_select on members for select
  using (owner_id = (select auth.uid()));
create policy members_insert on members for insert
  with check (owner_id = (select auth.uid()));
create policy members_update on members for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy members_delete on members for delete
  using (owner_id = (select auth.uid()));
```

`(select auth.uid())` rather than a bare `auth.uid()` is deliberate: the scalar subquery is
evaluated once as an InitPlan instead of once per row. Satisfies **FR-005**, **FR-006**, **SC-006**.

---

## State transitions

### Round

```text
                  officer picks ordering_mode
   (none) ─────────────────────────────────────► active
                                                   │
                        last round_entry.received_at set
                                                   ▼
                                                complete ──► (next round: officer picks again)
```

`active → active` on manual reset (**FR-040**): all `received_at` cleared, distributions for the
round deleted, `round_number` unchanged.

**Completion has two triggers, not one.** The award path above is the common one. The second is an
`after delete` trigger on `round_entries`: removing the last member who had not yet received an item
must complete the round rather than leave it active with an empty line. Without it, a roster
deletion can strand a round permanently — the officer can start a distribution, but `v_current_offer`
returns nothing and no action can advance it. See **FR-037** and
[contracts/rpc.md](./contracts/rpc.md#round-completion-has-two-paths-not-one).

A completed round can be destroyed outright by `delete_round_history`, which cascades to
`round_entries`, `distributions`, and `offer_responses`. `round_number` is not reused afterwards —
the next round continues from the previous high-water mark (**FR-044**).

### Distribution

```text
                                    record_award(mode = 'sequence' | 'manual')
   in_progress ───────────────────────────────────────────────────────────► awarded
        │  ▲                                                                   │
        │  │ record_pass  (appends offer_response, holder recomputes)          │
        │  └───────────────────────────────────────────────────────────       │
        │                                                                      │
        │  close_unclaimed                                       undo_last_action
        └──────────────────────────────► unclaimed ◄────────────────────────────┘
```

- `awarded` sets `round_entries.received_at` for the recipient — **FR-028**, **FR-032**.
- `unclaimed` sets no `received_at`; the line is untouched — **FR-034**.
- `undo_last_action` returns `awarded` or `unclaimed` to `in_progress`, or removes the last pass.
  Across a round boundary it rolls back the next round only when that round is still empty —
  [R-008](./research.md#r-008-undo-across-a-round-boundary).

---

## Validation rules, consolidated

| Rule | Enforced by | Requirement |
|---|---|---|
| Member name unique per account, case-insensitive | unique index on `lower(btrim(name))` | FR-009 |
| Member name 1–60 chars after trim | check constraint + Zod | FR-008 |
| CP integer, `>= 0`; zero allowed | check constraint + Zod | FR-010 |
| Item name 1–120 chars after trim | check constraint + Zod | FR-025 |
| One award per member per round | partial unique index | FR-033, FR-036 |
| One in-progress distribution per round | partial unique index | — |
| One active round per account | partial unique index | FR-038 |
| One response per member per distribution | partial unique index | FR-030 |
| Retry-safe writes | `client_action_id` unique indexes | FR-048 |
| Cross-account isolation | RLS on every table, `security_invoker` views | FR-005, SC-006 |
| Current round never re-sorts | `ranked_cp` snapshot, never updated | FR-018 |
| Round completes when the last eligible entry disappears | `after delete` trigger on `round_entries` | FR-037 |
| History deletion requires a literal `YES` | checked inside `delete_round_history`, not in the UI | FR-046 |
| The active round can never be deleted | `GS011` guard in `delete_round_history` | FR-045 |
