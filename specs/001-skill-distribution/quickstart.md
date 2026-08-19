# Quickstart & Validation Guide

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Executed 2026-08-18** against a local Supabase stack. V1–V8 and V10–V11 are covered by the
automated integration and Playwright suites and pass. V9's mobile assertions run in
`tests/e2e/mobile.spec.ts`. The one criterion still needing a human is **SC-007** (90% of
first-time officers complete a distribution unassisted) — that is a usability study, not a test.

How to run the app locally and prove the feature works. Implementation belongs in `tasks.md`.

## Prerequisites

- Node.js 22 LTS (Next 16 requires ≥ 20.9; this machine has 22.20.0)
- Docker, for the local Supabase stack
- Supabase CLI

## Setup

```bash
npm install
supabase start          # prints the local API URL and keys
cp .env.example .env.local   # fill in from the supabase start output
supabase db reset       # applies supabase/migrations/*
npm run dev             # http://localhost:3000
```

`.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The publishable key is the current name for what older guides call the anon key. No service-role
key belongs in this app — every write runs as the signed-in user so that RLS applies.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next dev server (Turbopack is the default in 16) |
| `npm test` | Vitest unit tests |
| `npm run test:integration` | Vitest against the local Supabase stack |
| `npm run test:e2e` | Playwright, 360 px viewport |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `supabase db reset` | Rebuild the local database from migrations |

---

## Validation scenarios

Each maps to spec acceptance criteria. Together they are the definition of done.

### V-lines — Several rotations at once (FR-057 → FR-061)

Create **Weapons** and **Talics**. Give each its own members — the same person may appear in both.
Start a round on each.

- Both are live, and both read **Round 1**: numbering is per line.
- Award an item on Weapons → that person is still eligible on Talics.
- An item in the Talics pool cannot be distributed while only Weapons has a round (`GS001`).
- Delete Weapons, typing its name to confirm → its members, items, rounds, and history go; Talics is
  untouched.

**Proves**: FR-057, FR-058, FR-059, FR-060, FR-061.

### V-manual — A line with no Combat Power (FR-010, FR-020, FR-062 → FR-064)

On a line whose members were added with the Combat Power field left blank, start a round with
**Arrange by hand**.

- The roster shows **no Combat Power** rather than 0.
- **Rearrange the line**, move somebody to the top, save → the offer moves with them, mid-round.
- The header reads **arranged by hand**; on a CP-ranked round it reads **ranked by current Combat
  Power, then rearranged** — the choice that started the round is not rewritten.
- Add a member mid-round → they go to the back, because there is nothing to place them by.

**Proves**: FR-010, FR-020, FR-062, FR-063, FR-064.

### V0 — The item pool (FR-025, FR-050 → FR-054)

With a round running, open **Add items** and type `Force Blade`, `Chakra Ring`, `Guardian Boots`
into **Item names**, one per line.

- All three appear in the pool, in the order they were typed.
- Distribute **Chakra Ring**, not the first one — the pool is a list to pick from, not a queue.
- Award it. Chakra Ring is gone from the pool; the other two are still waiting.
- Remove `Guardian Boots` from the pool. It disappears without ever being distributed.
- Distribute one, then **← Back to the pool** → the item returns and nothing reaches the history.
  With a pass already recorded, the same button asks before discarding it.
- Reset the round → the items it consumed come back to the pool.
- Delete that round's history instead → they do not.

**Proves**: FR-025, FR-050, FR-051, FR-052, FR-053, FR-054, FR-055.

### V1 — The core loop (User Story 1, FR-026 → FR-030)

Sign in, add `Ash 88000`, `Bex 74000`, `Cyd 51000`, start a round with **rank by current CP**, add
`Force Blade` to the pool, then distribute it.

- The line reads Ash, Bex, Cyd; Ash holds the offer.
- Pass for Ash → offer moves to Bex; Ash is still shown as eligible.
- Pass for Bex → offer moves to Cyd.
- Award to Cyd → Cyd leaves the line; Ash and Bex remain, in that order, for the next item.
- Cyd's line row and roster row both read **received Force Blade** (FR-056).

**Proves**: FR-026, FR-027, FR-028, FR-029, FR-030 and spec US1 scenarios 1–3.

### V2 — Manual award and unclaimed (FR-031 → FR-034)

From V1's state, pool `Ice Shield`, distribute it, and pass for every eligible member.

- The close prompt offers both **award manually** and **record unclaimed**.
- Record unclaimed → nobody leaves the line; the history entry shows unclaimed with both passers.
- Start `Flame Aura`, immediately award manually to Bex → Bex leaves the line and the history entry
  is flagged as a manual award.
- Attempt a manual award to Cyd (already received in V1) → rejected with `GS004`.

**Proves**: FR-031, FR-032, FR-033, FR-034, US1 scenarios 4–5, and the "everyone passes" and
"manual award to an already-served member" edge cases.

### V3 — Undo (FR-035)

Immediately after V2's manual award, undo.

- Bex is eligible again at their original position, the distribution is back in progress, and the
  history entry is gone.
- Undo again → the last pass is removed and the offer returns to that member.

**Proves**: FR-035 and US1 scenario 6.

### V4 — Round completion and the ordering choice (User Story 2, FR-037 → FR-039)

Award to the remaining members until the round completes.

- The app reports **Round 1 complete** and does not silently start Round 2.
- Before confirming, edit Ash's CP to `40000` — Ash is flagged as having a pending change and the
  line still shows Ash first, on the ranked-on value.
- Choose **reuse previous sequence** → Round 2 opens Ash, Bex, Cyd, and Ash's pending flag remains.
- Reset, then choose **rank by current CP** → Round 2 opens Bex, Cyd, Ash, and the flag clears.

**Proves**: FR-018, FR-019, FR-020, FR-021, FR-022, FR-037, FR-038, US2 scenarios 1–4, US4
scenarios 4–5, and the "edited and edited back" edge case.

### V5 — Roster changes mid-round (User Story 4)

During an active round: add `Dov 66000`, remove Bex, rename Cyd.

- Dov becomes eligible immediately and sits between Ash and Cyd by CP, with nobody renumbered.
- Bex vanishes from the line but their earlier awards and passes remain in the history under the
  name recorded at the time.
- Adding a second `ash` (any casing) is rejected as a duplicate.
- CP values of `-1` and `abc` are rejected; `0` is accepted.

**Proves**: FR-008 → FR-014, FR-023, FR-041, US4 scenarios 1–3 and 6.

### V6 — Persistence across devices (User Story 3, FR-004)

Record activity, sign out, sign in from a second browser profile.

- Roster, round number, ordering mode, position in the line, and history are identical.

**Proves**: FR-002, FR-004, US3 scenarios 1–2, and **SC-005**.

### V7 — Cross-account isolation (FR-005, SC-006)

The highest-value test in the suite. As an integration test, not by hand:

- Create accounts A and B, each with a roster.
- Signed in as B, attempt to select A's `members`, `rounds`, `round_entries`, `distributions`,
  `offer_responses`, and both views, by explicit id.
- Every read returns zero rows. Every write against A's ids is rejected.
- Repeat against `v_round_line` and `v_current_offer` specifically — a view created without
  `security_invoker` would pass the table checks and fail here.

**Proves**: FR-005, FR-006, **SC-006**.

### V8 — Concurrency and retry (FR-048, FR-049)

Integration-level, two clients on the same account:

- Both award the same item to the same member at once → one succeeds, the other fails cleanly.
  The member has exactly one award in the round.
- A stale client passes for a member who is no longer the holder → `GS003`, no response written.
- Replaying a write with the same `client_action_id` → returns the original row, creates nothing.

**Proves**: FR-048, FR-049, and **SC-004**.

### V9 — Mobile (FR-047, SC-008)

Playwright at 360 × 640:

- On the live distribution screen the current offer holder is visible without scrolling.
- No horizontal scrollbar on any primary screen.
- Pass and award controls measure at least 44 px on their shorter side.
- A 60-character member name does not overflow its row.

**Proves**: FR-047, **SC-003**, **SC-008**, and the long-name edge case.

### V10 — Guarded history deletion (User Story 5, FR-043 → FR-046)

With at least two completed rounds and one in progress:

- Requesting deletion of a completed round shows how many rounds and distributions will be destroyed.
- Typing `yes`, ` YES `, or `Y` leaves the control disabled and, if forced through the action
  directly, is refused with `GS010` — nothing is deleted.
- Typing exactly `YES` deletes the round along with its entries, distributions, and responses.
- Requesting deletion of the **active** round is refused with `GS011` and points at round reset.
- After deleting the earliest round, the roster is unchanged and the next round to start still takes
  the next number in sequence rather than reusing the deleted one.
- Calling the RPC directly with a valid round id but no confirmation is refused — proving the guard
  is server-side, not a property of the dialog.

**Proves**: FR-043, FR-044, FR-045, FR-046, US5 scenarios 4–5, and the three deletion edge cases.

### V11 — A removed member cannot strand a round (FR-037)

With an active round in which one member remains eligible:

- Remove that member from the roster.
- The round reports complete rather than sitting active with an empty line, and the officer is
  offered the next round's ordering choice.

**Proves**: FR-037 and the "last remaining eligible member is removed" edge case.

---

## Known pitfalls

- **`middleware.ts` does nothing on Next 16.** The file is `proxy.ts`. Supabase's bootstrap page
  still shows the old name. Symptom: sessions stop refreshing and users appear to be logged out at
  random.
- **Dropping the `headers` argument in `setAll`.** Those cache headers must reach the response, or a
  CDN can serve one account's authenticated response to another.
- **`getSession()` on the server.** Use `getClaims()`. `getSession()` does not guarantee
  revalidation and must not gate anything.
- **A view without `security_invoker = on`** runs as its owner and bypasses RLS on its base tables.
  V7 exists specifically to catch this.
- **Synchronous `cookies()` / `headers()` / `params`.** Removed in Next 16 — always `await`.
- **Confirming a deletion in the dialog only.** The `YES` check belongs in `delete_round_history`;
  a UI-only guard is bypassed by any direct call. V10's last step exists to catch that.
- **Completing a round only on award.** A roster deletion can remove the last eligible member and
  strand the round. V11 exists to catch that.
- **Deriving what is in the pool without covering history deletion.** Availability comes from
  `distributions.item_id`; deleting a round cascades its distributions away, so without the explicit
  cleanup in `delete_round_history` every item the round handed out reappears as if it never had.
- **Scoping a round to the account rather than the line.** `rounds_one_active_per_line`, not
  per-owner; `start_distribution` finds the round through the item's line. Getting this wrong makes
  a second line silently impossible to start.
