# Implementation Plan: Guild Item Loot Distribution

**Branch**: `001-skill-distribution` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-skill-distribution/spec.md`

## Summary

A mobile-first web app that lets one guild officer run RF Online Next item loot distribution as a
round-robin down a Combat-Power-ordered line: offer the item to the top eligible member, record
passes down the line, award it, and reset the sequence once everyone has received one.

The technical approach puts the distribution rules **in Postgres**, not in TypeScript. The spec's
hardest requirements are all concurrency and integrity requirements — a member must never receive
two items in one round (FR-033, FR-036, SC-004), two devices must not double-log (FR-049), a
retry after a dropped connection must not duplicate (FR-048), and no account may ever see another's
data (FR-005, SC-006). Each becomes a database constraint or a row lock inside a `SECURITY INVOKER`
function, so no application bug can violate it. Next.js Server Actions are callers of those
functions; RLS is the authorization boundary.

Two modelling choices carry most of the design. The round's order is stored as a **snapshot**
(`ranked_cp`, `tiebreak_seq`) with position derived by `ORDER BY`, which gives the frozen mid-round
sequence (FR-018), the stable tie-break (FR-017), free mid-round insertion (FR-023), and a
self-clearing "CP change pending" flag (FR-019, FR-021) from one representation. And **whose turn it
is** is never stored — it is derived from the response log, which reduces undo (FR-035) to deleting
a row.

## Technical Context

**Language/Version**: TypeScript 5.9+, Node.js 22 LTS (Next 16 requires ≥ 20.9)

**Primary Dependencies**: Next.js 16.3.1 (App Router), React 19.2.8, `@supabase/ssr` 0.12.4,
`@supabase/supabase-js` 2.112.3, Tailwind CSS 4.3.3, Zod 4.4.3
*(versions read from the npm registry on 2026-08-18)*

**Storage**: Supabase Postgres — 6 tables, 2 `security_invoker` views, 8 RPC functions, 2 triggers, RLS on
everything

**Testing**: Vitest 4.1.10 (unit + integration against a local Supabase stack), Playwright 1.62.1
(end-to-end at a 360 px viewport)

**Target Platform**: Mobile web browsers first, desktop second. Deployed to Vercel with hosted
Supabase; runs fully locally via the Supabase CLI.

**Project Type**: Web application — a single Next.js app with Supabase as its backend. No separate
backend service.

**Performance Goals**: Recording a pass or award feels instant on a phone — optimistic UI, with the
server action settling under 500 ms p95. Line and history views render server-side in one round
trip. This is not a throughput problem.

**Constraints**: Every screen usable at 360 px with no horizontal scroll (SC-008); the current
offer holder above the fold (SC-003); a full distribution recordable in under 30 seconds (SC-002);
online-only, per the spec's assumptions.

**Scale/Scope**: Rosters in the tens; history in the low thousands of rows per account. Roughly 8
screens. Scale is not a design driver here — correctness under concurrent edits is.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unmodified Spec Kit template — every principle is a
`[PRINCIPLE_N_NAME]` placeholder and the document is unratified. **There are no project principles
to check this design against, so the gate passes vacuously.** No principles were invented to fill
the gap; doing so would put words in the project's mouth.

Worth knowing: had the template's own example principles been ratified as written, this design
would violate *Library-First* and *CLI Interface* — it is a web application with no library or CLI
surface. If you want a meaningful gate on future features, run `/speckit-constitution` before the
next one. It would not change this plan.

**Initial check**: PASS (no constraints defined)
**Post-Phase-1 re-check**: PASS (no constraints defined; design unchanged by the gate)

## Project Structure

### Documentation (this feature)

```text
specs/001-skill-distribution/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 — 14 decisions with rationale
├── data-model.md        # Phase 1 — schema, RLS, state transitions
├── quickstart.md        # Phase 1 — setup and 9 validation scenarios
├── contracts/
│   ├── rpc.md           # Database RPC surface + error codes
│   └── server-actions.md# Server Actions, auth routes, proxy.ts obligations
├── checklists/
│   └── requirements.md  # Spec quality checklist — 16/16
└── tasks.md             # Phase 2 — 107 tasks across 8 phases
```

### Source Code (repository root)

```text
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── auth/confirm/route.ts          # verifyOtp callback for password reset
├── (app)/
│   ├── layout.tsx                 # signed-in shell, bottom nav
│   ├── page.tsx                   # the line + active distribution (primary screen)
│   ├── round/start/page.tsx       # ordering choice on round start — FR-020
│   ├── roster/page.tsx            # add / edit / remove members — FR-008..FR-015
│   └── history/page.tsx           # filterable history + deletion — FR-041..FR-046
├── layout.tsx
└── globals.css

components/
├── line/                          # LineList, OfferCard, PassAwardControls,
│                                  # ManualAwardDialog, ClosePrompt, RoundHeader,
│                                  # ResetRoundDialog
├── roster/                        # MemberForm, MemberRow, PendingCpBadge,
│                                  # RemoveMemberDialog
├── history/                       # HistoryList, HistoryFilters, DeleteHistoryDialog
└── ui/                            # Button, Dialog, Field, ConfirmDialog

lib/
├── supabase/
│   ├── client.ts                  # createBrowserClient
│   ├── server.ts                  # createServerClient over await cookies()
│   └── proxy.ts                   # updateSession helper used by proxy.ts
├── domain/
│   ├── ordering.ts                # pure: rank, tie-break, position
│   ├── offer.ts                   # pure: current holder, eligibility
│   ├── schemas.ts                 # Zod, shared client + server
│   └── errors.ts                  # GS001..GS009 → user-facing messages
├── actions/                       # one file per Server Action group
├── queries/                       # read-side query modules (history)
└── types/database.ts              # generated by supabase gen types

