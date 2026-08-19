// T090 — quickstart V10. FR-043, FR-044, FR-045, FR-046.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V10 — guarded history deletion', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string;
  let roundOne: string;

  const award = async (memberId: string, skill: string) => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    await a.client.rpc('record_award', {
      p_distribution_id: (data as { id: string }).id,
      p_member_id: memberId,
      p_mode: 'manual',
      p_client_action_id: uuid(),
    });
  };

  beforeEach(async () => {
    a = await createAccount('v10');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex] = roster.map((m) => m.id);

    // Round 1, completed.
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
    const { data: r1 } = await a.client.from('rounds').select('id').single();
    roundOne = r1!.id;
    await award(ash, 'Force Blade');
    await award(bex, 'Ice Shield');

    // Round 2, left in progress.
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
    await award(ash, 'Flame Aura');
  });

  afterEach(async () => destroyAccount(a));

  it.each(['yes', 'Yes', ' YES ', 'Y', '', 'YES!'])(
    'refuses confirmation %o with GS010 and deletes nothing',
    async (confirmation) => {
      const { error } = await a.client.rpc('delete_round_history', {
        p_round_ids: [roundOne],
        p_confirmation: confirmation,
      });
      expect(error?.message).toContain('GS010');

      const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
      expect(count).toBe(2);
    },
  );

  it('deletes a completed round and everything belonging to it on exactly YES', async () => {
    const { data, error } = await a.client.rpc('delete_round_history', {
      p_round_ids: [roundOne],
      p_confirmation: 'YES',
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const { data: rounds } = await a.client.from('rounds').select('round_number');
    expect(rounds).toEqual([{ round_number: 2 }]);

    // Round 1's distributions and responses cascaded away; round 2's survive.
    const { data: dists } = await a.client.from('distributions').select('item_name');
    expect(dists).toEqual([{ item_name: 'Flame Aura' }]);

    const { count: entries } = await a.client
      .from('round_entries')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', roundOne);
    expect(entries).toBe(0);
  });

  it('refuses to delete the active round with GS011', async () => {
    const { data: active } = await a.client
      .from('rounds')
      .select('id')
      .eq('status', 'active')
      .single();

    const { error } = await a.client.rpc('delete_round_history', {
      p_round_ids: [active!.id],
      p_confirmation: 'YES',
    });
    expect(error?.message).toContain('GS011');

    const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
  });

  it('refuses the whole batch if it includes the active round', async () => {
    const { data: active } = await a.client
      .from('rounds')
      .select('id')
      .eq('status', 'active')
      .single();

    const { error } = await a.client.rpc('delete_round_history', {
      p_round_ids: [roundOne, active!.id],
      p_confirmation: 'YES',
    });
    expect(error?.message).toContain('GS011');
    // Round 1 was not deleted either — the batch is all or nothing.
    const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
  });

  it('leaves the roster untouched', async () => {
    await a.client.rpc('delete_round_history', {
      p_round_ids: [roundOne],
      p_confirmation: 'YES',
    });
    const { data } = await a.client.from('members').select('id');
    expect(data?.map((m) => m.id).sort()).toEqual([ash, bex].sort());
  });

  it('never reuses a deleted round number', async () => {
    await a.client.rpc('delete_round_history', {
      p_round_ids: [roundOne],
      p_confirmation: 'YES',
    });

    // Finish round 2 and start round 3.
    await award(bex, 'Wind Step');
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });

    const { data } = await a.client.from('rounds').select('round_number').order('round_number');
    expect(data).toEqual([{ round_number: 2 }, { round_number: 3 }]);
  });

  it('ignores ids that match no round rather than failing obscurely', async () => {
    const { data, error } = await a.client.rpc('delete_round_history', {
      p_round_ids: [uuid()],
      p_confirmation: 'YES',
    });
    expect(error).toBeNull();
    expect(data).toBe(0);
  });

  it('cannot delete another account rounds even with a valid confirmation', async () => {
    const b = await createAccount('v10-other');
    const { data } = await b.client.rpc('delete_round_history', {
      p_round_ids: [roundOne],
      p_confirmation: 'YES',
    });
    expect(data).toBe(0);

    const { count } = await a.client.from('rounds').select('*', { count: 'exact', head: true });
    expect(count).toBe(2);
    await destroyAccount(b);
  });
});
