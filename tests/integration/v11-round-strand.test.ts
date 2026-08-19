/**
 * T078 — quickstart V11. FR-037.
 *
 * The gap /speckit-analyze found: round completion was reachable only through record_award, so
 * removing the last eligible member left the round active with an empty line and no way forward.
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

describe('V11 — a removed member cannot strand a round', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string;

  beforeEach(async () => {
    a = await createAccount('v11');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex] = roster.map((m) => m.id);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  it('completes the round when the last eligible member is removed', async () => {
    // Ash takes a skill; Bex is the only one left eligible.
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

    const { data: before } = await a.client.from('rounds').select('status').single();
    expect(before?.status).toBe('active');

    // Bex leaves the guild.
    await a.client.from('members').delete().eq('id', bex);

    const { data: after } = await a.client.from('rounds').select('status, completed_at').single();
    expect(after?.status).toBe('complete');
    expect(after?.completed_at).not.toBeNull();
  });

  it('does not complete the round while someone eligible remains', async () => {
    await a.client.from('members').delete().eq('id', bex);
    const { data } = await a.client.from('rounds').select('status').single();
    expect(data?.status).toBe('active');
  });

  it('leaves no active round that cannot be advanced', async () => {
    await a.client.from('members').delete().eq('id', ash);
    await a.client.from('members').delete().eq('id', bex);

    const { data: active } = await a.client
      .from('rounds')
      .select('id')
      .eq('status', 'active')
      .maybeSingle();
    expect(active).toBeNull();
  });
});
