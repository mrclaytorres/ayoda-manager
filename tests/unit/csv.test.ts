// Roster CSV import — parsing and planning.
import { describe, expect, it } from 'vitest';
import { parseMembersCsv, planImport } from '@/lib/domain/csv';

describe('parseMembersCsv', () => {
  it('parses the members.csv shape', () => {
    const { rows, skipped } = parseMembersCsv(
      'ign,combat_power\nLaLlorona,120993\nAtherine,111153\n',
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { name: 'LaLlorona', combatPower: 120993, line: 2 },
      { name: 'Atherine', combatPower: 111153, line: 3 },
    ]);
  });

  it('handles Windows CRLF endings', () => {
    const { rows } = parseMembersCsv('ign,combat_power\r\nLaLlorona,120993\r\nAtherine,111153\r\n');
    expect(rows.map((r) => r.name)).toEqual(['LaLlorona', 'Atherine']);
    expect(rows[0].combatPower).toBe(120993);
  });

  it('strips a UTF-8 BOM left by Excel', () => {
    const { rows } = parseMembersCsv('﻿ign,combat_power\nAsh,88000\n');
    expect(rows).toEqual([{ name: 'Ash', combatPower: 88000, line: 2 }]);
  });

  it('accepts `name` as well as `ign` for the first column', () => {
    const { rows } = parseMembersCsv('name,cp\nAsh,88000\n');
    expect(rows).toEqual([{ name: 'Ash', combatPower: 88000, line: 2 }]);
  });

  it('treats a file with no header row as data', () => {
    const { rows } = parseMembersCsv('Ash,88000\nBex,74000\n');
    expect(rows.map((r) => r.name)).toEqual(['Ash', 'Bex']);
  });

  it('accepts thousands separators pasted from the game client', () => {
    const { rows } = parseMembersCsv('ign,combat_power\n"Ash","120,993"\nBex,"74 000"\n');
    expect(rows.map((r) => r.combatPower)).toEqual([120993, 74000]);
  });

  it('handles quoted fields containing a comma', () => {
    const { rows } = parseMembersCsv('ign,combat_power\n"Smith, John",88000\n');
    expect(rows[0].name).toBe('Smith, John');
  });

  it('handles an escaped quote inside a quoted field', () => {
    const { rows } = parseMembersCsv('ign,combat_power\n"The ""Ace""",88000\n');
    expect(rows[0].name).toBe('The "Ace"');
  });

  it('preserves non-ASCII names', () => {
    const { rows } = parseMembersCsv(
      'ign,combat_power\nMaldîta,102342\nMETAツ,87138\nUncle×John,63222\n',
    );
    expect(rows.map((r) => r.name)).toEqual(['Maldîta', 'METAツ', 'Uncle×John']);
  });

  it('accepts zero Combat Power', () => {
    const { rows } = parseMembersCsv('ign,combat_power\nBeeLzieBuB,0\n');
    expect(rows[0].combatPower).toBe(0);
  });

  it('reads a blank Combat Power as unranked rather than as zero', () => {
    const { rows, skipped } = parseMembersCsv('ign,combat_power\nBeeLzieBuB,\nAsh,88000\n');
    // null and 0 are different answers: 0 is a real ranking, blank is "not measured". A line
    // ordered by hand may never fill this column in.
    expect(rows).toEqual([
      { name: 'BeeLzieBuB', combatPower: null, line: 2 },
      { name: 'Ash', combatPower: 88000, line: 3 },
    ]);
    expect(skipped).toEqual([]);
  });

  it('skips negative, decimal, and non-numeric Combat Power', () => {
    const { rows, skipped } = parseMembersCsv('ign,cp\nA,-1\nB,12.5\nC,abc\nD,10\n');
    expect(rows.map((r) => r.name)).toEqual(['D']);
    expect(skipped).toHaveLength(3);
    expect(skipped.every((s) => s.reason.includes('whole number'))).toBe(true);
  });

  it('skips a row with no name', () => {
    const { skipped } = parseMembersCsv('ign,cp\n,88000\n');
    expect(skipped[0].reason).toBe('No name in the first column');
  });

  it('skips a name longer than 60 characters', () => {
    const { skipped } = parseMembersCsv(`ign,cp\n${'A'.repeat(61)},10\n`);
    expect(skipped[0].reason).toContain('longer than 60');
  });

  it('skips a row with no Combat Power column', () => {
    const { skipped } = parseMembersCsv('ign,cp\nAsh\n');
    expect(skipped[0].reason).toBe('No Combat Power column');
  });

  it('reports a case-insensitive duplicate against the line it first appeared on', () => {
    const { rows, skipped } = parseMembersCsv('ign,cp\nAsh,88000\nash,70000\n');
    expect(rows.map((r) => r.name)).toEqual(['Ash']);
    expect(skipped[0].reason).toBe('Duplicate of "ash" on line 2');
  });

  it('ignores blank lines and a trailing newline', () => {
    const { rows, skipped } = parseMembersCsv('ign,cp\nAsh,88000\n\n\nBex,74000\n');
    expect(rows).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseMembersCsv('')).toEqual({ rows: [], skipped: [] });
  });

  it('returns nothing for a header-only file', () => {
    expect(parseMembersCsv('ign,combat_power\n')).toEqual({ rows: [], skipped: [] });
  });
});

