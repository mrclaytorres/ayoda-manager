# Contract: Next.js Server Actions and routes

**Spec**: [../spec.md](../spec.md) | **RPC contract**: [rpc.md](./rpc.md)

The UI never talks to Supabase's RPC endpoint directly. Every mutation is a Server Action that
builds a request-scoped server client from the session cookies, calls one RPC, and revalidates.

## Obligations on every action

1. Build the client with `createClient()` from `lib/supabase/server.ts` (async — Next 16 requires
   `await cookies()`).
2. Parse input with the shared Zod schema from `lib/domain/schemas.ts`. Client-side validation is a
   convenience; this parse and the database constraints are what count.
3. Mint `client_action_id` **in the browser**, once per user gesture, and pass it through. Minting
   it server-side would defeat **FR-048**, since a retried request would arrive with a fresh id.
4. Map a raised `errcode` to a user-facing message (**FR-048**); never surface a raw Postgres error.
5. `revalidatePath` the affected routes.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };
```

## Actions

| Action | Input | RPC | Requirements |
|---|---|---|---|
| `addMember` | `{ name, combatPower }` | insert `members` | FR-008, FR-009, FR-010 |
| `updateMember` | `{ id, name?, combatPower? }` | update `members` | FR-011, FR-012 |
| `removeMember` | `{ id }` | delete `members` | FR-013, FR-014 |
| `startRound` | `{ orderingMode }` | `start_round` | FR-020, FR-022, FR-038 |
| `startDistribution` | `{ itemId, clientActionId }` | `start_distribution` | FR-051 |
| `addItems` | `{ names[] }` | direct insert into `items` | FR-025, FR-050 |
| `removeItem` | `{ id }` | direct delete from `items` | FR-053 |
| `cancelDistribution` | `{ distributionId }` | `cancel_distribution` | FR-055 |
| `createLine` | `{ name }` | direct insert into `lines` | FR-057 |
| `renameLine` | `{ id, name }` | direct update on `lines` | FR-060 |
| `removeLine` | `{ id }` | direct delete from `lines` | FR-060 |
| `setRoundOrder` | `{ roundId, memberIds[] }` | `set_round_order` | FR-063 |
| `recordPass` | `{ distributionId, memberId, clientActionId }` | `record_pass` | FR-029, FR-030 |
| `recordAward` | `{ distributionId, memberId, mode, clientActionId }` | `record_award` | FR-027, FR-028, FR-031, FR-032 |
| `closeUnclaimed` | `{ distributionId, clientActionId }` | `close_unclaimed` | FR-034 |
| `undoLastAction` | `{ distributionId }` | `undo_last_action` | FR-035 |
| `resetRound` | `{ roundId }` | `reset_round` | FR-040 |
| `deleteRoundHistory` | `{ roundIds, confirmation }` | `delete_round_history` | FR-043, FR-044, FR-045, FR-046 |

The `confirmation` string on `deleteRoundHistory` is passed through to the RPC untouched — the action must not
trim, upper-case, or otherwise "help" it. The server is the authority on whether the officer confirmed.

`recordPass` and `recordAward` carry `memberId` from the rendered line, not from the server's idea
of the current holder. A stale device therefore names the wrong member and is rejected with
`GS003` instead of acting on someone else's turn.

## Auth routes

| Route | Purpose | Requirements |
|---|---|---|
| `/register` | `signUp` with email + password | FR-001 |
| `/login` | `signInWithPassword` | FR-002 |
| `/forgot-password` | `resetPasswordForEmail` | FR-003 |
| `/reset-password` | `updateUser({ password })` after the callback | FR-003 |
| `/auth/confirm` (route handler) | `verifyOtp({ token_hash, type })`, then redirect | FR-003 |
| `signOut` action | `signOut`, redirect to `/login` | FR-002 |

## `proxy.ts` (project root — **not** `middleware.ts`)

Next 16 renamed the file and removed the synchronous request APIs
([R-002](../research.md#r-002-nextjs-16-breaking-changes-that-shape-the-file-layout)). Supabase's
own bootstrap page still shows `middleware.ts`; that name silently does nothing on Next 16, so
sessions never refresh and the app appears to log users out at random.

Obligations:

- Cookie adapter exposes `getAll()` and `setAll(cookiesToSet, headers)` only. The individual
  `get` / `set` / `remove` methods are deprecated and break session handling.
- `setAll` **must** copy the `headers` argument (`Cache-Control`, `Expires`, `Pragma`) onto the
  response. Skipping it lets a CDN cache one account's authenticated response and serve it to
  another — a direct breach of **SC-006**.
- Call `supabase.auth.getClaims()`, never `getSession()`, which is not guaranteed to revalidate
  the token on the server ([R-004](../research.md#r-004-verifying-the-session-on-the-server)).
- Thin proxy: refresh the token and redirect unauthenticated requests to `/login`. Authorization
  itself is RLS's job, not the proxy's.
- Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and image extensions.

## Client obligations

| Obligation | Requirement |
|---|---|
| Optimistic update via `useOptimistic` on pass and award; reconcile on the action's result | SC-002 |
| Current offer holder rendered above the fold at 360 px | SC-003, FR-024 |
| Pass / award controls with touch targets no smaller than 44 px | FR-047, SC-008 |
| Explicit retry affordance on failure, reusing the same `clientActionId` | FR-048 |
| Destructive confirmation on `resetRound` naming what will be lost | FR-040 |
| Typed `YES` confirmation on `deleteRoundHistory`, stating the round and distribution counts, with the submit control disabled until the text matches exactly | FR-046 |
| Members with `cp_change_pending` show both the ranked-on CP and the new CP | FR-019 |
