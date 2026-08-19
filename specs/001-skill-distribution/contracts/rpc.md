# Contract: Database RPC surface

**Spec**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

Every mutation goes through one of these functions. They are the authoritative implementation of
the distribution rules; the TypeScript layer above them is a caller, not an enforcer
([R-005](../research.md#r-005-where-the-distribution-rules-are-enforced)).

## Conventions binding on all functions

- `SECURITY INVOKER` (the default). RLS therefore applies to the caller — a function is not a way
  around **FR-005**.
- `SET search_path = ''` on every function; all identifiers fully qualified. Without this a
  caller-controlled `search_path` can resolve an identifier to an attacker's object.
- Each mutating function begins `select ... from public.rounds where id = <round> for update`,
  serialising concurrent mutations on the same round. This is how **FR-049** is met.
- Functions that create a row take a caller-minted `p_client_action_id uuid`. A repeat call with
  the same id returns the existing row and changes nothing — **FR-048**.
- Errors are raised with a stable `errcode` so the UI can map them to messages without parsing
  English text.

### Error codes

| `errcode` | Meaning | Surfaced when |
|---|---|---|
| `GS001` | No active round | a distribution is started before a round exists |
| `GS002` | Roster is empty | round start attempted with no members — spec edge case |
| `GS003` | Not the current offer holder | a stale device passes/awards for the wrong member |
| `GS004` | Member already received this round | **FR-033** |
| `GS005` | Member not eligible in this round | manual award to a non-participant |
| `GS006` | Distribution already closed | action against a settled distribution |
| `GS007` | Nothing to undo | **FR-035** with an empty action log |
| `GS008` | Undo blocked — next round has activity | [R-008](../research.md#r-008-undo-across-a-round-boundary) |
| `GS009` | Round already complete | writes against a finished round |
| `GS010` | Confirmation not given | history deletion without the exact literal `YES` — **FR-046** |
| `GS011` | Cannot delete the active round | history deletion aimed at a live round — **FR-045** |
| `GS012` | Import file unreadable | `import_members` given a malformed payload |
| `GS013` | Import row rejected | a row the roster will not accept; nothing is imported |
| `GS014` | Item not available | picking an item that is gone or already distributed — **FR-052** |
| `GS015` | Order does not match the round | `set_round_order` given a list that drops, duplicates, or invents a member |
| `GS016` | Line not found | an action aimed at a line the caller does not own — **FR-057** |

---

## `start_round(p_ordering_mode ordering_mode) → rounds`

Creates the next round and its full `round_entries` snapshot.

**Behaviour**

1. Raise `GS002` if the roster is empty.
2. `round_number` = previous max + 1, or 1 for the first round.
3. Build entries for **every** current roster member, `received_at = null`:
   - `current_cp` — `ranked_cp` from `members.combat_power` now; `tiebreak_seq` assigned by
     `ORDER BY combat_power DESC, created_at ASC, id ASC`.
   - `carry_previous` — copy `ranked_cp` and `tiebreak_seq` from the previous round for members
     still on the roster; members added since are appended with their current CP and
     `max(tiebreak_seq) + 1`.
4. Record `ordering_mode` on the round.

**Requirements**: FR-016, FR-017, FR-020, FR-021, FR-022, FR-038.
Because `ranked_cp` is copied here and never updated, choosing `carry_previous` leaves pending CP
changes pending, exactly as **FR-020** describes.

---

## `set_round_order(p_round_id uuid, p_member_ids uuid[]) → rounds`

**Behaviour**: rewrites `position_seq` from the array's order. `GS009` against a completed round.
`GS015` unless the array is exactly the round's members — no drops, no duplicates, no strangers —
because an arrangement that quietly omits somebody removes them from the line, which is a different
act with a different confirmation. Stamps `reordered_at`, leaving `ordering_mode` as the record of
how the round started (**FR-064**).

**Requirements**: FR-063, FR-064.

The whole order is sent rather than a move instruction: two officers dragging at once would
otherwise compose into an arrangement neither of them chose.

---

## `start_distribution(p_item_id uuid, p_client_action_id uuid) → distributions`

**Behaviour**: the item names the line, and the line names the round — `GS001` if that line has no
active round, even while another line is mid-round. Fails if a distribution is already in progress
for the round. Locks the item, raises `GS014` if it is not the caller's or has already been
distributed, and copies its name into `item_name` as a snapshot. Returns `status = 'in_progress'`.

**Requirements**: FR-051, FR-052.

The item name is no longer a parameter: it is entered into the pool ahead of time (FR-025) and
picked here (FR-051), so the blank-name check lives on `items` rather than in this function.

---

## `cancel_distribution(p_distribution_id uuid) → void`

**Behaviour**: deletes an `in_progress` distribution, taking its `offer_responses` with it by
cascade and returning the item to the pool — availability is derived from `distributions.item_id`,
so the delete *is* the return. Raises `GS006` against a distribution that has already been settled.
A distribution that is already gone is a **success**, not an error: the caller asked for it to not
exist, and it does not (**FR-048**).

**Requirements**: FR-055.

Distinct from `close_unclaimed`, which records that the item was offered and refused. This records
nothing at all.

---

## `record_pass(p_distribution_id uuid, p_member_id uuid, p_client_action_id uuid) → offer_responses`

**Behaviour**: verifies `p_member_id` equals the computed current offer holder from
`v_current_offer`; raises `GS003` if not. Appends a `pass` response with `seq = max + 1` and the
member's name snapshot. The passing member's `round_entries.received_at` is **not** touched.

**Requirements**: FR-029, FR-030.

Passing `p_member_id` explicitly is the concurrency guard: if the officer's second device is
showing a stale line, its pass names the wrong member and is rejected rather than silently
applied to whoever happens to be first now.

---

## `record_award(p_distribution_id uuid, p_member_id uuid, p_mode award_mode, p_client_action_id uuid) → distributions`

**Behaviour**

1. `GS004` if the member already has `received_at` set for this round.
2. `GS005` if the member has no `round_entries` row for this round.
3. When `p_mode = 'sequence'`, `p_member_id` must be the current offer holder (`GS003`).
   When `p_mode = 'manual'`, any eligible member is accepted, at any point in the distribution —
   including after everyone has passed.
4. Append an `accept` response, set `received_at`, and close the distribution as `awarded` with
   `award_mode`, `recipient_member_id`, and the `recipient_name` snapshot.
5. If no eligible entries remain, set the round `complete` with `completed_at`. **No new round is
   created** — the officer chooses the next ordering ([R-009](../research.md#r-009-when-the-next-round-is-created)).

**Requirements**: FR-027, FR-028, FR-031, FR-032, FR-033, FR-036, FR-037.

### Round completion has two paths, not one

Completion is reachable in **two** ways, and both must set the round `complete`:

1. **The last award** — handled here, in step 5.
2. **The removal of the last eligible member** — when a roster deletion cascades away the final
   `round_entries` row with a null `received_at`. Handled by an `after delete` trigger on
   `round_entries`.

Treating award as the only path leaves an active round with zero eligible members and no way to
progress — the officer can start a distribution but nobody can ever be offered it. The spec calls
this out directly: the round must complete "immediately rather than stalling with an empty line".

---

## `close_unclaimed(p_distribution_id uuid, p_client_action_id uuid) → distributions`

**Behaviour**: sets `status = 'unclaimed'` and `closed_at`. Touches no `round_entries`; the round
position is unchanged and nobody is removed from the line.

**Requirements**: FR-034. Together with a manual award, this is the officer's choice for closing an
all-pass distribution (**FR-031**, spec User Story 1 scenario 5).

---

## `undo_last_action(p_distribution_id uuid) → distributions`

**Behaviour**, in order of what the most recent action was:

| Last action | Undo effect |
|---|---|
| `pass` | delete the highest-`seq` response; holder recomputes from the view |
| award (either mode) | reopen to `in_progress`, clear recipient / mode / `closed_at`, clear the recipient's `received_at`, delete the `accept` response |
| unclaimed close | reopen to `in_progress` |
| none | raise `GS007` |

If undoing an award also un-completes the round, the round returns to `active`. If a later round
was already started, it is deleted when it holds no distributions; otherwise `GS008` is raised
and the message points at manual reset.

**Requirements**: FR-035, and [R-008](../research.md#r-008-undo-across-a-round-boundary).

---

## `reset_round(p_round_id uuid) → rounds`

**Behaviour**: deletes all distributions for the round (cascading their responses), clears every
`received_at`, returns `status` to `active`. `round_number`, `ranked_cp`, and `tiebreak_seq` are
preserved — a reset restarts the round, it does not re-rank it.

**Requirements**: FR-040. The confirmation warning is a UI obligation; the function assumes it has
already been given.

---

## `delete_round_history(p_round_ids uuid[], p_confirmation text) → integer`

Permanently destroys the history of completed rounds. Returns the number of rounds deleted.

**Behaviour**

1. Raise `GS010` unless `p_confirmation` is exactly the literal `YES` — byte-for-byte, no trimming
   and no case folding. **The guard lives here, not only in the dialog.** A confirmation enforced
   solely in the interface is not a confirmation; it is a suggestion that any direct API call
   ignores. This is why **FR-046** names the server explicitly.
2. Raise `GS011` if any id in `p_round_ids` refers to a round whose `status` is `active`. Resetting
   a live round is `reset_round`'s job (**FR-040**); deleting it is never right.
3. Delete the named rounds. `round_entries`, `distributions`, and `offer_responses` cascade.
4. Ids that match no round are ignored rather than raising — a second device may already have
   deleted them, and the caller's intent is satisfied either way.
5. `members` are untouched, and `rounds.round_number` continues from its previous high-water mark
   rather than restarting, so a future round cannot reuse a deleted round's number.

**Requirements**: FR-043, FR-044, FR-045, FR-046.

RLS still applies — `p_round_ids` naming another account's rounds deletes nothing, because those
rows are not visible to delete.

---

## Read paths

Reads go through PostgREST against the views and tables directly, under RLS. No RPC needed.

| Screen | Source | Requirements |
|---|---|---|
| The line | `v_round_line` filtered to the active round | FR-015, FR-017, FR-019, FR-024 |
| Current offer | `v_current_offer` | FR-026 |
| Round progress | `rounds` + count of `received_at` | FR-039 |
| History | `distributions` joined to `offer_responses`, filterable by member and round | FR-041, FR-042, FR-043 |
| Deletable rounds | `rounds` where `status = 'complete'`, with distribution counts | FR-044 |
