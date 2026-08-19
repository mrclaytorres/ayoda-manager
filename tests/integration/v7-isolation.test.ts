/**
 * T030 — quickstart V7. FR-005, FR-006, SC-006.
 *
 * This sits in the foundational phase, not with the auth journeys, because it verifies a property
 * of the schema rather than of the login screen. It gates the phase: no story work should start on
 * unverified RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

const TABLES = [
  'members',
  'rounds',
  'round_entries',
  'distributions',
  'offer_responses',
  'items',
] as const;
// Views are tested by name: one created without `security_invoker` passes every table check above
// and fails only here.
const VIEWS = ['v_round_line', 'v_current_offer', 'v_item_pool'] as const;

describe('cross-account isolation', () => {
  let a: TestAccount;
  let lineId = '';
  let b: TestAccount;
  let aRoundId: string;
  let aMemberId: string;

  beforeAll(async () => {
    a = await createAccount('account-a');
    b = await createAccount('account-b');

    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    aMemberId = roster[0].id;

    const { data: round, error } = await a.client
      .rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' })
      .single();
    if (error) throw error;
    aRoundId = (round as { id: string }).id;

    await addItem(a, lineId, 'Chakra Ring');

    const { error: distErr } = await a.client.rpc('start_distribution', {
      p_item_id: await addItem(a, lineId, 'Force Blade'),
      p_client_action_id: uuid(),
    });
    if (distErr) throw distErr;
  });

  afterAll(async () => {
    await destroyAccount(a);
    await destroyAccount(b);
  });

  it('account A sees its own rows', async () => {
    const { data } = await a.client.from('members').select('id');
    expect(data?.length).toBe(2);
  });

  it.each(TABLES)('account B reads zero rows from %s', async (table) => {
    const { data, error } = await b.client.from(table).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(VIEWS)('account B reads zero rows from %s', async (view) => {
    const { data, error } = await b.client.from(view).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('account B cannot read account A rows by explicit id', async () => {
    const { data } = await b.client.from('members').select('*').eq('id', aMemberId);
    expect(data).toEqual([]);

    const { data: rounds } = await b.client.from('rounds').select('*').eq('id', aRoundId);
    expect(rounds).toEqual([]);
  });

  it("account B cannot cancel account A's distribution", async () => {
    const { data: dist } = await a.client.from('distributions').select('id').single();

    // The RPC treats a row it cannot see as already gone, so it reports success — and must still
    // leave A's distribution standing.
    await b.client.rpc('cancel_distribution', { p_distribution_id: dist!.id });

    const { count } = await a.client
      .from('distributions')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(1);
  });

  it('account B cannot update or delete account A rows', async () => {
    const { data: updated } = await b.client
      .from('members')
      .update({ combat_power: 1 })
      .eq('id', aMemberId)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client.from('members').delete().eq('id', aMemberId).select();
    expect(deleted).toEqual([]);

    // And A's data is untouched.
    const { data: still } = await a.client
      .from('members')
      .select('combat_power')
      .eq('id', aMemberId);
    expect(still?.[0].combat_power).toBe(88_000);
  });

  it('account B cannot act on account A distributions through the RPCs', async () => {
    const { error } = await b.client.rpc('reset_round', { p_round_id: aRoundId });
    expect(error).not.toBeNull();
  });
});
