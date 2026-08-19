---
description: "Task list for Guild Skill Loot Distribution"
---

# Tasks: Guild Skill Loot Distribution

**Input**: Design documents from `/specs/001-skill-distribution/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. [research.md R-012](./research.md#r-012-testing-strategy) defines a three-layer strategy, and the plan promotes SC-004, SC-006, and SC-008 to executable tests because each fails silently if left to review. Test tasks reference the V1–V11 scenarios in [quickstart.md](./quickstart.md).

**Organization**: Grouped by user story so each is independently implementable and testable.

**Status**: All 107 tasks complete as of 2026-08-18. Verified against a real local Supabase stack —
20 migrations applied, 32 unit tests, 83 integration tests, 17 Playwright tests at 360 px, plus a
clean `tsc --noEmit`, `eslint`, and `next build`.

Two deviations from the task text as written, both deliberate:

- **T018** — `lib/types/database.ts` is hand-written to match the migrations rather than emitted by
  `supabase gen types`. `npm run db:types` regenerates it from the live schema and overwrites it.
- **T058, T059, T061** — round completion, the `carry_previous` path, and cross-round undo were
  implemented directly in migrations 0011, 0008, and 0013 where their functions live, rather than as
  separate `ALTER`-style migrations. Migrations 0014, 0015, and 0017 carry the `comment on function`
  documentation and the supporting index instead. Splitting a function definition across two
  migrations would have meant maintaining two copies of the same body.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US5)

## Path Conventions

Single Next.js application at the repository root, with the database versioned under `supabase/migrations/`. Paths follow the Structure Decision in [plan.md](./plan.md#project-structure).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, toolchain, and local database stack.

- [X] T001 Scaffold the Next.js 16 app at the repository root with TypeScript, App Router, and Tailwind 4 — creates `package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`
- [X] T002 Install runtime dependencies `next@16.3.1`, `react@19.2.8`, `react-dom@19.2.8`, `@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.3`, `zod@4.4.3` in `package.json`
- [X] T003 [P] Install dev dependencies `vitest@4.1.10`, `@playwright/test@1.62.1`, `@testing-library/react`, `eslint`, `prettier`, `typescript@^5.9` in `package.json`
- [X] T004 [P] Enable `strict` and configure the `@/*` path alias in `tsconfig.json`
- [X] T005 [P] Configure ESLint and Prettier in `eslint.config.mjs` and `.prettierrc`
- [X] T006 Initialize the local Supabase stack (`supabase init`) producing `supabase/config.toml` and the `supabase/migrations/` directory
- [X] T007 [P] Create `.env.example` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and add `.env.local` to `.gitignore` — no service-role key belongs in this app
- [X] T008 [P] Configure Vitest with separate `unit` and `integration` projects in `vitest.config.ts`
- [X] T009 [P] Configure Playwright with a 360 × 640 viewport as the default device in `playwright.config.ts`
- [X] T010 [P] Add the `dev`, `build`, `test`, `test:integration`, `test:e2e`, `lint`, `typecheck` scripts from [quickstart.md](./quickstart.md#commands) to `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, RLS, Supabase clients, and pure domain logic that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Note on ordering**: the schema is laid down whole here rather than split per story. This design is database-centric — the constraints *are* the business rules ([R-005](./research.md#r-005-where-the-distribution-rules-are-enforced)) — so slicing migrations per story would produce churn without buying independence. Story-specific RPC functions stay in their own phases.

### Database schema

- [X] T011 Create the five enums `ordering_mode`, `round_status`, `distribution_status`, `award_mode`, `offer_response_kind` in `supabase/migrations/0001_enums.sql`
- [X] T012 Create `profiles` with its `after insert` trigger on `auth.users` in `supabase/migrations/0002_profiles.sql`
- [X] T013 Create `members` with the non-negative CP check, name-length check, and the case-insensitive unique index on `(owner_id, lower(btrim(name)))` in `supabase/migrations/0003_members.sql`
- [X] T014 Create `rounds` and `round_entries` with the one-active-round-per-owner partial unique index and the `(round_id, ranked_cp desc, tiebreak_seq asc)` order index in `supabase/migrations/0004_rounds.sql`
- [X] T015 Create `distributions` and `offer_responses` with all four partial unique indexes, and the `distributions_awarded_shape` check that asserts on `recipient_name` rather than `recipient_member_id`, in `supabase/migrations/0005_distributions.sql`
- [X] T016 Enable RLS and add select/insert/update/delete policies using `(select auth.uid())` on all six tables in `supabase/migrations/0006_rls.sql`
- [X] T017 Create `v_round_line` and `v_current_offer` with `security_invoker = on` in `supabase/migrations/0007_views.sql`
- [X] T018 Generate database types into `lib/types/database.ts` via `supabase gen types typescript --local`

### Supabase clients and session handling

- [X] T019 [P] Implement the browser client factory in `lib/supabase/client.ts` using `createBrowserClient`
- [X] T020 [P] Implement the server client factory in `lib/supabase/server.ts` using `createServerClient` over `await cookies()`, with a `getAll` / `setAll(cookiesToSet, headers)` adapter only
- [X] T021 Implement the `updateSession` helper in `lib/supabase/proxy.ts` calling `auth.getClaims()`, copying the `headers` argument onto the response, and never calling `getSession()`
- [X] T022 Create `proxy.ts` at the repository root — **not** `middleware.ts`, which is inert on Next 16 — wiring `updateSession` and the matcher that excludes `_next/static`, `_next/image`, `favicon.ico`, and image extensions

### Shared domain logic

- [X] T023 [P] Define the Zod schemas for member name, combat power, skill name, and action inputs in `lib/domain/schemas.ts`
- [X] T024 [P] Map error codes `GS001`–`GS009` to user-facing messages in `lib/domain/errors.ts`
- [X] T025 [P] Implement pure ranking, tie-break, and position derivation in `lib/domain/ordering.ts`
- [X] T026 [P] Implement pure eligibility and current-offer-holder resolution in `lib/domain/offer.ts`

### Application shell and test harness

- [X] T027 Build the signed-in app shell with mobile bottom navigation in `app/(app)/layout.tsx` and base styles in `app/globals.css`
- [X] T028 [P] Build the shared UI primitives `Button`, `Field`, `Dialog`, `ConfirmDialog` in `components/ui/`
- [X] T029 Build the integration test harness that starts the local stack, provisions two independent test accounts, and truncates between tests in `tests/integration/harness.ts`
- [X] T030 [P] Integration test for quickstart V7 — account B reading account A's six tables **and both views** by explicit id, expecting zero rows and rejected writes — in `tests/integration/v7-isolation.test.ts`

**Checkpoint**: Foundation ready — user story implementation can begin. T030 must be green first: cross-account isolation is the one property that fails silently, so it gates the phase rather than trailing it.

---

## Phase 3: User Story 1 — Distribute a skill down the combat-power line (Priority: P1) 🎯 MVP

**Goal**: The officer enters a skill name, walks the CP-ordered line recording passes, awards it — by sequence or manually — or closes it unclaimed, and can undo the last action.

**Independent Test**: Enter three members with distinct CP values, start a distribution, pass on the top two, award to the third, and confirm the awarded member leaves the line while the two who passed remain at the top for the next skill.

### Tests for User Story 1

- [X] T031 [P] [US1] Unit tests for ranking, tie-break stability, and position in `tests/unit/ordering.test.ts`
- [X] T032 [P] [US1] Unit tests for eligibility and offer-holder resolution in `tests/unit/offer.test.ts`
- [X] T033 [P] [US1] Integration test for quickstart V1 — the core pass/award loop over the RPCs — in `tests/integration/v1-core-loop.test.ts`
- [X] T034 [P] [US1] Integration test for quickstart V2 — manual award, unclaimed close, and `GS004` on an already-served member — in `tests/integration/v2-manual-unclaimed.test.ts`
- [X] T035 [P] [US1] Integration test for quickstart V3 — undo of an award and of a pass — in `tests/integration/v3-undo.test.ts`
- [X] T036 [P] [US1] Integration test for quickstart V8 — two concurrent awards to the same member, a stale `GS003` pass, and `client_action_id` replay — in `tests/integration/v8-concurrency.test.ts`
- [X] T037 [P] [US1] End-to-end test of the V1 journey in `tests/e2e/core-loop.spec.ts`

### Implementation for User Story 1

- [X] T038 [US1] Implement `start_round(p_ordering_mode)` for the `current_cp` path — snapshot every member's CP into `round_entries`, assign `tiebreak_seq` by `(combat_power desc, created_at asc, id asc)`, raise `GS002` on an empty roster — in `supabase/migrations/0008_rpc_start_round.sql`
- [X] T039 [US1] Implement `start_distribution(p_skill_name, p_client_action_id)` with the `FOR UPDATE` round lock and idempotent replay in `supabase/migrations/0009_rpc_start_distribution.sql`
- [X] T040 [US1] Implement `record_pass(p_distribution_id, p_member_id, p_client_action_id)` verifying the member against `v_current_offer` and raising `GS003` on mismatch, in `supabase/migrations/0010_rpc_record_pass.sql`
- [X] T041 [US1] Implement `record_award(p_distribution_id, p_member_id, p_mode, p_client_action_id)` covering both `sequence` and `manual` modes, setting `received_at`, and raising `GS004` / `GS005`, in `supabase/migrations/0011_rpc_record_award.sql`
- [X] T042 [US1] Implement `close_unclaimed(p_distribution_id, p_client_action_id)` leaving all `round_entries` untouched, in `supabase/migrations/0012_rpc_close_unclaimed.sql`
- [X] T043 [US1] Implement `undo_last_action(p_distribution_id)` for within-distribution undo of a pass, an award, and an unclaimed close, raising `GS007` when there is nothing to undo, in `supabase/migrations/0013_rpc_undo.sql`
- [X] T044 [P] [US1] Implement the distribution Server Actions `startDistribution`, `recordPass`, `recordAward`, `closeUnclaimed`, `undoLastAction` in `lib/actions/distribution.ts`, each parsing input with Zod and returning `ActionResult<T>`
- [X] T045 [P] [US1] Implement the `addMember` Server Action in `lib/actions/members.ts` and a minimal add-member form in `components/roster/MemberForm.tsx`, enough to seed a roster for distribution
- [X] T046 [US1] Build the live line screen in `app/(app)/page.tsx` rendering `v_round_line` and `v_current_offer` server-side, with the offer holder above the fold
- [X] T047 [US1] Build `components/line/OfferCard.tsx` and `components/line/LineList.tsx`, showing remaining order, who has already received, and a tie indicator wherever `v_round_line.tied` is true (FR-017)
- [X] T048 [US1] Build `components/line/PassAwardControls.tsx` with `useOptimistic` updates, 44 px minimum touch targets, and browser-minted `clientActionId` per gesture
- [X] T049 [US1] Build the manual-award picker in `components/line/ManualAwardDialog.tsx`, listing only eligible members
- [X] T050 [US1] Build the all-passed close prompt in `components/line/ClosePrompt.tsx` offering manual award and unclaimed side by side
- [X] T051 [US1] Wire `lib/domain/errors.ts` into the line screen so `GS00x` codes surface as messages with a retry that reuses the same `clientActionId`
- [X] T052 [US1] Implement the `startRound` Server Action for the `current_cp` path in `lib/actions/rounds.ts`
- [X] T053 [US1] Build the no-active-round empty state with a “Start round” control in `app/(app)/page.tsx`
- [X] T054 [US1] Build the minimal roster route hosting `MemberForm` and a plain member list in `app/(app)/roster/page.tsx`

**Checkpoint**: The core loop is fully functional and demonstrable **end to end from the UI** — an officer can add members, start a round, and run distributions without touching the database. This is the MVP.

---

## Phase 4: User Story 2 — Complete a round and reset the sequence (Priority: P2)

**Goal**: The round completes when the last member is served, and the officer chooses whether the next round ranks by current CP or reuses the previous sequence.

**Independent Test**: With three members, award to each in turn, confirm the round reports complete, then confirm both ordering choices are offered and that the selection determines the new round's sequence.

### Tests for User Story 2

- [X] T055 [P] [US2] Integration test for quickstart V4 — completion, both ordering modes, and pending-CP flags surviving `carry_previous` — in `tests/integration/v4-round-lifecycle.test.ts`
- [X] T056 [P] [US2] Integration test for cross-round undo — rollback of an empty next round and `GS008` when it has activity — in `tests/integration/undo-round-boundary.test.ts`
- [X] T057 [P] [US2] End-to-end test of round completion and the ordering choice in `tests/e2e/round-lifecycle.spec.ts`

### Implementation for User Story 2

- [X] T058 [US2] Extend `record_award` to set the round `complete` with `completed_at` when no eligible entries remain, without creating the next round, in `supabase/migrations/0014_round_completion.sql`
- [X] T059 [US2] Extend `start_round` with the `carry_previous` path — copy `ranked_cp` and `tiebreak_seq` for surviving members, append newcomers at `max(tiebreak_seq) + 1` — in `supabase/migrations/0015_carry_previous.sql`
- [X] T060 [US2] Implement `reset_round(p_round_id)` clearing every `received_at` and deleting the round's distributions while preserving `round_number`, `ranked_cp`, and `tiebreak_seq`, in `supabase/migrations/0016_rpc_reset_round.sql`
- [X] T061 [US2] Extend `undo_last_action` to handle the round boundary — un-complete the round, delete an empty next round, raise `GS008` otherwise — in `supabase/migrations/0017_undo_round_boundary.sql`
- [X] T062 [P] [US2] Implement the `resetRound` Server Action and extend `startRound` with the ordering-mode parameter in `lib/actions/rounds.ts`
- [X] T063 [US2] Build the round-start screen in `app/(app)/round/start/page.tsx` offering both ordering modes with "rank by current Combat Power" preselected
- [X] T064 [US2] Build the round progress header in `components/line/RoundHeader.tsx` showing round number, ordering mode, and received-of-total
- [X] T065 [US2] Build the reset confirmation in `components/line/ResetRoundDialog.tsx` naming exactly what will be cleared

**Checkpoint**: US1 and US2 both work independently. The app now cycles indefinitely.

---

## Phase 5: User Story 3 — Keep guild data on an account across sessions and devices (Priority: P3)

**Goal**: Register, sign in, recover a password, and find the roster, round state, and history intact on any device — with no account able to reach another's data.

**Independent Test**: Create an account, enter a roster and record an award, sign out, sign in on a second device, and confirm everything is identical.

### Tests for User Story 3

- [X] T066 [P] [US3] End-to-end test for quickstart V6 — persistence across sign-out and a second browser profile — in `tests/e2e/persistence.spec.ts`
- [X] T067 [P] [US3] End-to-end test of the password reset journey in `tests/e2e/password-reset.spec.ts`

### Implementation for User Story 3

- [X] T068 [P] [US3] Build the registration page calling `signUp` in `app/(auth)/register/page.tsx`
- [X] T069 [P] [US3] Build the sign-in page calling `signInWithPassword` in `app/(auth)/login/page.tsx`
- [X] T070 [P] [US3] Build the forgot-password page calling `resetPasswordForEmail` in `app/(auth)/forgot-password/page.tsx`
- [X] T071 [P] [US3] Build the reset-password page calling `updateUser({ password })` in `app/(auth)/reset-password/page.tsx`
- [X] T072 [US3] Implement the `/auth/confirm` route handler performing `verifyOtp({ token_hash, type })` and redirecting, in `app/auth/confirm/route.ts`
- [X] T073 [US3] Implement the `signOut` action and expired-session handling that re-prompts without discarding in-flight input, in `lib/actions/auth.ts`
- [X] T074 [US3] Extend `proxy.ts` to redirect unauthenticated requests to `/login` while allowing the `(auth)` routes and `/auth/confirm` through

**Checkpoint**: The app is multi-account safe and durable across devices.

---

## Phase 6: User Story 4 — Maintain the roster as the guild changes (Priority: P4)

**Goal**: Add, edit, and remove members at any time — including mid-round — without disturbing the running sequence, with pending CP changes visible.

**Independent Test**: Mid-round, add a member, remove one who has not yet received, and edit another's CP; confirm the order is unchanged, the edit is flagged pending, and history survives the removal.

### Tests for User Story 4

- [X] T075 [P] [US4] Integration test for quickstart V5 — mid-round add slotting by CP, removal preserving history, duplicate-name and CP validation — in `tests/integration/v5-roster.test.ts`
- [X] T076 [P] [US4] Integration test for the CP edited-and-edited-back edge case leaving no pending flag, in `tests/integration/cp-pending.test.ts`
- [X] T077 [P] [US4] End-to-end test of mid-round roster changes in `tests/e2e/roster.spec.ts`
- [X] T078 [P] [US4] Integration test for quickstart V11 — removing the last eligible member completes the round instead of stranding it — in `tests/integration/v11-round-strand.test.ts`

### Implementation for User Story 4

- [X] T079 [US4] Add the `after insert` trigger on `members` that creates a `round_entries` row at `max(tiebreak_seq) + 1` when an active round exists, in `supabase/migrations/0018_member_joins_active_round.sql`
- [X] T080 [US4] Add the `after delete` trigger on `round_entries` that completes the round when no eligible entries remain, so removing the last unserved member cannot strand an active round, in `supabase/migrations/0019_complete_round_on_last_removal.sql`
- [X] T081 [P] [US4] Implement the `updateMember` and `removeMember` Server Actions in `lib/actions/members.ts`
- [X] T082 [US4] Extend the roster screen to full add, edit, and remove in `app/(app)/roster/page.tsx`
- [X] T083 [P] [US4] Build `components/roster/MemberRow.tsx` showing name, CP, and received-this-round state
- [X] T084 [P] [US4] Build `components/roster/PendingCpBadge.tsx` showing both the ranked-on CP and the new CP
- [X] T085 [US4] Surface duplicate-name and CP validation failures as field-level messages in `components/roster/MemberForm.tsx`
- [X] T086 [US4] Add the remove-member confirmation explaining that history is retained, in `components/roster/RemoveMemberDialog.tsx`

**Checkpoint**: The roster is sustainable over time without corrupting rounds.

---

## Phase 7: User Story 5 — Review what was awarded to whom (Priority: P5)

**Goal**: A filterable record of every distribution — skill, recipient, passers, manual flag, round, and timestamp — plus the ability to clear away completed rounds behind a typed confirmation.

**Independent Test**: Record several distributions across two rounds including a manual award and an unclaimed skill, confirm each appears correctly and the filters narrow as expected, then delete one completed round and confirm it is gone while the active round and roster are untouched.

### Tests for User Story 5

- [X] T087 [P] [US5] Integration test for history retrieval and the member and round filters in `tests/integration/history.test.ts`
- [X] T088 [P] [US5] Integration test confirming a removed member's awards remain readable under their snapshot name, in `tests/integration/history-removed-member.test.ts`
- [X] T089 [P] [US5] End-to-end test of the history screen in `tests/e2e/history.spec.ts`
- [X] T090 [P] [US5] Integration test for quickstart V10 — `GS010` on any confirmation other than the literal `YES`, `GS011` on the active round, correct cascade, and round numbers never reused — in `tests/integration/v10-history-deletion.test.ts`
- [X] T091 [P] [US5] End-to-end test of the guarded deletion dialog, including the disabled submit until `YES` is typed exactly, in `tests/e2e/history-deletion.spec.ts`

### Implementation for User Story 5

- [X] T092 [US5] Implement the history query joining `distributions` to `offer_responses` with member and round filters in `lib/queries/history.ts`
- [X] T093 [US5] Build the history screen in `app/(app)/history/page.tsx`
- [X] T094 [P] [US5] Build `components/history/HistoryList.tsx` rendering recipient, passers, manual and unclaimed badges, round, and timestamp
- [X] T095 [P] [US5] Build `components/history/HistoryFilters.tsx` for the member and round filters
- [X] T096 [US5] Implement `delete_round_history(p_round_ids, p_confirmation)` raising `GS010` unless the confirmation is byte-for-byte `YES` and `GS011` for an active round, in `supabase/migrations/0020_rpc_delete_round_history.sql`
- [X] T097 [US5] Implement the `deleteRoundHistory` Server Action passing the confirmation string through untrimmed and unfolded, in `lib/actions/history.ts`
- [X] T098 [US5] Build the guarded deletion dialog stating the round and distribution counts, with submit disabled until `YES` is typed exactly, in `components/history/DeleteHistoryDialog.tsx`

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T099 [P] End-to-end test for quickstart V9 — no horizontal scroll, offer holder above the fold, 44 px touch targets, a 60-character name that does not overflow, and a full pass → pass → award distribution completing in under 30 seconds (SC-002) — in `tests/e2e/mobile.spec.ts`
- [X] T100 [P] Add empty states for no roster, no active round, and no history across `app/(app)/`
- [X] T101 [P] Add loading and pending states to every Server Action call site in `components/`
- [X] T102 [P] Accessibility pass — labels, focus order, and dialog focus traps in `components/`
- [X] T103 Verify the `setAll` cache headers reach the response and that no CDN caching of authenticated responses is possible, in `lib/supabase/proxy.ts`
- [X] T104 [P] Add the Vercel deployment configuration and production environment variables in `vercel.json` and the project README
- [X] T105 [P] Write the setup and contribution README at `README.md` referencing [quickstart.md](./quickstart.md)
- [X] T106 Measure Server Action latency against the sub-500 ms p95 goal and address regressions in `lib/actions/`
- [X] T107 Execute the full quickstart V1–V9 suite against a clean database and record the results in `specs/001-skill-distribution/quickstart.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** — no dependencies
- **Foundational (Phase 2)** — depends on Setup; **blocks every user story**
- **US1 (Phase 3)** — depends on Foundational only
- **US2 (Phase 4)** — depends on US1; extends `record_award`, `start_round`, and `undo_last_action`
- **US3 (Phase 5)** — depends on Foundational only; independent of US1, US2, US4, US5
- **US4 (Phase 6)** — depends on Foundational; T079 and T080 assume a round exists, so validate after US1
- **US5 (Phase 7)** — depends on Foundational; needs US1 to have produced history to display
- **Polish (Phase 8)** — depends on the stories you intend to ship

### An honest note on US3

The spec prioritises by user value, which puts authentication at P3. Technically, sign-in is a prerequisite for RLS to scope anything — so the *plumbing* (clients, `proxy.ts`, RLS policies, the harness's account provisioning) sits in Foundational, while the *user-facing journeys* (register, login, reset, cross-device verification) stay in Phase 5. US1 and US2 are therefore developed against harness-provisioned accounts. This preserves the spec's value ordering without pretending the dependency does not exist.

The cross-account isolation test (T030) sits in Foundational rather than US3 for the same reason: it verifies a property of the schema, not of the login screen, and leaving it until Phase 5 would mean two phases of work built on unverified RLS. It carries no story label because Foundational tasks do not take one.

### Within each story

- Tests are written first and must fail before implementation
- SQL migrations before Server Actions; Server Actions before UI
- `lib/domain/` is pure and imports nothing from Supabase, so it is unit-testable in isolation

### Parallel opportunities

- **Phase 1**: T003–T005 and T007–T010 run together
- **Phase 2**: T019, T020, T023, T024, T025, T026, T028 run together once the migrations land. T011–T017 are sequential — each migration builds on the last. T030 gates the phase: do not start a user story until cross-account isolation is proven
- **Phase 3**: all seven test tasks T031–T037 run together; T044 and T045 run together; RPC tasks T038–T043 are sequential within `supabase/migrations/`
- **Phase 5**: T068–T071 are four separate pages and run together
- **Phase 6**: T083 and T084 run together
- **Phase 7**: T094 and T095 run together; T090 and T091 run together
- **Across stories**: with more than one developer, US3 can proceed alongside US1 from the moment Foundational completes — they share no files

---

## Parallel Example: User Story 1

```bash
# All US1 tests together (T031–T037) — seven separate files, no shared state:
Task: "Unit tests for ranking and tie-break in tests/unit/ordering.test.ts"
Task: "Unit tests for offer-holder resolution in tests/unit/offer.test.ts"
Task: "Integration test V1 core loop in tests/integration/v1-core-loop.test.ts"
Task: "Integration test V2 manual and unclaimed in tests/integration/v2-manual-unclaimed.test.ts"
Task: "Integration test V3 undo in tests/integration/v3-undo.test.ts"
Task: "Integration test V8 concurrency in tests/integration/v8-concurrency.test.ts"
Task: "End-to-end V1 journey in tests/e2e/core-loop.spec.ts"

# Then the two independent action modules (T044, T045):
Task: "Distribution Server Actions in lib/actions/distribution.ts"
Task: "addMember action and MemberForm in lib/actions/members.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 — Setup
2. Phase 2 — Foundational (blocks everything)
3. Phase 3 — User Story 1
4. **Stop and validate**: run quickstart V1, V2, V3, V8
5. Demo to the guild — the officer can already run a raid night from it, starting each round from the UI and resetting by hand between them

### Incremental delivery

| Increment | Adds | Validates with |
|---|---|---|
| Setup + Foundational | Nothing user-visible | Migrations apply, harness runs, **V7 isolation green** |
| + US1 | The core loop — **MVP** | V1, V2, V3, V8 |
| + US2 | Rounds cycle on their own | V4 |
| + US3 | Real accounts, durable data | V6 |
| + US4 | Sustainable roster | V5, V11 |
| + US5 | Auditable history, clearable behind a `YES` guard | V10 and the full suite |

### Parallel team strategy

Complete Setup and Foundational together — the schema is shared and worth agreeing on as a group. Then Developer A takes US1 → US2 (they share migration files), Developer B takes US3 → US5, and US4 goes to whoever frees up first, since T079 and T080 want US1's round machinery to exist before they can be validated.

---

## Notes

- Every task names a file path; RPC tasks name the migration they create so numbering stays linear
- The `GS001`–`GS009` codes in [contracts/rpc.md](./contracts/rpc.md#error-codes) are the contract between SQL and UI — add a code rather than a message when a new failure mode appears
- `proxy.ts`, never `middleware.ts` — the wrong name fails silently on Next 16
- Views must carry `security_invoker = on`; T030 exists to catch a lapse, and it now sits in Foundational so the lapse cannot survive past the phase that introduces it
- The `YES` guard on history deletion is enforced inside `delete_round_history` (T096), not only in the dialog (T098) — a UI-only confirmation is bypassed by any direct call
- Round completion has two triggers: the last award (T058) and the removal of the last eligible member (T080). Implementing only the first strands the round
- Commit after each task or logical group; stop at any checkpoint to validate a story independently

---

## Follow-up work (after the initial 107)

Changes made on request once the app was in use. Each one carries its own tests.

- [X] T108 Rename the loot from "skill" to "item" across the schema, the interface, and the specs — migration `0022_items.sql` renames `distributions.skill_name` rather than editing `0005`, because the officer's database already holds rounds.
- [X] T109 Add the `items` table, RLS policies, the `seq` trigger, and the `v_item_pool` view (FR-025, FR-050).
- [X] T110 Rework `start_distribution` to take `p_item_id` instead of `p_skill_name`, with `GS014` (FR-051, FR-052).
- [X] T111 Teach `delete_round_history` to take a round's items with it (FR-054) — migration `0023`.
- [X] T112 Replace the single-name form with `ItemPool`: the pool as tappable chips — the name is the button that distributes it, with its own remove target — and multi-line entry behind an **Add items** dialog (FR-025, FR-051, FR-053).
- [X] T114 Add `cancel_distribution` (migration `0024`) and the **← Back to the pool** control, so an item picked by mistake can be swapped without inventing a history entry (FR-055).
- [X] T115 Carry `received_item` on `v_round_line` (migration `0025`) and name it on the line and the roster (FR-015, FR-056).
- [X] T116 Lines: the `lines` table, `line_id` on members, items, and rounds, one live round per line, per-line round numbering, and per-line name uniqueness (migrations `0027`, `0028`) — FR-057 → FR-061.
- [X] T117 Combat Power optional, in the column, the forms, and the CSV import; unranked members sort below zero (FR-010, FR-062).
- [X] T118 A single `position_seq` replaces `(ranked_cp desc, tiebreak_seq)`, plus `set_round_order` and the `manual` ordering mode (migrations `0026`, `0028`) — FR-020, FR-063, FR-064.
- [X] T119 Routing: `/` lists lines, `/lines/[id]` and `/lines/[id]/roster` scope to one, `NewLineDialog`, `LineSettings`, `ReorderDialog`, and a line filter on the history.
- [X] T113 Tests — `tests/unit/schemas.test.ts`, `tests/integration/item-pool.test.ts`, `tests/e2e/item-pool.spec.ts`, plus `items` and `v_item_pool` added to the isolation sweep.
