/**
 * Several lines at once — the point of the restructure.
 *
 * The old schema had one live round per *account*, so distributing weapons blocked distributing
 * armour and an award on one rotation took the member out of the other. These tests are mostly
 * about what must NOT bleed between lines.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addItem,
  createAccount,
  createLine,
  destroyAccount,
  seedRoster,
  uuid,
  type TestAccount,
} from './harness';

describe('lines running side by side', () => {
  let a: TestAccount;
  let weapons = '';
  let armour = '';
  let ashW = '';
  let ashA = '';

  beforeEach(async () => {
    a = await createAccount('lines');
    weapons = await createLine(a, 'Weapons');
    armour = await createLine(a, 'Armour');

    const w = await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 88_000 },
        { name: 'Bex', combatPower: 74_000 },
      ],
      weapons,
    );
    ashW = w[0].id;

    // The same person, taking part in both rotations — two rows, deliberately unlinked.
    const r = await seedRoster(
      a,
      [
        { name: 'Ash', combatPower: 51_000 },
        { name: 'Cyd', combatPower: 60_000 },
      ],
      armour,
    );
    ashA = r.find((m) => m.name === 'Ash')!.id;
  });

  afterEach(async () => destroyAccount(a));

  const startRound = async (lineId: string, mode = 'current_cp') => {
    const { data, error } = await a.client
      .rpc('start_round', { p_line_id: lineId, p_ordering_mode: mode })
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };

  const distribute = async (lineId: string, item: string) => {
    const { data, error } = await a.client
      .rpc('start_distribution', {
        p_item_id: await addItem(a, lineId, item),
        p_client_action_id: uuid(),
      })
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };

  it('runs a round on each line at the same time', async () => {
    await startRound(weapons);
    const { error } = await a.client
      .rpc('start_round', { p_line_id: armour, p_ordering_mode: 'current_cp' })
      .single();
    expect(error).toBeNull();

    const { data } = await a.client.from('rounds').select('line_id').eq('status', 'active');
    expect(data?.map((r) => r.line_id).sort()).toEqual([weapons, armour].sort());
  });

  it('still refuses a second round on the same line', async () => {
    await startRound(weapons);
    const { error } = await a.client.rpc('start_round', {
      p_line_id: weapons,
      p_ordering_mode: 'current_cp',
    });
    expect(error?.message).toContain('GS009');
  });

  it('numbers rounds within a line, so both start at 1', async () => {
    await startRound(weapons);
    await startRound(armour);
    const { data } = await a.client.from('rounds').select('round_number');
    expect(data?.map((r) => r.round_number)).toEqual([1, 1]);
  });

  it('keeps each line to its own members', async () => {
    const round = await startRound(weapons);
    const { data } = await a.client
      .from('v_round_line')
      .select('name')
      .eq('round_id', round)
      .order('position');
    expect(data?.map((r) => r.name)).toEqual(['Ash', 'Bex']);
  });

  it('keeps each line to its own item pool', async () => {
    await addItem(a, weapons, 'Force Blade');
    await addItem(a, armour, 'Guardian Boots');

    const { data } = await a.client.from('v_item_pool').select('name').eq('line_id', weapons);
    expect(data).toEqual([{ name: 'Force Blade' }]);
  });

  it('will not distribute an item into another line’s round', async () => {
    await startRound(weapons);
    // Armour has no round, so its items have nowhere to go — even while weapons is live.
    const { error } = await a.client.rpc('start_distribution', {
      p_item_id: await addItem(a, armour, 'Guardian Boots'),
      p_client_action_id: uuid(),
    });
    expect(error?.message).toContain('GS001');
  });

  it('an award on one line leaves the same person eligible on the other', async () => {
    await startRound(weapons);
    await startRound(armour);

    const dist = await distribute(weapons, 'Force Blade');
    await a.client.rpc('record_award', {
      p_distribution_id: dist,
      p_member_id: ashW,
      p_mode: 'sequence',
      p_client_action_id: uuid(),
    });

    const { data: onWeapons } = await a.client
      .from('v_round_line')
      .select('eligible')
      .eq('member_id', ashW)
      .single();
    const { data: onArmour } = await a.client
      .from('v_round_line')
      .select('eligible')
      .eq('member_id', ashA)
      .single();

    expect(onWeapons?.eligible).toBe(false);
    expect(onArmour?.eligible).toBe(true);
  });

  it('allows the same name on two lines but not twice on one', async () => {
    const { error: ok } = await a.client
      .from('members')
      .insert({ line_id: armour, name: 'Bex', combat_power: 1 });
    expect(ok).toBeNull();

    const { error: clash } = await a.client
      .from('members')
      .insert({ line_id: armour, name: 'bex', combat_power: 2 });
    expect(clash?.message).toContain('members_line_name_unique');
  });

  it('deleting a line takes its members, items, and rounds with it', async () => {
    await startRound(weapons);
    await addItem(a, weapons, 'Force Blade');

    const { error } = await a.client.from('lines').delete().eq('id', weapons);
    expect(error).toBeNull();

    const [{ count: members }, { count: items }, { count: rounds }] = await Promise.all([
      a.client.from('members').select('*', { count: 'exact', head: true }).eq('line_id', weapons),
      a.client.from('items').select('*', { count: 'exact', head: true }).eq('line_id', weapons),
      a.client.from('rounds').select('*', { count: 'exact', head: true }).eq('line_id', weapons),
    ]);
    expect([members, items, rounds]).toEqual([0, 0, 0]);

    // The other line is untouched.
    const { count: survivors } = await a.client
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('line_id', armour);
    expect(survivors).toBe(2);
  });

  it('refuses a duplicate line name on one account', async () => {
    const { error } = await a.client.from('lines').insert({ name: 'weapons' });
    expect(error?.message).toContain('lines_owner_name_unique');
  });
});
