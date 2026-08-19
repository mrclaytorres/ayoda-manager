/**
 * T025 — pure ordering logic.
 *
 * A mirror of the SQL, not a second authority on it: the database decides, this lets the UI reason
 * about the line without a round trip and lets the rules be unit-tested in isolation. Nothing here
 * imports Supabase.
 *
 * The order is **one key**. It used to be `(ranked_cp desc, tiebreak_seq asc)`, which cannot
 * express an order the app does not derive — so a line with no Combat Power had none. `position_seq`
 * is the position: every mode assigns it, and the officer can rewrite it (FR-063).
 */

export type OrderingMode = 'current_cp' | 'carry_previous' | 'manual';

export interface RankableMember {
  id: string;
  name: string;
  /** Optional: a line ordered by hand may never use it (FR-010). */
  combat_power: number | null;
  created_at: string;
}

export interface OrderedEntry {
  member_id: string;
  ranked_cp: number | null;
  position_seq: number;
}

export interface LineEntry {
  member_id: string;
  name: string;
  ranked_cp: number | null;
  current_cp: number | null;
  position_seq: number;
  received_at: string | null;
}

export interface LinePosition extends LineEntry {
  position: number;
  eligible: boolean;
  cp_change_pending: boolean;
  tied: boolean;
}

/**
 * Combat Power descending, then the older roster entry, then id as a final deterministic fallback.
 * A member with no Combat Power sorts below every member who has one, zero included: zero is a
 * ranking, blank is unranked (FR-062).
 */
function byCombatPower(a: RankableMember, b: RankableMember): number {
  if (a.combat_power === null && b.combat_power === null) {
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  }
  if (a.combat_power === null) return 1;
  if (b.combat_power === null) return -1;
  return (
    b.combat_power - a.combat_power ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The positions assigned at round start. `current_cp` and `manual` both start here — manual then
 * exists to be rearranged, and starting it from a shuffle would waste the officer's time.
 */
export function assignPositions(members: readonly RankableMember[]): OrderedEntry[] {
  return [...members].sort(byCombatPower).map((m, index) => ({
    member_id: m.id,
    ranked_cp: m.combat_power,
    position_seq: index + 1,
  }));
}

/** Order the round exactly as the database does: position_seq, then member_id. */
export function orderLine<T extends { position_seq: number; member_id: string }>(
  entries: readonly T[],
): T[] {
  return [...entries].sort(
    (a, b) => a.position_seq - b.position_seq || a.member_id.localeCompare(b.member_id),
  );
}

/**
 * Derive display positions and the flags the line screen needs.
 *
 * Both flags are suppressed on a hand-arranged round: it was never ranked on Combat Power, so
 * there is no pending change to report against and no tie to settle.
 */
export function positionLine(
  entries: readonly LineEntry[],
  orderingMode: OrderingMode = 'current_cp',
): LinePosition[] {
  const ordered = orderLine(entries);
  const cpCounts = new Map<number, number>();
  for (const e of ordered) {
    if (e.ranked_cp !== null) cpCounts.set(e.ranked_cp, (cpCounts.get(e.ranked_cp) ?? 0) + 1);
  }
  const ranked = orderingMode !== 'manual';

  return ordered.map((e, index) => ({
    ...e,
    position: index + 1,
    eligible: e.received_at === null,
    // FR-019: derived, so editing a CP and editing it back leaves no residue.
    cp_change_pending: ranked && e.current_cp !== e.ranked_cp,
    tied: ranked && e.ranked_cp !== null && (cpCounts.get(e.ranked_cp) ?? 0) > 1,
  }));
}

/**
 * Where a member joining mid-round goes (FR-023).
 *
 * By Combat Power, shifting everyone below them down one — unless there is nothing to place them
 * by, in which case they go to the back. Guessing a position inside an arrangement the officer set
 * by hand would silently undo it.
 */
export function placeJoiner(
  entries: readonly OrderedEntry[],
  combatPower: number | null,
  options: { orderingMode: OrderingMode; reordered?: boolean } = { orderingMode: 'current_cp' },
): { position_seq: number; shifted: string[] } {
  const back = entries.reduce((max, e) => Math.max(max, e.position_seq), 0) + 1;

  if (options.orderingMode === 'manual' || options.reordered || combatPower === null) {
    return { position_seq: back, shifted: [] };
  }

  const ahead = entries.filter((e) => e.ranked_cp !== null && e.ranked_cp >= combatPower).length;
  const position = ahead + 1;
  return {
    position_seq: position,
    shifted: entries.filter((e) => e.position_seq >= position).map((e) => e.member_id),
  };
}

/** Carry a completed round's sequence forward, appending members who joined since (FR-020). */
export function carryPreviousOrder(
  previous: readonly OrderedEntry[],
  currentMembers: readonly RankableMember[],
): OrderedEntry[] {
  const surviving = new Set(currentMembers.map((m) => m.id));
  const kept = previous.filter((e) => surviving.has(e.member_id));

  const carried = new Set(kept.map((e) => e.member_id));
  const newcomers = currentMembers.filter((m) => !carried.has(m.id));

  let seq = kept.reduce((max, e) => Math.max(max, e.position_seq), 0);
  const appended = [...newcomers].sort(byCombatPower).map((m) => ({
    member_id: m.id,
    ranked_cp: m.combat_power,
    position_seq: ++seq,
  }));

  return [...kept, ...appended];
}

/**
 * Apply a hand-made arrangement (FR-063).
 *
 * Rejects a list that is not exactly the round's members: one that quietly drops somebody would
 * take them out of the line, which is removal, not reordering.
 */
export function applyManualOrder(
  entries: readonly OrderedEntry[],
  memberIds: readonly string[],
): OrderedEntry[] {
  const present = new Set(entries.map((e) => e.member_id));
  const asked = new Set(memberIds);

  if (
    memberIds.length !== entries.length ||
    asked.size !== memberIds.length ||
    memberIds.some((id) => !present.has(id))
  ) {
    throw new Error('That order does not match the members in this round.');
  }

  const byId = new Map(entries.map((e) => [e.member_id, e]));
  return memberIds.map((id, index) => ({ ...byId.get(id)!, position_seq: index + 1 }));
}

export function roundProgress(entries: readonly { received_at: string | null }[]) {
  const total = entries.length;
  const received = entries.filter((e) => e.received_at !== null).length;
  return { received, total, complete: total > 0 && received === total };
}
