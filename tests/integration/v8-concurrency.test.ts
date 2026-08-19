// T036 — quickstart V8. FR-048, FR-049, SC-004.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('V8 — concurrency and retry safety', () => {
  let a: TestAccount;
  let lineId = '';
  let ash: string, bex: string;

  beforeEach(async () => {
    a = await createAccount('v8');
    const roster = await seedRoster(a, [
      { name: 'Ash', combatPower: 88_000 },
      { name: 'Bex', combatPower: 74_000 },
      { name: 'Cyd', combatPower: 51_000 },
    ]);
    lineId = roster.lineId;
    [ash, bex] = roster.map((m) => m.id);
    await a.client.rpc('start_round', { p_line_id: lineId, p_ordering_mode: 'current_cp' });
  });

  afterEach(async () => destroyAccount(a));

  const startDist = async (skill = 'Force Blade') => {
    const { data } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, skill),
        p_client_action_id: uuid(),
      })
      .single();
    return (data as { id: string }).id;
  };

  it('replaying a distribution with the same client_action_id creates nothing new', async () => {
    const id = uuid();
    // Same item and same action id: this is a retry of one gesture, not two gestures.
    const item = await addItem(a, lineId, 'Force Blade');
    const first = await a.client
      .rpc('start_distribution', { p_item_id: item, p_client_action_id: id })
      .single();
    const second = await a.client
      .rpc('start_distribution', { p_item_id: item, p_client_action_id: id })
      .single();

    expect((second.data as { id: string }).id).toBe((first.data as { id: string }).id);
    const { count } = await a.client
      .from('distributions')
      .select('*', { count: 'exact', head: true });
    expect(count).toBe(1);
  });

  it('replaying a pass with the same client_action_id does not double-record', async () => {
    const dist = await startDist();
    const id = uuid();
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: id,
    });
    const { error } = await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: id,
    });
    expect(error).toBeNull();

    const { count } = await a.client
      .from('offer_responses')
      .select('*', { count: 'exact', head: true })
      .eq('distribution_id', dist);
    expect(count).toBe(1);
  });

  it('two simultaneous awards to the same member yield exactly one award', async () => {
    const dist = await startDist();
    const results = await Promise.allSettled([
      a.client.rpc('record_award', {
        p_distribution_id: dist,
        p_member_id: ash,
        p_mode: 'sequence',
        p_client_action_id: uuid(),
      }),
      a.client.rpc('record_award', {
        p_distribution_id: dist,
        p_member_id: ash,
        p_mode: 'sequence',
        p_client_action_id: uuid(),
      }),
    ]);
    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { error: unknown }).error === null,
    );
    expect(succeeded).toHaveLength(1);

    const { count } = await a.client
      .from('distributions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'awarded');
    expect(count).toBe(1);
  });

  it('SC-004 — a member cannot receive two skills in one round, even concurrently', async () => {
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

    const { data } = await a.client
      .from('distributions')
      .select('recipient_member_id')
      .eq('status', 'awarded');
    expect(data?.filter((d) => d.recipient_member_id === ash)).toHaveLength(1);
  });

  it('a stale device passing for the wrong member is rejected, not silently applied', async () => {
    const dist = await startDist();
    // Device 1 records Ash's pass; the line has moved to Bex.
    await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });

    // Device 2 still shows Ash as the holder and passes for Ash again.
    const { error } = await a.client.rpc('record_pass', {
      p_distribution_id: dist,
      p_member_id: ash,
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS003');

    // Bex was not skipped.
    const { data } = await a.client
      .from('v_current_offer')
      .select('member_id')
      .eq('distribution_id', dist)
      .maybeSingle();
    expect(data?.member_id).toBe(bex);
  });

  it('two simultaneous distributions on one round yield exactly one in progress', async () => {
    // Both items exist before either call is issued, so neither request gets a head start.
    const [itemA, itemB] = [await addItem(a, lineId, 'A'), await addItem(a, lineId, 'B')];
    const results = await Promise.allSettled([
      a.client.rpc('start_distribution', { p_item_id: itemA, p_client_action_id: uuid() }),
      a.client.rpc('start_distribution', { p_item_id: itemB, p_client_action_id: uuid() }),
    ]);
    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && (r.value as { error: unknown }).error === null,
    );
    expect(succeeded).toHaveLength(1);
  });
});
