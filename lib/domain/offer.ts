/**
 * T026 — pure offer resolution.
 *
 * Whose turn it is, is never stored: it is the highest-ranked eligible member who has not yet
 * responded to this distribution. Deriving it is what reduces undo to deleting a row (FR-035).
 */
import { orderLine } from './ordering';

export interface OfferCandidate {
  member_id: string;
  name: string;
  ranked_cp: number | null;
  position_seq: number;
  received_at: string | null;
}

export interface Responded {
  member_id: string | null;
}

export function eligibleMembers<T extends { received_at: string | null }>(
  entries: readonly T[],
): T[] {
  // FR-028, FR-036: a member who has received an item is out of the line for the round.
  return entries.filter((e) => e.received_at === null);
}

/** The current offer holder, or null when everyone eligible has already responded. */
export function currentOfferHolder(
  entries: readonly OfferCandidate[],
  responses: readonly Responded[],
): OfferCandidate | null {
  const responded = new Set(responses.map((r) => r.member_id).filter((id): id is string => !!id));
  const remaining = orderLine(eligibleMembers(entries)).filter((e) => !responded.has(e.member_id));
  return remaining[0] ?? null;
}

/** True when every eligible member has responded and the distribution needs settling. */
export function allEligibleHaveResponded(
  entries: readonly OfferCandidate[],
  responses: readonly Responded[],
): boolean {
  return eligibleMembers(entries).length > 0 && currentOfferHolder(entries, responses) === null;
}

/** FR-033: a manual award is only valid for a member still eligible in this round. */
export function canAwardManually(
  entries: readonly OfferCandidate[],
  memberId: string,
): { allowed: boolean; reason?: 'not-in-round' | 'already-received' } {
  const entry = entries.find((e) => e.member_id === memberId);
  if (!entry) return { allowed: false, reason: 'not-in-round' };
  if (entry.received_at !== null) return { allowed: false, reason: 'already-received' };
  return { allowed: true };
}

/**
 * FR-037: the round is complete when nobody is eligible — whether the last eligible member received
 * a skill or was removed from the roster. Evaluating this only on the award path is what strands a
 * round with an empty line.
 */
export function roundIsComplete(entries: readonly { received_at: string | null }[]): boolean {
  return eligibleMembers(entries).length === 0;
}
