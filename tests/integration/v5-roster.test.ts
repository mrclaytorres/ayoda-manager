// T075 — quickstart V5. FR-008 → FR-014, FR-023.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V5 — roster changes mid-round', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  beforeEach(async () => {
    a = await createAccount('v5');
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

  it('slots a mid-round joiner in by Combat Power without renumbering anyone', async () => {
    const { error } = await a.client
      .from('members')
      .insert({ line_id: lineId, name: 'Dov', combat_power: 66_000 });
    expect(error).toBeNull();

    const { data } = await a.client
      .from('v_round_line')
      .select('name, position, eligible')
      .order('position');
    // Dov sits between Bex (74k) and Cyd (51k) on Combat Power.
    expect(data?.map((r) => r.name)).toEqual(['Ash', 'Bex', 'Dov', 'Cyd']);
    expect(data?.every((r) => r.eligible)).toBe(true);
  });

  it('removes a member from the line while keeping their history', async () => {
    const { data: dist } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, 'Force Blade'),
        p_client_action_id: uuid(),
      })
      .single();
    await a.client.rpc('record_award', {
      p_distribution_id: (dist as { id: string }).id,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    await a.client.from('members').delete().eq('id', ash);

    const { data: line } = await a.client.from('v_round_line').select('name');
    expect(line?.map((r) => r.name)).not.toContain('Ash');

    // FR-014 — the award survives under the name snapshot.
    const { data: history } = await a.client
      .from('distributions')
      .select('item_name, recipient_name, recipient_member_id')
      .eq('status', 'awarded');
    expect(history).toEqual([
      { item_name: 'Force Blade', recipient_name: 'Ash', recipient_member_id: null },
    ]);
  });

  it('rejects a duplicate name regardless of casing', async () => {
    const { error } = await a.client
      .from('members')
      .insert({ line_id: lineId, name: '  ash ', combat_power: 1 });
    expect(error?.message).toContain('members_line_name_unique');
  });

  it('rejects negative Combat Power and accepts zero', async () => {
    const bad = await a.client
      .from('members')
      .insert({ line_id: lineId, name: 'Neg', combat_power: -1 });
    expect(bad.error?.message).toContain('members_cp_non_negative');

    const zero = await a.client
      .from('members')
      .insert({ line_id: lineId, name: 'Zero', combat_power: 0 });
    expect(zero.error).toBeNull();
  });

  it('rejects a blank member name', async () => {
    const { error } = await a.client
      .from('members')
      .insert({ line_id: lineId, name: '   ', combat_power: 10 });
    expect(error?.message).toContain('members_name_len');
  });

  it('editing Combat Power mid-round leaves the order alone and flags the change', async () => {
    await a.client.from('members').update({ combat_power: 10 }).eq('id', ash);

    const { data } = await a.client
      .from('v_round_line')
      .select('name, position, ranked_cp, current_cp, cp_change_pending')
      .order('position');
    expect(data?.map((r) => r.name)).toEqual(['Ash', 'Bex', 'Cyd']);
    expect(data?.[0]).toMatchObject({ ranked_cp: 88_000, current_cp: 10, cp_change_pending: true });
    expect(bex && cyd).toBeTruthy();
  });

  it('moves the offer on when the current holder is removed', async () => {
    const { data: dist } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, 'Force Blade'),
        p_client_action_id: uuid(),
      })
      .single();
    const distId = (dist as { id: string }).id;

    await a.client.from('members').delete().eq('id', ash);

    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id')
      .eq('distribution_id', distId)
      .maybeSingle();
    expect(data?.member_id).toBe(bex);
  });
});
