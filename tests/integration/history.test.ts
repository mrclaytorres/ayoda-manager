// T087 — history retrieval and filters. FR-041, FR-042.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('history', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string, cyd: string;

  const distribute = async (
    skill: string,
    opts: { passes?: string[]; award?: string; mode?: 'sequence' | 'manual'; unclaimed?: boolean },
  ) => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    const id = (data as { id: string }).id;
    for (const memberId of opts.passes ?? []) {
      await a.client.rpc('record_pass', {
        p_distribution_id: id,
        p_member_id: memberId,
        p_client_action_id: uuid(),
      });
    }
    if (opts.unclaimed) {
      await a.client.rpc('close_unclaimed', { p_distribution_id: id, p_client_action_id: uuid() });
    } else if (opts.award) {
      await a.client.rpc('record_award', {
        p_distribution_id: id,
        p_member_id: opts.award,
        p_mode: opts.mode ?? 'sequence',
        p_client_action_id: uuid(),
      });
    }
    return id;
  };

  beforeEach(async () => {
    a = await createAccount('history');
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

  it('records the skill, recipient, passers, mode, round and timestamp', async () => {
    await distribute('Force Blade', { passes: [ash], award: bex });

    const { data } = await a.client
      .from('distributions')
      .select(
        'item_name, status, recipient_name, award_mode, closed_at, rounds(round_number), offer_responses(member_name, kind)',
      )
      .single();

    expect(data).toMatchObject({
      item_name: 'Force Blade',
      status: 'awarded',
      recipient_name: 'Bex',
      award_mode: 'sequence',
    });
    expect(data?.closed_at).not.toBeNull();
    const round = data?.rounds as unknown as { round_number: number } | { round_number: number }[];
    expect((Array.isArray(round) ? round[0] : round).round_number).toBe(1);
    const responses = data?.offer_responses as { member_name: string; kind: string }[];
    expect(responses.filter((r) => r.kind === 'pass').map((r) => r.member_name)).toEqual(['Ash']);
  });

  it('records an unclaimed skill with its passers', async () => {
    await distribute('Ice Shield', { passes: [ash, bex, cyd], unclaimed: true });

    const { data } = await a.client
      .from('distributions')
      .select('status, recipient_name, offer_responses(member_name, kind)')
      .single();
    expect(data).toMatchObject({ status: 'unclaimed', recipient_name: null });
    expect((data?.offer_responses as unknown[]).length).toBe(3);
  });

  it('distinguishes manual awards', async () => {
    await distribute('Flame Aura', { award: cyd, mode: 'manual' });
    const { data } = await a.client.from('distributions').select('award_mode').single();
    expect(data?.award_mode).toBe('manual');
  });

  it('filters by round', async () => {
    await distribute('A', { award: ash });
    await distribute('B', { award: bex });
    await distribute('C', { award: cyd });
    const { data: r1 } = await a.client.from('rounds').select('id').single();

    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
    await distribute('D', { award: ash });

    const { data } = await a.client
      .from('distributions')
      .select('item_name')
      .eq('round_id', r1!.id)
      .order('created_at');
    expect(data?.map((d) => d.item_name)).toEqual(['A', 'B', 'C']);
  });

  it('excludes an in-progress distribution from the settled history', async () => {
    await distribute('A', { award: ash });
    await a.client.rpc('start_distribution', {
      p_item_id: await addItem(a, lineId, 'B'),
      p_client_action_id: uuid(),
    });

    const { data } = await a.client
      .from('distributions')
      .select('item_name')
      .neq('status', 'in_progress');
    expect(data?.map((d) => d.item_name)).toEqual(['A']);
  });
});
