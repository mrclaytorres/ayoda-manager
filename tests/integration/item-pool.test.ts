/**
 * The item pool. Availability is derived from `distributions.item_id`, so these tests are as much
 * about what the pool does after an undo, a reset, and a history deletion as about the happy path.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('the item pool', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string;

  beforeEach(async () => {
    a = await createAccount('pool');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    ash = roster[0].id;
    const { error } = await a.client.rpc('start_round', {
      p_line_id: lineId,
      p_ordering_mode: 'current_cp',
    });
    expect(error).toBeNull();
  });

  afterEach(async () => destroyAccount(a));

  const pool = async () => {
    const { data } = await a.client.from('v_item_pool').select('name').order('seq');
    return data?.map((row) => row.name) ?? [];
  };

  const start = async (itemId: string) => {
    const { data, error } = await a.client
      .rpc('start_distribution', { p_item_id: itemId, p_client_action_id: uuid() })
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };

  it('keeps a batch in the order it was entered', async () => {
    const { error } = await a.client.from('items').insert([
      { line_id: lineId, name: 'Force Blade' },
      { line_id: lineId, name: 'Chakra Ring' },
      { line_id: lineId, name: 'Guardian Boots' },
    ]);
    expect(error).toBeNull();
    expect(await pool()).toEqual(['Force Blade', 'Chakra Ring', 'Guardian Boots']);
  });

  it('keeps duplicates apart — two of the same item can drop in one night', async () => {
    await a.client.from('items').insert([
      { line_id: lineId, name: 'Force Blade' },
      { line_id: lineId, name: 'Force Blade' },
    ]);
    expect(await pool()).toEqual(['Force Blade', 'Force Blade']);
  });

  it('takes an item out of the pool once it is being distributed', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    await addItem(a, lineId, 'Chakra Ring');
    await start(item);
    expect(await pool()).toEqual(['Chakra Ring']);
  });

  it('leaves it out after it is awarded, and after the award is undone', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });
    expect(await pool()).toEqual([]);

    // Undo reopens the distribution rather than deleting it, so the item is still spoken for.
    await a.client.rpc('undo_last_action', { p_distribution_id: dist });
    expect(await pool()).toEqual([]);
  });

  it('leaves it out after it is closed unclaimed', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    const { data: line } = await a.client
      .from('v_round_line')
      .select('member_id')
      .order('position');
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: line![1].member_id,
      p_client_action_id: uuid(),
    });
    await a.client.rpc('close_unclaimed', {
      p_distribution_id: dist,
      p_client_action_id: uuid(),
    });
    expect(await pool()).toEqual([]);
  });

  it('hands the items back when the round is reset', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { data: round } = await a.client
      .from('rounds')
      .select('id')
      .eq('status', 'active')
      .single();
    await a.client.rpc('reset_round', { p_round_id: round!.id });

    // The round is being redone from the top, so its loot is up for grabs again.
    expect(await pool()).toEqual(['Force Blade']);
  });

  it('puts the item back when the distribution is cancelled', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    await addItem(a, lineId, 'Chakra Ring');
    const dist = await start(item);
    expect(await pool()).toEqual(['Chakra Ring']);

    const { error } = await a.client.rpc('cancel_distribution', { p_distribution_id: dist });
    expect(error).toBeNull();

    // Back in its original place: seq is the pool's order, not the order things return in.
    expect(await pool()).toEqual(['Force Blade', 'Chakra Ring']);
  });

  it('cancelling discards the responses and writes nothing to the history', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });

    await a.client.rpc('cancel_distribution', { p_distribution_id: dist });

    const { count: dists } = await a.client
      .from('distributions')
      .select('*', { count: 'exact', head: true });
    expect(dists).toBe(0);
    const { count: responses } = await a.client
      .from('offer_responses')
      .select('*', { count: 'exact', head: true });
    expect(responses).toBe(0);
  });

  it('cancelling leaves the line untouched, so the next pick starts at the top', async () => {
    const first = await addItem(a, lineId, 'Force Blade');
    const dist = await start(first);
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    await a.client.rpc('cancel_distribution', { p_distribution_id: dist });

    const second = await start(await addItem(a, lineId, 'Chakra Ring'));
    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id')
      .eq('distribution_id', second)
      .single();
    // Ash passed on an item that no longer exists, so Ash holds the offer again.
    expect(data?.member_id).toBe(ash);
  });

  it('a retried cancel succeeds rather than erroring on the missing row', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('cancel_distribution', { p_distribution_id: dist });

    // FR-048: the caller asked for it to be gone, and it is gone.
    const { error } = await a.client.rpc('cancel_distribution', { p_distribution_id: dist });
    expect(error).toBeNull();
    expect(await pool()).toEqual(['Force Blade']);
  });

  it('refuses to cancel a distribution that has already been settled', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { error } = await a.client.rpc('cancel_distribution', { p_distribution_id: dist });
    expect(error?.message).toContain('GS006');
    expect(await pool()).toEqual([]);
  });

  it('names the item on the line row of whoever took it', async () => {
    const dist = await start(await addItem(a, lineId, 'Force Blade'));
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { data } = await a.client
      .from('v_round_line')
      .select('name, eligible, received_item')
      .order('position');
    expect(data).toEqual([
      { name: 'Ash', eligible: false, received_item: 'Force Blade' },
      { name: 'Bex', eligible: true, received_item: null },
    ]);
  });

  it('clears the named item when the award is undone', async () => {
    const dist = await start(await addItem(a, lineId, 'Force Blade'));
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });
    await a.client.rpc('undo_last_action', { p_distribution_id: dist });

    const { data } = await a.client
      .from('v_round_line')
      .select('eligible, received_item')
      .eq('member_id', ash)
      .single();
    // Eligible again, so there is nothing to have received.
    expect(data).toEqual({ eligible: true, received_item: null });
  });

  it('names the item after a manual award too', async () => {
    const dist = await start(await addItem(a, lineId, 'Chakra Ring'));
    const { data: line } = await a.client
      .from('v_round_line')
      .select('member_id')
      .order('position');
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: line![1].member_id,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });

    const { data } = await a.client
      .from('v_round_line')
      .select('name, received_item')
      .eq('member_id', line![1].member_id)
      .single();
    expect(data).toEqual({ name: 'Bex', received_item: 'Chakra Ring' });
  });

  it('refuses to distribute the same item twice', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { error } = await a.client.rpc('start_distribution', {
      p_item_id: item,
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS014');
  });

  it('keeps the history readable when a distributed item is deleted', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    await a.client.from('items').delete().eq('id', item);

    const { data } = await a.client
      .from('distributions')
      .select('item_name, item_id, recipient_name')
      .eq('id', dist)
      .single();
    expect(data).toEqual({ item_name: 'Force Blade', item_id: null, recipient_name: 'Ash' });
  });

  it('deleting a round takes its items with it', async () => {
    const item = await addItem(a, lineId, 'Force Blade');
    await addItem(a, lineId, 'Chakra Ring');
    const dist = await start(item);
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { data: rounds } = await a.client.from('rounds').select('id').eq('status', 'complete');
    const completed = rounds?.map((r) => r.id) ?? [];
    // The round only completes once everyone has received, so award the second member too.
    if (completed.length === 0) {
      const second = await addItem(a, lineId, 'Guardian Boots');
      const dist2 = await start(second);
      const { data: line } = await a.client
        .from('v_round_line')
        .select('member_id, received_at')
        .order('position');
      const remaining = line!.find((row) => row.received_at === null)!.member_id;
      await a.client.rpc('record_award', {
        p_distribution_id: dist2,
        p_member_id: remaining,
        p_mode: 'sequence',
        p_client_action_id: uuid(),
      });
    }

    const { data: done } = await a.client.from('rounds').select('id').eq('status', 'complete');
    const { error } = await a.client.rpc('delete_round_history', {
      p_round_ids: done!.map((r) => r.id),
      p_confirmation: 'YES',
    });
    expect(error).toBeNull();

    // Force Blade and Guardian Boots went out with the round. Chakra Ring never left the pool.
    expect(await pool()).toEqual(['Chakra Ring']);
  });
});
