/**
 * A JWT that outlives its account — what happens after `supabase db reset` while signed in.
 *
 * The signature still verifies, so the proxy admits the request and RLS-filtered reads quietly
 * return nothing. Only a write reveals the problem, and it must say so plainly rather than
 * blaming the network.
 */
import { describe, expect, it } from 'vitest';
import { admin, createAccount, createLine } from './harness';

describe('a session whose account no longer exists', () => {
  it('fails writes with a foreign key violation the app can recognise', async () => {
    const account = await createAccount('orphan');
    await admin().auth.admin.deleteUser(account.id);

    // The token still passes signature verification.
    const claims = await account.client.auth.getClaims();
    expect(claims.data?.claims).toBeTruthy();

    // Reads look empty rather than failing — which is why the app appeared to have no data.
    const read = await account.client.from('lines').select('id');
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    // The write is where it surfaces: owner_id defaults to a user row that is gone.
    const { error } = await account.client.from('lines').insert({ name: 'Main' });
    expect(error?.code).toBe('23503');
    expect(error?.message).toContain('owner_id_fkey');

    const { isOrphanedSession } = await import('@/lib/domain/errors');
    expect(isOrphanedSession(error)).toBe(true);
  });

  it('affects every write path, not only the first one tried', async () => {
    const account = await createAccount('orphan2');
    // Real data first, exactly as the officer had before the reset.
    const lineId = await createLine(account, 'Main');
    await admin().auth.admin.deleteUser(account.id);

    const member = await account.client
      .from('members')
      .insert({ line_id: lineId, name: 'Ash', combat_power: 1 });
    expect(member.error?.code).toBe('23503');

    const item = await account.client
      .from('items')
      .insert({ line_id: lineId, name: 'Force Blade' });
    expect(item.error?.code).toBe('23503');

    const { isOrphanedSession } = await import('@/lib/domain/errors');
    expect(isOrphanedSession(member.error)).toBe(true);
    expect(isOrphanedSession(item.error)).toBe(true);
  });
});
