// T034 — quickstart V2. FR-031, FR-032, FR-033, FR-034.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V2 — manual award and unclaimed close', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  beforeEach(async () => {
    a = await createAccount('v2');
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

  const startDist = async (skill: string) => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    return (data as { id: string }).id;
  };

  const passAll = async (dist: string, ids: string[]) => {
    for (const id of ids) {
      const { error } = await a.client.rpc('record_pass', {
        p_distribution_id: dist,
        p_member_id: id,
        p_client_action_id: uuid(),
      });
      expect(error).toBeNull();
    }
  };

  it('leaves nobody at the offer once everyone has passed', async () => {
    const dist = await startDist('Ice Shield');
    await passAll(dist, [ash, bex, cyd]);

    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id')
      .eq('distribution_id', dist)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it('records an all-pass skill as unclaimed without removing anyone', async () => {
    const dist = await startDist('Ice Shield');
    await passAll(dist, [ash, bex, cyd]);

    const { error } = await a.client.rpc('close_unclaimed', {
      p_distribution_id: dist,
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();

    const { data } = await a.client
      .from('distributions')
      .select('status, recipient_name')
      .eq('id', dist)
      .single();
    expect(data).toMatchObject({ status: 'unclaimed', recipient_name: null });

    // FR-034 — the line is untouched.
    const { count } = await a.client
      .from('v_round_line')
      .select('*', { count: 'exact', head: true })
      .eq('eligible', true);
    expect(count).toBe(3);
  });

  it('allows a manual award after everyone has passed', async () => {
    const dist = await startDist('Ice Shield');
    await passAll(dist, [ash, bex, cyd]);

    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: bex,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();

    const { data } = await a.client
      .from('distributions')
      .select('status, award_mode, recipient_name')
      .eq('id', dist)
      .single();
    expect(data).toMatchObject({ status: 'awarded', award_mode: 'manual', recipient_name: 'Bex' });
  });

  it('allows a manual award straight down the line, bypassing the sequence', async () => {
    const dist = await startDist('Flame Aura');
    // Nobody has passed; Ash holds the offer, but the officer awards to Cyd.
    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: cyd,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();

    const { data: eligible } = await a.client
      .from('v_round_line')
      .select('member_id')
      .eq('eligible', true);
    expect(eligible?.map((r) => r.member_id).sort()).toEqual([ash, bex].sort());
  });

  it('marks manual awards distinctly from sequence awards', async () => {
    const d1 = await startDist('A');
    await a.client.rpc('record_award', {
      p_distribution_id: d1,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });
    const d2 = await startDist('B');
    await a.client.rpc('record_award', {
      p_distribution_id: d2,
      p_member_id: cyd,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });

    const { data } = await a.client
      .from('distributions')
      .select('item_name, award_mode')
      .order('created_at');
    expect(data).toEqual([
      { item_name: 'A', award_mode: 'sequence' },
      { item_name: 'B', award_mode: 'manual' },
    ]);
  });

  it('rejects a manual award to someone who already received this round (GS004)', async () => {
    const d1 = await startDist('A');
    await a.client.rpc('record_award', {
      p_distribution_id: d1,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const d2 = await startDist('B');
    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: d2,
      p_member_id: ash,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS004');
  });

  it('allows a manual award to a member who joined mid-round', async () => {
    // FR-023: the members_join_active_round trigger enrols them, so they are immediately eligible.
    const { data: joiner } = await a.client
      .from('members')
      .insert({ line_id: lineId, name: 'Dov', combat_power: 10 })
      .select()
      .single();

    const dist = await startDist('A');
    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: joiner!.id,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error).toBeNull();

    const { data } = await a.client
      .from('distributions')
      .select('recipient_name')
      .eq('id', dist)
      .single();
    expect(data?.recipient_name).toBe('Dov');
  });

  it('rejects a manual award to a member not taking part in the round (GS005)', async () => {
    const dist = await startDist('A');
    const { error } = await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: uuid(), // no such member, so no round_entry
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS005');
  });

  it('refuses to act on a settled distribution (GS006)', async () => {
    const dist = await startDist('A');
    await a.client.rpc('close_unclaimed', { p_distribution_id: dist, p_client_action_id: uuid() });
    const { error } = await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS006');
  });
});
