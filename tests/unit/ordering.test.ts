// T025 — the pure ordering rules. FR-016 → FR-023, FR-062 → FR-064.
import { describe, expect, it } from 'vitest';
import {
  applyManualOrder,
  assignPositions,
  carryPreviousOrder,
  orderLine,
  placeJoiner,
  positionLine,
  roundProgress,
  type RankableMember,
} from '@/lib/domain/ordering';

const member = (
  id: string,
  combat_power: number | null,
  created_at = '2026-01-01T00:00:00Z',
): RankableMember => ({ id, name: id, combat_power, created_at });

describe('assignPositions', () => {
  it('ranks Combat Power descending', () => {
    const ordered = assignPositions([
      member('c', 51_000),
      member('a', 88_000),
      member('b', 74_000),
    ]);
    expect(ordered.map((e) => e.member_id)).toEqual(['a', 'b', 'c']);
    expect(ordered.map((e) => e.position_seq)).toEqual([1, 2, 3]);
  });

  it('settles equal Combat Power by the older roster entry, then by id', () => {
    const ordered = assignPositions([
      member('later', 80_000, '2026-03-01T00:00:00Z'),
      member('earlier', 80_000, '2026-01-01T00:00:00Z'),
    ]);
    expect(ordered.map((e) => e.member_id)).toEqual(['earlier', 'later']);
  });

  it('is stable across repeated calls, so the line never shifts between loads', () => {
    const roster = [member('a', 80_000), member('b', 80_000), member('c', 80_000)];
    expect(assignPositions(roster)).toEqual(assignPositions([...roster].reverse()));
  });

  it('puts members with no Combat Power below every member who has one, zero included', () => {
    const ordered = assignPositions([
      member('nil', null),
      member('zero', 0),
      member('high', 88_000),
    ]);
    // Zero is a ranking; blank is unranked. They are not the same answer.
    expect(ordered.map((e) => e.member_id)).toEqual(['high', 'zero', 'nil']);
  });

  it('orders members who all lack Combat Power by when they were added', () => {
    const ordered = assignPositions([
      member('second', null, '2026-02-01T00:00:00Z'),
      member('first', null, '2026-01-01T00:00:00Z'),
    ]);
    expect(ordered.map((e) => e.member_id)).toEqual(['first', 'second']);
  });

  it('carries the Combat Power it ranked on into the snapshot', () => {
    expect(assignPositions([member('a', 88_000), member('b', null)])).toEqual([
      { member_id: 'a', ranked_cp: 88_000, position_seq: 1 },
      { member_id: 'b', ranked_cp: null, position_seq: 2 },
    ]);
  });
});

