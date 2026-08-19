// T076 — the edited-and-edited-back edge case. FR-019, FR-021.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAccount, destroyAccount, seedRoster, type TestAccount } from './harness';

describe('pending Combat Power changes are derived, not stored', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string;

  const pending = async () => {
    const { data } = await a.client
      .from('v_round_line')
      .select('cp_change_pending')
      .eq('member_id', ash)
      .single();
    return data?.cp_change_pending;
  };

  beforeEach(async () => {
    a = await createAccount('cp-pending');
    const roster = await seedRoster(a, [{ name: 'Ash', combatPower: 88_000 }]);
    lineId = roster.lineId;
    ash = roster[0].id;
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  it('flags a change and clears it when the value is put back', async () => {
    expect(await pending()).toBe(false);

    await a.client.from('members').update({ combat_power: 40_000 }).eq('id', ash);
    expect(await pending()).toBe(true);

    // Edited back — no residue, because the flag is computed rather than stored.
    await a.client.from('members').update({ combat_power: 88_000 }).eq('id', ash);
    expect(await pending()).toBe(false);
  });

  it('drops the pending change with the member when they are removed', async () => {
    await a.client.from('members').update({ combat_power: 40_000 }).eq('id', ash);
    await a.client.from('members').delete().eq('id', ash);

    const { count } = await a.client
      .from('v_round_line')
      .select('*', { count: 'exact', head: true })
      .eq('cp_change_pending', true);
    expect(count).toBe(0);
  });
});
