// T088 — a removed member's history survives under their snapshot name. FR-014.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('history after a member is removed', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string;

  beforeEach(async () => {
    a = await createAccount('history-removed');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex] = roster.map((m) => m.id);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  it('keeps the award and the pass under the names recorded at the time', async () => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, 'Force Blade'),
        p_client_action_id: uuid(),
      })
      .single();
    const distId = (data as { id: string }).id;

    await a.client.rpc('record_pass', {
      p_distribution_id: distId,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    await a.client.rpc('record_award', {
      p_distribution_id: distId,
      p_member_id: bex,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    // Both members leave the guild.
    await a.client.from('members').delete().in('id', [ash, bex]);

    const { data: dist } = await a.client
      .from('distributions')
      .select('item_name, recipient_name, recipient_member_id, status')
      .single();
    // Deleting a member must not fail on the awarded-shape check, and the name must survive.
    expect(dist).toEqual({
      item_name: 'Force Blade',
      recipient_name: 'Bex',
      recipient_member_id: null,
      status: 'awarded',
    });

    const { data: responses } = await a.client
      .from('offer_responses')
      .select('member_name, member_id, kind')
      .order('seq');
    expect(responses).toEqual([
      { member_name: 'Ash', member_id: null, kind: 'pass' },
      { member_name: 'Bex', member_id: null, kind: 'accept' },
    ]);
  });
});