describe('orderLine', () => {
  it('sorts by position alone, ignoring Combat Power', () => {
    // The whole point: a hand-arranged line puts a low-CP member first and stays that way.
    const entries = [
      { member_id: 'a', ranked_cp: 88_000, position_seq: 3 },
      { member_id: 'b', ranked_cp: 10, position_seq: 1 },
      { member_id: 'c', ranked_cp: null, position_seq: 2 },
    ];
    expect(orderLine(entries).map((e) => e.member_id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a duplicated position on member id, so the order is never arbitrary', () => {
    // Positions are not unique: shifting a block down to make room transiently duplicates one.
    const entries = [
      { member_id: 'b', ranked_cp: 1, position_seq: 2 },
      { member_id: 'a', ranked_cp: 2, position_seq: 2 },
    ];
    expect(orderLine(entries).map((e) => e.member_id)).toEqual(['a', 'b']);
  });
});

describe('positionLine', () => {
  const entry = (id: string, ranked: number | null, current: number | null, seq: number) => ({
    member_id: id,
    name: id,
    ranked_cp: ranked,
    current_cp: current,
    position_seq: seq,
    received_at: null,
  });

  it('numbers positions from one and marks who is still eligible', () => {
    const line = positionLine([
      { ...entry('a', 88_000, 88_000, 1), received_at: '2026-01-01T00:00:00Z' },
      entry('b', 74_000, 74_000, 2),
    ]);
    expect(line.map((r) => [r.position, r.eligible])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('flags a Combat Power edited since the round started', () => {
    const [row] = positionLine([entry('a', 88_000, 90_000, 1)]);
    expect(row.cp_change_pending).toBe(true);
  });

  it('leaves no residue when a Combat Power is edited and edited back', () => {
    const [row] = positionLine([entry('a', 88_000, 88_000, 1)]);
    expect(row.cp_change_pending).toBe(false);
  });

  it('flags equal Combat Power as tied so it can be settled by guild convention', () => {
    const line = positionLine([entry('a', 80_000, 80_000, 1), entry('b', 80_000, 80_000, 2)]);
    expect(line.map((r) => r.tied)).toEqual([true, true]);
  });

  it('does not call two unranked members tied — they share no Combat Power', () => {
    const line = positionLine([entry('a', null, null, 1), entry('b', null, null, 2)]);
    expect(line.map((r) => r.tied)).toEqual([false, false]);
  });

  it('suppresses both flags on a hand-arranged round', () => {
    // It was never ranked on Combat Power, so there is nothing pending and nothing tied.
    const line = positionLine(
      [entry('a', 80_000, 99_000, 1), entry('b', 80_000, 80_000, 2)],
      'manual',
    );
    expect(line.map((r) => [r.cp_change_pending, r.tied])).toEqual([
      [false, false],
      [false, false],
    ]);
  });
});

describe('placeJoiner', () => {
  const line = [
    { member_id: 'a', ranked_cp: 88_000, position_seq: 1 },
    { member_id: 'b', ranked_cp: 74_000, position_seq: 2 },
    { member_id: 'c', ranked_cp: 51_000, position_seq: 3 },
  ];

  it('slots a joiner in by Combat Power and shifts everyone below them', () => {
    expect(placeJoiner(line, 80_000, { orderingMode: 'current_cp' })).toEqual({
      position_seq: 2,
      shifted: ['b', 'c'],
    });
  });

  it('puts the highest Combat Power at the front', () => {
    expect(placeJoiner(line, 99_000, { orderingMode: 'current_cp' })).toEqual({
      position_seq: 1,
      shifted: ['a', 'b', 'c'],
    });
  });

  it('puts a joiner with no Combat Power at the back, shifting nobody', () => {
    expect(placeJoiner(line, null, { orderingMode: 'current_cp' })).toEqual({
      position_seq: 4,
      shifted: [],
    });
  });

  it('puts a joiner at the back of a hand-arranged round', () => {
    expect(placeJoiner(line, 99_000, { orderingMode: 'manual' })).toEqual({
      position_seq: 4,
      shifted: [],
    });
  });

  it('puts a joiner at the back of a round that was rearranged', () => {
    // The officer's arrangement is authoritative; inserting by Combat Power would undo part of it.
    expect(placeJoiner(line, 99_000, { orderingMode: 'current_cp', reordered: true })).toEqual({
      position_seq: 4,
      shifted: [],
    });
  });

  it('ties on equal Combat Power in favour of whoever was already in the line', () => {
    expect(placeJoiner(line, 74_000, { orderingMode: 'current_cp' }).position_seq).toBe(3);
  });
});

describe('carryPreviousOrder', () => {
  const previous = [
    { member_id: 'a', ranked_cp: 88_000, position_seq: 1 },
    { member_id: 'b', ranked_cp: 74_000, position_seq: 2 },
  ];

  it('keeps the previous order and the Combat Power it was ranked on', () => {
    const carried = carryPreviousOrder(previous, [member('a', 10), member('b', 99_000)]);
    // Both edited their CP; carrying means the new values stay pending, not applied.
    expect(carried).toEqual(previous);
  });

  it('drops members who have left the roster', () => {
    const carried = carryPreviousOrder(previous, [member('a', 88_000)]);
    expect(carried.map((e) => e.member_id)).toEqual(['a']);
  });

  it('appends newcomers past the maximum, ranked among themselves', () => {
    const carried = carryPreviousOrder(previous, [
      member('a', 88_000),
      member('b', 74_000),
      member('d', 30_000),
      member('c', 60_000),
    ]);
    expect(carried.map((e) => [e.member_id, e.position_seq])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('preserves a hand-made arrangement into the next round', () => {
    const arranged = [
      { member_id: 'c', ranked_cp: 51_000, position_seq: 1 },
      { member_id: 'a', ranked_cp: 88_000, position_seq: 2 },
    ];
    const carried = carryPreviousOrder(arranged, [member('a', 88_000), member('c', 51_000)]);
    expect(carried.map((e) => e.member_id)).toEqual(['c', 'a']);
  });
});

describe('applyManualOrder', () => {
  const entries = [
    { member_id: 'a', ranked_cp: 88_000, position_seq: 1 },
    { member_id: 'b', ranked_cp: 74_000, position_seq: 2 },
    { member_id: 'c', ranked_cp: null, position_seq: 3 },
  ];

  it('renumbers from the given order', () => {
    expect(applyManualOrder(entries, ['c', 'a', 'b'])).toEqual([
      { member_id: 'c', ranked_cp: null, position_seq: 1 },
      { member_id: 'a', ranked_cp: 88_000, position_seq: 2 },
      { member_id: 'b', ranked_cp: 74_000, position_seq: 3 },
    ]);
  });

  it('refuses an order that drops a member', () => {
    // Dropping somebody takes them out of the line — that is removal, not reordering.
    expect(() => applyManualOrder(entries, ['a', 'b'])).toThrow(/does not match/);
  });

  it('refuses an order that duplicates a member', () => {
    expect(() => applyManualOrder(entries, ['a', 'a', 'b'])).toThrow(/does not match/);
  });

  it('refuses an order naming somebody who is not in the round', () => {
    expect(() => applyManualOrder(entries, ['a', 'b', 'stranger'])).toThrow(/does not match/);
  });
});

describe('roundProgress', () => {
  it('counts who has received out of the whole line', () => {
    expect(roundProgress([{ received_at: '2026-01-01T00:00:00Z' }, { received_at: null }])).toEqual(
      { received: 1, total: 2, complete: false },
    );
  });

  it('is complete when nobody is left eligible', () => {
    expect(roundProgress([{ received_at: '2026-01-01T00:00:00Z' }]).complete).toBe(true);
  });

  it('is not complete when the line is empty', () => {
    // An empty round is not a finished one; it is a round that never had members.
    expect(roundProgress([]).complete).toBe(false);
  });
});
