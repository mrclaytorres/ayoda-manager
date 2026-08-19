// T055 — quickstart V4. FR-018, FR-019, FR-020, FR-021, FR-022, FR-037, FR-038, FR-040.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V4 — round completion, ordering choice, and reset', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  const award = async (memberId: string, skill: string) => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: (data as { id: string }).id,
      p_member_id: memberId,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();
  };

  const activeRound = async () => {
    const { data } = await a.client.from('rounds').select('*').eq('status', 'active').maybeSingle();
    return data;
  };

  beforeEach(async () => {
    a = await createAccount('v4');
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

  it('completes the round when the last eligible member is awarded', async () => {
    await award(ash, 'A');
    await award(bex, 'B');
    expect((await activeRound())?.status).toBe('active');

    await award(cyd, 'C');
    expect(await activeRound()).toBeNull();

    const { data } = await a.client.from('rounds').select('status, completed_at').single();
    expect(data?.status).toBe('complete');
    expect(data?.completed_at).not.toBeNull();
  });

  it('does not create the next round automatically', async () => {
    await award(ash, 'A');
    await award(bex, 'B');
    await award(cyd, 'C');

    const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
    expect(count).toBe(1);
  });

  it('freezes the order mid-round when a Combat Power is edited', async () => {
    await a.client.from('members').update({ combat_power: 40_000 }).eq('id', ash);

    const { data } = await a.client
      .from('v_round_line')
      .select('member_id, position, ranked_cp, current_cp, cp_change_pending')
      .order('position');

    // FR-018 — Ash is still first, on the CP the round was ranked on.
    expect(data?.[0]).toMatchObject({
      member_id: ash,
      position: 1,
      ranked_cp: 88_000,
      current_cp: 40_000,
      cp_change_pending: true,
    });
  });

  it('carry_previous keeps the old sequence and leaves the CP edit pending', async () => {
    await a.client.from('members').update({ combat_power: 40_000 }).eq('id', ash);
    await award(ash, 'A');
    await award(bex, 'B');
    await award(cyd, 'C');

    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'carry_previous' });
    const round = await activeRound();
    expect(round?.ordering_mode).toBe('carry_previous');

    const { data } = await a.client
      .from('v_round_line')
      .select('member_id, ranked_cp, cp_change_pending')
      .eq('round_id', round!.id)
      .order('position');
    expect(data?.map((r) => r.member_id)).toEqual([ash, bex, cyd]);
    expect(data?.[0]).toMatchObject({ ranked_cp: 88_000, cp_change_pending: true });
  });

  it('current_cp re-ranks by the edited values and clears the pending flag', async () => {
    await a.client.from('members').update({ combat_power: 40_000 }).eq('id', ash);
    await award(ash, 'A');
    await award(bex, 'B');
    await award(cyd, 'C');

    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
    const round = await activeRound();

    const { data } = await a.client
      .from('v_round_line')
      .select('member_id, ranked_cp, cp_change_pending')
      .eq('round_id', round!.id)
      .order('position');
    // Ash drops to last on 40,000.
    expect(data?.map((r) => r.member_id)).toEqual([bex, cyd, ash]);
    expect(data?.every((r) => r.cp_change_pending === false)).toBe(true);
  });

  it('numbers rounds sequentially and records the ordering that produced each', async () => {
    await award(ash, 'A');
    await award(bex, 'B');
    await award(cyd, 'C');
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'carry_previous' });

    const { data } = await a.client
      .from('rounds')
      .select('round_number, ordering_mode')
      .order('round_number');
    expect(data).toEqual([
      { round_number: 1, ordering_mode: 'current_cp' },
      { round_number: 2, ordering_mode: 'carry_previous' },
    ]);
  });

  it('refuses a second active round', async () => {
    const { error } = await a.client.rpc('start_round', {
      p_line_id: lineId,
      p_ordering_mode: 'current_cp',
    });
    expect(error?.message).toContain('GS009');
  });

  it('reset clears progress and distributions but keeps the number and order', async () => {
    await award(ash, 'A');
    const round = await activeRound();

    const { error } = await a.client.rpc('reset_round', { p_round_id: round!.id });
    expect(error).toBeNull();

    const { count: dists } = await a.client
      .from('distributions')
      .select('*', { count: 'exact', head: true });
    expect(dists).toBe(0);

    const { data: line } = await a.client
      .from('v_round_line')
      .select('member_id, eligible, ranked_cp')
      .order('position');
    expect(line?.every((r) => r.eligible)).toBe(true);
    expect(line?.map((r) => r.member_id)).toEqual([ash, bex, cyd]);

    const { data: after } = await a.client.from('rounds').select('round_number, status').single();
    expect(after).toEqual({ round_number: 1, status: 'active' });
  });
});