describe('planImport', () => {
  const existing = [
    { name: 'Ash', combat_power: 88000 },
    { name: 'Bex', combat_power: 74000 },
  ];

  it('classifies rows as added, updated, or unchanged', () => {
    const { rows } = parseMembersCsv('ign,cp\nAsh,90000\nBex,74000\nCyd,51000\n');
    const plan = planImport(rows, existing);

    expect(plan.toAdd.map((r) => r.name)).toEqual(['Cyd']);
    expect(plan.toUpdate).toEqual([
      { name: 'Ash', combatPower: 90000, line: 2, previousCombatPower: 88000 },
    ]);
    expect(plan.unchanged.map((r) => r.name)).toEqual(['Bex']);
  });

  it('matches existing members case-insensitively, as the roster index does', () => {
    const { rows } = parseMembersCsv('ign,cp\nASH,90000\n');
    const plan = planImport(rows, existing);
    expect(plan.toAdd).toEqual([]);
    expect(plan.toUpdate).toHaveLength(1);
  });

  it('leaves members absent from the file alone — import never removes', () => {
    const { rows } = parseMembersCsv('ign,cp\nAsh,88000\n');
    const plan = planImport(rows, existing);
    expect(plan.toAdd).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.unchanged.map((r) => r.name)).toEqual(['Ash']);
    // Bex is untouched and unmentioned.
  });
});

describe('orphaned session detection', () => {
  it('recognises the foreign key violation left by a deleted account', async () => {
    const { isOrphanedSession, messageFor } = await import('@/lib/domain/errors');
    // The exact shape Postgres returns when the JWT is valid but auth.users no longer has the row.
    const error = {
      code: '23503',
      details: 'Key is not present in table "users".',
      hint: null,
      message:
        'insert or update on table "members" violates foreign key constraint "members_owner_id_fkey"',
    };
    expect(isOrphanedSession(error)).toBe(true);
    const mapped = messageFor(error);
    expect(mapped.code).toBe('SESSION_GONE');
    expect(mapped.message).toContain('no longer exists');
  });

  it('does not mistake an ordinary failure for a dead session', async () => {
    const { isOrphanedSession } = await import('@/lib/domain/errors');
    expect(isOrphanedSession({ code: 'P0001', message: 'GS004: already received' })).toBe(false);
    expect(isOrphanedSession(null)).toBe(false);
    expect(isOrphanedSession({ message: 'network error' })).toBe(false);
  });

  it('keeps our own validation message instead of flattening it', async () => {
    const { invalid } = await import('@/lib/domain/errors');
    const result = invalid('Combat Power cannot be negative.');
    expect(result).toEqual({
      ok: false,
      code: 'INVALID',
      message: 'Combat Power cannot be negative.',
    });
  });
});

describe('planImport with optional Combat Power', () => {
  it('treats gaining and losing a Combat Power as a change', () => {
    const gained = planImport(
      [{ name: 'Ash', combatPower: 88000, line: 2 }],
      [{ name: 'Ash', combat_power: null }],
    );
    expect(gained.toUpdate).toEqual([
      { name: 'Ash', combatPower: 88000, line: 2, previousCombatPower: null },
    ]);

    const cleared = planImport(
      [{ name: 'Ash', combatPower: null, line: 2 }],
      [{ name: 'Ash', combat_power: 88000 }],
    );
    expect(cleared.toUpdate).toEqual([
      { name: 'Ash', combatPower: null, line: 2, previousCombatPower: 88000 },
    ]);
  });

  it('leaves a member alone whose Combat Power is blank in both places', () => {
    const plan = planImport(
      [{ name: 'Ash', combatPower: null, line: 2 }],
      [{ name: 'Ash', combat_power: null }],
    );
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.toUpdate).toEqual([]);
  });
});
