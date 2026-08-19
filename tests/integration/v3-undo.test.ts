// T035 — quickstart V3. FR-035.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V3 — undo', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  beforeEach(async () => {
    a = await createAccount('v3');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
      { name: 'Cyd', combatPower: 51_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex, cyd] = roster.map((m) => m.id);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  const startDist = async (skill = 'Force Blade') => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    return (data as { id: string }).id;
  };

  const holder = async (dist: string) => {
    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id')
      .eq('distribution_id', dist)
      .maybeSingle();
    return data?.member_id ?? null;
  };

  it('undoes a pass and returns the offer to that member', async () => {
    const dist = await startDist();
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    expect(await holder(dist)).toBe(bex);

    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(error).toBeNull();
    expect(await holder(dist)).toBe(ash);
  });

  it('undoes an award, restoring the member to their original position', async () => {
    const dist = await startDist();
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: bex,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(error).toBeNull();

    const { data: dist_ } = await a.client
      .from('distributions')
      .select('status, recipient_name, award_mode, closed_at')
      .eq('id', dist)
      .single();
    expect(dist_).toMatchObject({
      status: 'in_progress',
      recipient_name: null,
      award_mode: null,
      closed_at: null,
    });

    // Bex is eligible again, still at position 2 behind Ash.
    const { data: line } = await a.client
      .from('v_round_line')
      .select('member_id, position, eligible')
      .order('position');
    expect(line).toEqual([
      { member_id: ash, position: 1, eligible: true },
      { member_id: bex, position: 2, eligible: true },
      { member_id: cyd, position: 3, eligible: true },
    ]);
    // The offer returns to Bex — Ash's pass survived the undo of the award.
    expect(await holder(dist)).toBe(bex);
  });

  it('undoes a manual award the same way', async () => {
    const dist = await startDist();
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: cyd,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    await a.client.rpc('undo_last_action', { p_distribution_id: dist });

    const { count } = await a.client
      .from('v_round_line')
      .select('*', { count: 'exact', head: true })
      .eq('eligible', true);
    expect(count).toBe(3);
  });

  it('undoes an unclaimed close', async () => {
    const dist = await startDist();
    await a.client.rpc('close_unclaimed', { p_distribution_id: dist, p_client_action_id: uuid() });
    await a.client.rpc('undo_last_action', { p_distribution_id: dist });

    const { data } = await a.client.from('distributions').select('status').eq('id', dist).single();
    expect(data?.status).toBe('in_progress');
  });

  it('undoes repeatedly, back to the start of the distribution', async () => {
    const dist = await startDist();
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: bex,
      p_client_action_id: uuid(),
    });

    await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(await holder(dist)).toBe(bex);
    await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(await holder(dist)).toBe(ash);
  });

  it('raises GS007 when there is nothing left to undo', async () => {
    const dist = await startDist();
    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(error?.message).toContain('GS007');
  });
});
