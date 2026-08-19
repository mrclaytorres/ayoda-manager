// T032 — offer resolution. FR-026, FR-028, FR-030, FR-033, FR-036, FR-037.
import { describe, expect, it } from 'vitest';
import {
  allEligibleHaveResponded,
  canAwardManually,
  currentOfferHolder,
  eligibleMembers,
  roundIsComplete,
} from '@/lib/domain/offer';

const entry = (id: string, cp: number, seq: number, received: string | null = null) => ({
  member_id: id,
  name: id.toUpperCase(),
  ranked_cp: cp,
  position_seq: seq,
  received_at: received,
});

const line = [entry('ash', 88_000, 1), entry('bex', 74_000, 2), entry('cyd', 51_000, 3)];

describe('currentOfferHolder', () => {
  it('offers to the highest-ranked eligible member', () => {
    expect(currentOfferHolder(line, [])?.member_id).toBe('ash');
  });

  it('moves down the line as members pass, keeping passers eligible', () => {
    const after = currentOfferHolder(line, [{ member_id: 'ash' }]);
    expect(after?.member_id).toBe('bex');
    // FR-030: passing costs nothing — Ash is still in the line.
    expect(eligibleMembers(line).map((e) => e.member_id)).toContain('ash');
  });

  it('skips members who already received a skill this round', () => {
    const served = [entry('ash', 88_000, 1, '2026-08-18T10:00:00Z'), entry('bex', 74_000, 2)];
    expect(currentOfferHolder(served, [])?.member_id).toBe('bex');
  });

  it('returns null once every eligible member has responded', () => {
    const responses = [{ member_id: 'ash' }, { member_id: 'bex' }, { member_id: 'cyd' }];
    expect(currentOfferHolder(line, responses)).toBeNull();
  });

  it('ignores responses from members who were since deleted', () => {
    expect(currentOfferHolder(line, [{ member_id: null }])?.member_id).toBe('ash');
  });
});

describe('allEligibleHaveResponded', () => {
  it('is true when the whole line has passed', () => {
    const responses = [{ member_id: 'ash' }, { member_id: 'bex' }, { member_id: 'cyd' }];
    expect(allEligibleHaveResponded(line, responses)).toBe(true);
  });

  it('is false while someone is still to be asked', () => {
    expect(allEligibleHaveResponded(line, [{ member_id: 'ash' }])).toBe(false);
  });

  it('is false for an empty line rather than vacuously true', () => {
    expect(allEligibleHaveResponded([], [])).toBe(false);
  });
});

describe('canAwardManually', () => {
  it('allows any eligible member, not just the offer holder', () => {
    expect(canAwardManually(line, 'cyd').allowed).toBe(true);
  });

  it('refuses a member who already received this round', () => {
    const served = [entry('ash', 88_000, 1, '2026-08-18T10:00:00Z')];
    expect(canAwardManually(served, 'ash')).toEqual({
      allowed: false,
      reason: 'already-received',
    });
  });

  it('refuses a member who is not in the round at all', () => {
    expect(canAwardManually(line, 'dov')).toEqual({ allowed: false, reason: 'not-in-round' });
  });
});

describe('roundIsComplete', () => {
  it('is complete when nobody is eligible', () => {
    expect(roundIsComplete([{ received_at: 'x' }, { received_at: 'y' }])).toBe(true);
  });

  it('is complete when the last eligible member was removed, leaving an empty line', () => {
    // FR-037 — the stranded-round case. Completion is not only reachable via an award.
    expect(roundIsComplete([])).toBe(true);
  });

  it('is not complete while anyone is still eligible', () => {
    expect(roundIsComplete([{ received_at: null }])).toBe(false);
  });
});
