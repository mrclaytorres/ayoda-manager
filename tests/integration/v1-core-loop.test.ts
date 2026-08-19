// T033 — quickstart V1. FR-026, FR-027, FR-028, FR-029, FR-030.
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

describe('V1 — the core pass/award loop', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  beforeEach(async () => {
    a = await createAccount('v1');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
      { name: 'Cyd', combatPower: 51_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex, cyd] = roster.map((m) => m.id);
    const { error } = await a.client.rpc('start_round', {
      p_line_id: lineId,
      p_ordering_mode: 'current_cp',
    });
    expect(error).toBeNull();
  });

  afterEach(async () => destroyAccount(a));

  const startDist = async (skill = 'Force Blade') => {
    const { data, error } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };

  const holder = async (distId: string) => {
    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id, name, position')
      .eq('distribution_id', distId)
      .maybeSingle();
    return data;
  };

  it('ranks the line by Combat Power, highest first', async () => {
    const { data } = await a.client.from('v_round_line').select('name, position').order('position');
    expect(data?.map((r) => r.name)).toEqual(['Ash', 'Bex', 'Cyd']);
  });

  it('offers to the highest-CP member first', async () => {
    const dist = await startDist();
    expect((await holder(dist))?.member_id).toBe(ash);
  });

  it('moves the offer down the line on a pass, keeping the passer eligible', async () => {
    const dist = await startDist();

    const { error: p1 } = await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    expect(p1).toBeNull();
    expect((await holder(dist))?.member_id).toBe(bex);

    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: bex,
      p_client_action_id: uuid(),
    });
    expect((await holder(dist))?.member_id).toBe(cyd);

    // FR-030 — passing costs nothing; Ash and Bex are still eligible.
    const { data: line } = await a.client
      .from('v_round_line')
      .select('member_id, eligible')
      .eq('eligible', true);
    expect(line?.map((r) => r.member_id).sort()).toEqual([ash, bex, cyd].sort());
  });

  it('removes the recipient from the line on an award, leaving passers at the top', async () => {
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

    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: cyd,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();

    const { data: eligible } = await a.client
      .from('v_round_line')
      .select('member_id, position')
      .eq('eligible', true)
      .order('position');
    expect(eligible?.map((r) => r.member_id)).toEqual([ash, bex]);

    // The next skill starts back at the top of the line.
    const next = await startDist('Ice Shield');
    expect((await holder(next))?.member_id).toBe(ash);
  });

  it('records the award with the skill and recipient', async () => {
    const dist = await startDist();
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { data } = await a.client
      .from('distributions')
      .select('item_name, status, recipient_name, award_mode')
      .eq('id', dist)
      .single();
    expect(data).toMatchObject({
      item_name: 'Force Blade',
      status: 'awarded',
      recipient_name: 'Ash',
      award_mode: 'sequence',
    });
  });

  it('rejects a pass naming someone who is not the current holder', async () => {
    const dist = await startDist();
    const { error } = await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: cyd,
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS003');
  });

  it('rejects an empty item name at the pool', async () => {
    // The name is checked where it is entered now, not where it is picked.
    const { error } = await a.client.from('items').insert({ line_id: lineId, name: '   ' });
    expect(error?.message).toContain('items_name_len');
  });

  it('rejects a distribution of an item that is not in the pool', async () => {
    const { error } = await a.client.rpc('start_distribution', {
      p_item_id: uuid(),
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS014');
  });

  it('refuses a second distribution while one is in progress', async () => {
    await startDist();
    const { error } = await a.client.rpc('start_distribution', {
      p_item_id: await addItem(a, lineId, 'Ice Shield'),
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS006');
  });

  it('refuses to start a round with an empty roster', async () => {
    const b = await createAccount('empty');
    const emptyLine = await createLine(b);
    const { error } = await b.client.rpc('start_round', {
      p_line_id: emptyLine,
      p_ordering_mode: 'current_cp',
    });
    expect(error?.message).toContain('GS002');
    await destroyAccount(b);
  });
});
