/**
 * T029 — integration harness.
 *
 * Provisions two independent accounts against the local Supabase stack so tests can prove both the
 * behaviour of the RPCs and, critically, that account B cannot reach account A's data.
 *
 * Requires `supabase start` and the SUPABASE_SERVICE_ROLE_KEY from its output. The service key is
 * used only to create and destroy test users — never by the application.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export interface TestAccount {
  id: string;
  email: string;
  client: SupabaseClient;
}

export function admin(): SupabaseClient {
  if (!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for integration tests.');
  return createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

let counter = 0;

/** Create a confirmed user and return a client already signed in as them. */
export async function createAccount(label = 'officer'): Promise<TestAccount> {
  const email = `${label}-${Date.now()}-${counter++}@example.test`;
  const password = 'correct-horse-battery-staple';

  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user!.id, email, client };
}

export async function destroyAccount(account: TestAccount) {
  // Cascades through profiles, members, rounds, distributions, and responses.
  await admin().auth.admin.deleteUser(account.id);
}

let lineCounter = 0;

/** Create a line to hang members, items, and rounds off. */
export async function createLine(account: TestAccount, name?: string): Promise<string> {
  const { data, error } = await account.client
    .from('lines')
    .insert({ name: name ?? `line-${lineCounter++}` })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Seed a line's roster and return the members in the order the round will rank them —
 * Combat Power descending, with the unranked last.
 *
 * `lineId` is optional: most tests want one line and do not care about its id, so this makes one
 * on demand and hands it back on the returned array.
 */
export async function seedRoster(
  account: TestAccount,
  members: ReadonlyArray<{ name: string; combatPower?: number | null }>,
  lineId?: string,
): Promise<Array<{ id: string; name: string; combat_power: number | null }> & { lineId: string }> {
  const line = lineId ?? (await createLine(account));
  const { data, error } = await account.client
    .from('members')
    .insert(
      members.map((m) => ({
        line_id: line,
        name: m.name,
        combat_power: m.combatPower ?? null,
      })),
    )
    .select();
  if (error) throw error;

  const sorted = [...data!].sort((a, b) => {
    if (a.combat_power === null) return b.combat_power === null ? 0 : 1;
    if (b.combat_power === null) return -1;
    return b.combat_power - a.combat_power;
  });
  return Object.assign(sorted, { lineId: line });
}

/** Put one item in the pool and return its id. Distributions are started from the pool now. */
export async function addItem(account: TestAccount, lineId: string, name: string): Promise<string> {
  const { data, error } = await account.client
    .from('items')
    .insert({ line_id: lineId, name })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export const uuid = () => crypto.randomUUID();

/** Postgres raises our GS codes as messages; tests assert on the code, not the prose. */
export function codeOf(error: unknown): string | null {
  const text = JSON.stringify(error ?? {});
  return text.match(/GS0\d{2}/)?.[0] ?? null;
}
