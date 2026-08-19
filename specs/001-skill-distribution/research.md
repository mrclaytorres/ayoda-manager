# Phase 0 Research: Guild Item Loot Distribution

**Date**: 2026-08-18 | **Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

All versions below were read from the npm registry on 2026-08-18, not from memory.

---

## R-001: Framework and runtime versions

**Decision**: Next.js 16.3.1 (App Router, Turbopack default), React 19.2.8, TypeScript 5.9+, Node.js 22 LTS.

**Rationale**: The user specified Next.js. 16.3.1 is `latest` on npm. Next 16 requires Node 20.9+ and React 19.2 in the App Router; the local toolchain is Node 22.20.0, which satisfies this.

**Alternatives considered**: Pinning to Next 15.5.x to avoid the 16 migration surface. Rejected — this is a greenfield project, so there is no migration to perform and no reason to start on an older major.

---

## R-002: Next.js 16 breaking changes that shape the file layout

**Decision**: Use `proxy.ts` at the project root (not `middleware.ts`), and `await` every request API.

**Rationale**: Next 16 renamed `middleware.ts` to `proxy.ts` and runs it on the Node.js runtime only. The synchronous forms of `cookies()`, `headers()`, `draftMode()`, `params`, and `searchParams` were fully removed — the Next 15 warning shim is gone, so they must be awaited. Config flags renamed accordingly (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`).

**Consequence for this feature**: Supabase's own "Bootstrap Next.js v16 app with Supabase Auth" prompt page still shows the file as `middleware.ts`. That guidance is stale for Next 16; the code inside is correct but the file must be named `proxy.ts`. This is the single most likely source of a "why is auth not refreshing" bug during implementation, so it is called out in [quickstart.md](./quickstart.md).

**Alternatives considered**: Keeping `middleware.ts` for the Edge runtime. Rejected — nothing here needs Edge, and Node runtime is required for the Supabase server client anyway.

---

## R-003: Supabase auth integration pattern

**Decision**: `@supabase/ssr` 0.12.4 with `@supabase/supabase-js` 2.112.3. Three client factories: browser (`createBrowserClient`), server (`createServerClient` over `await cookies()`), and proxy (`createServerClient` over the request/response cookie jars).

**Rationale**: `@supabase/ssr` is the current supported package; the older auth-helpers packages are deprecated. The cookie interface is `getAll()` / `setAll(cookiesToSet, headers)` only — the individual `get` / `set` / `remove` methods are deprecated and break session handling. Note the second `headers` argument to `setAll`: it carries `Cache-Control`, `Expires`, and `Pragma` headers that must be copied onto the HTTP response, otherwise a CDN can cache one user's session response and serve it to another. That is a direct threat to **SC-006** (zero cross-account disclosure), so it is a contract requirement, not a detail.

**Alternatives considered**: Rolling auth on our own tables. Rejected — reimplementing password reset, session refresh, and token rotation for a guild utility is unjustifiable risk for **FR-001** through **FR-003**.

---

## R-004: Verifying the session on the server

**Decision**: Use `supabase.auth.getClaims()` in `proxy.ts` and in server code. Never `getSession()` on the server.

**Rationale**: Supabase's server-side auth guide is explicit: `getSession()` is not guaranteed to revalidate the token and must not be trusted in server code. `getClaims()` validates the JWT signature against the project's published public keys on every call, and does so locally — no network round trip per request — which suits the "thin proxy" pattern Next 16 encourages: check the session in the proxy, do the real authorization in the database.

**Alternatives considered**: `getUser()`, which Supabase's older examples use. It is safe (it calls the Auth server) but adds a network round trip to every matched request. `getClaims()` gives the same safety more cheaply. `getUser()` remains fine in server actions where a round trip is already happening.

---

## R-005: Where the distribution rules are enforced

**Decision**: Enforce every state transition in Postgres — as constraints plus a small set of `SECURITY INVOKER` RPC functions — and have Next.js Server Actions call those RPCs. No distribution rule is enforced only in TypeScript.

**Rationale**: This is the central architectural decision, and it comes straight from three requirements that are hard to satisfy any other way:

- **FR-036 / FR-033** (a member must never receive two items in one round) becomes a partial unique index on `(round_id, recipient_member_id)`. A race between two devices cannot violate it.
- **FR-049** (concurrent sessions must not double-award or double-log) becomes `SELECT ... FOR UPDATE` on the round row inside each RPC, serialising all mutations for a given round.
- **FR-048** (retry after a failed save must not duplicate) becomes a `client_action_id` UUID minted by the client and covered by a unique index — a retry with the same id is a no-op that returns the original row.

Enforcing these in application code would leave every one of them open to a lost update between two phones on the same account during a raid.

**Alternatives considered**: Validate in Server Actions against a read of current state. Rejected — read-then-write without a lock is exactly the race the spec's edge cases describe. Optimistic concurrency via a version column was also considered; it works, but it pushes retry logic into the UI for no benefit over row locking at this scale (rosters in the tens).

---

## R-006: Representing the round order

**Decision**: Store the order as a snapshot in `round_entries(ranked_cp, tiebreak_seq)` and derive position with `ORDER BY ranked_cp DESC, tiebreak_seq ASC`. Never store a dense position integer.

**Rationale**: This single representation satisfies four requirements at once:

- **FR-018** (the round never re-sorts mid-round) — `ranked_cp` is a snapshot; editing `members.combat_power` cannot move anyone.
- **FR-017** (stable, repeatable tie-break) — `tiebreak_seq` is persisted, so two members on equal CP appear in the same order on every page load, on every device.
- **FR-023** (a member added mid-round slots in by CP) — give them their current CP and `max(tiebreak_seq) + 1`. They land in the right place with no renumbering of anyone else.
- **FR-019 / FR-021** (pending CP changes, flags that clear themselves) — "pending" is `members.combat_power IS DISTINCT FROM round_entries.ranked_cp`. It is computed, never stored, so it cannot drift out of sync and it clears automatically the moment a new round adopts the new value. Editing a CP and editing it back leaves no residue, which is one of the spec's edge cases handled for free.

**Alternatives considered**: A stored `position` column. Rejected — every mid-round addition would require renumbering, which is both a write amplification problem and a source of ordering bugs. A stored `cp_change_pending` boolean was rejected for the same class of reason: derived state that is stored is state that can be wrong.

---

## R-007: Deriving the current offer holder

**Decision**: Do not store "whose turn it is". Derive it: the highest-ranked member in the round who has not yet received an item and has not yet responded to *this* distribution.

**Rationale**: Makes **FR-035** (undo) almost free. Undoing a pass is deleting the last `offer_responses` row; the offer holder recomputes itself. There is no pointer to rewind and therefore no way for a pointer to disagree with the response log.

**Alternatives considered**: A `current_member_id` column on `distributions`. Rejected — it duplicates information already implied by the response log, and undo then has to keep two things consistent.

---

## R-008: Undo across a round boundary

**Decision**: Undo of a round-completing award is permitted, and rolls back the newly started round **only if that round has no distributions yet**. Otherwise the action is refused with an explanation pointing at manual round reset (**FR-040**).

**Rationale**: **FR-035** asks for undo of the most recent award without qualification, and the most recent award is often the one that completed the round. Refusing outright would fail the requirement. Cascading a rollback through a round that has already seen activity, however, would silently destroy records the officer has not asked to lose. The "empty next round" condition is the exact line between the two, and it is cheap to test.

**Alternatives considered**: Blocking all cross-round undo (fails FR-035 for the common case) and unrestricted cascade (destroys data).

---

## R-009: When the next round is created

**Decision**: Completing a round does not silently create the next one. The app moves to a round-start screen offering the two ordering choices, defaulting to "rank by current Combat Power". The new round row is written when the officer confirms.

**Rationale**: **FR-020** requires the officer to *choose* the ordering, and **FR-038** requires a new round to start on completion. Creating the round eagerly with a default would make the choice retroactive. Deferring creation to the confirmation satisfies both, and has the useful side effect of making R-008's rollback condition trivially true right after completion. A partial unique index guarantees at most one active round per account, so the app is never ambiguous about which round is live.

**Alternatives considered**: Auto-create with `current_cp` and let the officer change it afterwards. Rejected — "change the ordering of a round already in progress" reintroduces exactly the mid-round re-sorting that FR-018 forbids.

---

## R-010: Tenancy and isolation

**Decision**: Denormalise `owner_id uuid NOT NULL DEFAULT auth.uid()` onto every table. RLS policies read `owner_id = (SELECT auth.uid())`. Views are created `WITH (security_invoker = on)`.

**Rationale**: **FR-005** and **SC-006** demand that isolation hold on every path, including any future direct API access — so it belongs in the database, not in query helpers a developer can forget. Wrapping `auth.uid()` in a scalar subquery is Supabase's documented RLS performance pattern: it lets the planner evaluate it once as an InitPlan rather than per row. `security_invoker` on views is required, otherwise a view runs as its owner and quietly bypasses the RLS of its base tables — a textbook way to build the exact leak SC-006 forbids.

**Alternatives considered**: A `guilds` table joined in each policy. Rejected — a join in every policy on every row is both slower and easier to get wrong than a column comparison. Guild naming lives on a small `profiles` table instead.

---

## R-011: Preserving history when a member is deleted

**Decision**: `round_entries.member_id` cascades on delete; `distributions.recipient_member_id` and `offer_responses.member_id` are `ON DELETE SET NULL` alongside a `recipient_name` / `member_name` text snapshot captured at write time.

**Rationale**: **FR-013** wants a removed member gone from the line, while **FR-014** wants their past awards and passes retained. Cascade gives the first, snapshot-plus-null gives the second, and the history stays readable because the name was copied at the time it mattered.

**Pitfall this avoids**: a `CHECK` constraint asserting `recipient_member_id IS NOT NULL` for awarded rows would be re-evaluated when `ON DELETE SET NULL` fires, and deleting a member would fail with a constraint violation. The check therefore asserts on `recipient_name`, which never disappears.

---

## R-012: Testing strategy

**Decision**: Three layers — Vitest 4.1.10 for pure ordering and offer-resolution logic; Vitest integration tests against a local Supabase stack (`supabase start`) that exercise the RPCs and, with two real accounts, prove cross-account isolation; Playwright 1.62.1 for end-to-end journeys driven at a 360 px viewport.

**Rationale**: The riskiest logic is in SQL, so the integration layer is where most of the value is — a test that signs in as account B and confirms it cannot read account A's roster is a direct, executable check of **SC-006**. Driving Playwright at 360 px makes **SC-008** a test rather than an opinion.

**Alternatives considered**: pgTAP for database tests. It is the more idiomatic choice for pure SQL assertions, but it would mean a second test runner and language for the team to maintain, and it cannot express the "sign in as a real second user" check that matters most here.

---

## R-013: Styling and validation

**Decision**: Tailwind CSS 4.3.3 and Zod 4.4.3.

**Rationale**: Tailwind's mobile-first defaults make **FR-047** and **SC-008** the path of least resistance rather than a retrofit. Zod schemas are shared between Server Action input parsing and client-side form feedback, so the CP and item-name rules in **FR-010** and **FR-025** are written once — with the database constraints as the authoritative backstop.

---

## R-014: Real-time synchronisation between the officer's devices

**Decision**: Out of scope for the initial build; revisit after the core loop ships.

**Rationale**: **FR-049** requires that concurrent sessions cannot *corrupt* data, and R-005 delivers that in the database. Keeping two screens visually in step is a comfort feature, not a correctness one. Supabase Realtime subscriptions on `distributions` and `offer_responses` would add it later without schema change.

**Alternatives considered**: Building it now. Rejected as scope the spec does not ask for.

---

## Sources

- [Next.js 16 release notes](https://nextjs.org/blog/next-16)
- [Upgrading: Version 16 — Next.js](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Setting up Server-Side Auth for Next.js — Supabase](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Creating a Supabase client for SSR — Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [AI Prompt: Bootstrap Next.js v16 app with Supabase Auth — Supabase](https://supabase.com/docs/guides/getting-started/ai-prompts/nextjs-supabase-auth)