supabase/
├── migrations/                    # tables, indexes, RLS, views, RPC functions
├── seed.sql
└── config.toml

tests/
├── unit/                          # lib/domain — Vitest
├── integration/                   # RPCs + RLS against local Supabase — Vitest
└── e2e/                           # Playwright, 360 px

proxy.ts                           # project root — NOT middleware.ts (Next 16)
vercel.json                        # deployment configuration
```

**Structure Decision**: A single Next.js application at the repository root, with the database as a
first-class, version-controlled part of the codebase under `supabase/migrations/`. There is no
`backend/` + `frontend/` split because Supabase *is* the backend — introducing an API tier would
add a hop without adding a rule that RLS and the RPCs do not already enforce. The one structural
point worth flagging is `lib/domain/`: the pure ordering and offer-resolution logic is kept free of
any Supabase import so it can be unit-tested directly, while remaining a mirror of the SQL rather
than the authority on them.

## Phase 0 — Research

Complete: [research.md](./research.md). Fourteen decisions, each with rationale and rejected
alternatives. No `NEEDS CLARIFICATION` items remain — both spec-level markers were resolved during
`/speckit-specify`, and every technical unknown was settled against the npm registry and current
vendor documentation rather than recalled.

The decisions that most shape the build:

| ID | Decision | Why it matters |
|---|---|---|
| R-002 | `proxy.ts`, not `middleware.ts`; all request APIs awaited | Next 16 renamed the file. Supabase's own bootstrap page is stale on this, and the wrong filename fails silently. |
| R-004 | `getClaims()`, never `getSession()`, on the server | `getSession()` is not guaranteed to revalidate the token |
| R-005 | Rules in Postgres — constraints, row locks, RPCs | The only way to actually satisfy FR-033/FR-036/FR-048/FR-049 |
| R-006 | Order as a snapshot; position and pending-CP derived | Four requirements from one representation |
| R-007 | Current offer holder derived, never stored | Makes undo a delete |
| R-008 | Undo across a round boundary rolls back only an empty next round | Honours FR-035 without destroying records |
| R-009 | The next round is created on the officer's confirmation | Reconciles FR-020 with FR-038 |
| R-010 | `owner_id` on every table; `(select auth.uid())` in policies; `security_invoker` views | SC-006 holds on every path |
| R-011 | Name snapshots + `ON DELETE SET NULL` for history | FR-013 and FR-014 both, without a constraint that breaks deletion |

## Phase 1 — Design & Contracts

Complete. Artifacts:

- **[data-model.md](./data-model.md)** — 6 tables, 5 enums, 2 views, full RLS, state-transition
  diagrams for Round and Distribution, and a consolidated table mapping every validation rule to the
  requirement it serves and the constraint that enforces it.
- **[contracts/rpc.md](./contracts/rpc.md)** — the 8 RPC functions with behaviour, requirement
  mapping, and a stable `GS001`–`GS011` error-code table so the UI maps failures without parsing
  message text.
- **[contracts/server-actions.md](./contracts/server-actions.md)** — the 11 Server Actions, the auth
  routes, the obligations on `proxy.ts`, and the client-side obligations that back the mobile
  success criteria.
- **[quickstart.md](./quickstart.md)** — setup, commands, and eleven numbered validation scenarios
  (V1–V11) covering every user story plus isolation, concurrency, guarded deletion, and mobile layout.
- **Agent context** — `CLAUDE.md` updated to point at this plan.

### Requirements coverage

All 49 functional requirements are mapped to a concrete mechanism across the data model and
contracts. The nine success criteria are covered by V1–V11 in the quickstart, with SC-004, SC-006,
and SC-008 promoted to executable tests rather than review items — those three are the ones that
fail quietly if left to inspection.

The requirement set grew from 46 to 49 after `/speckit-analyze`: FR-044 through FR-046 add guarded
history deletion, which FR-043 had implied without ever granting. FR-037 was widened to cover round
completion by roster removal, and FR-038 was reworded to match the deferred round creation the
design had already chosen.

### Risks carried into implementation

1. **Stale vendor documentation.** Supabase's Next.js bootstrap page still names the file
   `middleware.ts`. On Next 16 that file is inert, so auth appears to work until sessions stop
   refreshing. Called out in both the contract and the quickstart pitfalls.
2. **A view created without `security_invoker`** bypasses RLS on its base tables while every
   table-level test still passes. V7 tests the views by name for exactly this reason.
3. **The `setAll(cookiesToSet, headers)` second argument.** Dropping it is easy and lets a CDN cache
   an authenticated response across accounts. Contract requirement, not a nicety.
4. **Undo across a round boundary** is the subtlest rule in the feature (R-008). It deserves
   dedicated integration tests when `/speckit-tasks` breaks the work down.
5. **Round completion has two triggers, not one.** The award path is obvious; the removal of the
   last eligible member is not, and implementing only the first strands the round with an empty
   line and no way forward. Surfaced by `/speckit-analyze`; now covered by a trigger and V11.
6. **A confirmation enforced only in the dialog is not a confirmation.** The `YES` guard on history
   deletion lives inside `delete_round_history`, because any direct API call bypasses the UI.

## Complexity Tracking

No constitution violations to justify — the constitution defines no constraints. Two deliberate
complexity choices are recorded here for review anyway:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| Business rules as Postgres RPCs rather than TypeScript services | FR-049 and FR-048 require atomic, lock-protected transitions; FR-033/FR-036 require an integrity guarantee a race cannot beat | Read-then-write in a Server Action is exactly the lost-update race the spec's concurrency edge cases describe |
| `client_action_id` on every write | FR-048 demands a retry that cannot duplicate | Server-generated ids change on retry, so the duplicate would be created |
