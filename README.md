# aYoda Manager

Round-robin item loot distribution for an RF Online Next guild. One officer pools the night's loot,
then records who passes and who takes each item, down a line ranked by Combat Power — or arranged by
hand; when everyone has received one, the round resets.

An account runs as many lines as it needs at once. A line is one rotation with its own members, its
own item pool, and its own round numbering, so weapons and armour can be handed out side by side
without an award on one taking someone out of the other.

Built to the specification in [`specs/001-skill-distribution/`](specs/001-skill-distribution/).
Going live is [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres + Auth).

## Getting started

```bash
npm install
supabase start                # prints the API URL and keys
cp .env.example .env.local    # fill in from that output
supabase db reset             # apply supabase/migrations/
npm run dev                   # http://localhost:3000
```

## Commands

| Command                                 | What it does                                       |
| --------------------------------------- | -------------------------------------------------- |
| `npm run dev`                           | Dev server                                         |
| `npm run build`                         | Production build                                   |
| `npm test`                              | Unit tests (pure domain logic)                     |
| `npm run test:integration`              | Integration tests against the local Supabase stack |
| `npm run test:e2e`                      | Playwright, 360 px viewport                        |
| `npm run typecheck` / `npm run lint`    | `tsc --noEmit` / ESLint                            |
| `npm run db:reset` / `npm run db:types` | Rebuild the local DB / regenerate types            |

## Importing a roster

The roster screen has an **Import CSV** control. It takes a file with a name and a Combat Power per
line:

```csv
ign,combat_power
LaLlorona,120993
Atherine,111153
```

- The first column may be headed `ign` or `name`, the second `combat_power`, `cp`, or `power`. A
  file with no header row is read as data.
- Windows CRLF endings, an Excel BOM, quoted fields, and thousands separators (`"120,993"`) are all
  accepted.
- Members already on the roster are matched **case-insensitively** and have their Combat Power
  updated. Members absent from the file are left alone — **import never removes anyone**.
- Rows that cannot be accepted (blank, negative, or non-numeric Combat Power; missing name;
  duplicate within the file) are listed with their line number and skipped.
- You see a preview of exactly what will change before anything is written, and the whole import
  runs in one transaction — either it all lands or none of it does.
- Importing mid-round is safe: new members join the current line by Combat Power, and updated
  Combat Power does not reorder the round in progress (it applies from the next one).

## How it is put together

**The rules live in Postgres, not in TypeScript.** A member must never receive two items in one
round, two devices must not double-log, a retry after a dropped connection must not duplicate, and
no account may ever see another's data. Each of those is a constraint or a row lock inside a
`SECURITY INVOKER` function under `supabase/migrations/`. The Server Actions in `lib/actions/` call
those functions; they do not re-implement the rules.

Two modelling choices carry most of the design:

- **The round order is a snapshot.** `round_entries(ranked_cp, tiebreak_seq)` freezes the sequence
  when a round starts; position is derived by `ORDER BY`. That one representation gives the frozen
  mid-round order, a stable tie-break, free mid-round insertion, and a "Combat Power change pending"
  flag that clears itself because it is computed rather than stored.
- **Whose turn it is, is never stored.** It is derived from the response log, which reduces undo to
  deleting a row.

`lib/domain/` holds pure ordering and offer logic with no Supabase imports — a mirror of the SQL for
the UI to reason with, and unit-testable on its own.

## Things that will bite you

- **`proxy.ts`, not `middleware.ts`.** Next 16 renamed it. A file named `middleware.ts` is inert
  here, and sessions silently stop refreshing. Supabase's own bootstrap docs still show the old name.
- **`setAll(cookiesToSet, headers)`** — the second argument carries cache headers that must reach the
  response, or a CDN can serve one account's authenticated response to another.
- **`getClaims()`, never `getSession()`** on the server. `getSession()` is not guaranteed to
  revalidate the token.
- **Views need `security_invoker = on`**, or they run as their owner and bypass RLS on their base
  tables. `tests/integration/v7-isolation.test.ts` queries the views by name to catch that.
- **The `YES` guard on history deletion is enforced in the database.** A UI-only confirmation is
  bypassed by any direct call.
- **`supabase db reset` wipes `auth.users` but not the JWT signing secret.** A browser signed in
  before the reset keeps a token that still verifies, so the proxy admits it and RLS-filtered reads
  quietly return nothing — the app looks signed in with an empty roster, and only a write fails
  (foreign key on `owner_id`). The app now detects this, signs you out, and says so. Sign in again
  after any reset.
