/**
 * Hand-arranged lines and optional Combat Power.
 *
 * Ordering used to be `ranked_cp desc, tiebreak_seq asc`, which cannot express "these people, in
 * this order, for reasons the app does not know". It is one position now, which every mode assigns
 * and the officer can rewrite mid-round.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  createLine,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('manual ordering and optional Combat Power', () => {
  let a: TestAccount;
  let lineId = '';
  let ash = '';
  let bex = '';
  let cyd = '';

  beforeEach(async () => {
    a = await createAccount('manual');
    lineId = await createLine(a);
    const roster = await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 88_000 },
        { name: 'Bex', combatPower: 74_000 },
        { name: 'Cyd', combatPower: 51_000 },
      ],
      lineId,
    );
    [ash, bex, cyd] = roster.map((m) => m.id);
  });

  afterEach(async () => destroyAccount(a));

  const startRound = async (mode: string) => {
    const { data, error } = await a.client
      .rpc('start_round', { p_line_id: lineId, p_ordering_mode: mode })
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };

  const order = async (roundId: string) => {
    const { data } = await a.client
      .from('v_round_line')
      .select('name')
      .eq('round_id', roundId)
      .order('position');
    return data?.map((r) => r.name) ?? [];
  };

  it('accepts a member with no Combat Power at all', async () => {
    const { error } = await a.client
      .from('members')
      .insert({ line_id: lineId, name: 'Dov', combat_power: null });
    expect(error).toBeNull();

    const { data } = await a.client
      .from('members')
      .select('combat_power')
      .eq('name', 'Dov')
      .single();
    expect(data?.combat_power).toBeNull();
  });

  it('ranks members without Combat Power below those with it, zero included', async () => {
    await a.client.from('members').insert([
      { line_id: lineId, name: 'Nil', combat_power: null },
      { line_id: lineId, name: 'Zero', combat_power: 0 },
    ]);

    const round = await startRound('current_cp');
    // Zero is a real ranking and sorts above the unranked; blank is not "worth nothing", it is
    // "not measured".
    expect(await order(round)).toEqual(['Ash', 'Bex', 'Cyd', 'Zero', 'Nil']);
  });

  it('starts a manual round from the Combat Power order, then lets it be rearranged', async () => {
    const round = await startRound('manual');
    expect(await order(round)).toEqual(['Ash', 'Bex', 'Cyd']);

    const { error } = await a.client.rpc('set_round_order', {
      p_round_id: round,
      p_member_ids: [cyd, ash, bex],
    });
    expect(error).toBeNull();
    expect(await order(round)).toEqual(['Cyd', 'Ash', 'Bex']);
  });

  it('rearranges a round that is already under way, and the offer follows', async () => {
    const round = await startRound('current_cp');
    const { data: dist } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, 'Force Blade'),
        p_client_action_id: uuid(),
      })
      .single();
    const distId = (dist as { id: string }).id;

    const holder = async () => {
      const { data } = await a.client
        .from('v_current_offer')
        .select('name')
        .eq('distribution_id', distId)
        .single();
      return data?.name;
    };
    expect(await holder()).toBe('Ash');

    await a.client.rpc('set_round_order', { p_round_id: round, p_member_ids: [cyd, bex, ash] });
    // Whose turn it is is derived from the order, so moving Cyd to the top moves the offer.
    expect(await holder()).toBe('Cyd');
  });

  it('records that a round was rearranged without rewriting how it started', async () => {
    const round = await startRound('current_cp');
    await a.client.rpc('set_round_order', { p_round_id: round, p_member_ids: [cyd, bex, ash] });

    const { data } = await a.client
      .from('rounds')
      .select('ordering_mode, reordered_at')
      .eq('id', round)
      .single();
    expect(data?.ordering_mode).toBe('current_cp');
    expect(data?.reordered_at).not.toBeNull();
  });

  it('refuses an arrangement that drops, duplicates, or invents a member', async () => {
    const round = await startRound('manual');

    for (const bad of [
      [cyd, ash],
      [cyd, ash, ash],
      [cyd, ash, bex, uuid()],
    ]) {
      const { error } = await a.client.rpc('set_round_order', {
        p_round_id: round,
        p_member_ids: bad,
      });
      expect(error?.message).toContain('GS015');
    }
    expect(await order(round)).toEqual(['Ash', 'Bex', 'Cyd']);
  });

  it('refuses to rearrange a completed round', async () => {
    const round = await startRound('manual');
    for (const member of [ash, bex, cyd]) {
      const { data: dist } = await a.client
        .rpc('start_distribution', {
          p_item_id: await addItem(a, lineId, `item-${member}`),
          p_client_action_id: uuid(),
        })
        .single();
      await a.client.rpc('record_award', {
        p_distribution_id: (dist as { id: string }).id,
        p_member_id: member,
        p_mode: 'manual',
        p_client_action_id: uuid(),
      });
    }

    const { error } = await a.client.rpc('set_round_order', {
      p_round_id: round,
      p_member_ids: [cyd, bex, ash],
    });
    expect(error?.message).toContain('GS009');
  });

  it('puts a mid-round joiner at the back of a hand-arranged round', async () => {
    const round = await startRound('manual');
    await a.client.rpc('set_round_order', { p_round_id: round, p_member_ids: [cyd, ash, bex] });

    // No Combat Power basis to place them by, and guessing would silently undo the arrangement.
    await a.client.from('members').insert({ line_id: lineId, name: 'Dov', combat_power: 999_999 });
    expect(await order(round)).toEqual(['Cyd', 'Ash', 'Bex', 'Dov']);
  });

  it('still slots a joiner in by Combat Power when the round was never rearranged', async () => {
    const round = await startRound('current_cp');
    await a.client.from('members').insert({ line_id: lineId, name: 'Dov', combat_power: 80_000 });
    expect(await order(round)).toEqual(['Ash', 'Dov', 'Bex', 'Cyd']);
  });

  it('puts a joiner with no Combat Power at the back', async () => {
    const round = await startRound('current_cp');
    await a.client.from('members').insert({ line_id: lineId, name: 'Dov', combat_power: null });
    expect(await order(round)).toEqual(['Ash', 'Bex', 'Cyd', 'Dov']);
  });

  it('carries a hand-arranged order into the next round', async () => {
    const first = await startRound('manual');
    await a.client.rpc('set_round_order', { p_round_id: first, p_member_ids: [cyd, ash, bex] });

    for (const member of [cyd, ash, bex]) {
      const { data: dist } = await a.client
        .rpc('start_distribution', {
          p_item_id: await addItem(a, lineId, `x-${member}`),
          p_client_action_id: uuid(),
        })
        .single();
      await a.client.rpc('record_award', {
        p_distribution_id: (dist as { id: string }).id,
        p_member_id: member,
        p_mode: 'manual',
        p_client_action_id: uuid(),
      });
    }

    const second = await startRound('carry_previous');
    expect(await order(second)).toEqual(['Cyd', 'Ash', 'Bex']);
  });

  it('suppresses the pending-Combat-Power flag on a hand-arranged round', async () => {
    const round = await startRound('manual');
    await a.client.from('members').update({ combat_power: 1 }).eq('id', ash);

    const { data } = await a.client
      .from('v_round_line')
      .select('cp_change_pending, tied')
      .eq('round_id', round)
      .eq('member_id', ash)
      .single();
    // The round was never ranked on Combat Power, so there is no pending change to report.
    expect(data).toEqual({ cp_change_pending: false, tied: false });
  });
});
