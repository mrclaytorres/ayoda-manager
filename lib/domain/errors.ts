// T024 — the GS00x contract between SQL and the interface.
// Mapping on a stable code rather than parsing message text means a wording change in a migration
// cannot break the UI.

export const ERROR_MESSAGES: Record<string, string> = {
  GS001: 'There is no round in progress. Start a round first.',
  GS002: 'Add at least one member to the roster before starting a round.',
  GS003: 'That member is no longer first in line — the line moved on. Refresh and try again.',
  GS004: 'That member has already received an item this round.',
  GS005: 'That member is not taking part in this round.',
  GS006: 'This distribution has already been settled.',
  GS007: 'There is nothing left to undo.',
  GS008: 'The next round has already started, so this cannot be undone. Reset the round instead.',
  GS009: 'This round is already complete.',
  GS010: `You must type ${'YES'} exactly to confirm. Nothing was deleted.`,
  GS011: 'The round in progress cannot be deleted. Reset it instead.',
  GS012: 'That import file could not be read. Check the format and try again.',
  GS013: 'The import contained a row the roster will not accept. Nothing was imported.',
  GS014: 'That item is no longer in the pool. Refresh and pick another.',
  GS015: 'That order does not match the members in this round. Refresh and try again.',
  GS016: 'That line no longer exists.',
  SESSION_GONE:
    'You are signed in to an account that no longer exists — this happens after the database is ' +
    'reset. You have been signed out; sign in or register again and retry.',
};

export const GENERIC_ERROR =
  'That did not save. Check your connection and try again — retrying is safe.';

const CODE_PATTERN = /\bGS0\d{2}\b/;

/** Pull a GS code out of whatever shape the Postgres error arrived in. */
export function extractCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  for (const field of [e.code, e.message, e.details, e.hint]) {
    if (typeof field === 'string') {
      const match = field.match(CODE_PATTERN);
      if (match) return match[0];
    }
  }
  return null;
}

export function messageFor(error: unknown): { code: string; message: string } {
  const code = extractCode(error);
  if (code && ERROR_MESSAGES[code]) return { code, message: ERROR_MESSAGES[code] };

  // Constraint names are stable too, and give a better message than the raw driver text.
  const raw =
    error && typeof error === 'object' ? String((error as { message?: string }).message ?? '') : '';

  // A valid JWT for a deleted user: the signature still verifies, so the proxy waves it through and
  // reads quietly return nothing, but any write fails the owner_id foreign key. Without this the
  // officer sees "check your connection" for a problem no amount of retrying will fix.
  if (isOrphanedSession(error)) {
    return { code: 'SESSION_GONE', message: ERROR_MESSAGES.SESSION_GONE };
  }

  if (raw.includes('members_line_name_unique')) {
    return { code: 'DUP_NAME', message: 'A member with that name already exists.' };
  }
  if (raw.includes('members_cp_non_negative')) {
    return { code: 'BAD_CP', message: 'Combat Power cannot be negative.' };
  }
  if (raw.includes('distributions_one_award_per_member_per_round')) {
    return { code: 'GS004', message: ERROR_MESSAGES.GS004 };
  }
  if (raw.includes('lines_owner_name_unique')) {
    return { code: 'DUP_LINE', message: 'You already have a line with that name.' };
  }
  if (raw.includes('rounds_one_active_per_line')) {
    return { code: 'GS009', message: 'A round is already in progress.' };
  }
  return { code: 'UNKNOWN', message: GENERIC_ERROR };
}

/** True when the failure is a write against an owner_id whose auth user is gone. */
export function isOrphanedSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  const message = String(e.message ?? '');
  const details = String(e.details ?? '');
  return (
    e.code === '23503' &&
    (message.includes('owner_id_fkey') || message.includes('_id_fkey') || details.includes('users'))
  );
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: unknown): ActionResult<never> {
  const { code, message } = messageFor(error);
  return { ok: false, code, message };
}

/** A validation failure we produced ourselves — its message is already the right one to show. */
export function invalid(message: string): ActionResult<never> {
  return { ok: false, code: 'INVALID', message };
}
