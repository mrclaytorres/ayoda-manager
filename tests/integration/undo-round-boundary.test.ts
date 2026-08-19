// T056 — undo across a round boundary. FR-035, research R-008.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('undo across a round boundary', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string;
  let lastDistId: string;

  const award = async (memberId: string, skill: string) => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    lastDistId = (data as { id: string }).id;
    await a.client.rpc('record_award', {
      p_distribution_id: lastDistId,
      p_member_id: memberId,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
  };

  beforeEach(async () => {
    a = await createAccount('undo-boundary');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex] = roster.map((m) => m.id);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  it('reopens the round when the completing award is undone', async () => {
    await award(ash, 'A');
    await award(bex, 'B');

    const { data: completed } = await a.client.from('rounds').select('status').single();
    expect(completed?.status).toBe('complete');

    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: lastDistId });
    expect(error).toBeNull();

    const { data: reopened } = await a.client
      .from('rounds')
      .select('status, completed_at')
      .single();
    expect(reopened).toMatchObject({ status: 'active', completed_at: null });
  });

  it('rolls back an empty next round', async () => {
    await award(ash, 'A');
    await award(bex, 'B');
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });

    const { count: before } = await a.client
      .from('rounds')
      .select('*', { count: 'exact', head: true });
    expect(before).toBe(2);

    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: lastDistId });
    expect(error).toBeNull();

    const { data } = await a.client.from('rounds').select('round_number, status');
    expect(data).toEqual([{ round_number: 1, status: 'active' }]);
  });

  it('refuses with GS008 once the next round has activity', async () => {
    await award(ash, 'A');
    const completingDist = lastDistId;
    await award(bex, 'B');
    const roundOneLast = lastDistId;

    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
    // Real activity in round 2.
    await a.client.rpc('start_distribution', {
      p_item_id: await addItem(a, lineId, 'C'),
      p_client_action_id: uuid(),
    });

    const { error } = await a.client.rpc('undo_last_action', { p_distribution_id: roundOneLast });
    expect(error?.message).toContain('GS008');

    // Nothing was destroyed.
    const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
    expect(completingDist).toBeTruthy();
  });
});
