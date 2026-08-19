// Bulk roster import RPC. FR-008, FR-009, FR-010, FR-012, FR-023.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAccount,
  createLine,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

const rows = (...pairs: [string, number][]) =>
  pairs.map(([name, combatPower]) => ({ name, combatPower }));

describe('import_members', () => {
  let a: TestAccount;
  let lineId = '';

  beforeEach(async () => {
    a = await createAccount('import');
    lineId = await createLine(a);
  });
  afterEach(async () => destroyAccount(a));

  const roster = async () => {
    const { data } = await a.client
      .from('members')
      .select('name, combat_power')
      .order('combat_power', { ascending: false });
    return data ?? [];
  };

  it('inserts a fresh roster and reports the counts', async () => {
    const { data, error } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['LaLlorona', 120993], ['Atherine', 111153], ['Zats', 85991]),
    });
    expect(error).toBeNull();
    expect(data).toEqual({ inserted: 3, updated: 0, unchanged: 0 });
    expect(await roster()).toEqual([
      { name: 'LaLlorona', combat_power: 120993 },
      { name: 'Atherine', combat_power: 111153 },
      { name: 'Zats', combat_power: 85991 },
    ]);
  });

  it('updates existing members and leaves matching ones alone', async () => {
    await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 88000 },
        { name: 'Bex', combatPower: 74000 },
      ],
      lineId,
    );

    const { data } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['Ash', 90000], ['Bex', 74000], ['Cyd', 51000]),
    });
    expect(data).toEqual({ inserted: 1, updated: 1, unchanged: 1 });
    expect(await roster()).toEqual([
      { name: 'Ash', combat_power: 90000 },
      { name: 'Bex', combat_power: 74000 },
      { name: 'Cyd', combat_power: 51000 },
    ]);
  });

  it('matches existing members case-insensitively rather than creating a duplicate', async () => {
    await seedRoster(a, [{ name: 'Ash', combatPower: 88000 }], lineId);
    const { data } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['ASH', 90000]),
    });
    expect(data).toEqual({ inserted: 0, updated: 1, unchanged: 0 });

    const list = await roster();
    expect(list).toHaveLength(1);
    // The original casing is preserved; only the Combat Power moves.
    expect(list[0]).toEqual({ name: 'Ash', combat_power: 90000 });
  });

  it('never removes a member absent from the import', async () => {
    await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 88000 },
        { name: 'Bex', combatPower: 74000 },
      ],
      lineId,
    );
    await a.client.rpc('import_members', { p_line_id: lineId, p_rows: rows(['Ash', 88000]) });
    expect((await roster()).map((m) => m.name).sort()).toEqual(['Ash', 'Bex']);
  });

  it('accepts zero Combat Power', async () => {
    const { error } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['BeeLzieBuB', 0]),
    });
    expect(error).toBeNull();
    expect(await roster()).toEqual([{ name: 'BeeLzieBuB', combat_power: 0 }]);
  });

  it('preserves non-ASCII names', async () => {
    await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['Maldîta', 102342], ['METAツ', 87138], ['Uncle×John', 63222]),
    });
    expect((await roster()).map((m) => m.name)).toEqual(['Maldîta', 'METAツ', 'Uncle×John']);
  });

  it('rolls the whole import back if any row is invalid', async () => {
    await seedRoster(a, [{ name: 'Ash', combatPower: 88000 }], lineId);
    const { error } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['Bex', 74000], ['Bad', -1], ['Cyd', 51000]),
    });
    expect(error?.message).toContain('GS013');

    // Nothing landed — not even the valid rows before the bad one.
    expect((await roster()).map((m) => m.name)).toEqual(['Ash']);
  });

  it('rejects a blank name', async () => {
    const { error } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['   ', 10]),
    });
    expect(error?.message).toContain('GS013');
  });

  it('rejects a payload that is not a list', async () => {
    const { error } = await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: { name: 'Ash' },
    });
    expect(error?.message).toContain('GS012');
  });

  it('enrols imported members into a round in progress', async () => {
    await seedRoster(a, [{ name: 'Ash', combatPower: 88000 }], lineId);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });

    await a.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['Dov', 66000], ['Cyd', 51000]),
    });

    // FR-023 — they slot in by Combat Power without renumbering anyone.
    const { data: line } = await a.client
      .from('v_round_line')
      .select('name, position, eligible')
      .order('position');
    expect(line?.map((r) => r.name)).toEqual(['Ash', 'Dov', 'Cyd']);
    expect(line?.every((r) => r.eligible)).toBe(true);
  });

  it('does not reorder a round in progress when it updates Combat Power', async () => {
    await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 88000 },
        { name: 'Bex', combatPower: 74000 },
      ],
      lineId,
    );
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });

    await a.client.rpc('import_members', { p_line_id: lineId, p_rows: rows(['Ash', 10]) });

    // FR-018 — the snapshot holds; the change shows as pending instead.
    const { data: line } = await a.client
      .from('v_round_line')
      .select('name, position, ranked_cp, current_cp, cp_change_pending')
      .order('position');
    expect(line?.map((r) => r.name)).toEqual(['Ash', 'Bex']);
    expect(line?.[0]).toMatchObject({ ranked_cp: 88000, current_cp: 10, cp_change_pending: true });
  });

  it("refuses to import into another account's line", async () => {
    const b = await createAccount('import-other');

    // A's line is invisible to B, so the RPC cannot find it — the import is refused outright
    // rather than quietly landing somewhere else.
    const { error } = await b.client.rpc('import_members', {
      p_line_id: lineId,
      p_rows: rows(['Intruder', 99999]),
    });
    expect(error?.message).toContain('GS016');

    expect(await roster()).toEqual([]);
    const { data } = await b.client.from('members').select('name');
    expect(data).toEqual([]);
    await destroyAccount(b);
  });
});
