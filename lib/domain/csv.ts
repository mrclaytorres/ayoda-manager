/**
 * Pure CSV parsing for roster import. No Supabase, no React — unit-testable on its own.
 *
 * Accepts the shape of `members.csv`:
 *
 *     ign,combat_power
 *     LaLlorona,120993
 *
 * and is deliberately forgiving about how that file reaches us: Windows CRLF endings, a UTF-8 BOM
 * from Excel, quoted fields, thousands separators pasted straight out of the game client, and
 * either `ign` or `name` as the first column.
 */

export interface ParsedMember {
  name: string;
  /** null when the column is blank — a hand-ordered line may not use Combat Power at all. */
  combatPower: number | null;
  line: number;
}

export interface SkippedRow {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedMember[];
  skipped: SkippedRow[];
}

const NAME_HEADERS = new Set(['ign', 'name', 'character name', 'character_name', 'charactername']);
const CP_HEADERS = new Set([
  'combat_power',
  'combat power',
  'combatpower',
  'cp',
  'combat-power',
  'power',
]);

const MAX_NAME = 60;
const MAX_CP = 2_147_483_647;

/** RFC 4180-ish: quoted fields, "" as an escaped quote, CRLF or LF or bare CR. */
function splitRows(text: string): string[][] {
  // Excel writes a BOM; left in place it becomes part of the first header name.
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      // Treat CRLF as one break, not two.
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);
  return rows;
}

function looksLikeHeader(row: string[]): boolean {
  const first = (row[0] ?? '').trim().toLowerCase();
  const second = (row[1] ?? '').trim().toLowerCase();
  return NAME_HEADERS.has(first) || CP_HEADERS.has(second);
}

/**
 * Combat Power as it appears in the wild: "120993", "120,993", "120 993".
 * Anything else — decimals, letters, a negative — is a rejection, not a guess.
 */
function parseCombatPower(
  raw: string,
): { ok: true; value: number | null } | { ok: false; reason: string } {
  const cleaned = raw
    .trim()
    .replace(/^\+/, '')
    .replace(/[,\s ']/g, '');
  // Blank is a valid answer now — "not measured" — rather than a row to skip.
  if (cleaned === '') return { ok: true, value: null };
  if (!/^\d+$/.test(cleaned)) {
    return { ok: false, reason: `Combat Power "${raw.trim()}" is not a whole number of 0 or more` };
  }
  const value = Number(cleaned);
  if (value > MAX_CP) return { ok: false, reason: `Combat Power "${raw.trim()}" is too large` };
  return { ok: true, value };
}

export function parseMembersCsv(text: string): ParseResult {
  const rows = splitRows(text);
  const result: ParseResult = { rows: [], skipped: [] };
  const seen = new Map<string, number>();

  let start = 0;
  if (rows.length > 0 && looksLikeHeader(rows[0])) start = 1;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const raw = row.join(',');

    // A trailing newline produces one empty row; so does a blank separator line.
    if (row.every((cell) => cell.trim() === '')) continue;

    const name = (row[0] ?? '').trim();
    const cpRaw = row[1] ?? '';

    if (name === '') {
      result.skipped.push({ line, raw, reason: 'No name in the first column' });
      continue;
    }
    if (name.length > MAX_NAME) {
      result.skipped.push({ line, raw, reason: `Name is longer than ${MAX_NAME} characters` });
      continue;
    }
    if (row.length < 2) {
      result.skipped.push({ line, raw, reason: 'No Combat Power column' });
      continue;
    }

    const cp = parseCombatPower(cpRaw);
    if (!cp.ok) {
      result.skipped.push({ line, raw, reason: cp.reason });
      continue;
    }

    // The roster's unique index is case-insensitive, so the file must be too — otherwise the
    // import would fail at the database with a constraint error instead of a readable message.
    const key = name.toLowerCase();
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined) {
      result.skipped.push({ line, raw, reason: `Duplicate of "${name}" on line ${firstSeen}` });
      continue;
    }

    seen.set(key, line);
    result.rows.push({ name, combatPower: cp.value, line });
  }

  return result;
}

export interface ImportPlan {
  toAdd: ParsedMember[];
  toUpdate: (ParsedMember & { previousCombatPower: number | null })[];
  unchanged: ParsedMember[];
}

/**
 * What the import would do, worked out before anything is written so the officer can see it.
 * Members already on the roster but absent from the file are left alone — an import adds and
 * updates, it never removes. Removing someone is a deliberate act with its own confirmation.
 */
export function planImport(
  rows: readonly ParsedMember[],
  existing: readonly { name: string; combat_power: number | null }[],
): ImportPlan {
  const byName = new Map(existing.map((m) => [m.name.trim().toLowerCase(), m]));
  const plan: ImportPlan = { toAdd: [], toUpdate: [], unchanged: [] };

  for (const row of rows) {
    const match = byName.get(row.name.toLowerCase());
    if (!match) plan.toAdd.push(row);
    else if (match.combat_power !== row.combatPower) {
      plan.toUpdate.push({ ...row, previousCombatPower: match.combat_power });
    } else plan.unchanged.push(row);
  }

  return plan;
}
